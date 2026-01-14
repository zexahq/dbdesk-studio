import type {
  ConnectionProfile,
  DatabaseType,
  DBConnectionOptions,
  DeleteTableRowsOptions,
  ExportTableOptions,
  QueryResultRow,
  TableDataOptions,
  TableFilterCondition,
  TableSortRule,
  UpdateTableCellOptions
} from '@common/types'
import { randomUUID } from 'crypto'
import cors from 'cors'
import express, { type Application, type NextFunction, type Request, type Response } from 'express'
import { adapterRegistry, listRegisteredAdapters } from './adapters'
import { connectionManager, ConnectionManager } from './connectionManager'
import { deleteQuery, loadQueries, saveQuery, updateQuery } from './saved-queries-storage'
import { deleteProfile, getProfile, loadProfiles, saveProfile } from './storage'
import { ValidationError } from './utils/errors'
import { getRouteParam } from './utils/validation'
import { deleteWorkspace, loadWorkspace, saveWorkspace } from './workspace-storage'

const app: Application = express()

// Middleware
app.use(cors({
  origin: 'http://localhost:3001',
  credentials: true
}))

app.use(express.json())

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true })
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

app.get('/api/connections', async (_req: Request, res: Response) => {
  const profiles = await loadProfiles()
  res.json(profiles)
})

app.post('/api/connections', async (req: Request, res: Response, next: NextFunction) => {
  try {
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
      id: randomUUID(),
      name,
      type,
      options,
      createdAt: now,
      updatedAt: now
    } as ConnectionProfile

    await saveProfile(profile)
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
      const profile = await getProfile(connectionId)

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

      const profiles = await loadProfiles()
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

      await saveProfile(profile)
      res.json(profile)
    } catch (err) {
      next(err)
    }
  }
)

app.delete('/api/connections/:connectionId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const connectionId = getRouteParam(req.params, 'connectionId')
    deleteProfile(connectionId)
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
      const manager = ConnectionManager.getInstance()
      const profile = await getProfile(connectionId)

      if (!profile) {
        res.status(404).json({ error: 'Connection not found' })
        return
      }

      await manager.createConnection(connectionId, profile.type, profile.options)
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
      const manager = ConnectionManager.getInstance()
      await manager.closeConnection(connectionId)
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }
)

// ============================================================================
// Query API
// ============================================================================

app.post(
  '/api/connections/:connectionId/query',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const { query, options } = req.body as { query: string; options?: { limit?: number; offset?: number } }

      if (!query) {
        res.status(400).json({ error: 'Missing required field: query' })
        return
      }

      const manager = ConnectionManager.getInstance()
      const adapter = manager.getConnection(connectionId)

      if (!adapter) {
        res.status(404).json({ error: 'Connection not found or not connected' })
        return
      }

      const result = await adapter.runQuery(query, options)
      res.json(result)
    } catch (err) {
      next(err)
    }
  }
)

// ============================================================================
// Schema/Tables API
// ============================================================================

app.get(
  '/api/connections/:connectionId/schemas',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const manager = ConnectionManager.getInstance()
      const adapter = manager.getSQLConnection(connectionId)

      if (!adapter) {
        res.status(404).json({ error: 'Connection not found or not a SQL adapter' })
        return
      }

      const schemas = await adapter.listSchemas()
      res.json(schemas)
    } catch (err) {
      next(err)
    }
  }
)

app.get(
  '/api/connections/:connectionId/schemas/:schema/tables',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const schema = getRouteParam(req.params, 'schema')
      const manager = ConnectionManager.getInstance()
      const adapter = manager.getSQLConnection(connectionId)

      if (!adapter) {
        res.status(404).json({ error: 'Connection not found or not a SQL adapter' })
        return
      }

      const tables = await adapter.listTables(schema)
      res.json(tables)
    } catch (err) {
      next(err)
    }
  }
)

app.get(
  '/api/connections/:connectionId/schemas-with-tables',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const manager = ConnectionManager.getInstance()
      const adapter = manager.getSQLConnection(connectionId)

      if (!adapter) {
        res.status(404).json({ error: 'Connection not found or not a SQL adapter' })
        return
      }

      const schemas = await adapter.listSchemaWithTables()
      res.json(schemas)
    } catch (err) {
      next(err)
    }
  }
)

