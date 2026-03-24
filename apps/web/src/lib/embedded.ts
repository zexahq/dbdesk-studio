/**
 * Centralized utilities for DBDesk Studio embedded mode.
 *
 * When DBDesk Studio runs inside a parent application (e.g. autobase console)
 * via an iframe, this module provides:
 *
 *  - `isEmbedded`  — boolean flag for iframe detection
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
 * | `components/quick-panel.tsx`                  | Hides "Toggle Theme" command                            |
 * | `store/theme-store.ts`                        | Calls `setupEmbeddedThemeListener` to sync parent theme |
 * | `lib/embedded.ts` (this file)                  | `setupEmbeddedThemeListener` — syncs theme from parent  |
 * | `main.tsx`                                     | Calls `setupEmbeddedConnectListener` at startup         |
 *
 * When embedded:
 * - The theme toggle are hidden (checked via `isEmbedded`)
 * - Theme is synced from the parent via postMessage
 * - Parent can send `dbdesk-connect` to auto-create and connect to a database
 */

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

// ---------------------------------------------------------------------------
// Embedded connect listener
// ---------------------------------------------------------------------------

/**
 * Listen for `dbdesk-connect` postMessage events from the parent frame.
 *
 * When received the listener will:
 *  1. Create a new connection profile via the HTTP API
 *  2. Connect to it
 *  3. Navigate the app to the connection's SQL workspace
 *  4. Reply with `{ type: "dbdesk-connected", connectionId }` on success
 *     or `{ type: "dbdesk-connect-error", error }` on failure
 *
 * Also sends `{ type: "dbdesk-ready" }` to the parent once the listener
 * is registered so the parent knows it can start sending messages.
 *
 * Expected payload from parent:
 * ```
 * {
 *   type: "dbdesk-connect",
 *   connection: {
 *     host: string,
 *     port: number,
 *     database: string,
 *     user: string,
 *     password: string,
 *     type?: "postgres"              // defaults to "postgres"
 *     name?: string                  // display name, defaults to "database@host"
 *   }
 * }
 * ```
 *
 * Call once at app startup. No-op when not embedded.
 */
export function setupEmbeddedConnectListener(): void {
  if (!isEmbedded) return

  console.log('[dbdesk-connect] isEmbedded:', isEmbedded)

  window.addEventListener('message', async (event) => {
    if (
      !event.data ||
      typeof event.data !== 'object' ||
      event.data.type !== 'dbdesk-connect'
    ) {
      return
    }

    const conn = event.data.connection
    if (!conn || typeof conn !== 'object') return

    const {
      host,
      port,
      database,
      user,
      password,
      type = 'postgres',
      name,
    } = conn as {
      host: string
      port: number
      database: string
      user: string
      password: string
      type?: 'postgres'
      name?: string
    }

    const displayName = name || `${database}@${host}`

    try {
      // Lazy import to avoid circular deps at module level
      const { dbdeskClient } = await import('@/api/client')

      // Create the connection profile
      const profile = await dbdeskClient.createConnection(displayName, type, {
        host,
        port: Number(port),
        database,
        user,
        password,
      })

      // Connect to it
      await dbdeskClient.connect(profile.id)

      // Navigate to the SQL workspace
      window.location.hash = `/connections/${profile.id}`

      // Notify parent of success
      window.parent.postMessage(
        { type: 'dbdesk-connected', connectionId: profile.id },
        '*',
      )
    } catch (err) {
      console.error('[dbdesk-connect] Failed to create/connect:', err)
      window.parent.postMessage(
        {
          type: 'dbdesk-connect-error',
          error: err instanceof Error ? err.message : String(err),
        },
        '*',
      )
    }
  })

  // Tell the parent we're ready to receive messages
  window.parent.postMessage({ type: 'dbdesk-ready' }, '*')
}
