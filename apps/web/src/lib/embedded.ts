import {
  getRuntimeConfig,
  interpolateConnectionPath,
  normalizeBasePath
} from '@common/config'

/**
 * Centralized utilities for DBDesk Studio embedded mode.
 *
 * Third-party integration boundary:
 * When Studio runs inside a parent application (for example, Autobase) via an
 * iframe, this module is the only place that should interpret the host
 * postMessage protocol. Event names, origins, UI policy, and routing are read
 * from autobase.yaml through the shared runtime registry.
 *
 * This module provides:
 *
 *  - `isEmbedded()` — configured iframe detection
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

/** True when running inside an enabled embedding host. */
export function isEmbedded(): boolean {
  const mode = getRuntimeConfig().embedding.enabled
  if (mode === true) return true
  if (mode === false) return false
  try {
    return window.self !== window.top
  } catch {
    // Cross-origin iframe — we're definitely embedded
    return true
  }
}

function isAllowedParentMessage(event: MessageEvent): boolean {
  // Do not accept messages from sibling frames or arbitrary windows. The
  // origin allowlist is configured centrally so each host can tighten it.
  if (!isEmbedded() || event.source !== window.parent) return false
  const { allowedOrigins } = getRuntimeConfig().embedding
  return allowedOrigins.includes('*') || allowedOrigins.includes(event.origin)
}

function postToParent(message: Record<string, unknown>): void {
  // targetOrigin is deliberately configurable for hosts that do not use '*'.
  window.parent.postMessage(message, getRuntimeConfig().embedding.targetOrigin)
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
  if (!isEmbedded()) return

  window.addEventListener('message', (event) => {
    const config = getRuntimeConfig()
    if (!config.embedding.theme.syncFromParent) return
    if (!isAllowedParentMessage(event)) return
    if (
      event.data &&
      typeof event.data === 'object' &&
      event.data.type === config.embedding.messages.setTheme &&
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
  const config = getRuntimeConfig()
  if (!isEmbedded()) return

  console.log('[dbdesk-connect] isEmbedded:', isEmbedded())

  window.addEventListener('message', async (event) => {
    if (
      !event.data ||
      typeof event.data !== 'object' ||
      event.data.type !== config.embedding.messages.connect ||
      !isAllowedParentMessage(event)
    ) {
      return
    }

    // The connection payload is a host-to-Studio API. Do not add host-specific
    // fields here; extend the shared contract only when another embedder needs
    // the same capability.
    const conn = event.data.connection
    if (!conn || typeof conn !== 'object') return

    const {
      host,
      port,
      database,
      user,
      password,
      type = config.embedding.connection.defaultType,
      name,
    } = conn as {
      host: string
      port: number
      database: string
      user: string
      password: string
      type?: string
      name?: string
    }

    try {
      const connectionType = type === 'postgres' ? 'postgres' : config.embedding.connection.defaultType
      if (connectionType !== 'postgres') {
        throw new Error(`Unsupported embedded connection type: ${connectionType}`)
      }
      const displayName = name || `${database || config.embedding.connection.defaultDatabase}@${host}`

      // Lazy import avoids a startup cycle between the host bridge and API
      // client, and keeps standalone startup independent of the bridge.
      const { dbdeskClient } = await import('@/api/client')

      const resolvedPort = Number(port) || config.embedding.connection.defaultPort
      const resolvedDatabase = database || config.embedding.connection.defaultDatabase
      const resolvedUser = user || config.embedding.connection.defaultUser
      const existingProfile = config.embedding.connection.reuseExistingProfile
        ? (await dbdeskClient.listConnections()).find((candidate) => {
            if (candidate.type !== 'postgres') return false
            const options = candidate.options
            return options.host === host && options.port === resolvedPort && options.database === resolvedDatabase && options.user === resolvedUser
          })
        : undefined

      const profile = existingProfile
        ? await dbdeskClient.updateConnection(existingProfile.id, displayName, 'postgres', {
            host,
            port: resolvedPort,
            database: resolvedDatabase,
            user: resolvedUser,
            password: password || existingProfile.options.password
          })
        : await dbdeskClient.createConnection(displayName, 'postgres', {
            host,
            port: resolvedPort,
            database: resolvedDatabase,
            user: resolvedUser,
            password
          })

      // Connect to it
      await dbdeskClient.connect(profile.id)

      // Navigate to the SQL workspace
      const path = interpolateConnectionPath(config.routing.postConnectPath, profile.id)
      const basePath = normalizeBasePath(config.routing.basePath)
      window.location.hash = `${basePath.replace(/\/$/, '')}${path}`

      // Notify parent of success
      postToParent({ type: config.embedding.messages.connected, connectionId: profile.id })
    } catch (err) {
      console.error('[dbdesk-connect] Failed to create/connect:', err)
      postToParent({
        type: config.embedding.messages.connectError,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  })

  // Tell the parent we're ready to receive messages
  postToParent({ type: config.embedding.messages.ready })
}
