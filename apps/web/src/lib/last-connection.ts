/**
 * Remembers the last actively-used connection so a full page reload restores
 * the user's SQL workspace instead of dropping them back on the connections
 * list.
 *
 * This matters most in embedded mode: the host app (e.g. the autobase console)
 * mounts DBDesk Studio in an iframe pointed at the base URL, so a reload of the
 * host resets the iframe to `/` and the in-memory route/connection is lost.
 * Persisting the id in `localStorage` lets the app navigate back to
 * `/connections/$connectionId` on boot.
 *
 * All storage access is best-effort and guarded — it degrades to a no-op when
 * `localStorage` is unavailable (private mode, sandboxed iframe, SSR).
 */
import type { ConnectionProfile } from '@common/types'

const STORAGE_KEY = 'dbdesk:last-connection-id'

/** The id of the last connection the user actively worked in, or null. */
export function getLastConnectionId(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value && value.trim().length > 0 ? value : null
  } catch {
    return null
  }
}

/** Remember `connectionId` as the last active connection. No-op if falsy. */
export function setLastConnectionId(connectionId: string): void {
  if (!connectionId || connectionId.trim().length === 0) return
  try {
    window.localStorage.setItem(STORAGE_KEY, connectionId)
  } catch {
    // best-effort — ignore storage failures
  }
}

/** Forget the remembered connection (e.g. on disconnect or delete). */
export function clearLastConnectionId(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // best-effort — ignore storage failures
  }
}

/**
 * Whether a fetched profile is safe to auto-restore into. Guards against
 * restoring a malformed/empty profile: SQL connections must carry an actual
 * target (host + database). Non-SQL profiles only need a valid id/type since
 * the editor renders a placeholder for them.
 */
export function isRestorableConnection(
  profile: ConnectionProfile | null | undefined,
): profile is ConnectionProfile {
  if (!profile || !profile.id || !profile.type) return false

  if (profile.type === 'postgres') {
    const options = profile.options
    return Boolean(options && options.host && options.database)
  }

  return true
}
