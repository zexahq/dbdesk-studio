import type { DashboardConfig, DashboardExport } from '@common/types'
import { env } from '@dbdesk-studio/env/server'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readJsonFile, updateJsonFile } from './json-storage'

const DASHBOARD_FILENAME = 'dashboards.json'
const DEFAULT_STORAGE_DIR = join(homedir(), '.config', 'dbdesk-studio')
const DEFAULT_DASHBOARD_LAYOUT = {
  columns: 12,
  rowHeight: 80,
  margin: [16, 16] as [number, number],
  containerPadding: [0, 0] as [number, number]
}

// Dashboard persistence is connection-scoped and host-neutral. Third-party
// integrations control visibility through the active runtime registry; they do not need a
// separate storage implementation or provider-specific database schema.

type StoredDashboard = Omit<DashboardConfig, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt: string
}

type StoredDashboardStorage = Record<string, StoredDashboard[]>

const getStoragePath = () => join(env.STORAGE_PATH || DEFAULT_STORAGE_DIR, DASHBOARD_FILENAME)

const serialize = (dashboard: DashboardConfig): StoredDashboard => ({
  ...dashboard,
  createdAt: new Date(dashboard.createdAt).toISOString(),
  updatedAt: new Date(dashboard.updatedAt).toISOString()
})

const deserialize = (dashboard: StoredDashboard): DashboardConfig => ({
  ...dashboard,
  // Dashboards saved by the initial Studio implementation did not persist a
  // grid layout. Supplying the dbdesk default keeps those records usable.
  layout: dashboard.layout ?? DEFAULT_DASHBOARD_LAYOUT,
  createdAt: new Date(dashboard.createdAt),
  updatedAt: new Date(dashboard.updatedAt)
})

async function readStorage(): Promise<StoredDashboardStorage> {
  return readJsonFile(getStoragePath(), () => ({}))
}

export async function loadDashboards(connectionId: string): Promise<DashboardConfig[]> {
  const storage = await readStorage()
  return (storage[connectionId] ?? []).map(deserialize)
}

export async function getDashboard(
  connectionId: string,
  dashboardId: string
): Promise<DashboardConfig | undefined> {
  return (await loadDashboards(connectionId)).find((dashboard) => dashboard.dashboardId === dashboardId)
}

export async function saveDashboard(dashboard: DashboardConfig): Promise<DashboardConfig> {
  return updateJsonFile<StoredDashboardStorage, DashboardConfig>(getStoragePath(), () => ({}), (storage) => {
    const dashboards = storage[dashboard.connectionId] ?? []
    const serialized = serialize({ ...dashboard, updatedAt: new Date() })
    const index = dashboards.findIndex((item) => item.dashboardId === dashboard.dashboardId)
    if (index === -1) dashboards.push(serialized)
    else dashboards[index] = serialized
    storage[dashboard.connectionId] = dashboards
    return deserialize(serialized)
  })
}

export async function deleteDashboard(connectionId: string, dashboardId: string): Promise<void> {
  await updateJsonFile<StoredDashboardStorage, void>(getStoragePath(), () => ({}), (storage) => {
    const dashboards = storage[connectionId] ?? []
    storage[connectionId] = dashboards.filter((dashboard) => dashboard.dashboardId !== dashboardId)
  })
}

export async function exportDashboards(connectionId?: string): Promise<DashboardExport> {
  const storage = await readStorage()
  const dashboards = Object.values(storage).flat().map(deserialize)
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    dashboards: connectionId ? dashboards.filter((item) => item.connectionId === connectionId) : dashboards
  }
}
