import type { QueryBatchResult, QueryResult, RunQueryOptions } from '@common/types'
import { performance } from 'node:perf_hooks'
import { Client, Pool, type PoolClient, type QueryResult as PgQueryResult, type QueryResultRow } from 'pg'
import { getInitialStatementKeyword, hasAdditionalStatements, isSelectableQuery, normalizeQuery, stripSqlComments } from '../sql-parser'

export class PostgresQueryExecution {
  private readonly activeQueries = new Map<string, number>()
  constructor(private readonly pool: Pool) {}
  public async runQuery(query: string, options?: RunQueryOptions): Promise<QueryResult> {
    const start = performance.now()
    const normalizedQuery = normalizeQuery(query)
    if (options?.readOnly) this.validateReadOnly(normalizedQuery)
    const client = await this.pool.connect()
    try {
      await this.prepareClient(client, options)
      return await this.executeQuery(normalizedQuery, options, client, start)
    } finally {
      await this.releaseClient(client, options?.queryId)
    }
  }

  public async runManyQueries(
    queries: string[],
    options?: RunQueryOptions
  ): Promise<QueryBatchResult[]> {
    if (options?.readOnly) queries.forEach((query) => this.validateReadOnly(query))
    const client = await this.pool.connect()
    const results: QueryBatchResult[] = []
    const queryId = options?.queryId

    try {
      await this.prepareClient(client, options)
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
      await this.releaseClient(client, queryId)
    }

    return results
  }

  private validateReadOnly(query: string): void {
    // Keep transaction/session commands and additional statements from escaping
    // the read-only transaction. PostgreSQL enforces writes hidden inside CTEs.
    const keyword = stripSqlComments(query).trim().match(/^[A-Za-z]+/)?.[0]?.toLowerCase()
    if (!keyword || !['select', 'with', 'values', 'show', 'explain'].includes(keyword) ||
      query.includes('\\') || query.includes('\0') || /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.test(query) || hasAdditionalStatements(query)) {
      throw new Error('Read-only execution requires one read statement without escape or dollar quoting')
    }
  }

  private async prepareClient(client: PoolClient, options?: RunQueryOptions): Promise<void> {
    await client.query('SET statement_timeout = 20000')
    if (options?.readOnly) await client.query('START TRANSACTION READ ONLY')
    if (options?.queryId) {
      const result = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      const pid = result.rows[0]?.pid
      if (typeof pid === 'number') this.activeQueries.set(options.queryId, pid)
    }
  }

  private async releaseClient(client: PoolClient, queryId?: string): Promise<void> {
    if (queryId) this.activeQueries.delete(queryId)
    let discard = false
    try {
      // Also handles BEGIN followed by an error or a forgotten COMMIT in a batch.
      await client.query('ROLLBACK')
      await client.query('RESET ALL')
    } catch {
      discard = true
    }
    client.release(discard)
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
    if (options && isSelectableQuery(normalizedQuery) && getInitialStatementKeyword(normalizedQuery) !== 'show') {
      // A dedicated client queues SQL. Do not queue a second statement before
      // the first succeeds: cancellation must not leave another query running
      // ahead of the rollback/reset that returns this client to the pool.
      const countQuery = `SELECT COUNT(*) AS total FROM (${normalizedQuery}) AS subquery`
      const paginatedQuery = `SELECT * FROM (${normalizedQuery}) AS subquery LIMIT ${options.limit ?? 50} OFFSET ${options.offset ?? 0}`

      const pageResult = await runner.query<QueryResultRow>(paginatedQuery)
      const countResult = await runner.query<{ total: number }>(countQuery)

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

    // Cancellation must remain available when every pool slot is busy.
    const control = new Client({ ...this.pool.options, connectionTimeoutMillis: 5000 })
    try {
      await control.connect()
      if (this.activeQueries.get(queryId) !== pid) return false
      const result = await control.query<{ cancelled: boolean }>('SELECT pg_cancel_backend($1) AS cancelled', [pid])
      return result.rows[0]?.cancelled === true
    } finally {
      await control.end()
    }
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
