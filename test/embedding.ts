import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultRuntimeConfig, setRuntimeConfig } from '../packages/common/config'
import { setupEmbeddedConnectListener, setupEmbeddedThemeListener } from '../apps/web/src/lib/embedded'
import { dbdeskClient } from '../apps/web/src/api/client'
import { loadRuntimeConfig } from '../apps/web/src/lib/runtime-config'
import { saveCurrentWorkspace, subscribeWorkspaceAutosave } from '../apps/web/src/lib/workspace'
import { useSqlWorkspaceStore } from '../apps/web/src/store/sql-workspace-store'
import { useTabStore } from '../apps/web/src/store/tab-store'

test('embedding checks parent/origin, announces readiness, serializes project switches and respects the base path', async () => {
  const originalWindow = globalThis.window
  const originalMethods = { listConnections: dbdeskClient.listConnections, createConnection: dbdeskClient.createConnection, connect: dbdeskClient.connect }
  const listeners: ((event: any) => unknown)[] = []
  const messages: { message: any; origin: string }[] = []
  const parent = { postMessage: (message: any, origin: string) => messages.push({ message, origin }) }
  const fake = { parent, location: { hash: '' }, addEventListener: (_type: string, handler: any) => listeners.push(handler), __DBDESK_PROJECT_ID__: '' }
  Object.defineProperty(globalThis, 'window', { value: fake, configurable: true })
  setRuntimeConfig({ ...defaultRuntimeConfig, embedding: { ...defaultRuntimeConfig.embedding, enabled: true,
    allowedOrigins: ['https://host.example'], targetOrigin: 'https://host.example',
    projects: { enabled: true, id: '' } }, routing: { ...defaultRuntimeConfig.routing, basePath: '/dbdesk/' } })
  const scopes: string[] = []
  let release!: () => void
  let began!: () => void
  const started = new Promise<void>((done) => { began = done })
  const first = new Promise<void>((done) => { release = done })
  dbdeskClient.listConnections = async () => []
  dbdeskClient.createConnection = async (_name, _type, options) => {
    const scope = fake.__DBDESK_PROJECT_ID__
    scopes.push(scope)
    began()
    if (scope === 'a') await first
    assert.equal(fake.__DBDESK_PROJECT_ID__, scope)
    return { id: scope, options } as any
  }
  dbdeskClient.connect = async (id) => {
    assert.equal(fake.__DBDESK_PROJECT_ID__, id)
    return { success: true }
  }
  try {
    setupEmbeddedConnectListener()
    assert.equal(messages[0]?.message.type, 'dbdesk-ready')
    const event = (projectId: string, origin = 'https://host.example', source: unknown = parent) => ({ source, origin,
      data: { type: 'dbdesk-connect', projectId, connection: { host: 'localhost', password: '' } } })
    await listeners[0]!(event('rejected', 'https://other.example'))
    await listeners[0]!(event('rejected', 'https://host.example', {}))
    assert.deepEqual(scopes, [])
    const a = listeners[0]!(event('a'))
    const b = listeners[0]!(event('b'))
    await started
    assert.deepEqual(scopes, ['a'])
    release()
    await Promise.all([a, b])
    assert.deepEqual(scopes, ['a', 'b'])
    assert.equal(fake.location.hash, '/dbdesk/connections/b')
    assert.deepEqual(messages.map(({ message }) => message.type), ['dbdesk-ready', 'dbdesk-connected', 'dbdesk-connected'])
    assert.ok(messages.every(({ origin }) => origin === 'https://host.example'))
    const themes: string[] = []
    setupEmbeddedThemeListener((theme) => themes.push(theme))
    await listeners[1]!({ source: parent, origin: 'https://other.example', data: { type: 'dbdesk-set-theme', theme: 'light' } })
    await listeners[1]!({ source: parent, origin: 'https://host.example', data: { type: 'dbdesk-set-theme', theme: 'dark' } })
    assert.deepEqual(themes, ['dark'])
  } finally {
    Object.assign(dbdeskClient, originalMethods)
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
    setRuntimeConfig(defaultRuntimeConfig)
  }
})

test('runtime registry uses an injected base path and missing configuration keeps standalone defaults', async () => {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'window', { value: { __DBDESK_BASE_PATH__: '/tools/dbdesk/' }, configurable: true })
  const urls: string[] = []
  globalThis.fetch = async (url) => { urls.push(String(url)); return new Response('embedding:\n  enabled: false\n') }
  try {
    await loadRuntimeConfig()
    assert.deepEqual(urls, ['/tools/dbdesk/runtime.yaml'])
    globalThis.fetch = async () => new Response('missing', { status: 404 })
    await loadRuntimeConfig()
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
    setRuntimeConfig(defaultRuntimeConfig)
  }
})

test('embedding reports a failed workspace flush and keeps the previous project selected', async (t) => {
  const originalWindow = globalThis.window
  const originalSave = dbdeskClient.saveWorkspace
  const originalList = dbdeskClient.listConnections
  const messages: any[] = []
  let listener!: (event: any) => Promise<void>
  const parent = { postMessage: (message: any) => messages.push(message) }
  const fake = { parent, __DBDESK_PROJECT_ID__: 'a', location: { hash: '' },
    addEventListener: (type: string, callback: any) => { if (type === 'message') listener = callback },
    removeEventListener: () => {} }
  Object.defineProperty(globalThis, 'window', { value: fake, configurable: true })
  setRuntimeConfig({ ...defaultRuntimeConfig, embedding: { ...defaultRuntimeConfig.embedding, enabled: true } })
  useSqlWorkspaceStore.getState().setCurrentConnection('current')
  useSqlWorkspaceStore.getState().setWorkspaceReady('current')
  const unsubscribe = subscribeWorkspaceAutosave('current', 60000)
  let listed = 0
  dbdeskClient.listConnections = async () => { listed++; return [] }
  dbdeskClient.saveWorkspace = async () => { throw new Error('Workspace storage unavailable') }
  t.mock.method(console, 'error', () => {})
  try {
    const id = useTabStore.getState().addQueryTab()
    useTabStore.getState().updateQueryTab(id, { editorContent: 'SELECT unsaved' })
    setupEmbeddedConnectListener()
    await listener({ source: parent, origin: 'https://host.example', data: {
      type: 'dbdesk-connect', projectId: 'b', connection: { host: 'localhost' }
    } })
    assert.equal(fake.__DBDESK_PROJECT_ID__, 'a')
    assert.equal(listed, 0)
    assert.equal(messages.at(-1).type, 'dbdesk-connect-error')
    assert.match(messages.at(-1).error, /Workspace storage unavailable/)
    dbdeskClient.saveWorkspace = async () => {}
    await saveCurrentWorkspace()
  } finally {
    unsubscribe()
    dbdeskClient.saveWorkspace = originalSave
    dbdeskClient.listConnections = originalList
    useSqlWorkspaceStore.getState().reset()
    useTabStore.getState().reset()
    setRuntimeConfig(defaultRuntimeConfig)
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})