app.get(
  '/api/connections/:connectionId/schemas/:schema/tables/:table/introspect',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const schema = getRouteParam(req.params, 'schema')
      const table = getRouteParam(req.params, 'table')
      const manager = ConnectionManager.getInstance()
      const adapter = manager.getSQLConnection(connectionId)

      if (!adapter) {
        res.status(404).json({ error: 'Connection not found or not a SQL adapter' })
        return
      }

      const info = await adapter.introspectTable(schema, table)
      res.json(info)
    } catch (err) {
      next(err)
    }
  }
)

app.post(
  '/api/connections/:connectionId/schemas/:schema/tables/:table/data',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const schema = getRouteParam(req.params, 'schema')
      const table = getRouteParam(req.params, 'table')

      const options = { ...(req.body || {}), schema, table } as TableDataOptions
      const manager = ConnectionManager.getInstance()
      const adapter = manager.getSQLConnection(connectionId)

      if (!adapter) {
        res.status(404).json({ error: 'Connection not found or not a SQL adapter' })
        return
      }

      const data = await adapter.fetchTableData(options)
      res.json(data)
    } catch (err) {
      next(err)
    }
  }
)

// ============================================================================
// Delete Table API
// ============================================================================

app.delete(
  '/api/connections/:connectionId/schemas/:schema/tables/:table',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const schema = getRouteParam(req.params, 'schema')
      const table = getRouteParam(req.params, 'table')
      const manager = ConnectionManager.getInstance()
      const adapter = manager.getSQLConnection(connectionId)
      if (!adapter) {
        res.status(404).json({ error: 'Connection not found or not a SQL adapter' })
        return
      }
      const result = await adapter.deleteTable({ schema, table })
      res.json(result)
    } catch (err) {
      next(err)
    }
  }
)

// ============================================================================
// Data Modification API
// ============================================================================

app.post(
  '/api/connections/:connectionId/schemas/:schema/tables/:table/rows/delete',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const schema = getRouteParam(req.params, 'schema')
      const table = getRouteParam(req.params, 'table')
      const { rows } = req.body as { rows: unknown[] }

      if (!rows) {
        res.status(400).json({ error: 'Missing required field: rows' })
        return
      }

      const manager = ConnectionManager.getInstance()
      const adapter = manager.getSQLConnection(connectionId)

      if (!adapter) {
        res.status(404).json({ error: 'Connection not found or not a SQL adapter' })
        return
      }

      const options: DeleteTableRowsOptions = { schema, table, rows: rows as QueryResultRow[] }
      const result = await adapter.deleteTableRows(options)
      res.json(result)
    } catch (err) {
      next(err)
    }
  }
)

app.post(
  '/api/connections/:connectionId/schemas/:schema/tables/:table/cell',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectionId = getRouteParam(req.params, 'connectionId')
      const schema = getRouteParam(req.params, 'schema')
      const table = getRouteParam(req.params, 'table')
      const { columnToUpdate, newValue, row } = req.body as {
        columnToUpdate: string
        newValue: unknown
        row: unknown
      }

      if (!columnToUpdate || newValue === undefined || !row) {
        res.status(400).json({ error: 'Missing required fields: columnToUpdate, newValue, row' })
        return
      }

      const manager = ConnectionManager.getInstance()
      const adapter = manager.getSQLConnection(connectionId)

      if (!adapter) {
        res.status(404).json({ error: 'Connection not found or not a SQL adapter' })
        return
      }

      const options: UpdateTableCellOptions = { schema, table, columnToUpdate, newValue, row }
      const result = await adapter.updateTableCell(options)
      res.json(result)
    } catch (err) {
      next(err)
    }
  }
)

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
      const { options } = req.body as { options?: { sortRules?: TableSortRule[]; filters?: TableFilterCondition[] } }

      if (!options) {
        res.status(400).json({ error: 'Missing required field: options' })
        return
      }

      const exportOptions: ExportTableOptions = { schema, table, ...options }

      const manager = ConnectionManager.getInstance()
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
      const { options } = req.body as { options?: { sortRules?: TableSortRule[]; filters?: TableFilterCondition[] } }

      if (!options) {
        res.status(400).json({ error: 'Missing required field: options' })
        return
      }

      const exportOptions: ExportTableOptions = { schema, table, ...options }
      const manager = ConnectionManager.getInstance()
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
  res.status(500).json({ error: message })
})

app.listen(3000, () => {
  console.log('Server is running on port 3000')
  console.log('http://localhost:3000')
})
