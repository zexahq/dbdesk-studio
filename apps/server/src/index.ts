import type {
  ConnectionProfile,
  DashboardConfig,
  DatabaseType,
  DBConnectionOptions,
  ExportTableOptions,
  QueryResultRow,
  TableDataOptions,
  TableFilterCondition,
  TableSortRule,
} from '@common/types'
import cors from 'cors'
import express, { type Application, type NextFunction, type Request, type Response } from 'express'
import { adapterRegistry, listRegisteredAdapters } from './adapters'
import { connectionManager } from './connectionManager'
import {
  deleteDashboard,
  exportDashboards,
  getDashboard,
  loadDashboards,
  saveDashboard
} from './dashboard-storage'
import { deleteQuery, loadQueries, saveQuery, updateQuery } from './saved-queries-storage'
import { deleteProfile, getProfile, loadProfiles, saveProfile } from './storage'
import { getProjectId } from './project-scope'
import { registerSQLRoutes } from './routes/sql'
import { ValidationError } from './utils/errors'
import { getRouteParam } from './utils/validation'
import { registerConnectionURIRoute } from './routes/connections'
import { deleteWorkspace, loadWorkspace, saveWorkspace } from './workspace-storage'

function generateUUID(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

async function connectProfile(profile: ConnectionProfile, projectId?: string): Promise<void> {
  await connectionManager.createConnection(profile.id, profile.type, profile.options)
  profile.lastConnectedAt = new Date()
  await saveProfile(profile, projectId)
}

const app: Application = express()

// Get port from environment or default to 6789
const PORT = parseInt(process.env.PORT || '6789', 10)

// Get frontend URL from environment for CORS
const CORS_ORIGIN = process.env.CORS_ORIGIN || [
  'http://localhost:9876',
  'http://localhost:3001',
  'http://127.0.0.1:9876',
  'http://127.0.0.1:3001'
]

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true
}))

app.use(express.json())

// Health check
app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
  res.json({ ok: true, workspaceContract: 1 })
})

// ============================================================================
// Config API
// ============================================================================

app.get('/api/config', (_req: Request, res: Response) => {
  const defaultSslMode = process.env.DEFAULT_SSL_MODE || ''

  res.json({ defaultSslMode })
})

// ============================================================================
// Adapters API
// ============================================================================

app.get('/api/adapters', (_req: Request, res: Response) => {
  const adapters = listRegisteredAdapters()
  res.json(adapters)
})

// ============================================================================
// Connections API
// ============================================================================

registerConnectionURIRoute(app)

// Enforce the same project boundary for every connection-scoped endpoint,
// including queries and schema operations. Listing alone is not sufficient:
// a host must not be able to reuse an id belonging to another project.
app.use('/api/connections/:connectionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = getProjectId(req)
    const profile = await getProfile(String(req.params.connectionId), projectId)
    if (!profile) {
      res.status(404).json({ error: 'Connection not found' })
      return
    }
    next()
  } catch (error) {
    next(error)
  }
})

app.get('/api/connections', async (req: Request, res: Response) => {
  const profiles = await loadProfiles(getProjectId(req))
  res.json(profiles)
})

app.post('/api/connections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = getProjectId(req)
    const { name, type, options } = req.body as {
      name: string
      type: DatabaseType
      options: DBConnectionOptions
    }

    if (!name || !type || !options) {
      res.status(400).json({ error: 'Missing required fields: name, type, options' })
      return
    }

    if (!adapterRegistry.getFactory(type)) {
      res.status(400).json({ error: `Adapter "${type}" is not available` })
      return
    }

    const now = new Date()
    const profile = {
      id: generateUUID(),
      name,
      type,
      options,
      createdAt: now,
      updatedAt: now,
      projectId
    } as ConnectionProfile

    await saveProfile(profile, projectId)
    res.status(201).json(profile)
  } catch (err) {
    next(err)
  }
})

