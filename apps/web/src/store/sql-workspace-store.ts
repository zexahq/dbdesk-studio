import type { ColumnInfo, SchemaWithTables } from '@common/types'
import { create } from 'zustand'

export type WorkspaceSurface = null

interface SqlWorkspaceStore {
  currentConnectionId: string | null
  disconnectingId: string | null
  workspaceReadyId: string | null
  setWorkspaceReady: (id: string | null) => void
  setDisconnecting: (id: string | null) => void
  schemasWithTables: SchemaWithTables[]
  tableColumns: Record<string, ColumnInfo[]>
  sidebarViewMode: 'schemas' | 'queries' | 'dashboards'
  activeSurface: WorkspaceSurface

  setCurrentConnection: (connectionId: string | null) => void
  setSchemasWithTables: (schemas: SchemaWithTables[]) => void
  setTableColumns: (tableColumns: Record<string, ColumnInfo[]>) => void
  setSidebarViewMode: (mode: 'schemas' | 'queries' | 'dashboards') => void
  setActiveSurface: (surface: WorkspaceSurface) => void
  reset: () => void
}

export const useSqlWorkspaceStore = create<SqlWorkspaceStore>((set) => ({
  currentConnectionId: null,
  disconnectingId: null,
  workspaceReadyId: null,
  setWorkspaceReady: (workspaceReadyId) => set({ workspaceReadyId }),
  setDisconnecting: (disconnectingId) => set({ disconnectingId }),
  schemasWithTables: [],
  tableColumns: {},
  sidebarViewMode: 'schemas',
  activeSurface: null,

  setCurrentConnection: (connectionId) =>
    set({
      currentConnectionId: connectionId,
      workspaceReadyId: null,
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
      workspaceReadyId: null,
      schemasWithTables: [],
      tableColumns: {},
      sidebarViewMode: 'schemas',
      activeSurface: null
    })
}))
