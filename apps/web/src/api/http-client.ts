import type {
    ConnectionProfile,
    ConnectionWorkspace,
    ColumnDefinition,
    CreateTableResult,
    DatabaseType,
    DBConnectionOptions,
    DeleteTableResult,
    DeleteTableRowsResult,
    DashboardConfig,
    DashboardExport,
    ExportTableOptions,
    ExportTableResult,
    QueryResult,
    QueryBatchResult,
    QueryResultRow,
    SavedQuery,
    SchemaWithTables,
    TableDataOptions,
    TableDataResult,
    TableFilterCondition,
    TableInfo,
    TableSortRule,
    UpdateTableCellResult
  } from '@common/types'
  import { getRuntimeConfig } from '@common/config'
  import { getRuntimeBasePath } from '@/lib/runtime-config'
  
  // Third-party deployment boundary: API calls follow the same runtime route
  // prefix as the router. Hosts mounted below /dbdesk/ can inject the prefix
  // without rebuilding the application; standalone/dev usage falls back to
  // VITE_API_BASE_URL.
  function getBaseUrl(): string {
    const configuredApiPath = getRuntimeConfig().routing.apiBasePath
    if (configuredApiPath) return configuredApiPath.replace(/\/$/, '')
    const basePath = getRuntimeBasePath()
    if (basePath !== '/') return basePath.replace(/\/$/, '')
    return import.meta.env.VITE_API_BASE_URL ?? ''
  }
  
  async function request<T>(path: string, options: RequestInit = {}) {
    const url = `${getBaseUrl()}${path}`
    const headers = new Headers(options.headers)
    headers.set('Content-Type', 'application/json')
    const config = getRuntimeConfig()
    const projectId = config.embedding.projects.enabled
      ? (globalThis.window as (Window & { __DBDESK_PROJECT_ID__?: string }) | undefined)?.__DBDESK_PROJECT_ID__ || config.embedding.projects.id
      : ''
    if (projectId) headers.set('X-DBDESK-Project-ID', projectId)
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers,
      ...options
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`)
    }
    if (res.status === 204) return undefined as unknown as T
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    if (!contentType.includes('application/json')) {
      const text = await res.text()
      throw new Error(
        `Expected JSON response but received ${contentType || 'unknown content-type'}: ${
          text ? text.slice(0, 300) : '<empty response>'
        }`
      )
    }
  
    return (await res.json()) as T
  }
  
  export const httpClient = {
    async getConfig(): Promise<{ defaultSslMode: string }> {
      return request<{ defaultSslMode: string }>('/api/config')
    },

    async getAdapters(): Promise<DatabaseType[]> {
      return request<DatabaseType[]>('/api/adapters')
    },
  
    async listConnections(): Promise<ConnectionProfile[]> {
      return request<ConnectionProfile[]>('/api/connections')
    },
  
    async getConnection(connectionId: string): Promise<ConnectionProfile> {
      return request<ConnectionProfile>(`/api/connections/${connectionId}`)
    },
  
    async createConnection(
      name: string,
      type: DatabaseType,
      options: DBConnectionOptions
    ): Promise<ConnectionProfile> {
      return request<ConnectionProfile>('/api/connections', {
        method: 'POST',
        body: JSON.stringify({ name, type, options })
      })
    },

    async createConnectionFromUri(uri: string): Promise<ConnectionProfile> {
      return request<ConnectionProfile>('/api/connections/from-uri', {
        method: 'POST',
        body: JSON.stringify({ uri })
      })
    },
  
    async updateConnection(
      connectionId: string,
      name: string,
      type: DatabaseType,
      options: DBConnectionOptions
    ): Promise<ConnectionProfile> {
      return request<ConnectionProfile>(`/api/connections/${connectionId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, type, options })
      })
    },
  
    async connect(connectionId: string): Promise<{ success: boolean; connectionId?: string }> {
      return request(`/api/connections/${connectionId}/connect`, { method: 'POST' })
    },
  
    async disconnect(connectionId: string): Promise<{ success: boolean }> {
      return request(`/api/connections/${connectionId}/disconnect`, { method: 'POST' })
    },
  
    async deleteConnection(connectionId: string): Promise<{ success: boolean }> {
      return request(`/api/connections/${connectionId}`, { method: 'DELETE' })
    },
  
    async runQuery(connectionId: string, query: string, options?: { limit?: number; offset?: number; queryId?: string }): Promise<QueryResult> {
      return request<QueryResult>(`/api/connections/${connectionId}/query`, {
        method: 'POST',
        body: JSON.stringify({ query, options })
      })
    },

    async runManyQueries(
      connectionId: string,
      queries: string[],
      options?: { limit?: number; offset?: number; queryId?: string }
    ): Promise<QueryBatchResult[]> {
      return request<QueryBatchResult[]>(`/api/connections/${connectionId}/query/batch`, {
        method: 'POST',
        body: JSON.stringify({ queries, options })
      })
    },

    async cancelQuery(connectionId: string, queryId: string): Promise<{ cancelled: boolean }> {
      return request<{ cancelled: boolean }>(`/api/connections/${connectionId}/query/cancel`, {
        method: 'POST',
        body: JSON.stringify({ queryId })
      })
    },
  
    async listSchemas(connectionId: string): Promise<string[]> {
      return request<string[]>(`/api/connections/${connectionId}/schemas`)
    },
  
    async listTables(connectionId: string, schema: string): Promise<string[]> {
      return request<string[]>(
        `/api/connections/${connectionId}/schemas/${encodeURIComponent(schema)}/tables`
      )
    },
  
    async listSchemasWithTables(connectionId: string): Promise<SchemaWithTables[]> {
      return request<SchemaWithTables[]>(`/api/connections/${connectionId}/schemas-with-tables`)
    },
  
    async introspectTable(connectionId: string, schema: string, table: string): Promise<TableInfo> {
      return request<TableInfo>(
        `/api/connections/${connectionId}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/introspect`
      )
    },
  
    async fetchTableData(
      connectionId: string,
      schema: string,
      table: string,
      options?: Pick<TableDataOptions, 'limit' | 'offset' | 'sortRules' | 'filters'>
    ): Promise<TableDataResult> {
      return request<TableDataResult>(
        `/api/connections/${connectionId}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(
          table
        )}/data`,
        { method: 'POST', body: JSON.stringify(options ?? {}) }
      )
    },
  
    async deleteTableRows(
      connectionId: string,
      schema: string,
      table: string,
      rows: QueryResultRow[]
    ): Promise<DeleteTableRowsResult> {
      return request<DeleteTableRowsResult>(
        `/api/connections/${connectionId}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(
          table
        )}/rows/delete`,
        { method: 'POST', body: JSON.stringify({ rows }) }
      )
    },
  
    async updateTableCell(
      connectionId: string,
      schema: string,
      table: string,
      columnToUpdate: string,
      newValue: unknown,
      row: QueryResultRow
    ): Promise<UpdateTableCellResult> {
      return request<UpdateTableCellResult>(
        `/api/connections/${connectionId}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(
          table
        )}/cell`,
        { method: 'POST', body: JSON.stringify({ columnToUpdate, newValue, row }) }
      )
    },

    async insertTableRow(
      connectionId: string,
      schema: string,
      table: string,
      values: Record<string, unknown>
    ): Promise<{ insertedRowCount: number }> {
      return request<{ insertedRowCount: number }>(
        `/api/connections/${connectionId}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/rows`,
        { method: 'POST', body: JSON.stringify({ values }) }
      )
    },

    async createTable(
      connectionId: string,
      schema: string,
      table: string,
      columns: ColumnDefinition[]
    ): Promise<CreateTableResult> {
      return request<CreateTableResult>(
        `/api/connections/${connectionId}/schemas/${encodeURIComponent(schema)}/tables`,
        { method: 'POST', body: JSON.stringify({ table, columns }) }
      )
    },
  
    async loadWorkspace(connectionId: string): Promise<ConnectionWorkspace | undefined> {
      return request<ConnectionWorkspace | undefined>(`/api/connections/${connectionId}/workspace`)
    },
  
    async saveWorkspace(workspace: ConnectionWorkspace): Promise<void> {
      await request<void>(`/api/connections/${workspace.connectionId}/workspace`, {
        method: 'POST',
        body: JSON.stringify(workspace)
      })
    },
  
    async deleteWorkspace(connectionId: string): Promise<void> {
      await request<void>(`/api/connections/${connectionId}/workspace`, { method: 'DELETE' })
    },

    async loadDashboards(connectionId: string): Promise<DashboardConfig[]> {
      return request<DashboardConfig[]>(`/api/connections/${connectionId}/dashboards`)
    },

    async getDashboard(connectionId: string, dashboardId: string): Promise<DashboardConfig> {
      return request<DashboardConfig>(`/api/connections/${connectionId}/dashboards/${dashboardId}`)
    },

    async saveDashboard(dashboard: DashboardConfig): Promise<DashboardConfig> {
      return request<DashboardConfig>(
        `/api/connections/${dashboard.connectionId}/dashboards/${dashboard.dashboardId}`,
        { method: 'PUT', body: JSON.stringify(dashboard) }
      )
    },

    async deleteDashboard(connectionId: string, dashboardId: string): Promise<void> {
      await request<void>(`/api/connections/${connectionId}/dashboards/${dashboardId}`, {
        method: 'DELETE'
      })
    },

    async exportDashboards(connectionId?: string): Promise<DashboardExport> {
      const query = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : ''
      return request<DashboardExport>(`/api/dashboards/export${query}`)
    },
  
    async loadQueries(connectionId: string): Promise<SavedQuery[]> {
      return request<SavedQuery[]>(`/api/connections/${connectionId}/queries`)
    },
  
    async saveQuery(
      connectionId: string,
      id: string,
      name: string,
      content: string
    ): Promise<SavedQuery> {
      return request<SavedQuery>(`/api/connections/${connectionId}/queries`, {
        method: 'POST',
        body: JSON.stringify({ connectionId, id, name, content })
      })
    },
  
    async deleteQuery(connectionId: string, queryId: string): Promise<void> {
      await request<void>(`/api/connections/${connectionId}/queries/${queryId}`, { method: 'DELETE' })
    },
  
    async updateQuery(
      connectionId: string,
      queryId: string,
      name: string,
      content: string
    ): Promise<SavedQuery | undefined> {
      return request<SavedQuery | undefined>(`/api/connections/${connectionId}/queries/${queryId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, content })
      })
    },

    async exportTableAsCSV(
      connectionId: string,
      schema: string,
      table: string,
      options?: { sortRules?: TableSortRule[]; filters?: TableFilterCondition[] }
    ): Promise<ExportTableResult> {
      return request<ExportTableResult>(
        `/api/connections/${connectionId}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(
          table
        )}/export/csv`,
        {
          method: 'POST',
          body: JSON.stringify({ options })
        }
      )
    },

    async exportTableAsSQL(
      connectionId: string,
      schema: string,
      table: string,
      options?: { sortRules?: TableSortRule[]; filters?: TableFilterCondition[] }
    ): Promise<ExportTableResult> {
      return request<ExportTableResult>(
        `/api/connections/${connectionId}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(
          table
        )}/export/sql`,
        {
          method: 'POST',
          body: JSON.stringify({ options })
        }
      )
    },

    async deleteTable(
      connectionId: string,
      schema: string,
      table: string
    ): Promise<DeleteTableResult> {
      return request<DeleteTableResult>(
        `/api/connections/${connectionId}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(
          table
        )}`,
        { method: 'DELETE' }
      )
    }
  }
  
  
  export type {
    ConnectionProfile,
    DatabaseType,
    DBConnectionOptions,
    DeleteTableResult,
    DeleteTableRowsResult,
    ExportTableOptions,
    ExportTableResult,
    QueryResult,
    QueryBatchResult,
    QueryResultRow,
    SavedQuery,
    SchemaWithTables,
    TableDataOptions,
    TableDataResult,
    TableFilterCondition,
    TableInfo,
    TableSortRule,
    UpdateTableCellResult
  }
