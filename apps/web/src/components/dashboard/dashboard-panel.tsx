import type { DashboardConfig, QueryResult, SQLConnectionProfile, Widget, WidgetType } from '@common/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, Database, LineChart, PieChart, Plus, RefreshCw, Table2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { dbdeskClient } from '@/api/client'
import { useSavedQueriesStore } from '@/store/saved-queries-store'
import { useDashboardStore } from '@/store/dashboard-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Dashboard is a normal Studio surface, not an Autobase-only extension.
 * Hosts that do not want to expose it should list `dashboard` in
 * `features.excluded` in their runtime registry.
 */

const widgetTypes: Array<{ type: WidgetType; label: string }> = [
  { type: 'kpi', label: 'KPI' },
  { type: 'table', label: 'Table' },
  { type: 'barChart', label: 'Bar chart' },
  { type: 'lineChart', label: 'Line chart' },
  { type: 'pieChart', label: 'Pie chart' },
  { type: 'notes', label: 'Notes' }
]

export function DashboardPanel({ profile }: { profile: SQLConnectionProfile }) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const { data: dashboards = [], isLoading } = useQuery({
    queryKey: ['dashboards', profile.id],
    queryFn: () => dbdeskClient.loadDashboards(profile.id)
  })
  const currentDashboard = useDashboardStore((state) => state.currentDashboard)
  const setCurrentDashboard = useDashboardStore((state) => state.setCurrentDashboard)
  const createDashboard = useDashboardStore((state) => state.createDashboard)
  const saveDashboard = useDashboardStore((state) => state.saveDashboard)
  const deleteDashboard = useDashboardStore((state) => state.deleteDashboard)
  const addWidget = useDashboardStore((state) => state.addWidget)
  const savedQueries = useSavedQueriesStore((state) => state.queries)

  useEffect(() => {
    if (!selectedId && dashboards[0]) setSelectedId(dashboards[0].dashboardId)
    if (selectedId && !dashboards.some((dashboard) => dashboard.dashboardId === selectedId)) {
      setSelectedId(dashboards[0]?.dashboardId ?? null)
    }
  }, [dashboards, selectedId])

  useEffect(() => {
    const selected = dashboards.find((dashboard) => dashboard.dashboardId === selectedId)
    setCurrentDashboard(selected ?? null)
  }, [dashboards, selectedId, setCurrentDashboard])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['dashboards', profile.id] })

  const handleCreate = async () => {
    const name = newName.trim() || `Dashboard ${dashboards.length + 1}`
    const dashboard = await createDashboard(profile.id, name)
    setNewName('')
    setSelectedId(dashboard.dashboardId)
    await refresh()
  }

  const handleDelete = async (dashboard: DashboardConfig) => {
    if (!window.confirm(`Delete ${dashboard.name}?`)) return
    await deleteDashboard(profile.id, dashboard.dashboardId)
    setSelectedId(null)
    await refresh()
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="w-64 shrink-0 border-r bg-muted/10 p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Dashboards</h2>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => void refresh()} title="Refresh dashboards">
            <RefreshCw className="size-4" />
          </Button>
        </div>
        <div className="mb-3 flex gap-2">
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Dashboard name" onKeyDown={(event) => { if (event.key === 'Enter') void handleCreate() }} />
          <Button size="icon" onClick={() => void handleCreate()} title="Create dashboard"><Plus className="size-4" /></Button>
        </div>
        {isLoading ? <p className="p-2 text-xs text-muted-foreground">Loading…</p> : dashboards.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">No dashboards yet.</p>
        ) : dashboards.map((dashboard) => (
          <div key={dashboard.dashboardId} className={cn('group mb-1 flex items-center rounded-md', selectedId === dashboard.dashboardId && 'bg-accent')}>
            <button className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm" onClick={() => setSelectedId(dashboard.dashboardId)}>{dashboard.name}</button>
            <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100" onClick={() => void handleDelete(dashboard)} title="Delete dashboard"><Trash2 className="size-3.5" /></Button>
          </div>
        ))}
      </aside>
      {currentDashboard ? <DashboardCanvas dashboard={currentDashboard} savedQueries={savedQueries} onSave={async (dashboard) => { await saveDashboard(dashboard); await refresh() }} onAddWidget={(type) => void addWidget(currentDashboard, type).then(refresh)} /> : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Create or select a dashboard.</div>
      )}
    </div>
  )
}

function DashboardCanvas({ dashboard, savedQueries, onSave, onAddWidget }: { dashboard: DashboardConfig; savedQueries: Array<{ id: string; name: string; content: string }>; onSave: (dashboard: DashboardConfig) => Promise<void>; onAddWidget: (type: WidgetType) => void }) {
  return (
    <main className="min-w-0 flex-1 overflow-auto p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-lg font-semibold">{dashboard.name}</h1><p className="text-xs text-muted-foreground">Reusable database dashboard</p></div>
        <div className="flex flex-wrap gap-1">
          {widgetTypes.map(({ type, label }) => <Button key={type} variant="outline" size="sm" onClick={() => onAddWidget(type)}><WidgetIcon type={type} />{label}</Button>)}
        </div>
      </div>
      <div className="grid auto-rows-min grid-cols-1 gap-4 xl:grid-cols-2">
        {dashboard.widgets.length === 0 ? <Card className="col-span-full"><CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Database className="size-4" />Add a widget to start building this dashboard.</CardContent></Card> : dashboard.widgets.map((widget) => <DashboardWidget key={widget.id} widget={widget} dashboard={dashboard} savedQueries={savedQueries} onSave={onSave} />)}
      </div>
    </main>
  )
}

