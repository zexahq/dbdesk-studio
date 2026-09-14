import {
  defaultRuntimeConfig,
  getRuntimeConfig,
  normalizeBasePath,
  parseRuntimeConfig,
  setRuntimeConfig
} from '@common/config'

type RuntimeWindow = Window & { __DBDESK_BASE_PATH__?: string }

/**
 * Resolve the public URL prefix before the YAML file is loaded.
 *
 * Third-party hosts that mount Studio below a sub-path must inject
 * `__DBDESK_BASE_PATH__` in the bootstrap HTML so the registry itself can be
 * fetched from the correct location.
 */
export function getRuntimeBasePath(): string {
  const injectedPath = (window as RuntimeWindow).__DBDESK_BASE_PATH__
  return normalizeBasePath(injectedPath || getRuntimeConfig().routing.basePath)
}

export async function loadRuntimeConfig(): Promise<void> {
  const basePath = getRuntimeBasePath()
  try {
    const response = await fetch(`${basePath}autobase.yaml`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    setRuntimeConfig(parseRuntimeConfig(await response.text()))
  } catch (error) {
    // A standalone deployment should remain usable if the optional registry
    // is unavailable; the shared defaults preserve the original behavior.
    console.warn('[runtime-config] Using defaults:', error)
    setRuntimeConfig(defaultRuntimeConfig)
  }
}
