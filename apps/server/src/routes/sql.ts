import type { ColumnDefinition, DeleteTableRowsOptions, RunQueryOptions, UpdateTableCellOptions } from '@common/types'
import type { Application, NextFunction, Request, Response } from 'express'
import { connectionManager } from '../connectionManager'
import { translatePsqlMetaCommand } from '../lib/psql-meta'
import { getRouteParam } from '../utils/validation'

export function registerSQLRoutes(app: Application): void {
  // ============================================================================
  // Query API
  // ============================================================================

  app.post(
    '/api/connections/:connectionId/query',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const connectionId = getRouteParam(req.params, 'connectionId')
        const { query, options } = req.body as { query: string; options?: RunQueryOptions }

        if (!query) {
          res.status(400).json({ error: 'Missing required field: query' })
          return
        }

        const manager = connectionManager
        const adapter = manager.getConnection(connectionId)

        if (!adapter) {
          res.status(404).json({ error: 'Connection not found or not connected' })
          return
        }

        const result = await adapter.runQuery(translatePsqlMetaCommand(query), options)
        res.json(result)
      } catch (err) {
        next(err)
      }
    }
  )

  app.post(
    '/api/connections/:connectionId/query/batch',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const connectionId = getRouteParam(req.params, 'connectionId')
        const { queries, options } = req.body as { queries: string[]; options?: RunQueryOptions }
        if (!Array.isArray(queries) || queries.length === 0) {
          res.status(400).json({ error: 'Missing required field: queries' })
          return
        }

        const adapter = connectionManager.getConnection(connectionId)
        if (!adapter?.runManyQueries) {
          res.status(404).json({ error: 'Connection not found or batch queries are not supported' })
          return
        }

        res.json(await adapter.runManyQueries(queries.map(translatePsqlMetaCommand), options))
      } catch (err) {
        next(err)
      }
    }
  )

  app.post(
    '/api/connections/:connectionId/query/cancel',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const connectionId = getRouteParam(req.params, 'connectionId')
        const { queryId } = req.body as { queryId: string }
        if (!queryId) {
          res.status(400).json({ error: 'Missing required field: queryId' })
          return
        }

        const adapter = connectionManager.getConnection(connectionId)
        if (!adapter?.cancelQuery) {
          res.json({ cancelled: false })
          return
        }

        res.json({ cancelled: await adapter.cancelQuery(queryId) })
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
        const manager = connectionManager
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
        const manager = connectionManager
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
        const manager = connectionManager
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
        const manager = connectionManager
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
        const manager = connectionManager
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
        const manager = connectionManager
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

        const manager = connectionManager
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

        const manager = connectionManager
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

  app.post(
    '/api/connections/:connectionId/schemas/:schema/tables/:table/rows',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const connectionId = getRouteParam(req.params, 'connectionId')
        const schema = getRouteParam(req.params, 'schema')
        const table = getRouteParam(req.params, 'table')
        const adapter = connectionManager.getSQLConnection(connectionId)
        if (!adapter) {
          res.status(404).json({ error: 'Connection not found or not a SQL adapter' })
          return
        }

        res.json(await adapter.insertTableRow({ schema, table, values: req.body?.values ?? req.body ?? {} }))
      } catch (err) {
        next(err)
      }
    }
  )

  app.post(
    '/api/connections/:connectionId/schemas/:schema/tables',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const connectionId = getRouteParam(req.params, 'connectionId')
        const schema = getRouteParam(req.params, 'schema')
        const { table, columns } = req.body as { table: string; columns: unknown[] }
        if (!table || !Array.isArray(columns)) {
          res.status(400).json({ error: 'Missing required fields: table, columns' })
          return
        }

        const adapter = connectionManager.getSQLConnection(connectionId)
        if (!adapter) {
          res.status(404).json({ error: 'Connection not found or not a SQL adapter' })
          return
        }

        res.status(201).json(await adapter.createTable({ schema, table, columns: columns as ColumnDefinition[] }))
      } catch (err) {
        next(err)
      }
    }
  )

}
