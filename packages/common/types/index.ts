/**
 * Central export file for all common types
 * Import from here for convenience: import { ... } from '@common/types'
 */

// Base adapter types
export type { QueryResultRow } from 'pg'
export type { BaseAdapter, DBAdapter, QueryBatchResult, QueryResult, RunQueryOptions } from './adapter'

// SQL types
export type {
  ColumnInfo,
  ColumnDefinition,
  CreateTableOptions,
  CreateTableResult,
  DeleteTableOptions,
  DeleteTableResult,
  DeleteTableRowsOptions,
  DeleteTableRowsResult,
  EditorQueryBlock,
  ExportTableOptions,
  ExportTableResult,
  InsertTableRowOptions,
  InsertTableRowResult,
  IndexInfo,
  SQLAdapter,
  SQLConnectionOptions,
  SchemaWithTables,
  TableDataColumn,
  TableDataOptions,
  TableDataResult,
  TableFilterCondition,
  TableInfo,
  TableSortRule,
  UpdateTableCellOptions,
  UpdateTableCellResult
} from './sql'

// MongoDB types
export type {
  CollectionInfo,
  MongoDBAdapter,
  MongoDBConnectionOptions,
  MongoDBIndexInfo
} from './mongodb'

// Redis types
export type { KeyInfo, RedisAdapter, RedisConnectionOptions, RedisKeyType } from './redis'

// Connection types
export type {
  ConnectionProfile,
  DBConnectionOptions,
  DatabaseType,
  MongoDBConnectionProfile,
  RedisConnectionProfile,
  SQLConnectionProfile,
  SQLDatabaseType
} from './connection'

// Workspace types
export type {
  ConnectionWorkspace,
  SavedQueriesStorage,
  SavedQuery,
  SerializedDashboardTab,
  SerializedQueryTab,
  SerializedSchemaDiagramTab,
  SerializedTab,
  SerializedTableTab,
  WorkspaceStorage
} from './workspace'

// Dashboard types
export type {
  ChartWidgetSettings,
  DashboardConfig,
  DashboardExport,
  DashboardLayout,
  KPIWidgetSettings,
  NotesWidgetSettings,
  PieChartWidgetSettings,
  SavedQueriesWidgetSettings,
  ScatterWidgetSettings,
  TableWidgetSettings,
  Widget,
  WidgetPosition,
  WidgetSettings,
  WidgetType
} from './dashboard'
