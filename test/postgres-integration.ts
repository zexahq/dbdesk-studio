import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { PostgresAdapter } from '../apps/server/src/adapters/postgres'
import { PostgresQueryExecution } from '../apps/server/src/lib/postgres/execution'

const serverRequire = createRequire(new URL('../apps/server/package.json', import.meta.url))
const { Pool } = serverRequire('pg')
const connectionString = process.env.DBDESK_TEST_DATABASE_URL

test('PostgreSQL integration: full exports, transaction cleanup, read-only batches and cancellation', { skip: !connectionString }, async () => {
  const pool = new Pool({ connectionString, max: 1 })
  const schema = `studio_test_${randomUUID().replaceAll('-', '')}`
  const table = `"${schema}".items`
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`)
    await pool.query(`CREATE TABLE ${table} (id integer PRIMARY KEY, value integer NOT NULL DEFAULT 0)`)
    await pool.query(`INSERT INTO ${table} (id) SELECT generate_series(1, 123)`)
    const adapter = new PostgresAdapter({ host: '', database: '', user: '', password: '', port: 5432 })
    Object.assign(adapter, { pool })
    const csv = Buffer.from((await adapter.exportTableAsCSV({ schema, table: 'items' })).base64Content, 'base64').toString()
    const sql = Buffer.from((await adapter.exportTableAsSQL({ schema, table: 'items' })).base64Content, 'base64').toString()
    assert.equal(csv.split('\n').length, 124)
    assert.equal(sql.split('\n').length, 123)
    const execution = new PostgresQueryExecution(pool)
    const batch = await execution.runManyQueries(['BEGIN', `UPDATE ${table} SET value=9 WHERE id=1`, 'SELECT 1/0'])
    assert.ok(batch[2]?.error)
    assert.equal((await pool.query(`SELECT value FROM ${table} WHERE id=1`)).rows[0].value, 0)
    await execution.runQuery(`UPDATE ${table} SET value=1 WHERE id=1`)
    assert.equal((await pool.query(`SELECT value FROM ${table} WHERE id=1`)).rows[0].value, 1)
    const denied = await execution.runManyQueries([`WITH changed AS (UPDATE ${table} SET value=7 RETURNING *) SELECT * FROM changed`], { readOnly: true, includeTotalRowCount: false })
    assert.match(denied[0]?.error || '', /read-only transaction/)
    assert.equal((await pool.query(`SELECT value FROM ${table} WHERE id=1`)).rows[0].value, 1)
    const shown = await execution.runQuery('SHOW server_version', { limit: 50 })
    assert.equal(shown.rowCount, 1)
    const queryId = randomUUID()
    const started = performance.now()
    const running = execution.runQuery('SELECT pg_sleep(10)', { queryId })
    const rejected = assert.rejects(running, /canceling statement/)
    const deadline = Date.now() + 3000
    while (!(execution as any).activeQueries.has(queryId)) {
      assert.ok(Date.now() < deadline, 'Query did not register for cancellation')
      await new Promise((done) => setTimeout(done, 10))
    }
    assert.equal(await execution.cancelQuery(queryId), true)
    await rejected
    assert.ok(performance.now() - started < 3000, 'Cancellation left queued SQL running before cleanup')
    assert.equal(await execution.cancelQuery(queryId), false)
    assert.equal((await execution.runQuery('SELECT 1 AS value')).rows[0]?.value, 1)
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await pool.end()
  }
})
