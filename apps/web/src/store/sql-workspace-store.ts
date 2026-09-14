import type { ColumnInfo, SchemaWithTables } from '@common/types'
import { create } from 'zustand'

export type WorkspaceSurface = 'dashboard' | 'schema-visualizer' | null

interface SqlWorkspaceStore {
  currentConnectionId: string | null
  schemasWithTables: SchemaWithTables[]
  tableColumns: Record<string, ColumnInfo[]>
  sidebarViewMode: 'schemas' | 'queries'
  activeSurface: WorkspaceSurface

  setCurrentConnection: (connectionId: string | null) => void
  setSchemasWithTables: (schemas: SchemaWithTables[]) => void
  setTableColumns: (tableColumns: Record<string, ColumnInfo[]>) => void
  setSidebarViewMode: (mode: 'schemas' | 'queries') => void
  setActiveSurface: (surface: WorkspaceSurface) => void
  reset: () => void
}

export const useSqlWorkspaceStore = create<SqlWorkspaceStore>((set) => ({
  currentConnectionId: null,
  schemasWithTables: [],
  tableColumns: {},
  sidebarViewMode: 'schemas',
  activeSurface: null,

  setCurrentConnection: (connectionId) =>
    set({
      currentConnectionId: connectionId,
      schemasWithTables: [],
      tableColumns: {},
      activeSurface: null
    }),
  setSchemasWithTables: (schemas) => set({ schemasWithTables: schemas }),
  setTableColumns: (tableColumns) => set({ tableColumns }),
  setSidebarViewMode: (sidebarViewMode) => set({ sidebarViewMode }),
  setActiveSurface: (activeSurface) => set({ activeSurface }),
  reset: () =>
    set({
      currentConnectionId: null,
      schemasWithTables: [],
      tableColumns: {},
      sidebarViewMode: 'schemas',
      activeSurface: null
    })
}))
