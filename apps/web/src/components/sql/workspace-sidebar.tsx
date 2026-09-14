import type { DashboardConfig, SQLConnectionProfile } from '@common/types'
import { dbdeskClient } from '@/api/client'
import { SaveQueryDialog } from '@/components/dialogs/save-query-dialog'
import { AddTableSheet } from '@/components/sql/table-view/add-table-sheet'
import { TableOptionsDropdown } from '@/components/sql/table-view/table-options-dropdown'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarSeparator
} from '@/components/ui/sidebar'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useSavedQueriesStore } from '@/store/saved-queries-store'
import { DASHBOARD_QUERY_KEYS, useDashboardStore } from '@/store/dashboard-store'
import { useSqlWorkspaceStore } from '@/store/sql-workspace-store'
import { type Tab, useActiveTab, useTabStore } from '@/store/tab-store'
import {
  ChevronRight,
  DatabaseIcon,
  FileText,
  LayoutDashboard,
  MoreVertical,
  Pencil,
  Plus,
  RotateCw,
  SquareCode,
  Table2Icon,
  Trash2,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

type WorkspaceSidebarProps = {
  profile: SQLConnectionProfile
  onCloseSurface: () => void
}

type RenameMode = {
  open: boolean
  queryId: string | null
}

export function WorkspaceSidebar({ profile, onCloseSurface }: WorkspaceSidebarProps) {
  const [renameMode, setRenameMode] = useState<RenameMode>({ open: false, queryId: null })
  const [dashboardName, setDashboardName] = useState('')

  const schemasWithTables = useSqlWorkspaceStore((s) => s.schemasWithTables)
  const sidebarViewMode = useSqlWorkspaceStore((s) => s.sidebarViewMode)
  const setSidebarViewMode = useSqlWorkspaceStore((s) => s.setSidebarViewMode)
  const addTableTab = useTabStore((s) => s.addTableTab)
  const addQueryTab = useTabStore((s) => s.addQueryTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const findQueryTabById = useTabStore((s) => s.findQueryTabById)
  const updateQueryTab = useTabStore((s) => s.updateQueryTab)
  const removeTab = useTabStore((s) => s.removeTab)
  const addDashboardTab = useTabStore((s) => s.addDashboardTab)
  const findDashboardTabById = useTabStore((s) => s.findDashboardTabById)
  const activeTab = useActiveTab()

  const queries = useSavedQueriesStore((s) => s.queries)
  const loadQueries = useSavedQueriesStore((s) => s.loadQueries)
  const deleteQuery = useSavedQueriesStore((s) => s.deleteQuery)
  const updateQuery = useSavedQueriesStore((s) => s.updateQuery)

  const queryClient = useQueryClient()
  const dashboardStore = useDashboardStore()
  const { data: dashboards = [], isLoading: dashboardsLoading } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.list(profile.id),
    queryFn: () => dbdeskClient.loadDashboards(profile.id),
    staleTime: 30_000,
    refetchOnWindowFocus: false
  })
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefreshSchemas = async () => {
    setIsRefreshing(true)
    try {
      await queryClient.invalidateQueries({
        queryKey: ['schemasWithTables', profile.id]
      })
      toast.success('Schemas refreshed')
    } catch {
      toast.error('Failed to refresh schemas')
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    loadQueries(profile.id).catch((error) => {
      console.error('Failed to load queries:', error)
    })
  }, [profile.id, loadQueries])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return
      if (event.key.toLowerCase() === 'e') {
        event.preventDefault()
        setSidebarViewMode('schemas')
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault()
        setSidebarViewMode('queries')
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [setSidebarViewMode])

  const handleTableClick = (schema: string, table: string) => {
    onCloseSurface()
    addTableTab(schema, table)
  }

  const handleLoadQuery = (query: (typeof queries)[0]) => {
    onCloseSurface()
    const existingTab = findQueryTabById(query.id)
    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    const newTabId = addQueryTab()
    updateQueryTab(newTabId, {
      id: query.id,
      name: query.name,
      editorContent: query.content,
      lastSavedContent: query.content
    })
    setActiveTab(query.id)
  }

  const handleDeleteQuery = async (queryId: string) => {
    try {
      await deleteQuery(profile.id, queryId)
      // Close the tab if that query is open
      const tab = findQueryTabById(queryId)
      if (tab) {
        removeTab(tab.id)
      }

      toast.success('Query deleted')
    } catch {
      toast.error('Failed to delete query')
    }
  }

  const handleRenameQuery = async (newName: string) => {
    if (!renameMode.queryId) return

    const query = queries.find((q) => q.id === renameMode.queryId)
    if (!query) return
    const tab = findQueryTabById(renameMode.queryId)
    if (tab?.isLocked) {
      toast.error('Unlock the query tab before renaming it')
      return
    }

    try {
      await updateQuery(profile.id, renameMode.queryId, newName, query.content)
      toast.success('Query renamed')

      if (tab) {
        updateQueryTab(tab.id, { name: newName })
      }
    } catch {
      toast.error('Failed to rename query')
    }
  }

  const selectedQuery = renameMode.queryId ? queries.find((q) => q.id === renameMode.queryId) : null

  const handleNewQuery = () => {
    onCloseSurface()
    addQueryTab()
  }

  const handleDuplicateToQuery = (schema: string, table: string) => {
    const newTabId = addQueryTab()
    updateQueryTab(newTabId, {
      editorContent: `SELECT * FROM "${schema}"."${table}" LIMIT 50`,
      name: `${table} copy`
    })
  }

  const refreshDashboards = () =>
    queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.list(profile.id) })

  const handleCreateDashboard = async () => {
    try {
      const name = dashboardName.trim() || `Dashboard ${dashboards.length + 1}`
      const dashboard = await dashboardStore.createDashboard(profile.id, name)
      setDashboardName('')
      addDashboardTab(dashboard.dashboardId, dashboard.name)
      dashboardStore.setCurrentDashboard(dashboard)
      await refreshDashboards()
      toast.success('Dashboard created')
    } catch {
      toast.error('Failed to create dashboard')
    }
  }

  const handleLoadDashboard = (dashboard: DashboardConfig) => {
    addDashboardTab(dashboard.dashboardId, dashboard.name)
    dashboardStore.setCurrentDashboard(dashboard)
  }

  const handleDeleteDashboard = async (dashboard: DashboardConfig) => {
    if (!window.confirm(`Delete ${dashboard.name}?`)) return
    try {
      await dashboardStore.deleteDashboard(profile.id, dashboard.dashboardId)
      const tab = findDashboardTabById(dashboard.dashboardId)
      if (tab) removeTab(tab.id)
      await refreshDashboards()
      toast.success('Dashboard deleted')
    } catch {
      toast.error('Failed to delete dashboard')
    }
  }

  return (
    <>
      <Sidebar className="w-full h-full" collapsible="none">
        <SidebarHeader>
          <SidebarGroup className="flex flex-col gap-2">
            <div className="text-sm font-medium text-foreground px-2">{profile.name}</div>
            <Button
              variant="outline"
              className="w-full justify-start h-10 gap-2 cursor-pointer"
              onClick={handleNewQuery}
            >
              <Plus className="size-4 text-muted-foreground" />
              New Query
            </Button>
          </SidebarGroup>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent className="gap-0 py-2">
          <Collapsible defaultOpen className={cn('group/schema', sidebarViewMode !== 'schemas' && 'hidden')}>
            <SidebarGroup className="gap-2 py-0">
              <div className="flex items-center gap-2">
                <CollapsibleTrigger className="flex-1 cursor-pointer h-10 px-3 flex items-center justify-between text-sm font-medium border rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
                  <span className="flex items-center gap-2">
                    <DatabaseIcon className="size-4" />
                    <span>Schemas</span>
                  </span>
                  <ChevronRight className="size-4 transition-transform group-data-[state=open]/schema:rotate-90" />
                </CollapsibleTrigger>
                <button
                  onClick={handleRefreshSchemas}
                  disabled={isRefreshing}
                  className="h-10 w-10 flex items-center justify-center border rounded-md hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
                  title="Refresh schemas"
                >
                  <RotateCw className={cn('size-4', isRefreshing && 'animate-spin')} />
                </button>
              </div>
              <CollapsibleContent>
                <SidebarGroupContent className="mt-2">
                  <SidebarMenu>
                    {schemasWithTables.length === 0 ? (
                      <SidebarMenuItem>
                        <SidebarMenuButton aria-disabled>No schemas</SidebarMenuButton>
                      </SidebarMenuItem>
                    ) : (
                      schemasWithTables.map((schemaData) => (
                        <SchemaTree
                          key={schemaData.schema}
                          connectionId={profile.id}
                          schema={schemaData.schema}
                          tables={schemaData.tables}
                          activeTab={activeTab}
                          onTableClick={handleTableClick}
                          onDuplicateToQuery={handleDuplicateToQuery}
                        />
                      ))
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>

          <div className={cn('px-2 pb-3', sidebarViewMode !== 'dashboards' && 'hidden')}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Dashboards</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => void refreshDashboards()}
                title="Refresh dashboards"
              >
                <RotateCw className="size-4" />
              </Button>
            </div>
            <div className="mb-2 flex gap-2">
              <Input
                value={dashboardName}
                onChange={(event) => setDashboardName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleCreateDashboard()
                }}
                placeholder="Dashboard name"
                className="h-9"
              />
              <Button
                size="icon"
                className="size-9 shrink-0"
                onClick={() => void handleCreateDashboard()}
                title="Create dashboard"
              >
                <Plus className="size-4" />
              </Button>
            </div>
            {dashboardsLoading ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>
            ) : dashboards.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">No dashboards yet.</p>
            ) : (
              <SidebarMenu>
                {dashboards.map((dashboard) => {
                  const isActive =
                    activeTab?.kind === 'dashboard' &&
                    activeTab.dashboardId === dashboard.dashboardId
                  return (
                    <SidebarMenuItem key={dashboard.dashboardId}>
                      <div className={cn('group flex items-center rounded-md', isActive && 'bg-accent')}>
                        <SidebarMenuButton
                          onClick={() => handleLoadDashboard(dashboard)}
                          className="min-w-0 flex-1 cursor-pointer gap-2"
                        >
                          <LayoutDashboard className="size-4 shrink-0" />
                          <span className="truncate">{dashboard.name}</span>
                        </SidebarMenuButton>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => void handleDeleteDashboard(dashboard)}
                          title="Delete dashboard"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            )}
          </div>

          <Collapsible
            defaultOpen={sidebarViewMode === 'queries'}
            className={cn(
              'group/queries',
              sidebarViewMode !== 'queries' && sidebarViewMode !== 'dashboards' && 'hidden'
            )}
          >
            <SidebarGroup className="gap-2">
              <CollapsibleTrigger className="cursor-pointer w-full h-10 px-3 flex items-center justify-between text-sm font-medium border rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
                <span className="flex items-center gap-2">
                  <FileText className="size-4" />
                  Saved Queries
                </span>
                <ChevronRight className="size-4 transition-transform group-data-[state=open]/queries:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent className="mt-2">
                  {queries.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No saved queries yet
                      <div className="text-xs mt-2">Press Ctrl+S to save a query</div>
                    </div>
                  ) : (
                    <SidebarMenu>
                      {queries.map((query) => {
                        const isActive = activeTab?.id === query.id
                        return (
                          <SidebarMenuItem key={query.id}>
                            <div
                              className={cn(
                                'flex items-center justify-between w-full px-2 rounded-md hover:bg-accent group',
                                isActive && 'bg-accent'
                              )}
                            >
                              <SidebarMenuButton
                                onClick={() => handleLoadQuery(query)}
                                className="flex-1 cursor-pointer gap-2 h-9"
                                asChild
                              >
                                <button className="text-left">
                                  <SquareCode className="size-4 shrink-0" />
                                  <span className="truncate">{query.name}</span>
                                </button>
                              </SidebarMenuButton>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-accent rounded cursor-pointer">
                                    <MoreVertical className="size-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setRenameMode({ open: true, queryId: query.id })
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <Pencil className="size-4 mr-2" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteQuery(query.id)}
                                    className="cursor-pointer"
                                  >
                                    <Trash2 className="size-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </SidebarMenuItem>
                        )
                      })}
                    </SidebarMenu>
                  )}
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        </SidebarContent>
      </Sidebar>

      {selectedQuery && (
        <SaveQueryDialog
          open={renameMode.open}
          onOpenChange={(open) => setRenameMode({ ...renameMode, open })}
          title="Rename Query"
          description="Enter a new name for your query"
          placeholder={selectedQuery.name}
          submitText="Rename"
          initialValue={selectedQuery.name}
          onSave={handleRenameQuery}
        />
      )}
    </>
  )
}

