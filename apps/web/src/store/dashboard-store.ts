import type { DashboardConfig, Widget, WidgetType } from '@common/types'
import { create } from 'zustand'
import { dbdeskClient } from '@/api/client'

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function createDashboard(connectionId: string, name: string): DashboardConfig {
  const now = new Date()
  return {
    dashboardId: createId('dashboard'),
    connectionId,
    name,
    widgets: [],
    createdAt: now,
    updatedAt: now
  }
}

export interface DashboardStore {
  currentDashboard: DashboardConfig | null
  setCurrentDashboard: (dashboard: DashboardConfig | null) => void
  createDashboard: (connectionId: string, name: string) => Promise<DashboardConfig>
  saveDashboard: (dashboard: DashboardConfig) => Promise<DashboardConfig>
  deleteDashboard: (connectionId: string, dashboardId: string) => Promise<void>
  addWidget: (dashboard: DashboardConfig, type: WidgetType) => Promise<DashboardConfig>
  updateWidget: (dashboard: DashboardConfig, widget: Widget) => Promise<DashboardConfig>
  removeWidget: (dashboard: DashboardConfig, widgetId: string) => Promise<DashboardConfig>
  reset: () => void
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  currentDashboard: null,
  setCurrentDashboard: (currentDashboard) => set({ currentDashboard }),
  createDashboard: async (connectionId, name) => {
    const saved = await dbdeskClient.saveDashboard(createDashboard(connectionId, name))
    set({ currentDashboard: saved })
    return saved
  },
  saveDashboard: async (dashboard) => {
    const saved = await dbdeskClient.saveDashboard({ ...dashboard, updatedAt: new Date() })
    set({ currentDashboard: saved })
    return saved
  },
  deleteDashboard: async (connectionId, dashboardId) => {
    await dbdeskClient.deleteDashboard(connectionId, dashboardId)
    set((state) => ({
      currentDashboard:
        state.currentDashboard?.dashboardId === dashboardId ? null : state.currentDashboard
    }))
  },
  addWidget: async (dashboard, type) => {
    const widget: Widget = {
      id: createId('widget'),
      type,
      title: type === 'barChart' ? 'Bar chart' : `${type[0].toUpperCase()}${type.slice(1)}`,
      queryId: null,
      position: { x: 0, y: dashboard.widgets.length, w: 1, h: 1 },
      settings: { query: '', valueField: '', labelField: '' }
    }
    return get().saveDashboard({
      ...dashboard,
      widgets: [...dashboard.widgets, widget]
    })
  },
  updateWidget: async (dashboard, widget) =>
    get().saveDashboard({
      ...dashboard,
      widgets: dashboard.widgets.map((item) => (item.id === widget.id ? widget : item))
    }),
  removeWidget: async (dashboard, widgetId) =>
    get().saveDashboard({
      ...dashboard,
      widgets: dashboard.widgets.filter((item) => item.id !== widgetId)
    }),
  reset: () => set({ currentDashboard: null })
}))
