import assert from 'node:assert/strict'
import { test } from 'node:test'

test('local query history is bounded, deduplicated and clears only the chosen connection', async () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key)
  } })
  const { useQueryHistoryStore } = await import('../apps/web/src/store/query-history-store')
  for (let index = 0; index < 110; index++) useQueryHistoryStore.getState().record({
    id: String(index), connectionId: index % 2 ? 'a' : 'b', sql: 'SELECT '.repeat(2000),
    startedAt: new Date().toISOString(), durationMs: 10, outcome: 'succeeded'
  })
  assert.equal(useQueryHistoryStore.getState().entries.length, 100)
  assert.ok(useQueryHistoryStore.getState().entries.every((entry) => entry.sql.length <= 10000))
  assert.ok(useQueryHistoryStore.getState().entries.every((entry) => entry.truncated))
  const newest = useQueryHistoryStore.getState().entries[0]!
  useQueryHistoryStore.getState().record({ ...newest, outcome: 'failed' })
  assert.equal(useQueryHistoryStore.getState().entries.length, 100)
  assert.equal(useQueryHistoryStore.getState().entries[0]?.outcome, 'failed')
  useQueryHistoryStore.getState().clear('a')
  assert.ok(useQueryHistoryStore.getState().entries.every((entry) => entry.connectionId === 'b'))
  assert.equal(JSON.parse(storage.get('dbdesk-query-history')!).state.entries.length, 50)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Storage blocked by host') } })
  assert.doesNotThrow(() => useQueryHistoryStore.getState().record({ ...newest, id: 'blocked-storage' }))
  storage.clear()
  delete (globalThis as any).localStorage
})
