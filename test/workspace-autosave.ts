import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dbdeskClient } from '../apps/web/src/api/client'
import { saveCurrentWorkspace, subscribeWorkspaceAutosave } from '../apps/web/src/lib/workspace'
import { useSqlWorkspaceStore } from '../apps/web/src/store/sql-workspace-store'
import { useTabStore } from '../apps/web/src/store/tab-store'
import { parseWorkspace } from '../apps/server/src/workspace-validation'

test('workspace autosave waits for restoration, coalesces edits and flushes before project switches', async () => {
  const originalWindow = globalThis.window
  const originalSave = dbdeskClient.saveWorkspace
  const listeners = new Map<string, () => void>()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type)
  } })
  const writes: any[] = []
  dbdeskClient.saveWorkspace = async (workspace) => { writes.push(JSON.parse(JSON.stringify(workspace))) }
  useSqlWorkspaceStore.getState().setCurrentConnection('a')
  const unsubscribe = subscribeWorkspaceAutosave('a', 10)
  try {
    const tab = useTabStore.getState().addQueryTab()
    useTabStore.getState().updateQueryTab(tab, { editorContent: 'SELECT restored' })
    await new Promise((done) => setTimeout(done, 20))
    assert.equal(writes.length, 0)
    useSqlWorkspaceStore.getState().setWorkspaceReady('a')
    useTabStore.getState().updateQueryTab(tab, { editorContent: 'SELECT 1' })
    useTabStore.getState().updateQueryTab(tab, { editorContent: 'SELECT 2' })
    await new Promise((done) => setTimeout(done, 30))
    assert.equal(writes.length, 1)
    assert.equal(parseWorkspace(writes[0], 'a').tabs.length, 1)
    assert.equal(writes[0].tabs[0].editorContent, 'SELECT 2')
    useTabStore.getState().updateQueryTab(tab, { queryResults: { columns: [], rows: [], rowCount: 0 } })
    await new Promise((done) => setTimeout(done, 20))
    assert.equal(writes.length, 1)
    useTabStore.getState().updateQueryTab(tab, { editorContent: 'SELECT 3' })
    await saveCurrentWorkspace()
    assert.equal(writes.at(-1).tabs[0].editorContent, 'SELECT 3')
    useTabStore.getState().updateQueryTab(tab, { editorContent: 'SELECT 4' })
    listeners.get('pagehide')!()
    await saveCurrentWorkspace()
    assert.equal(writes.at(-1).tabs[0].editorContent, 'SELECT 4')
    useSqlWorkspaceStore.getState().setCurrentConnection('b')
    useTabStore.getState().reset()
    await new Promise((done) => setTimeout(done, 20))
    assert.equal(writes.length, 3)
  } finally {
    unsubscribe()
    dbdeskClient.saveWorkspace = originalSave
    useSqlWorkspaceStore.getState().reset()
    useTabStore.getState().reset()
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('failed workspace saves retain the latest draft and never replay an older queued snapshot', async () => {
  const originalWindow = globalThis.window
  const originalSave = dbdeskClient.saveWorkspace
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    addEventListener: () => {}, removeEventListener: () => {}
  } })
  useSqlWorkspaceStore.getState().setCurrentConnection('retry')
  useSqlWorkspaceStore.getState().setWorkspaceReady('retry')
  const unsubscribe = subscribeWorkspaceAutosave('retry', 60000)
  const attempts: string[] = []
  let shouldFail = true
  dbdeskClient.saveWorkspace = async (workspace) => {
    attempts.push((workspace.tabs[0] as any).editorContent)
    if (shouldFail) throw new Error('Storage unavailable')
  }
  try {
    const tab = useTabStore.getState().addQueryTab()
    useTabStore.getState().updateQueryTab(tab, { editorContent: 'SELECT retry_me' })
    await assert.rejects(saveCurrentWorkspace(), /Storage unavailable/)
    shouldFail = false
    await saveCurrentWorkspace()
    assert.deepEqual(attempts, ['SELECT retry_me', 'SELECT retry_me'])

    let rejectFirst!: (error: Error) => void
    let began!: () => void
    const started = new Promise<void>((done) => { began = done })
    attempts.length = 0
    dbdeskClient.saveWorkspace = async (workspace) => {
      attempts.push((workspace.tabs[0] as any).editorContent)
      if (attempts.length === 1) {
        began()
        await new Promise<void>((_done, reject) => { rejectFirst = reject })
      }
    }
    useTabStore.getState().updateQueryTab(tab, { editorContent: 'SELECT old' })
    const first = assert.rejects(saveCurrentWorkspace(), /Old save failed/)
    await started
    useTabStore.getState().updateQueryTab(tab, { editorContent: 'SELECT latest' })
    const second = saveCurrentWorkspace()
    rejectFirst(new Error('Old save failed'))
    await first
    await second
    await saveCurrentWorkspace()
    assert.deepEqual(attempts, ['SELECT old', 'SELECT latest'])
  } finally {
    unsubscribe()
    dbdeskClient.saveWorkspace = originalSave
    useSqlWorkspaceStore.getState().reset()
    useTabStore.getState().reset()
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})
