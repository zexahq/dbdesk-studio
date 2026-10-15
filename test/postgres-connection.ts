import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { parseConnectionURI, postgresPoolConfig, sslFallback, postgresConnectionError } from '../apps/server/src/lib/postgres/connection'

const serverRequire = createRequire(new URL('../apps/server/package.json', import.meta.url))
const { Client } = serverRequire('pg')

test('URI parsing preserves encoded values, query parameters, IPv6 and SSL policy', () => {
  const parsed = parseConnectionURI('postgresql://name%40team:pass%3Aword@localhost:5435/db%20name?sslmode=verify-full&application_name=studio')
  assert.equal(parsed.options.user, 'name@team')
  assert.equal(parsed.options.password, 'pass:word')
  assert.equal(parsed.options.database, 'db name')
  const config = postgresPoolConfig(parsed.options, 'host.docker.internal')
  const parameters = new Client(config).connectionParameters
  assert.equal(parameters.host, 'host.docker.internal')
  assert.equal(parameters.port, 5435)
  assert.equal(parameters.database, 'db name')
  assert.equal(parameters.password, 'pass:word')
  assert.equal(parameters.application_name, 'studio')
  assert.equal(parameters.ssl.rejectUnauthorized, true)
  assert.equal(parameters.ssl.servername, 'localhost')
  assert.equal(postgresPoolConfig(parsed.options, '').host, 'localhost')
  const ipv6 = parseConnectionURI('postgres://u:p@[::1]:5435/db')
  assert.equal(ipv6.options.host, '::1')
  assert.equal(new Client(postgresPoolConfig(ipv6.options, '')).connectionParameters.host, '::1')
  const query = parseConnectionURI('postgresql://ignored:p@localhost/db?host=remote.example&port=6543&user=actual&dbname=other&password=space%20pass&ssl-mode=require')
  const resolved = new Client(postgresPoolConfig(query.options, 'host.docker.internal')).connectionParameters
  assert.equal(resolved.host, 'remote.example')
  assert.equal(resolved.port, 6543)
  assert.equal(resolved.user, 'actual')
  assert.equal(resolved.database, 'other')
  assert.equal(resolved.password, 'space pass')
  assert.equal(resolved.ssl.rejectUnauthorized, false)
  for (const uri of ['http://u:p@host/db', 'postgres://u:p@host/db?sslmode=bogus', 'postgres://u:p@host:99999/db',
    'postgres://u:%XX@host/db', 'postgres://u:p@host/db?sslkey=/private/key', 'postgres://u:p@host/db?sslrootcert=/private/ca']) {
    assert.throws(() => parseConnectionURI(uri))
  }
  assert.throws(() => postgresPoolConfig({ ...parsed.options, connectionString: 'postgres://u:p@host/db?sslcert=/private/key' }))
})

test('TLS fallback is limited to explicit negotiation and secrets stay out of errors', () => {
  const noTLS = new Error('The server does not support SSL connections')
  assert.equal(sslFallback('prefer', noTLS), false)
  for (const mode of ['require', 'verify-ca', 'verify-full'] as const) assert.equal(sslFallback(mode, noTLS), undefined)
  assert.equal(sslFallback('prefer', new Error('certificate verification failed')), undefined)
  assert.equal(sslFallback('allow', { code: '28P01', message: 'authentication failed' }), undefined)
  assert.ok(sslFallback('allow', { code: '28000', message: 'no pg_hba.conf entry, no encryption' }))
  const options = parseConnectionURI('postgres://u:fixture-secret@host/db').options
  const message = postgresConnectionError(new Error('postgres://u:fixture-secret@host/db fixture-secret'), options).message
  assert.ok(!message.includes('fixture-secret'))
})

test('URI collection route bypasses ID lookup, reconnects changed options, and never hides failure', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dbdesk-uri-'))
  process.env.STORAGE_PATH = directory
  const { registerConnectionURIRoute } = await import('../apps/server/src/routes/connections')
  const { connectionManager } = await import('../apps/server/src/connectionManager')
  const { loadProfiles } = await import('../apps/server/src/storage')
  const express = serverRequire('express')
  const originalCreate = connectionManager.createConnection
  const originalClose = connectionManager.closeConnection
  const closes: string[] = []
  connectionManager.createConnection = async (_id, _type, options) => {
    if (options.password === 'bad') throw new Error('fixture authentication failed')
    return {} as any
  }
  connectionManager.closeConnection = async (id) => { closes.push(id) }
  const app = express()
  app.use(express.json())
  registerConnectionURIRoute(app)
  app.use('/api/connections/:connectionId', (_req: unknown, res: any) => res.status(404).json({ error: 'ID guard' }))
  app.use((error: Error, _req: unknown, res: any, _next: unknown) => res.status(500).json({ error: error.message }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(resolve))
    connectionManager.createConnection = originalCreate
    connectionManager.closeConnection = originalClose
    await rm(directory, { recursive: true, force: true })
  })
  const url = `http://127.0.0.1:${server.address().port}/api/connections/from-uri`
  const send = (uri: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uri }) })
  const first = await send('postgres://u:good@localhost:5435/db?sslmode=require')
  assert.equal(first.status, 201)
  const profile = await first.json() as any
  const updated = await send('postgres://u:changed@localhost:5435/db?sslmode=verify-full')
  assert.equal(updated.status, 200)
  assert.equal((await updated.json() as any).id, profile.id)
  assert.ok(closes.includes(profile.id))
  assert.equal((await loadProfiles())[0].options.sslMode, 'verify-full')
  const failed = await send('postgres://u:bad@localhost:5435/db')
  assert.equal(failed.status, 500)
  assert.equal((await loadProfiles())[0].options.password, 'changed')
  const newFailed = await send('postgres://u:bad@other.example/db')
  assert.equal(newFailed.status, 500)
  assert.equal((await loadProfiles()).length, 1)
})
