import { parse } from 'yaml'

/**
 * Shared runtime contract for third-party hosts embedding Studio.
 *
 * Keep this type independent from Autobase so integrations can provide their
 * own event names, origins, UI policy, and route prefix through the same YAML
 * registry. The browser and server-side tooling should consume this type
 * rather than introducing host-specific constants in feature code.
 */
export type EmbeddingMode = boolean | 'auto'

/** Stable feature identifiers used by the host-controlled feature registry. */
export type RuntimeFeature = 'dashboard' | 'schema-visualizer'

export interface RuntimeConfig {
  /**
   * Provider-neutral feature controller. Hosts can hide optional Studio
   * surfaces without forking components or adding host-specific conditionals.
   */
  features: {
    excluded: string[]
  }
  embedding: {
    enabled: EmbeddingMode
    allowedOrigins: string[]
    targetOrigin: string
    messages: {
      ready: string
      connect: string
      connected: string
      connectError: string
      setTheme: string
    }
    ui: {
      hideThemeControls: boolean
      hideDisconnect: boolean
    }
    theme: {
      syncFromParent: boolean
    }
    connection: {
      defaultType: string
      defaultPort: number
      defaultDatabase: string
      defaultUser: string
      reuseExistingProfile: boolean
      restoreLastConnection: boolean
      clearRememberedOnDisconnect: boolean
    }
  }
  routing: {
    basePath: string
    apiBasePath: string
    postConnectPath: string
  }
}

export const defaultRuntimeConfig: RuntimeConfig = {
  features: {
    excluded: []
  },
  embedding: {
    enabled: 'auto',
    allowedOrigins: ['*'],
    targetOrigin: '*',
    messages: {
      ready: 'dbdesk-ready',
      connect: 'dbdesk-connect',
      connected: 'dbdesk-connected',
      connectError: 'dbdesk-connect-error',
      setTheme: 'dbdesk-set-theme'
    },
    ui: {
      hideThemeControls: true,
      hideDisconnect: false
    },
    theme: {
      syncFromParent: true
    },
    connection: {
      defaultType: 'postgres',
      defaultPort: 5432,
      defaultDatabase: 'postgres',
      defaultUser: 'postgres',
      reuseExistingProfile: true,
      restoreLastConnection: true,
      clearRememberedOnDisconnect: true
    }
  },
  routing: {
    basePath: '/',
    apiBasePath: '',
    postConnectPath: '/connections/{connectionId}'
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

const asString = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.length > 0 ? value : fallback

const asBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback

const asNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const asOrigins = (value: unknown, fallback: string[]) =>
  Array.isArray(value) && value.every((origin) => typeof origin === 'string')
    ? value
    : fallback

const asStringArray = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : fallback

export function parseRuntimeConfig(text: string): RuntimeConfig {
  // Config is intentionally normalized at the boundary. A malformed or
  // partially populated third-party file falls back field-by-field instead
  // of preventing Studio from booting entirely.
  const raw = asRecord(parse(text))
  const features = asRecord(raw.features)
  const embedding = asRecord(raw.embedding)
  const messages = asRecord(embedding.messages)
  const ui = asRecord(embedding.ui)
  const theme = asRecord(embedding.theme)
  const connection = asRecord(embedding.connection)
  const routing = asRecord(raw.routing)
  const enabled = embedding.enabled === true || embedding.enabled === false || embedding.enabled === 'auto'
    ? embedding.enabled
    : defaultRuntimeConfig.embedding.enabled

  return {
    features: {
      excluded: asStringArray(features.excluded, defaultRuntimeConfig.features.excluded)
    },
    embedding: {
      enabled,
      allowedOrigins: asOrigins(embedding.allowedOrigins, defaultRuntimeConfig.embedding.allowedOrigins),
      targetOrigin: asString(embedding.targetOrigin, defaultRuntimeConfig.embedding.targetOrigin),
      messages: {
        ready: asString(messages.ready, defaultRuntimeConfig.embedding.messages.ready),
        connect: asString(messages.connect, defaultRuntimeConfig.embedding.messages.connect),
        connected: asString(messages.connected, defaultRuntimeConfig.embedding.messages.connected),
        connectError: asString(messages.connectError, defaultRuntimeConfig.embedding.messages.connectError),
        setTheme: asString(messages.setTheme, defaultRuntimeConfig.embedding.messages.setTheme)
      },
      ui: {
        hideThemeControls: asBoolean(ui.hideThemeControls, defaultRuntimeConfig.embedding.ui.hideThemeControls),
        hideDisconnect: asBoolean(ui.hideDisconnect, defaultRuntimeConfig.embedding.ui.hideDisconnect)
      },
      theme: {
        syncFromParent: asBoolean(theme.syncFromParent, defaultRuntimeConfig.embedding.theme.syncFromParent)
      },
      connection: {
        defaultType: asString(connection.defaultType, defaultRuntimeConfig.embedding.connection.defaultType),
        defaultPort: asNumber(connection.defaultPort, defaultRuntimeConfig.embedding.connection.defaultPort),
        defaultDatabase: asString(connection.defaultDatabase, defaultRuntimeConfig.embedding.connection.defaultDatabase),
        defaultUser: asString(connection.defaultUser, defaultRuntimeConfig.embedding.connection.defaultUser),
        reuseExistingProfile: asBoolean(connection.reuseExistingProfile, defaultRuntimeConfig.embedding.connection.reuseExistingProfile),
        restoreLastConnection: asBoolean(connection.restoreLastConnection, defaultRuntimeConfig.embedding.connection.restoreLastConnection),
        clearRememberedOnDisconnect: asBoolean(connection.clearRememberedOnDisconnect, defaultRuntimeConfig.embedding.connection.clearRememberedOnDisconnect)
      }
    },
    routing: {
      basePath: asString(routing.basePath, defaultRuntimeConfig.routing.basePath),
      apiBasePath: typeof routing.apiBasePath === 'string' ? routing.apiBasePath : defaultRuntimeConfig.routing.apiBasePath,
      postConnectPath: asString(routing.postConnectPath, defaultRuntimeConfig.routing.postConnectPath)
    }
  }
}

let runtimeConfig: RuntimeConfig = defaultRuntimeConfig

export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfig
}

export function setRuntimeConfig(config: RuntimeConfig): void {
  runtimeConfig = config
}

export function normalizeBasePath(path: string): string {
  if (!path || path === '/') return '/'
  return `/${path.replace(/^\/+|\/+$/g, '')}/`
}

/** Replace the route placeholder used by host-controlled post-connect paths. */
export function interpolateConnectionPath(path: string, connectionId: string): string {
  return path.replaceAll('{connectionId}', encodeURIComponent(connectionId))
}

/** Return whether an optional Studio surface is available to this host. */
export function isFeatureEnabled(feature: RuntimeFeature | string): boolean {
  return !getRuntimeConfig().features.excluded.includes(feature)
}