app.get(
  '/api/connections/:connectionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const profile = await getProfile(connectionId, getProjectId(req))

      if (!profile) {
        res.status(404).json({ error: 'Connection not found' })
        return
      }

      res.json(profile)
    } catch (err) {
      next(err)
    }
  }
)

app.put(
  '/api/connections/:connectionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, type, options } = req.body as {
        name: string
        type: DatabaseType
        options: DBConnectionOptions
      }

      const connectionId = getRouteParam(req.params, 'connectionId')
      const projectId = getProjectId(req)
      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'Missing required fields: name' })
        return
      }
      if (!type || typeof type !== 'string') {
        res.status(400).json({ error: 'Missing required fields: type' })
        return
      }
      if (!options || typeof options !== 'object') {
        res.status(400).json({ error: 'Missing required fields: options' })
        return
      }

      const profiles = await loadProfiles(projectId)
      const existingProfile = profiles.find((item) => item.id === connectionId)

      if (!existingProfile) {
        throw new ValidationError(`Connection profile "${connectionId}" not found`)
      }

      if (!adapterRegistry.getFactory(type)) {
        throw new ValidationError(`Adapter "${type}" is not available`)
      }

      // If connection is active and options changed, we should reconnect
      const isConnected = connectionManager.isConnected(connectionId)
      const optionsChanged =
        JSON.stringify(existingProfile.options) !== JSON.stringify(options) ||
        existingProfile.type !== type

      if (isConnected && optionsChanged) {
        await connectionManager.closeConnection(connectionId).catch(() => {})
      }

      const profile = {
        ...existingProfile,
        name: name.trim(),
        type,
        options: options as ConnectionProfile['options'],
        updatedAt: new Date()
      } as ConnectionProfile

      await saveProfile(profile, projectId)
      res.json(profile)
    } catch (err) {
      next(err)
    }
  }
)

app.delete('/api/connections/:connectionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const connectionId = getRouteParam(req.params, 'connectionId')
    await deleteProfile(connectionId, getProjectId(req))
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

app.post(
  '/api/connections/:connectionId/connect',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const projectId = getProjectId(req)
      const profile = await getProfile(connectionId, projectId)

      if (!profile) {
        res.status(404).json({ error: 'Connection not found' })
        return
      }

      await connectProfile(profile, projectId)
      res.json({ success: true, connectionId })
    } catch (err) {
      next(err)
    }
  }
)

app.post(
  '/api/connections/:connectionId/disconnect',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const manager = connectionManager
      await manager.closeConnection(connectionId)
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }
)

registerSQLRoutes(app)

// ============================================================================
// Workspace API
// ============================================================================

app.get(
  '/api/connections/:connectionId/workspace',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const workspace = await loadWorkspace(connectionId)
      res.json(workspace)
    } catch (err) {
      next(err)
    }
  }
)

app.post(
  '/api/connections/:connectionId/workspace',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspace = req.body
      await saveWorkspace(workspace)
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }
)

app.delete(
  '/api/connections/:connectionId/workspace',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      await deleteWorkspace(connectionId)
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }
)

// ============================================================================
// Dashboard API
// ============================================================================

app.get(
  '/api/connections/:connectionId/dashboards',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      res.json(await loadDashboards(connectionId))
    } catch (err) {
      next(err)
    }
  }
)

app.get(
  '/api/connections/:connectionId/dashboards/:dashboardId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const dashboardId = getRouteParam(req.params, 'dashboardId')
      const dashboard = await getDashboard(connectionId, dashboardId)
      if (!dashboard) {
        res.status(404).json({ error: 'Dashboard not found' })
        return
      }
      res.json(dashboard)
    } catch (err) {
      next(err)
    }
  }
)

app.put(
  '/api/connections/:connectionId/dashboards/:dashboardId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const dashboardId = getRouteParam(req.params, 'dashboardId')
      const dashboard = req.body as Record<string, unknown>
      if (dashboard.connectionId !== connectionId || dashboard.dashboardId !== dashboardId) {
        res.status(400).json({ error: 'Dashboard identity does not match the URL' })
        return
      }
      if (typeof dashboard.name !== 'string' || !dashboard.name.trim() || !Array.isArray(dashboard.widgets)) {
        res.status(400).json({ error: 'Dashboard requires a name and widgets array' })
        return
      }
      res.json(await saveDashboard(dashboard as unknown as DashboardConfig))
    } catch (err) {
      next(err)
    }
  }
)

