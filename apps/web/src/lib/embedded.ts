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
 *
 * When embedded:
 * - The theme toggle are hidden (checked via `isEmbedded`)
 * - Theme is synced from the parent via postMessage
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
