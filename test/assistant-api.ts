import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createRequire } from 'node:module'
const express = createRequire(new URL('../apps/server/package.json', import.meta.url))('express')
import type { SQLAdapter } from '@common/types'
import type { Pool } from 'pg'

const directory = await mkdtemp(join(tmpdir(), 'dbdesk-assistant-'))
process.env.STORAGE_PATH = directory
const { registerAssistantRoutes } = await import('../apps/server/src/assistant/routes')
const { AssistantService, revision, validateSQL } = await import('../apps/server/src/assistant/service')
const { saveProfile } = await import('../apps/server/src/storage')
const { adapterRegistry } = await import('../apps/server/src/adapters')
const { connectionManager } = await import('../apps/server/src/connectionManager')
const { PostgresQueryExecution } = await import('../apps/server/src/lib/postgres/execution')

await test('assistant API authenticates, isolates projects, binds profiles and executes each ID once', async () => {
  const token = 't'.repeat(64)
  const projectId = 'project-a'
  const profile = { id: randomUUID(), name: 'sample', type: 'postgres' as const,
    options: { host: 'localhost', port: 5432, user: 'fixture', password: 'private-fixture', database: 'fixture' },
    projectId, createdAt: new Date(), updatedAt: new Date() }
  const foreign = { ...profile, id: randomUUID(), projectId: 'project-b' }
  await saveProfile(profile, projectId)
  await saveProfile(foreign, foreign.projectId)
  let executions = 0
  let connected = 0
  let disconnected = 0
  let release = () => {}
  let began = () => {}
  let started = Promise.resolve()
  const adapter = {
    connect: async () => { connected++ }, disconnect: async () => { disconnected++ },
    listSchemas: async () => ['public'], listSchemaWithTables: async () => [{ schema: 'public', tables: [] }],
    cancelQuery: async () => { release(); return true },
    runQuery: async (sql: string, options: { readOnly: boolean; includeTotalRowCount: boolean }) => {
      executions++
      assert.equal(options.includeTotalRowCount, false)
      if (sql === 'SELECT wait') { began(); await new Promise<void>(resolve => { release = resolve }) }
      if (sql === 'SELECT secret_error') throw new Error('private-fixture SELECT secret_error')
      return { columns: ['readOnly'], rows: [{ readOnly: options.readOnly }], rowCount: 1 }
    }
  } as unknown as SQLAdapter
  adapterRegistry.registerAdapter('postgres', () => adapter)
  const app = express()
  const service = new AssistantService()
  const access = { token, projectId, allowWrites: false }
  registerAssistantRoutes(app, access, service)
  const disabled = express()
  registerAssistantRoutes(disabled, {})
  app.use('/disabled', disabled)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address() as { port: number }
  const url = `http://127.0.0.1:${address.port}/api/assistant/v1`
  const request = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(url + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'X-DBDesk-Project-ID': projectId,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') }
  }
  try {
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/disabled/api/assistant/v1/status`)).status, 503)
    assert.equal((await request('/status', undefined, { Authorization: '' })).status, 401)
    assert.equal((await request('/status', undefined, { 'X-DBDesk-Project-ID': 'project-b' })).status, 403)
    const capabilities = await request('/capabilities')
    assert.equal(capabilities.body.version, 1)
    assert.equal(capabilities.body.writesEnabled, false)
    assert.equal(capabilities.body.endpoints.length, 8)
    assert.equal(capabilities.cache, 'no-store')
    const profiles = await request('/connections')
    assert.equal(profiles.body.length, 1)
    assert.equal(profiles.body[0].connected, false)
    assert.equal(JSON.stringify(profiles.body).includes('private-fixture'), false)
    const expected = revision(profile)
    assert.equal((await request(`/connections/${profile.id}/connect`, {})).status, 400)
    assert.equal((await request(`/connections/${profile.id}/connect`, {}, { 'If-Match': '0'.repeat(64) })).status, 412)
    assert.equal((await request(`/connections/${foreign.id}/connect`, {}, { 'If-Match': revision(foreign) })).status, 404)
    assert.equal((await request(`/connections/${profile.id}/connect`, { password: 'forbidden' }, { 'If-Match': expected })).status, 400)
    assert.equal((await request(`/connections/${profile.id}/connect`, {}, { 'If-Match': expected })).body.connected, true)
    assert.equal(connected, 1)
    assert.equal((await request(`/connections/${profile.id}/schema`, undefined, { 'If-Match': expected })).status, 200)
    const input = { queryId: randomUUID(), connectionId: profile.id, revision: expected, sql: 'SELECT 1' }
    assert.equal((await request('/queries', { ...input, mode: 'write' })).status, 403)
    assert.equal((await request('/queries', { ...input, password: 'forbidden' })).status, 400)
    assert.equal((await request('/queries', { ...input, sql: 'SELECT 1; COMMIT' })).status, 400)
    assert.equal((await request('/queries', { ...input, sql: 'SELECT ' + 'x'.repeat(40000) })).status, 413)
    const result = await request('/queries', input)
    assert.equal(result.status, 200)
    assert.equal(result.body.rows[0].readOnly, true)
    access.allowWrites = true
    const writeInput = { ...input, queryId: randomUUID(), sql: 'UPDATE fixture SET x=1', mode: 'write' }
    assert.equal((await request('/queries', writeInput)).body.rows[0].readOnly, false)
    const writes = executions
    assert.equal((await request('/queries', writeInput)).status, 200)
    assert.equal(executions, writes)
    access.allowWrites = false
    const after = executions
    assert.equal((await request('/queries', input)).status, 200)
    assert.equal(executions, after)
    assert.equal((await request('/queries', { ...input, sql: 'SELECT 2' })).status, 409)
    assert.equal((await request(`/queries/${input.queryId}`)).body.state, 'succeeded')
    assert.equal((await request(`/queries/${input.queryId}/cancel`, {})).body.cancelled, false)
    const failed = await request('/queries', { ...input, queryId: randomUUID(), sql: 'SELECT secret_error' })
    assert.equal(failed.status, 422)
    assert.equal(JSON.stringify(failed.body).includes('private-fixture'), false)
    started = new Promise<void>(resolve => { began = resolve })
    const runningID = randomUUID()
    const running = request('/queries', { ...input, queryId: runningID, sql: 'SELECT wait' })
    await started
    assert.equal((await request(`/connections/${profile.id}/disconnect`, {}, { 'If-Match': expected })).status, 409)
    const duplicate = request('/queries', { ...input, queryId: runningID, sql: 'SELECT wait' })
    const beforeCancel = executions
    assert.equal((await request(`/queries/${runningID}/cancel`, {})).body.rollbackConfirmed, false)
    assert.equal((await running).status, 200)
    assert.equal((await duplicate).status, 200)
    assert.equal(executions, beforeCancel)
    const status = await request('/status')
    assert.equal(status.body.connections[0].connected, true)
    assert.equal(JSON.stringify(status.body).includes('SELECT wait'), false)
    await saveProfile({ ...profile, options: { ...profile.options, password: 'replacement' } }, projectId)
    assert.equal((await request('/queries', { ...input, queryId: randomUUID() })).status, 412)
    assert.equal((await request(`/connections/${profile.id}/disconnect`, {}, { 'If-Match': revision({ ...profile, options: { ...profile.options, password: 'replacement' } }) })).status, 200)
    assert.equal(disconnected, 1)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await connectionManager.closeAll()
  }
})

await test('write queries and PostgreSQL execution do not run a count or repeat SQL', async () => {
  const calls: string[] = []
  const client = {
    query: async (sql: string) => {
      calls.push(sql)
      return { rows: sql.includes('pg_backend_pid') ? [{ pid: 1 }] : [{ value: 1 }], fields: [{ name: 'value' }], rowCount: 1 }
    }, release: () => {}
  }
  const execution = new PostgresQueryExecution({ connect: async () => client } as unknown as Pool)
  await execution.runQuery('SELECT 1', { queryId: randomUUID(), readOnly: true, limit: 5, includeTotalRowCount: false })
  assert.equal(calls.filter(sql => sql.includes('assistant_query')).length, 1)
  assert.equal(calls.some(sql => sql.includes('COUNT(*)')), false)
  assert.ok(calls.includes('START TRANSACTION READ ONLY'))
  assert.ok(calls.includes('ROLLBACK'))
  calls.length = 0
  const write = 'WITH changed AS (DELETE FROM fixture RETURNING *) SELECT * FROM changed'
  await execution.runQuery(write, { queryId: randomUUID(), readOnly: false, includeTotalRowCount: false })
  assert.equal(calls.filter(sql => sql === write).length, 1)
  assert.equal(calls.some(sql => sql.includes('COUNT(*)')), false)
  for (const sql of ['COMMIT', 'SET transaction_read_only=off', 'SELECT 1; DELETE FROM fixture', "SELECT E'\\'; COMMIT", 'SELECT $$x$$']) {
    assert.throws(() => validateSQL(sql, 'read'))
  }
  validateSQL("SELECT ';' AS value; -- ok", 'read')
  validateSQL('UPDATE fixture SET x=1', 'write')
})
await rm(directory, { recursive: true, force: true })