type SchemaTreeProps = {
  connectionId: string
  schema: string
  tables: string[]
  activeTab: Tab | null
  onTableClick: (schema: string, table: string) => void
  onDuplicateToQuery: (schema: string, table: string) => void
}

function SchemaTree({ connectionId, schema, tables, activeTab, onTableClick }: SchemaTreeProps) {
  const isPublic = schema === 'public'
  const [createTableOpen, setCreateTableOpen] = useState(false)

  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        defaultOpen={isPublic}
      >
        <div className="flex items-center gap-1">
          <CollapsibleTrigger asChild>
            <SidebarMenuButton className="cursor-pointer h-9">
              <ChevronRight className="size-4 transition-transform" />
              <DatabaseIcon className="size-4" />
              <span>{schema}</span>
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            title={`Create table in ${schema}`}
            onClick={() => setCreateTableOpen(true)}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <CollapsibleContent>
          <SidebarMenuSub className="ml-3! mr-0!">
            {tables.length === 0 ? (
              <SidebarMenuButton aria-disabled>No tables</SidebarMenuButton>
            ) : (
              tables.map((table) => {
                const isActive = activeTab?.id === `${schema}.${table}`
                return (
                  <div
                    key={table}
                    className={cn(
                      'flex items-center justify-between w-full px-2 rounded-md hover:bg-accent group',
                      isActive && 'bg-accent'
                    )}
                  >
                    <SidebarMenuButton
                      onClick={() => onTableClick(schema, table)}
                      className="flex-1 cursor-pointer gap-2 h-9"
                      isActive={isActive}
                    >
                      <Table2Icon className="size-4" />
                      <span>{table}</span>
                    </SidebarMenuButton>
                    <div className={`${isActive ? 'block!' : 'hidden'}`}>
                      <TableOptionsDropdown
                        connectionId={connectionId}
                        schema={schema}
                        table={table}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
      <AddTableSheet
        connectionId={connectionId}
        schema={schema}
        open={createTableOpen}
        onOpenChange={setCreateTableOpen}
      />
    </SidebarMenuItem>
  )
}
