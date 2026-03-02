/**
 * Centralized utilities for DBDesk Studio embedded mode.
 *
 * When DBDesk Studio runs inside a parent application (e.g. autobase console)
 * via an iframe, this module provides:
 *
 *  - `isEmbedded`  — boolean flag for iframe detection
 *  - `setupEmbeddedConnectListener()` — auto-creates a connection from
 *     a `dbdesk-connect` postMessage sent by the parent
 *  - `setupEmbeddedThemeListener(setTheme)` — syncs theme from the parent
 *     via a `dbdesk-set-theme` postMessage
 *
 * Embedded behaviour registry
 *
 * Every file that uses embedded-related logic is listed below. When adding
 * new embedded behaviour, **update this list** so the registry stays current.
 *
 * | Consumer                                      | What changes when embedded                              |
 * | --------------------------------------------- | ------------------------------------------------------- |
 * | `components/main-sidebar.tsx`                 | Hides `<ThemeToggle />` (theme controlled by parent)    |
 * | `components/sql/workspace-topbar.tsx`         | Hides the disconnect button                             |
 * | `components/quick-panel.tsx`                  | Hides "Disconnect" command and "Toggle Theme" command   |
 * | `store/theme-store.ts`                        | Calls `setupEmbeddedThemeListener` to sync parent theme |
 * | `lib/embedded.ts` (this file)                  | `setupEmbeddedConnectListener` — auto-connect via       |
 * |                                               | `dbdesk-connect` postMessage from parent frame          |
 *
 * When embedded:
 * - The disconnect button and theme toggle are hidden (checked via `isEmbedded`)
 * - Theme is synced from the parent via postMessage
 */

import { dbdeskClient } from '@/api/client'

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** True when running inside an iframe */
export const isEmbedded = (() => {
  try {
    return window.self !== window.top
  } catch {
    // Cross-origin iframe — we're definitely embedded
    return true
  }
})()

// ---------------------------------------------------------------------------
// Embedded connect listener
// ---------------------------------------------------------------------------

interface DbdeskConnectPayload {
  type: 'dbdesk-connect'
  connection: {
    host: string
    port: string | number
    user: string
    password: string
    database?: string
  }
}

function isConnectMessage(data: unknown): data is DbdeskConnectPayload {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    d.type === 'dbdesk-connect' &&
    d.connection != null &&
    typeof d.connection === 'object'
  )
}

/**
 * Listen for "dbdesk-connect" postMessage events sent by a parent frame
 * and auto-create + navigate to a connection.
 *
 * The parent sends:
 *   { type: 'dbdesk-connect', connection: { host, port, user, password, database } }
 *
 * Uses `createConnection()` (saves profile without testing connectivity)
 * instead of `createConnectionFromUri()` (which validates and fails if DB
 * is unreachable). The connection page handles the actual DB session.
 *
 * Call once at app startup (e.g. from main.tsx). No-op when not embedded.
 */
export function setupEmbeddedConnectListener() {
  console.log('[dbdesk-connect] isEmbedded:', isEmbedded)
  if (!isEmbedded) return

  let connecting = false

  window.addEventListener('message', async (event) => {
    console.log('[dbdesk-connect] message received:', event.data?.type, 'connecting:', connecting)
    if (!isConnectMessage(event.data) || connecting) return

    connecting = true
    try {
      const conn = event.data.connection
      console.log('[dbdesk-connect] connection payload:', JSON.stringify(conn))
      const host = conn.host || 'localhost'
      const port = typeof conn.port === 'string' ? parseInt(conn.port, 10) || 5432 : (conn.port || 5432)
      const database = conn.database || 'postgres'
      const user = conn.user || 'postgres'
      const password = conn.password || ''

      // Save the connection profile without testing connectivity.
      const profile = await dbdeskClient.createConnection(
        `${user}@${host}`,   // name
        'postgres',            // type
        { host, port, database, user, password },
      )

      console.log('[dbdesk-connect] profile created:', profile.id)
      // Use window.location for reliable navigation inside the iframe.
      window.location.replace(`/connections/${encodeURIComponent(profile.id)}`)
    } catch (err) {
      console.error('[dbdesk-connect] Failed to create connection profile:', err)
    } finally {
      connecting = false
    }
  })

  console.log('[dbdesk-connect] listener registered')

  // Signal to the parent frame that we are ready to receive messages.
  // This solves a timing issue: the parent's iframe onLoad can fire
  // before our module script has executed, so the parent's initial
  // postMessage gets lost. With this handshake the parent waits for
  // "dbdesk-ready" before sending the connection data.
  try {
    window.parent.postMessage({ type: 'dbdesk-ready' }, '*')
    console.log('[dbdesk-connect] sent dbdesk-ready to parent')
  } catch (err) {
    console.warn('[dbdesk-connect] could not send ready signal:', err)
  }
}

// ---------------------------------------------------------------------------
// Embedded theme listener
// ---------------------------------------------------------------------------

/**
 * Listen for `dbdesk-set-theme` postMessage events from the parent frame
 * and forward them to the supplied `setTheme` callback.
 *
 * Call once at app startup. No-op when not embedded.
 *
 * @param setTheme — typically `useThemeStore.getState().setTheme`
 */
export function setupEmbeddedThemeListener(
  setTheme: (theme: 'light' | 'dark') => void,
) {
  if (!isEmbedded) return

  window.addEventListener('message', (event) => {
    if (
      event.data &&
      typeof event.data === 'object' &&
      event.data.type === 'dbdesk-set-theme' &&
      (event.data.theme === 'light' || event.data.theme === 'dark')
    ) {
      setTheme(event.data.theme)
    }
  })
}