function DashboardWidget({ widget, dashboard, savedQueries, onSave }: { widget: Widget; dashboard: DashboardConfig; savedQueries: Array<{ id: string; name: string; content: string }>; onSave: (dashboard: DashboardConfig) => Promise<void> }) {
  const [query, setQuery] = useState(typeof widget.settings.query === 'string' ? widget.settings.query : '')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)
  const settings = widget.settings

  useEffect(() => setQuery(typeof widget.settings.query === 'string' ? widget.settings.query : ''), [widget.id, widget.settings.query])

  const run = async () => {
    const saved = widget.queryId ? savedQueries.find((item) => item.id === widget.queryId)?.content : undefined
    const sql = (query.trim() || saved || '').trim()
    if (!sql) return
    setRunning(true)
    try { setResult(await dbdeskClient.runQuery(dashboard.connectionId, sql, { limit: 100 })) } finally { setRunning(false) }
  }

  const saveQuery = () => void onSave({ ...dashboard, widgets: dashboard.widgets.map((item) => item.id === widget.id ? { ...item, settings: { ...item.settings, query } } : item) })
  const rows = result?.rows ?? []
  const columns = result?.columns ?? (rows[0] ? Object.keys(rows[0]) : [])
  const numericValues = rows.map((row) => Number(row[String(settings.valueField || columns[0])])).filter(Number.isFinite)
  const max = Math.max(...numericValues, 1)

  return <Card className="min-w-0"><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-sm">{widget.title}</CardTitle><div className="flex gap-1"><Button variant="ghost" size="icon" className="size-8" onClick={() => void run()} disabled={running} title="Run widget query"><RefreshCw className={cn('size-3.5', running && 'animate-spin')} /></Button><Button variant="ghost" size="icon" className="size-8" onClick={() => void onSave({ ...dashboard, widgets: dashboard.widgets.filter((item) => item.id !== widget.id) })} title="Remove widget"><Trash2 className="size-3.5" /></Button></div></CardHeader><CardContent className="space-y-3">
    {widget.type === 'notes' ? <textarea value={query} onChange={(event) => setQuery(event.target.value)} onBlur={saveQuery} className="min-h-32 w-full rounded-md border bg-background p-2 text-sm" placeholder="Write a note…" /> : <>
      <textarea value={query} onChange={(event) => setQuery(event.target.value)} onBlur={saveQuery} className="min-h-16 w-full rounded-md border bg-background p-2 font-mono text-xs" placeholder="SELECT ..." />
      {result && widget.type === 'kpi' && <div className="py-4 text-3xl font-semibold">{String(result.rows[0]?.[result.columns[0]] ?? '—')}</div>}
      {result && (widget.type === 'barChart' || widget.type === 'lineChart' || widget.type === 'pieChart') && <div className="space-y-2">{rows.slice(0, 8).map((row, index) => { const label = String(row[columns[0]] ?? index + 1); const value = Number(row[columns[1]]) || 0; return <div key={`${widget.id}-${index}`} className="flex items-center gap-2 text-xs"><span className="w-24 truncate">{label}</span><div className="h-5 flex-1 rounded bg-muted"><div className={cn('h-full rounded bg-primary', widget.type === 'lineChart' && 'bg-blue-500', widget.type === 'pieChart' && 'bg-emerald-500')} style={{ width: `${Math.max(2, Math.min(100, Math.abs(value) / max * 100))}%` }} /></div><span className="w-16 text-right">{value}</span></div> })}</div>}
      {result && widget.type === 'table' && <div className="overflow-auto"><table className="w-full text-xs"><thead><tr>{columns.map((column) => <th key={column} className="border-b px-2 py-1 text-left font-medium">{column}</th>)}</tr></thead><tbody>{rows.slice(0, 10).map((row, index) => <tr key={index}>{columns.map((column) => <td key={column} className="border-b px-2 py-1">{String(row[column] ?? '')}</td>)}</tr>)}</tbody></table></div>}
    </>}
  </CardContent></Card>
}

function WidgetIcon({ type }: { type: WidgetType }) {
  if (type === 'table') return <Table2 className="size-3.5" />
  if (type === 'barChart') return <BarChart3 className="size-3.5" />
  if (type === 'lineChart') return <LineChart className="size-3.5" />
  if (type === 'pieChart') return <PieChart className="size-3.5" />
  return <span className="text-xs">{type === 'kpi' ? '#' : '✎'}</span>
}