app.delete(
  '/api/connections/:connectionId/dashboards/:dashboardId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteDashboard(
        getRouteParam(req.params, 'connectionId'),
        getRouteParam(req.params, 'dashboardId')
      )
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }
)

app.get('/api/dashboards/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const connectionId = typeof req.query.connectionId === 'string' ? req.query.connectionId : undefined
    res.json(await exportDashboards(connectionId))
  } catch (err) {
    next(err)
  }
})

// ============================================================================
// Saved Queries API
// ============================================================================

app.get(
  '/api/connections/:connectionId/queries',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const queries = await loadQueries(connectionId)
      res.json(queries)
    } catch (err) {
      next(err)
    }
  }
)

app.post(
  '/api/connections/:connectionId/queries',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const { id, name, content } = req.body as {
        id: string
        name: string
        content: string
      }

      if (!name || !content) {
        res.status(400).json({ error: 'Missing required fields: name, content' })
        return
      }
      console.log('Saving query with id:', connectionId, id, name, content)
      const query = await saveQuery(connectionId, id, name, content)
      res.status(201).json(query)
    } catch (err) {
      next(err)
    }
  }
)

app.put(
  '/api/connections/:connectionId/queries/:queryId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const queryId = getRouteParam(req.params, 'queryId')
      const { name, content } = req.body as { name: string; content: string }

      if (!name || !content) {
        res.status(400).json({ error: 'Missing required fields: name, content' })
        return
      }

      const query = await updateQuery(connectionId, queryId, name, content)
      res.json(query)
    } catch (err) {
      next(err)
    }
  }
)

app.delete(
  '/api/connections/:connectionId/queries/:queryId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const queryId = getRouteParam(req.params, 'queryId')
      await deleteQuery(connectionId, queryId)
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }
)

// ============================================================================
// Export Table API
// ============================================================================

app.post(
  '/api/connections/:connectionId/schemas/:schema/tables/:table/export/csv',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const schema = getRouteParam(req.params, 'schema')
      const table = getRouteParam(req.params, 'table')
      const { options = {} } = req.body as { options?: { sortRules?: TableSortRule[]; filters?: TableFilterCondition[] } }

      const exportOptions: ExportTableOptions = { schema, table, ...options }

      const manager = connectionManager
      const adapter = manager.getSQLConnection(connectionId)
      if (!adapter) {
        res.status(404).json({ error: 'Connection not found or not a SQL adapter' })
        return
      }
      const result = await adapter.exportTableAsCSV(exportOptions)
      res.json(result)
    } catch (err) {
      next(err)
    }
  }
)

app.post(
  '/api/connections/:connectionId/schemas/:schema/tables/:table/export/sql',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const schema = getRouteParam(req.params, 'schema')
      const table = getRouteParam(req.params, 'table')
      const { options = {} } = req.body as { options?: { sortRules?: TableSortRule[]; filters?: TableFilterCondition[] } }

      const exportOptions: ExportTableOptions = { schema, table, ...options }
      const manager = connectionManager
      const adapter = manager.getSQLConnection(connectionId)
      if (!adapter) {
        res.status(404).json({ error: 'Connection not found or not a SQL adapter' })
        return
      }
      const result = await adapter.exportTableAsSQL(exportOptions)
      res.json(result)
    } catch (err) {
      next(err)
    }
  }
)

// Error handler middleware (placed after routes so it catches errors)
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API Error:', err)
  const message = err instanceof Error ? err.message : 'Internal server error'
  res.status(err instanceof ValidationError ? 400 : 500).json({ error: message })
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
  console.log(`http://localhost:${PORT}`)
})
