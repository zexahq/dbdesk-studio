import type { QueryBatchResult, QueryResult, RunQueryOptions } from '@common/types'
import { performance } from 'node:perf_hooks'
import { Pool, type PoolClient, type QueryResult as PgQueryResult, type QueryResultRow } from 'pg'
import { getInitialStatementKeyword, isSelectableQuery, normalizeQuery } from '../sql-parser'

export class PostgresQueryExecution {
  private readonly activeQueries = new Map<string, number>()
  constructor(private readonly pool: Pool) {}
  public async runQuery(query: string, options?: RunQueryOptions): Promise<QueryResult> {
    const pool = this.pool
    const start = performance.now()

    const normalizedQuery = normalizeQuery(query)

    // Cancellation and read-only plans both need a dedicated client. The
    // read-only transaction is enforced by PostgreSQL, including for writes
    // hidden in CTEs that a client-side parser could miss.
    if (options?.queryId || options?.readOnly) {
      const client = await pool.connect()
      try {
        await client.query('SET statement_timeout = 20000')
        if (options?.readOnly) {
          await client.query('START TRANSACTION READ ONLY')
          await client.query('SET LOCAL statement_timeout = 20000')
        }
        if (options?.queryId) {
          const pidResult = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
          const pid = pidResult.rows[0]?.pid
          if (typeof pid === 'number') {
            this.activeQueries.set(options.queryId, pid)
          }
        }
        return await this.executeQuery(normalizedQuery, options, client, start)
      } finally {
        if (options?.queryId) this.activeQueries.delete(options.queryId)
        if (options?.readOnly) await client.query('ROLLBACK').catch(() => {})
        await client.query('RESET statement_timeout').catch(() => {})
        client.release()
      }
    }

    return this.executeQuery(normalizedQuery, options, pool, start)
  }

  public async runManyQueries(
    queries: string[],
    options?: RunQueryOptions
  ): Promise<QueryBatchResult[]> {
    const pool = this.pool
    const client = await pool.connect()
    const results: QueryBatchResult[] = []
    const queryId = options?.queryId

    try {
      if (queryId) {
        const pidResult = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        const pid = pidResult.rows[0]?.pid
        if (typeof pid === 'number') this.activeQueries.set(queryId, pid)
      }
      for (const query of queries) {
        const normalizedQuery = normalizeQuery(query).trim()
        if (!normalizedQuery) continue

        const start = performance.now()
        try {
          const result = await this.executeQuery(normalizedQuery, options, client, start)
          results.push({
            query: normalizedQuery,
            result,
            executionTime: result.executionTime ?? performance.now() - start
          })
        } catch (error) {
          results.push({
            query: normalizedQuery,
            error: error instanceof Error ? error.message : 'Failed to execute query',
            executionTime: performance.now() - start
          })
          break
        }
      }
    } finally {
      if (queryId) this.activeQueries.delete(queryId)
      client.release()
    }

    return results
  }

  private async executeQuery(
    normalizedQuery: string,
    options: RunQueryOptions | undefined,
    runner: Pool | PoolClient,
    start: number
  ): Promise<QueryResult> {

    // Assistant execution must issue SQL once: a count query can repeat volatile
    // functions, and a modifying CTE must never be evaluated for pagination.
    if (options?.includeTotalRowCount === false) {
      const pageable = options.readOnly && ['select', 'with', 'values'].includes(getInitialStatementKeyword(normalizedQuery) || '')
      const sql = pageable ? `SELECT * FROM (${normalizedQuery}) AS assistant_query LIMIT ${options.limit ?? 100} OFFSET ${options.offset ?? 0}` : normalizedQuery
      const result = await runner.query(sql)
      return this.transformResult(result, performance.now() - start)
    }

    // Check if this is a SELECT query that can be paginated
    if (options && isSelectableQuery(normalizedQuery)) {
      // Execute count query and paginated query in parallel
      const countQuery = `SELECT COUNT(*) AS total FROM (${normalizedQuery}) AS subquery`
      const paginatedQuery = `SELECT * FROM (${normalizedQuery}) AS subquery LIMIT ${options.limit ?? 50} OFFSET ${options.offset ?? 0}`

      const [countResult, pageResult] = await Promise.all([
        runner.query<{ total: number }>(countQuery),
        runner.query<QueryResultRow>(paginatedQuery)
      ])

      const executionTime = performance.now() - start
      const totalRow = countResult.rows[0]?.total
      const totalRowCount = typeof totalRow === 'number' ? totalRow : Number(totalRow ?? 0)

      const transformedResult = this.transformResult(pageResult, executionTime)
      return {
        ...transformedResult,
        totalRowCount,
        limit: options.limit,
        offset: options.offset
      }
    }

    // For non-SELECT queries or when no pagination options provided
    const result = await runner.query(normalizedQuery)
    const executionTime = performance.now() - start

    return this.transformResult(result, executionTime)
  }

  public async cancelQuery(queryId: string): Promise<boolean> {
    const pid = this.activeQueries.get(queryId)
    if (typeof pid !== 'number') return false

    const pool = this.pool
    await pool.query('SELECT pg_cancel_backend($1)', [pid])
    return true
  }

  private transformResult(
    result: PgQueryResult<QueryResultRow>,
    executionTime: number
  ): QueryResult {
    const columns = result.fields.map((field) => field.name)

    return {
      rows: result.rows,
      columns,
      rowCount: typeof result.rowCount === 'number' ? result.rowCount : result.rows.length,
      executionTime
    }
  }

}
