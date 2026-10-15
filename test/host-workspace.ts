import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setupNativeWorkspaceBridge } from '../apps/web/src/lib/embedded'
import { useSqlWorkspaceStore } from '../apps/web/src/store/sql-workspace-store'
import { useTabStore } from '../apps/web/src/store/tab-store'

test('native result delivery waits for restoration and cannot reconnect or execute SQL', async () => {
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })
  const connectionId = '75d3cc86-c688-4af3-afc5-047e6eed774d'
  let navigations = 0
  setupNativeWorkspaceBridge(async (id) => {
    navigations++
    const workspace = useSqlWorkspaceStore.getState()
    workspace.setCurrentConnection(id)
    setTimeout(() => {
      useTabStore.getState().reset()
      useSqlWorkspaceStore.getState().setWorkspaceReady(id)
    }, 20)
  })
  const bridge = (window as any).__DBDESK_WORKSPACE__
  const payload = { id: 'approved-action', phase: 'prepare', connectionId, sql: 'SELECT 1', mode: 'read' }
  assert.equal(await bridge.present(payload), true)
  const tabId = useTabStore.getState().activeTabId!
  assert.equal(useTabStore.getState().findQueryTabById(tabId)?.editorContent, 'SELECT 1')
  assert.equal(useTabStore.getState().findQueryTabById(tabId)?.hostRunning, true)
  const result = { columns: ['check'], rows: [{ check: 1 }], rowCount: 1 }
  assert.equal(await bridge.present({ ...payload, phase: 'result', result }), true)
  assert.equal(navigations, 1)
  assert.equal(useTabStore.getState().findQueryTabById(tabId)?.queryResults?.rows[0].check, 1)
  assert.equal(useTabStore.getState().findQueryTabById(tabId)?.hostRunning, false)
  assert.equal(await bridge.present({ ...payload, phase: 'result', result }), true)
  assert.equal(useTabStore.getState().tabs.length, 1)
  useSqlWorkspaceStore.getState().setDisconnecting(connectionId)
  useSqlWorkspaceStore.getState().reset()
  useTabStore.getState().reset()
  assert.equal(await bridge.present({ ...payload, phase: 'result', result }), false)
  assert.equal(navigations, 1)
  assert.equal(useSqlWorkspaceStore.getState().currentConnectionId, null)
  assert.equal(await bridge.present({ ...payload, connectionId: 'untrusted/path' }), false)
})
