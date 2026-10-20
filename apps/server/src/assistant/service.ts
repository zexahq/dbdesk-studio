import { createHash } from 'node:crypto'
import type { ConnectionProfile, QueryResult } from '@common/types'
import { connectionManager } from '../connectionManager'
import { getProfile, loadProfiles, saveProfile } from '../storage'
import { hasAdditionalStatements, stripSqlComments } from '../lib/sql-parser'

export class AssistantError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

export function revision(profile: ConnectionProfile): string {
  return createHash('sha256').update(JSON.stringify([profile.id, profile.name, profile.type, profile.options])).digest('hex')
}

export function summary(profile: ConnectionProfile) {
  return { id: profile.id, name: profile.name, type: profile.type, revision: revision(profile),
    connected: connectionManager.isConnected(profile.id) }
}

export function validateSQL(sql: string, mode: string): void {
  // Conservative single-statement boundary: reject escape/dollar quoting rather than
  // risk transaction escape through a second statement. PostgreSQL enforces read-only.
  const clean = stripSqlComments(sql).trim()
  if (!clean || sql.includes('\0') || sql.includes('\\') || /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.test(sql) || hasAdditionalStatements(sql)) {
    throw new AssistantError(400, 'invalid_sql', 'Supply one SQL statement without escape or dollar quoting.')
  }
  const keyword = clean.match(/^[A-Za-z]+/)?.[0]?.toLowerCase() || ''
  const reads = ['select', 'with', 'values', 'show', 'explain']
  const writes = [...reads, 'insert', 'update', 'delete', 'create', 'alter', 'drop', 'truncate', 'grant', 'revoke', 'comment', 'refresh', 'analyze']
  if (!(mode === 'read' ? reads : writes).includes(keyword)) {
    throw new AssistantError(400, 'invalid_sql', 'Transaction, session, procedural and COPY commands are not supported by this API.')
  }
}

export interface QueryInput {
  queryId: string
  connectionId: string
  revision: string
  sql: string
  mode: 'read' | 'write'
  limit: number
  offset: number
}

interface QueryRecord {
  projectId?: string
  connectionId: string
  fingerprint: string
  state: 'running' | 'succeeded' | 'failed'
  mode: string
  outcome: Promise<QueryResult>
}

export class AssistantService {
  private readonly queries = new Map<string, QueryRecord>()
  private readonly controls = new Set<string>()

  async connections(projectId?: string) { return (await loadProfiles(projectId)).map(summary) }

  status(projectId?: string) {
    return [...this.queries].filter(([, record]) => record.projectId === projectId)
      .map(([queryId, record]) => ({ queryId, connectionId: record.connectionId, state: record.state, mode: record.mode }))
  }

  async profile(id: string, expected: string, projectId?: string): Promise<ConnectionProfile> {
    const profile = await getProfile(id, projectId)
    if (!profile) throw new AssistantError(404, 'connection_not_found', 'Saved connection not found in this project.')
    if (revision(profile) !== expected) throw new AssistantError(412, 'connection_changed', 'Refresh connections and approve the current profile before continuing.')
    return profile
  }

  private busy(id: string): boolean {
    return this.controls.has(id) || [...this.queries.values()].some(record => record.connectionId === id && record.state === 'running')
  }

  async control(id: string, expected: string, action: 'connect' | 'disconnect', projectId?: string) {
    const profile = await this.profile(id, expected, projectId)
    if (this.busy(id)) throw new AssistantError(409, 'connection_busy', 'Wait for or cancel the running operation before changing the connection.')
    this.controls.add(id)
    try {
      if (action === 'connect') {
        await connectionManager.createConnection(id, profile.type, profile.options)
        profile.lastConnectedAt = new Date()
        await saveProfile(profile, projectId)
      } else await connectionManager.closeConnection(id)
      return summary(profile)
    } finally { this.controls.delete(id) }
  }

  async schema(id: string, expected: string, projectId?: string) {
    await this.profile(id, expected, projectId)
    const adapter = connectionManager.getSQLConnection(id)
    if (!adapter) throw new AssistantError(409, 'not_connected', 'Connect this SQL database before inspecting its schema.')
    return adapter.listSchemaWithTables()
  }

  async query(input: QueryInput, projectId?: string): Promise<QueryResult> {
    const fingerprint = createHash('sha256').update(JSON.stringify([projectId, input])).digest('hex')
    const previous = this.queries.get(input.queryId)
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new AssistantError(409, 'query_id_conflict', 'A query ID cannot be reused for different arguments or projects.')
      return previous.outcome
    }
    // Reserve before any await so simultaneous requests cannot execute the same SQL twice.
    if (this.queries.size >= 256) throw new AssistantError(429, 'query_capacity', 'This process has reached its query ID limit; inspect outcomes before restarting it.')
    validateSQL(input.sql, input.mode)
    let finish!: (result: QueryResult) => void
    let fail!: (error: unknown) => void
    const outcome = new Promise<QueryResult>((resolve, reject) => { finish = resolve; fail = reject })
    const record: QueryRecord = { projectId, connectionId: input.connectionId, fingerprint, state: 'running', mode: input.mode, outcome }
    this.queries.set(input.queryId, record)
    // Attach a handler immediately; the HTTP caller may have disconnected already.
    void outcome.catch(() => {})
    void (async () => {
      try {
        const profile = await this.profile(input.connectionId, input.revision, projectId)
        if (profile.type !== 'postgres') throw new AssistantError(501, 'unsupported_adapter', 'Protected assistant queries currently require PostgreSQL.')
        if (this.controls.has(profile.id)) throw new AssistantError(409, 'connection_busy', 'A connection operation is running.')
        const adapter = connectionManager.getConnection(profile.id)
        if (!adapter) throw new AssistantError(409, 'not_connected', 'Connect this saved database before executing SQL.')
        const result = await adapter.runQuery(input.sql, {
          queryId: input.queryId, readOnly: input.mode === 'read', limit: input.limit, offset: input.offset, includeTotalRowCount: false
        })
        const bounded = { ...result, rows: result.rows.slice(0, input.limit) }
        if (Buffer.byteLength(JSON.stringify(bounded)) > 480 * 1024) {
          throw new AssistantError(502, 'result_too_large', 'Query completed but its result exceeds the response limit. Do not repeat a write; select smaller columns or pages.')
        }
        record.state = 'succeeded'
        finish(bounded)
      } catch (error) {
        record.state = 'failed'
        fail(error instanceof AssistantError ? error : new AssistantError(422, 'query_failed',
          input.mode === 'write' ? 'Query failed; its write outcome may be uncertain. Inspect before retrying.' : 'Query failed. Check SQL, permissions and database availability in Studio.'))
      }
    })()
    return outcome
  }

  async cancel(queryId: string, projectId?: string) {
    const record = this.queries.get(queryId)
    if (!record || record.projectId !== projectId) throw new AssistantError(404, 'query_not_found', 'Query not found in this project.')
    const adapter = connectionManager.getConnection(record.connectionId)
    const cancelled = record.state === 'running' && adapter?.cancelQuery ? await adapter.cancelQuery(queryId) : false
    return { queryId, cancelled, state: record.state, rollbackConfirmed: false }
  }
}
