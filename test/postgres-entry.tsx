import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { PostgresConnectionEntry } from '../apps/web/src/components/connections/connection-forms/postgres/postgres-connection-entry'
const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url))
const React = requireWeb('react')
const { renderToString } = requireWeb('react-dom/server')
// Match the production ESM exports so providers share the same React contexts.
const { QueryClient, QueryClientProvider } = await import(requireWeb.resolve('@tanstack/react-query').replace(/\.cjs$/, '.js'))
const { createRootRoute, createRouter, createMemoryHistory, RouterProvider } = await import(requireWeb.resolve('@tanstack/react-router').replace('/cjs/', '/esm/').replace(/\.cjs$/, '.js'))

test('new connection renders only the URI form; opening it does not connect', async () => {
  let connected = false
  const route = createRootRoute({ component: () => <PostgresConnectionEntry onSuccess={() => { connected = true }} /> })
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  const html = renderToString(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>)
  assert.ok(html.includes('postgres-quick-connect'))
  assert.ok(html.includes('No separate form fields are required'))
  for (const name of ['host', 'database', 'user', 'password', 'name', 'port']) assert.ok(!html.includes(`id="${name}"`), name)
  assert.ok(html.includes('type="submit"'))
  assert.equal(connected, false)
})
