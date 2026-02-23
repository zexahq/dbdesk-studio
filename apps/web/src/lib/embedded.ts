/**
 * Utilities for detecting when DBDesk Studio is embedded inside
 * a parent application (e.g. autobase console) via an iframe.
 *
 * When embedded:
 * - The disconnect button and theme toggle are hidden
 * - Theme is synced from the parent via postMessage
 */

/** True when running inside an iframe */
export const isEmbedded = (() => {
  try {
    return window.self !== window.top
  } catch {
    // Cross-origin iframe — we're definitely embedded
    return true
  }
})()
