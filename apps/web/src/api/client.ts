import type {
  ConnectionProfile,
  ConnectionWorkspace,
  DatabaseType,
  DBConnectionOptions,
  DeleteTableResult,
  DeleteTableRowsResult,
  ExportTableOptions,
  ExportTableResult,
  QueryResult,
  QueryResultRow,
  SavedQuery,
  SchemaWithTables,
  TableDataOptions,
  TableDataResult,
  TableInfo,
  UpdateTableCellResult,
  TableSortRule,
  TableFilterCondition
} from '@common/types'

function getDbdesk() {
  // return something temporary for now but fixing type errors 
  // TODO: fix type errors / add proper implementation
  return {
    getAdapters: () => Promise.resolve([]),
    listConnections: () => Promise.resolve([]),
    getConnection: (connectionId: string) => Promise.resolve(null),
    createConnection: (name: string, type: DatabaseType, options: DBConnectionOptions) => Promise.resolve(null),
    updateConnection: (connectionId: string, name: string, type: DatabaseType, options: DBConnectionOptions) => Promise.resolve(null),
    connect: (connectionId: string) => Promise.resolve(null),
    disconnect: (connectionId: string) => Promise.resolve(null),
    deleteConnection: (connectionId: string) => Promise.resolve(null),
    runQuery: (connectionId: string, query: string, options?: { limit?: number; offset?: number }) => Promise.resolve(null),
    listSchemas: (connectionId: string) => Promise.resolve([]),
    listTables: (connectionId: string, schema: string) => Promise.resolve([]),
    listSchemasWithTables: (connectionId: string) => Promise.resolve([]),
    introspectTable: (connectionId: string, schema: string, table: string) => Promise.resolve(null),
    fetchTableData: (connectionId: string, schema: string, table: string, options?: { limit?: number; offset?: number }) => Promise.resolve(null),
    deleteTableRows: (connectionId: string, schema: string, table: string, rows: QueryResultRow[]) => Promise.resolve(null),
    updateTableCell: (connectionId: string, schema: string, table: string, columnToUpdate: string, newValue: unknown, row: QueryResultRow) => Promise.resolve(null),
    loadWorkspace: (connectionId: string) => Promise.resolve(null),
    saveWorkspace: (workspace: ConnectionWorkspace) => Promise.resolve(null),
    deleteWorkspace: (connectionId: string) => Promise.resolve(null),
    loadQueries: (connectionId: string) => Promise.resolve([]),
    saveQuery: (connectionId: string, id: string, name: string, content: string) => Promise.resolve(null),
    deleteQuery: (connectionId: string, queryId: string) => Promise.resolve(null),
    updateQuery: (connectionId: string, queryId: string, name: string, content: string) => Promise.resolve(null),
    exportTableAsCSV: (connectionId: string, schema: string, table: string, options?: { sortRules?: TableSortRule[]; filters?: TableFilterCondition[] }) => Promise.resolve(null),
    exportTableAsSQL: (connectionId: string, schema: string, table: string, options?: { sortRules?: TableSortRule[]; filters?: TableFilterCondition[] }) => Promise.resolve(null),
    deleteTable: (connectionId: string, schema: string, table: string) => Promise.resolve(null),
  } as any
  }

