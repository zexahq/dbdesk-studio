import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dbdeskClient } from '../apps/web/src/api/client'
import { mapWithConcurrency } from '../apps/web/src/lib/async'

test('schema introspection forwards cancellation and queued work stops after abort', async () => {
  const previousFetch = globalThis.fetch
  const previousWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', { value: { __DBDESK_BASE_PATH__: '/dbdesk/' }, configurable: true })
  const controller = new AbortController()
  let requests = 0
  globalThis.fetch = async (_url, options) => {
    assert.equal(options?.signal, controller.signal)
    requests++
    controller.abort()
    throw new DOMException('Cancelled', 'AbortError')
  }
  try {
    const results = await mapWithConcurrency(Array.from({ length: 100 }, (_, index) => index), 4, async (index) => {
      controller.signal.throwIfAborted()
      return dbdeskClient.introspectTable('connection', 'public', `table-${index}`, controller.signal)
    })
    assert.equal(requests, 1)
    assert.equal(results.length, 100)
    assert.ok(results.every((result) => result.status === 'rejected'))
  } finally {
    globalThis.fetch = previousFetch
    Object.defineProperty(globalThis, 'window', { value: previousWindow, configurable: true })
  }
})
