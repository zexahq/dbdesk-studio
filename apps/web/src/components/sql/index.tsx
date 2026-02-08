import type { SQLConnectionProfile } from '@common/types'
import { dbdeskClient } from '@/api/client'
import { useSchemasWithTables } from '@/api/queries/schema'
import { UnsavedChangesDialog } from '@/components/sql/dialogs/unsaved-changes-dialog'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from '@/components/ui/resizable'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { useTabCloseHandler } from '@/hooks/use-tab-close-handler'
import { useSqlWorkspaceStore } from '@/store/sql-workspace-store'
import { useTabStore } from '@/store/tab-store'
import { useEffect, useRef, useState } from 'react'
import { QueryView } from './query-view'
import { TableView } from './table-view'
import { TabNavigation } from './table-view/tab-navigation'
import { WorkspaceSidebar } from './workspace-sidebar'
import { WorkspaceTopbar } from './workspace-topbar'

export function SqlWorkspace({ profile }: { profile: SQLConnectionProfile }) {
  const currentConnectionId = useSqlWorkspaceStore((s) => s.currentConnectionId)
  const setCurrentConnection = useSqlWorkspaceStore((s) => s.setCurrentConnection)
  const setSchemasWithTables = useSqlWorkspaceStore((s) => s.setSchemasWithTables)
  const loadFromSerialized = useTabStore((s) => s.loadFromSerialized)
  const reset = useTabStore((s) => s.reset)
  const activeTab = useTabStore((state) => {
    const { tabs, activeTabId } = state
    return tabs.find((t) => t.id === activeTabId)
  })

  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const { requestCloseTab, dialogProps } = useTabCloseHandler(profile)
  const lastInitializedConnectionId = useRef<string | null>(null)

  const { data: schemasWithTables } = useSchemasWithTables(profile.id)

  // Sync connectionId from route to store and load workspace on mount/connection change
  useEffect(() => {
    if (currentConnectionId === profile.id) {
      // Already synced, skip
      return
    }

    // Prevent double initialization in strict mode
    if (lastInitializedConnectionId.current === profile.id) return
    lastInitializedConnectionId.current = profile.id

    const initWorkspace = async () => {
      setCurrentConnection(profile.id)

      try {
        const savedWorkspace = await dbdeskClient.loadWorkspace(profile.id)
        if (savedWorkspace) {
          loadFromSerialized(savedWorkspace.tabs, savedWorkspace.activeTabId)
        } else {
          reset()
        }
      } catch (error) {
        console.warn('Failed to load workspace, using defaults:', error)
        reset()
      }
    }

    initWorkspace()
  }, [profile.id, currentConnectionId, setCurrentConnection, loadFromSerialized, reset])

  useEffect(() => {
    if (schemasWithTables) {
      setSchemasWithTables(schemasWithTables)
    } else {
      setSchemasWithTables([])
    }
  }, [schemasWithTables, setSchemasWithTables])

  return (
    <>
      <SidebarProvider className="h-full">
        <TabNavigation profile={profile} requestCloseTab={requestCloseTab} />
        <ResizablePanelGroup direction="horizontal" className="h-full overflow-hidden">
          <ResizablePanel
            defaultSize={16}
            minSize={12}
            maxSize={32}
            className={cn(!isSidebarOpen && 'hidden')}
          >
            <WorkspaceSidebar profile={profile} />
          </ResizablePanel>
          <ResizableHandle withHandle className={cn(!isSidebarOpen && 'hidden')} />
          <ResizablePanel>
            <SidebarInset className="flex h-full flex-col overflow-hidden">
              <WorkspaceTopbar
                 profile={profile}
                 isSidebarOpen={isSidebarOpen}
                 onSidebarOpenChange={setIsSidebarOpen}
                 requestCloseTab={requestCloseTab}
               />

              {/* No tab open - empty state */}
              {!activeTab ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <p className="text-lg font-medium">No tab open</p>
                    <p className="text-sm">Select a table from the sidebar or create a new query</p>
                  </div>
                </div>
              ) : activeTab?.kind === 'table' ? (
                <TableView profile={profile} activeTab={activeTab} />
              ) : activeTab?.kind === 'query' ? (
                <QueryView profile={profile} activeTab={activeTab} />
              ) : null}
            </SidebarInset>
          </ResizablePanel>
        </ResizablePanelGroup>
      </SidebarProvider>
      <UnsavedChangesDialog {...dialogProps} />
    </>
  )
}
