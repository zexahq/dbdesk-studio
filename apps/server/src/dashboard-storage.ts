import type { DashboardConfig, DashboardExport } from '@common/types'
import { env } from '@dbdesk-studio/env/server'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const DASHBOARD_FILENAME = 'dashboards.json'
const DEFAULT_STORAGE_DIR = join(homedir(), '.config', 'dbdesk-studio')

// Dashboard persistence is connection-scoped and host-neutral. Third-party
// integrations control visibility through autobase.yaml; they do not need a
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
  createdAt: new Date(dashboard.createdAt),
  updatedAt: new Date(dashboard.updatedAt)
})

async function readStorage(): Promise<StoredDashboardStorage> {
  try {
    const content = await fs.readFile(getStoragePath(), 'utf8')
    return content.trim() ? (JSON.parse(content) as StoredDashboardStorage) : {}
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    if (error instanceof SyntaxError) return {}
    throw error
  }
}

async function writeStorage(storage: StoredDashboardStorage): Promise<void> {
  const filePath = getStoragePath()
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(storage, null, 2), 'utf8')
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
  const storage = await readStorage()
  const dashboards = storage[dashboard.connectionId] ?? []
  const serialized = serialize({ ...dashboard, updatedAt: new Date() })
  const index = dashboards.findIndex((item) => item.dashboardId === dashboard.dashboardId)
  if (index === -1) dashboards.push(serialized)
  else dashboards[index] = serialized
  storage[dashboard.connectionId] = dashboards
  await writeStorage(storage)
  return deserialize(serialized)
}

export async function deleteDashboard(connectionId: string, dashboardId: string): Promise<void> {
  const storage = await readStorage()
  const dashboards = storage[connectionId] ?? []
  storage[connectionId] = dashboards.filter((dashboard) => dashboard.dashboardId !== dashboardId)
  await writeStorage(storage)
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
