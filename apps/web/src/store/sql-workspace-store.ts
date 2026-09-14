import type { ColumnInfo, SchemaWithTables } from '@common/types'
import { create } from 'zustand'

interface SqlWorkspaceStore {
  currentConnectionId: string | null
  schemasWithTables: SchemaWithTables[]
  tableColumns: Record<string, ColumnInfo[]>
  sidebarViewMode: 'schemas' | 'queries'

  setCurrentConnection: (connectionId: string | null) => void
  setSchemasWithTables: (schemas: SchemaWithTables[]) => void
  setTableColumns: (tableColumns: Record<string, ColumnInfo[]>) => void
  setSidebarViewMode: (mode: 'schemas' | 'queries') => void
  reset: () => void
}

export const useSqlWorkspaceStore = create<SqlWorkspaceStore>((set) => ({
  currentConnectionId: null,
  schemasWithTables: [],
  tableColumns: {},
  sidebarViewMode: 'schemas',

  setCurrentConnection: (connectionId) =>
    set({
      currentConnectionId: connectionId,
      schemasWithTables: [],
      tableColumns: {}
    }),
  setSchemasWithTables: (schemas) => set({ schemasWithTables: schemas }),
  setTableColumns: (tableColumns) => set({ tableColumns }),
  setSidebarViewMode: (sidebarViewMode) => set({ sidebarViewMode }),
  reset: () =>
    set({
      currentConnectionId: null,
      schemasWithTables: [],
      tableColumns: {},
      sidebarViewMode: 'schemas'
    })
}))
