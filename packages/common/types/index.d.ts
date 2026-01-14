/**
 * Central export file for all common types
 * Import from here for convenience: import { ... } from '@common/types'
 */
export type { QueryResultRow } from 'pg';
export type { BaseAdapter, DBAdapter, QueryResult, RunQueryOptions } from './adapter';
export type { ColumnInfo, DeleteTableOptions, DeleteTableResult, DeleteTableRowsOptions, DeleteTableRowsResult, ExportTableOptions, ExportTableResult, IndexInfo, SQLAdapter, SQLConnectionOptions, SchemaWithTables, TableDataColumn, TableDataOptions, TableDataResult, TableFilterCondition, TableInfo, TableSortRule, UpdateTableCellOptions, UpdateTableCellResult } from './sql';
export type { CollectionInfo, MongoDBAdapter, MongoDBConnectionOptions, MongoDBIndexInfo } from './mongodb';
export type { KeyInfo, RedisAdapter, RedisConnectionOptions, RedisKeyType } from './redis';
export type { ConnectionProfile, DBConnectionOptions, DatabaseType, MongoDBConnectionProfile, RedisConnectionProfile, SQLConnectionProfile, SQLDatabaseType } from './connection';
export type { ConnectionWorkspace, SavedQueriesStorage, SavedQuery, SerializedQueryTab, SerializedTab, SerializedTableTab, WorkspaceStorage } from './workspace';
