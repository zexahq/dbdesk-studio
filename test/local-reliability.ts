import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { PostgresAdapter } from '../apps/server/src/adapters/postgres'
import { PostgresQueryExecution } from '../apps/server/src/lib/postgres/execution'
import { buildTableDataQuery } from '../apps/server/src/lib/postgres/queries'
import { readJsonFile, updateJsonFile } from '../apps/server/src/json-storage'

const directory = await mkdtemp(join(tmpdir(), 'dbdesk-reliability-'))
process.env.STORAGE_PATH = directory
const { app } = await import('../apps/server/src/index')
const { saveProfile, loadProfiles } = await import('../apps/server/src/storage')
const { saveWorkspace, loadWorkspace } = await import('../apps/server/src/workspace-storage')
const { saveQuery, loadQueries } = await import('../apps/server/src/saved-queries-storage')
const { saveDashboard, loadDashboards } = await import('../apps/server/src/dashboard-storage')
const { connectionManager } = await import('../apps/server/src/connectionManager')
const { adapterRegistry } = await import('../apps/server/src/adapters')
const options = { host: 'localhost', port: 5432, database: 'fixture', user: 'fixture', password: '' }
after(async () => { await connectionManager.closeAll(); await rm(directory, { recursive: true, force: true }) })

test('CSV and SQL exports include all 123 rows while browsing keeps its default page', async () => {
  const adapter = new PostgresAdapter(options)
  const calls: { sql: string; params: unknown[] }[] = []
  Object.assign(adapter, {
    pool: { query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params })
      return { rows: Array.from({ length: sql.includes(' LIMIT ') ? 50 : 123 }, (_, id) => ({ id })) }
    } },
    queryColumns: async () => [{ name: 'id' }]
  })
  const exportOptions = { schema: 'public', table: 'items', filters: [{ column: 'id', operator: '>' as const, value: -1 }], sortRules: [{ column: 'id', direction: 'ASC' as const }] }
  const csv = Buffer.from((await adapter.exportTableAsCSV(exportOptions)).base64Content, 'base64').toString()
  const sql = Buffer.from((await adapter.exportTableAsSQL(exportOptions)).base64Content, 'base64').toString()
  assert.equal(csv.split('\n').length, 124)
  assert.equal(sql.split('\n').length, 123)
  for (const call of calls) {
    assert.ok(call.sql.includes('WHERE "id" > $1 ORDER BY "id" ASC'))
    assert.ok(!call.sql.includes(' LIMIT '))
    assert.deepEqual(call.params, [-1])
  }
  assert.deepEqual(buildTableDataQuery({ schema: 'public', table: 'items' }).params, [50, 0])
})

test('failed batches roll back before release, read-only batches are enforced, broken clients are discarded', async () => {
  const calls: string[] = []
  const releases: boolean[] = []
  let brokenCleanup = false
  const client = {
    query: async (sql: string) => {
      calls.push(sql)
      if (sql === 'BROKEN' || (brokenCleanup && sql === 'ROLLBACK')) throw new Error('fixture failure')
      return { rows: [{ value: 1 }], fields: [{ name: 'value' }], rowCount: 1 }
    },
    release: (discard: boolean) => releases.push(discard)
  }
  const execution = new PostgresQueryExecution({ connect: async () => client } as any)
  const result = await execution.runManyQueries(['BEGIN', 'BROKEN', 'SELECT never'])
  assert.equal(result.length, 2)
  assert.equal(result[1]?.error, 'fixture failure')
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'RESET ALL'])
  assert.deepEqual(releases, [false])
  calls.length = 0
  await execution.runManyQueries(['SHOW server_version', 'SELECT 1'], { readOnly: true, includeTotalRowCount: false })
  assert.ok(calls.indexOf('START TRANSACTION READ ONLY') < calls.indexOf('SHOW server_version'))
  await assert.rejects(execution.runManyQueries(['SELECT 1', 'COMMIT'], { readOnly: true }))
  await assert.rejects(execution.runQuery('SELECT 1; COMMIT', { readOnly: true }))
  brokenCleanup = true
  await execution.runQuery('SELECT 1')
  assert.equal(releases.at(-1), true)
})

test('concurrent profile, query, workspace and dashboard saves retain every update', async () => {
  const now = new Date()
  await Promise.all(Array.from({ length: 12 }, async (_, index) => {
    const id = `connection-${index}`
    await Promise.all([
      saveProfile({ id, name: id, type: 'postgres', options, createdAt: now, updatedAt: now }),
      saveQuery('shared', `query-${index}`, `Query ${index}`, 'SELECT 1'),
      saveWorkspace({ connectionId: id, lastUpdated: now, tabs: [], activeTabId: null }),
      saveDashboard({ connectionId: 'shared', dashboardId: `dashboard-${index}`, name: id,
        layout: { columns: 12, rowHeight: 80 }, widgets: [], createdAt: now, updatedAt: now })
    ])
  }))
  assert.equal((await loadProfiles()).length, 12)
  assert.equal((await loadQueries('shared')).length, 12)
  assert.equal((await loadDashboards('shared')).length, 12)
  for (let index = 0; index < 12; index++) assert.ok(await loadWorkspace(`connection-${index}`))
  assert.ok(!(await readdir(directory)).some((name) => name.endsWith('.lock') || name.endsWith('.tmp')))
})

