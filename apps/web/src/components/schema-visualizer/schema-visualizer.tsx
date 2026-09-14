import type { SQLConnectionProfile, SchemaWithTables, TableInfo } from '@common/types'
import { Search, Table2, Workflow, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { dbdeskClient } from '@/api/client'
import { useSqlWorkspaceStore } from '@/store/sql-workspace-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * The visualizer intentionally consumes the same introspection API as the SQL
 * workspace, so it remains reusable by embedded hosts and other adapters.
 * Hosts can hide its entry point with `features.excluded`.
 */

type DiagramTable = TableInfo & { x: number; y: number }

export function SchemaVisualizer({ profile, schemasWithTables, onOpenTable }: { profile: SQLConnectionProfile; schemasWithTables: SchemaWithTables[]; onOpenTable: (schema: string, table: string) => void }) {
  const [tables, setTables] = useState<DiagramTable[]>([])
  const [search, setSearch] = useState('')
  const [schema, setSchema] = useState('all')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(0)
  const setTableColumns = useSqlWorkspaceStore((state) => state.setTableColumns)
  const tableTargets = useMemo(() => schemasWithTables.flatMap((item) => item.tables.map((table) => ({ schema: item.schema, table }))), [schemasWithTables])

  const load = useCallback(async () => {
    setLoading(true)
    let failures = 0
    const loaded = await Promise.all(tableTargets.map(async ({ schema: tableSchema, table }, index) => {
      try {
        const info = await dbdeskClient.introspectTable(profile.id, tableSchema, table)
        setTableColumns({ ...useSqlWorkspaceStore.getState().tableColumns, [`${tableSchema}.${table}`]: info.columns })
        const columns = Math.max(1, Math.ceil(Math.sqrt(tableTargets.length)))
        return { ...info, x: 40 + (index % columns) * 300, y: 40 + Math.floor(index / columns) * 260 }
      } catch {
        failures += 1
        return null
      }
    }))
    setTables(loaded.filter((table): table is DiagramTable => Boolean(table)))
    setFailed(failures)
    setLoading(false)
  }, [profile.id, setTableColumns, tableTargets])

  useEffect(() => { void load() }, [load])

  const visibleTables = useMemo(() => tables.filter((table) => (schema === 'all' || table.schema === schema) && `${table.schema}.${table.name}`.toLowerCase().includes(search.trim().toLowerCase())), [search, schema, tables])
  const visibleIds = new Set(visibleTables.map((table) => `${table.schema}.${table.name}`))
  const edges = visibleTables.flatMap((table) => table.columns.flatMap((column) => {
    const foreignKey = column.foreignKey
    if (!foreignKey) return []
    const target = `${foreignKey.referencedSchema}.${foreignKey.referencedTable}`
    return visibleIds.has(target) ? [{ source: table, target: visibleTables.find((item) => `${item.schema}.${item.name}` === target)! }] : []
  }))
  const schemas = [...new Set(tables.map((table) => table.schema))].sort()

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-4 py-2">
      <Workflow className="size-4 text-muted-foreground" /><div className="mr-auto"><h1 className="text-sm font-medium">Schema visualizer</h1><p className="text-xs text-muted-foreground">{loading ? 'Reading table relationships…' : `${visibleTables.length}/${tables.length} tables · ${edges.length} relationships`}</p></div>
      <div className="relative"><Search className="pointer-events-none absolute left-2 top-2 size-3.5 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find table" className="h-8 w-40 pl-7 text-xs" />{search && <button className="absolute right-2 top-2" onClick={() => setSearch('')} aria-label="Clear search"><X className="size-3" /></button>}</div>
      <select value={schema} onChange={(event) => setSchema(event.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs"><option value="all">All schemas</option>{schemas.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <Button variant="outline" size="icon" className="size-8" onClick={() => void load()} disabled={loading} title="Refresh diagram"><RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /></Button>
    </div>
    <div className="relative min-h-0 flex-1 overflow-auto bg-muted/20">
      <div className="relative min-h-[720px] min-w-[1100px]" style={{ width: Math.max(1100, (Math.max(...visibleTables.map((table) => table.x), 0) + 340)), height: Math.max(720, Math.max(...visibleTables.map((table) => table.y), 0) + 300) }}>
        <svg className="pointer-events-none absolute inset-0 size-full">{edges.map(({ source, target }, index) => <line key={index} x1={source.x + 250} y1={source.y + 44} x2={target.x} y2={target.y + 44} stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="4 3" />)}</svg>
        {visibleTables.map((table) => <TableCard key={`${table.schema}.${table.name}`} table={table} onOpenTable={onOpenTable} />)}
      </div>
      {!loading && visibleTables.length === 0 && <div className="absolute inset-0 flex items-center justify-center"><div className="rounded-lg border bg-card p-6 text-center shadow-sm"><Table2 className="mx-auto mb-2 size-5 text-muted-foreground" /><p className="text-sm font-medium">No matching tables</p><p className="text-xs text-muted-foreground">Refresh the schema list or change the filter.</p></div></div>}
      {!loading && failed > 0 && <p className="absolute bottom-3 left-3 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">{failed} table{failed === 1 ? '' : 's'} could not be read.</p>}
    </div>
  </div>
}

function TableCard({ table, onOpenTable }: { table: DiagramTable; onOpenTable: (schema: string, table: string) => void }) {
  return <button className="absolute w-64 overflow-hidden rounded-md border bg-card text-left shadow-sm transition-shadow hover:shadow-md" style={{ left: table.x, top: table.y }} onDoubleClick={() => onOpenTable(table.schema, table.name)} title="Double-click to open table"><div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-semibold"><Table2 className="size-3.5" />{table.schema}.{table.name}</div><div className="divide-y">{table.columns.slice(0, 10).map((column) => <div key={column.name} className="flex items-center gap-2 px-3 py-1 text-xs"><span className={cn('w-3 text-center', column.isPrimaryKey && 'text-amber-500')}>{column.isPrimaryKey ? '◆' : column.foreignKey ? '↗' : ''}</span><span className="min-w-0 flex-1 truncate">{column.name}</span><span className="max-w-24 truncate text-muted-foreground">{column.type}</span></div>)}{table.columns.length > 10 && <div className="px-3 py-1 text-[10px] text-muted-foreground">+{table.columns.length - 10} more columns</div>}</div></button>
}