export const dbdeskClient = {
  async getAdapters(): Promise<DatabaseType[]> {
    return getDbdesk().getAdapters()
  },

  async listConnections(): Promise<ConnectionProfile[]> {
    return getDbdesk().listConnections()
  },

  async getConnection(connectionId: string): Promise<ConnectionProfile> {
    return getDbdesk().getConnection(connectionId)
  },

  async createConnection(
    name: string,
    type: DatabaseType,
    options: DBConnectionOptions
  ): Promise<ConnectionProfile> {
    return getDbdesk().createConnection(name, type, options)
  },

  async updateConnection(
    connectionId: string,
    name: string,
    type: DatabaseType,
    options: DBConnectionOptions
  ): Promise<ConnectionProfile> {
    return getDbdesk().updateConnection(connectionId, name, type, options)
  },

  async connect(connectionId: string): Promise<{ success: boolean; connectionId?: string }> {
    return getDbdesk().connect(connectionId)
  },

  async disconnect(connectionId: string): Promise<{ success: boolean }> {
    return getDbdesk().disconnect(connectionId)
  },

  async deleteConnection(connectionId: string): Promise<{ success: boolean }> {
    return getDbdesk().deleteConnection(connectionId)
  },

  async runQuery(
    connectionId: string,
    query: string,
    options?: { limit?: number; offset?: number }
  ): Promise<QueryResult> {
    return getDbdesk().runQuery(connectionId, query, options)
  },

  async listSchemas(connectionId: string): Promise<string[]> {
    return getDbdesk().listSchemas(connectionId)
  },

  async listTables(connectionId: string, schema: string): Promise<string[]> {
    return getDbdesk().listTables(connectionId, schema)
  },

  async listSchemasWithTables(connectionId: string): Promise<SchemaWithTables[]> {
    return getDbdesk().listSchemasWithTables(connectionId)
  },

  async introspectTable(connectionId: string, schema: string, table: string): Promise<TableInfo> {
    return getDbdesk().introspectTable(connectionId, schema, table)
  },

  async fetchTableData(
    connectionId: string,
    schema: string,
    table: string,
    options?: Pick<TableDataOptions, 'limit' | 'offset' | 'sortRules' | 'filters'>
  ): Promise<TableDataResult> {
    return getDbdesk().fetchTableData(connectionId, schema, table, options)
  },

  async deleteTableRows(
    connectionId: string,
    schema: string,
    table: string,
    rows: QueryResultRow[]
  ): Promise<DeleteTableRowsResult> {
    return getDbdesk().deleteTableRows(connectionId, schema, table, rows)
  },

  async updateTableCell(
    connectionId: string,
    schema: string,
    table: string,
    columnToUpdate: string,
    newValue: unknown,
    row: QueryResultRow
  ): Promise<UpdateTableCellResult> {
    return getDbdesk().updateTableCell(connectionId, schema, table, columnToUpdate, newValue, row)
  },

  async loadWorkspace(connectionId: string): Promise<ConnectionWorkspace | undefined> {
    return getDbdesk().loadWorkspace(connectionId) as Promise<ConnectionWorkspace | undefined>
  },

  async saveWorkspace(workspace: ConnectionWorkspace): Promise<void> {
    return getDbdesk().saveWorkspace(workspace)
  },

  async deleteWorkspace(connectionId: string): Promise<void> {
    return getDbdesk().deleteWorkspace(connectionId)
  },

  async loadQueries(connectionId: string): Promise<SavedQuery[]> {
    return getDbdesk().loadQueries(connectionId)
  },

  async saveQuery(
    connectionId: string,
    id: string,
    name: string,
    content: string
  ): Promise<SavedQuery> {
    return getDbdesk().saveQuery(connectionId, id, name, content)
  },

  async deleteQuery(connectionId: string, queryId: string): Promise<void> {
    return getDbdesk().deleteQuery(connectionId, queryId)
  },

  async updateQuery(
    connectionId: string,
    queryId: string,
    name: string,
    content: string
  ): Promise<SavedQuery | undefined> {
    return getDbdesk().updateQuery(connectionId, queryId, name, content)
  },

  async exportTableAsCSV(
    connectionId: string,
    schema: string,
    table: string,
    options?: Pick<ExportTableOptions, 'sortRules' | 'filters'>
  ): Promise<ExportTableResult> {
    return getDbdesk().exportTableAsCSV(connectionId, schema, table, options)
  },

  async exportTableAsSQL(
    connectionId: string,
    schema: string,
    table: string,
    options?: Pick<ExportTableOptions, 'sortRules' | 'filters'>
  ): Promise<ExportTableResult> {
    return getDbdesk().exportTableAsSQL(connectionId, schema, table, options)
  },

  async deleteTable(
    connectionId: string,
    schema: string,
    table: string
  ): Promise<DeleteTableResult> {
    return getDbdesk().deleteTable(connectionId, schema, table)
  }
}

export type {
  ConnectionProfile,
  DatabaseType,
  DBConnectionOptions,
  DeleteTableRowsResult,
  ExportTableOptions,
  ExportTableResult,
  QueryResult,
  QueryResultRow,
  SavedQuery,
  SchemaWithTables,
  TableDataOptions,
  TableDataResult,
  TableInfo,
  UpdateTableCellResult
} from '@common/types'