test('atomic JSON updates coordinate multiple processes and preserve corrupt files', async () => {
  const file = join(directory, 'counter.json')
  const serverRequire = createRequire(new URL('../apps/server/package.json', import.meta.url))
  const module = new URL('../apps/server/src/json-storage.ts', import.meta.url).pathname
  const code = `import { updateJsonFile } from ${JSON.stringify(module)}; (async () => { for (let i=0;i<15;i++) await updateJsonFile(${JSON.stringify(file)},()=>({count:0}), value => { value.count++ }); })().catch(error => { console.error(error); process.exit(1) })`
  const worker = () => new Promise<void>((done, fail) => {
    const child = spawn(process.execPath, [serverRequire.resolve('tsx/cli'), '-e', code], { stdio: ['ignore', 'ignore', 'pipe'] })
    let error = ''
    child.stderr.on('data', (chunk) => { error += chunk })
    child.once('error', fail)
    child.once('exit', (status) => status === 0 ? done() : fail(new Error(error)))
  })
  await Promise.all([worker(), worker()])
  assert.equal((await readJsonFile(file, () => ({ count: 0 }))).count, 30)
  await writeFile(file, '{ damaged')
  await assert.rejects(updateJsonFile(file, () => ({}), () => {}), SyntaxError)
  assert.equal(await readFile(file, 'utf8'), '{ damaged')
  assert.ok(!(await readdir(directory)).some((name) => name.endsWith('.lock')))
})

test('workspace HTTP saves normalize dates, reject foreign identity and scope dashboard exports', async () => {
  const now = new Date()
  const a = { id: 'project-a', name: 'A', type: 'postgres' as const, options, createdAt: now, updatedAt: now, projectId: 'a' }
  const b = { ...a, id: 'project-b', projectId: 'b' }
  await saveProfile(a, 'a'); await saveProfile(b, 'b')
  for (const profile of [a, b]) await saveDashboard({ connectionId: profile.id, dashboardId: profile.id, name: profile.id,
    layout: { columns: 12, rowHeight: 80 }, widgets: [], createdAt: now, updatedAt: now })
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((done) => server.once('listening', done))
  const address = server.address() as { port: number }
  const base = `http://127.0.0.1:${address.port}/api`
  const workspace = { connectionId: a.id, lastUpdated: now, tabs: [], activeTabId: null }
  const send = (body: unknown) => fetch(`${base}/connections/${a.id}/workspace`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DBDesk-Project-ID': 'a' }, body: JSON.stringify(body)
  })
  try {
    const missing = await fetch(`${base}/connections/${a.id}/workspace`, { headers: { 'X-DBDesk-Project-ID': 'a' } })
    assert.equal(missing.status, 204)
    assert.equal(await missing.text(), '')
    assert.equal((await send(workspace)).status, 200)
    assert.equal((await loadWorkspace(a.id))?.lastUpdated.toISOString(), now.toISOString())
    assert.equal((await send({ ...workspace, connectionId: b.id })).status, 400)
    assert.equal((await send({ ...workspace, lastUpdated: 'invalid' })).status, 400)
    assert.equal((await send({ ...workspace, tabs: [{}] })).status, 400)
    assert.equal((await send({ ...workspace, activeTabId: 'missing' })).status, 400)
    assert.equal(await loadWorkspace(b.id), undefined)
    const exported = await fetch(`${base}/dashboards/export`, { headers: { 'X-DBDesk-Project-ID': 'a' } })
    assert.deepEqual((await exported.json()).dashboards.map((item: any) => item.connectionId), [a.id])
    assert.equal((await fetch(`${base}/dashboards/export?connectionId=${b.id}`, { headers: { 'X-DBDesk-Project-ID': 'a' } })).status, 404)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
})

test('simultaneous connection requests share one pool and disconnect waits for creation', async () => {
  const original = adapterRegistry.getFactory('postgres')!
  let connected = 0
  let disconnected = 0
  let finish!: () => void
  const ready = new Promise<void>((done) => { finish = done })
  const adapter = { connect: async () => { connected++; await ready }, disconnect: async () => { disconnected++ } }
  adapterRegistry.registerAdapter('postgres', () => adapter as any)
  try {
    const first = connectionManager.createConnection('simultaneous', 'postgres', options)
    const second = connectionManager.createConnection('simultaneous', 'postgres', options)
    const closing = connectionManager.closeConnection('simultaneous')
    assert.equal(connected, 1)
    finish()
    assert.equal(await first, await second)
    await closing
    assert.equal(disconnected, 1)
    assert.equal(connectionManager.isConnected('simultaneous'), false)
  } finally { adapterRegistry.registerAdapter('postgres', original) }
})
