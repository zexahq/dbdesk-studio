import type { SQLConnectionProfile } from '@common/types'
import { useCancelQuery, useRunManyQueries, useRunQuery } from '@/api/queries/query'
import { SaveQueryDialog } from '@/components/dialogs/save-query-dialog'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from '@/components/ui/resizable'
import { useSavedQueriesStore } from '@/store/saved-queries-store'
import { useSqlWorkspaceStore } from '@/store/sql-workspace-store'
import { type QueryTab, useTabStore } from '@/store/tab-store'
import { toast } from '@/lib/toast'
import {
  getInitialStatementKeyword,
  getQueryAtLine,
  hasDangerousSqlKeywords,
  normalizeQuery
} from '@/lib/sql-parser'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { DangerousQueryDialog } from '../dialogs/dangerous-query-dialog'
import { QueryBottombar } from './query-bottombar'
import { QueryResults } from './query-results'

// Monaco, SQL formatting, and SQL language services are only needed after a
// query tab opens. Keeping them behind this boundary removes them from the
// initial connections/workspace download.
const SqlEditor = lazy(() => import('@/components/editor/sql-editor'))

interface QueryViewProps {
  profile: SQLConnectionProfile
  activeTab: QueryTab
}

export function QueryView({ profile, activeTab }: QueryViewProps) {
  const queries = useSavedQueriesStore((s) => s.queries)
  const saveQuery = useSavedQueriesStore((s) => s.saveQuery)
  const updateQuery = useSavedQueriesStore((s) => s.updateQuery)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [dangerousDialogOpen, setDangerousDialogOpen] = useState(false)
  const pendingQueriesRef = useRef<string[]>([])
  const queryIdRef = useRef<string | null>(null)

  const {
    mutateAsync: runQueryMutation,
    isPending: isExecuting,
    error: executionError
  } = useRunQuery(profile.id)
  const runManyMutation = useRunManyQueries(profile.id)
  const cancelMutation = useCancelQuery(profile.id)

  const isQueryTabSaved = queries.some((q) => q.id === activeTab.id)
  const updateQueryTab = useTabStore((s) => s.updateQueryTab)
  const schemasWithTables = useSqlWorkspaceStore((s) => s.schemasWithTables)
  const tableColumns = useSqlWorkspaceStore((s) => s.tableColumns)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (!activeTab.editorContent.trim()) {
          toast.error('Query cannot be empty')
          return
        }

        if (isQueryTabSaved) {
          void handleUpdateQuery()
        } else {
          setSaveDialogOpen(true)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, isQueryTabSaved])

  const executeQueries = useCallback(
    async (queries: string[], limit: number, offset: number) => {
      if (queries.length === 0) return
      const queryId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
      queryIdRef.current = queryId
      updateQueryTab(activeTab.id, {
        queryResults: undefined,
        batchResults: undefined,
        activeResultIndex: 0,
        isExplainPlan: false
      })

      try {
        if (queries.length === 1) {
          const result = await runQueryMutation({ query: queries[0], options: { limit, offset, queryId } })
          updateQueryTab(activeTab.id, {
            queryResults: result,
            limit: result.limit,
            offset: result.offset,
            totalRowCount: result.totalRowCount,
            isExplainPlan: false
          })
        } else {
          const results = await runManyMutation.mutateAsync({ queries, options: { limit, offset, queryId } })
          updateQueryTab(activeTab.id, { batchResults: results, activeResultIndex: 0, isExplainPlan: false })
        }
      } catch {
        updateQueryTab(activeTab.id, { queryResults: undefined, batchResults: undefined })
      } finally {
        queryIdRef.current = null
      }
    },
    [activeTab.id, runManyMutation, runQueryMutation, updateQueryTab]
  )

  const executeQueryWithPagination = useCallback(
    async (limit: number, offset: number, queries = getQueryAtLine(activeTab.editorContent)) => {
      await executeQueries(queries, limit, offset)
    },
    [activeTab.editorContent, executeQueries]
  )

  const handleRunQuery = async (cursorLine?: number) => {
    const queries = getQueryAtLine(activeTab.editorContent, cursorLine)
    if (queries.length === 0) {
      toast.error('Query cannot be empty')
      return
    }
    if (hasDangerousSqlKeywords(queries.join(';\n'))) {
      pendingQueriesRef.current = queries
      setDangerousDialogOpen(true)
      return
    }
    const limit = activeTab.limit ?? 50
    await executeQueryWithPagination(limit, 0, queries)
  }

  const handleExplain = async () => {
    const selected = getQueryAtLine(activeTab.editorContent)
    if (selected.length !== 1) {
      toast.error('Explain requires exactly one SQL statement')
      return
    }
    const query = normalizeQuery(selected[0])
    if (!query) {
      toast.error('Query cannot be empty')
      return
    }
    if (!['select', 'with', 'values'].includes(getInitialStatementKeyword(query) ?? '')) {
      toast.error('Explain Analyze supports one read-only SELECT, WITH, or VALUES statement')
      return
    }

    const queryId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    queryIdRef.current = queryId
    updateQueryTab(activeTab.id, {
      queryResults: undefined,
      batchResults: undefined,
      activeResultIndex: 0,
      isExplainPlan: false
    })
    try {
      const result = await runQueryMutation({
        query: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
        options: { queryId, readOnly: true }
      })
      updateQueryTab(activeTab.id, {
        queryResults: result,
        batchResults: undefined,
        activeResultIndex: 0,
        totalRowCount: undefined,
        lastExecutedQuery: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
        isExplainPlan: true
      })
    } catch {
      updateQueryTab(activeTab.id, { queryResults: undefined, batchResults: undefined })
    } finally {
      queryIdRef.current = null
    }
  }

  const handleUpdateQuery = async () => {
    if (activeTab.isLocked) return
    const savedQuery = queries.find((q) => q.id === activeTab.id)
    if (!savedQuery) return

    try {
      await updateQuery(profile.id, activeTab.id, savedQuery.name, activeTab.editorContent)
      updateQueryTab(activeTab.id, { lastSavedContent: activeTab.editorContent })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save query')
    }
  }

  const handleSaveQuery = async (name: string) => {
    if (activeTab.isLocked) return
    try {
      await saveQuery(profile.id, activeTab.id, name, activeTab.editorContent)
      updateQueryTab(activeTab.id, { name, lastSavedContent: activeTab.editorContent })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save query')
    }
  }

  return (
    <>
      <ResizablePanelGroup direction="vertical" className="flex-1">
        <ResizablePanel defaultSize={50} minSize={20}>
          <div className="h-full w-full">
            <Suspense fallback={<EditorLoading />}>
              <SqlEditor
                tabId={activeTab.id}
                value={activeTab.editorContent}
                onChange={(value) => updateQueryTab(activeTab.id, { editorContent: value })}
                language={profile.type}
                onExecute={handleRunQuery}
                readOnly={activeTab.isLocked}
                schemasWithTables={schemasWithTables}
                tableColumns={tableColumns}
              />
            </Suspense>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50} minSize={30}>
          <QueryResults
            queryResults={activeTab.queryResults}
            batchResults={activeTab.batchResults}
            activeResultIndex={activeTab.activeResultIndex}
            isLoading={isExecuting || runManyMutation.isPending}
            error={executionError ?? runManyMutation.error}
            onRun={handleRunQuery}
            onExplain={() => void handleExplain()}
            isExplainPlan={activeTab.isExplainPlan}
            onCancel={() => {
              if (queryIdRef.current) void cancelMutation.mutateAsync(queryIdRef.current)
            }}
            onResultSelect={(index) => updateQueryTab(activeTab.id, { activeResultIndex: index })}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {activeTab.queryResults && !activeTab.isExplainPlan && (
        <QueryBottombar
          totalRows={activeTab.totalRowCount ?? activeTab.queryResults.rowCount}
          executionTime={activeTab.queryResults.executionTime}
          limit={activeTab.limit}
          offset={activeTab.offset}
          isPaginationEnabled={activeTab.totalRowCount !== undefined}
          onLimitChange={async (limit) => {
            await executeQueryWithPagination(limit, 0)
          }}
          onOffsetChange={async (offset) => {
            await executeQueryWithPagination(activeTab.limit, offset)
          }}
        />
      )}

      <SaveQueryDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSaveQuery}
      />
      <DangerousQueryDialog
        open={dangerousDialogOpen}
        onOpenChange={setDangerousDialogOpen}
        onConfirm={() => {
          setDangerousDialogOpen(false)
          void executeQueryWithPagination(activeTab.limit ?? 50, 0, pendingQueriesRef.current)
        }}
      />
    </>
  )
}

function EditorLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading SQL editor…
    </div>
  )
}
