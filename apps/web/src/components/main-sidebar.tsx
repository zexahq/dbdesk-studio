import { Link } from '@tanstack/react-router'
import { DatabaseIcon, FileText, Home, LayoutDashboard, Workflow } from 'lucide-react'
import { QuickPanel } from './quick-panel'
import { ThemeToggle } from './theme-toggle'
import { Button } from './ui/button'
import { getRuntimeConfig } from '@common/config'
import { clearLastConnectionId } from '@/lib/last-connection'
import { isFeatureEnabled } from '@common/config'
import { useSqlWorkspaceStore } from '@/store/sql-workspace-store'
import { useTabStore } from '@/store/tab-store'

export function MainSidebar() {
  const currentConnectionId = useSqlWorkspaceStore((s) => s.currentConnectionId)
  const sidebarViewMode = useSqlWorkspaceStore((s) => s.sidebarViewMode)
  const setSidebarViewMode = useSqlWorkspaceStore((s) => s.setSidebarViewMode)
  const addSchemaDiagramTab = useTabStore((s) => s.addSchemaDiagramTab)
  if (getRuntimeConfig().embedding.ui.hideSidebar) return null
  // Deliberately leaving a workspace for the connections list: forget the
  // remembered connection so a later reload keeps the user on the list
  // instead of auto-restoring the editor.
  const handleGoToConnections = () => {
    clearLastConnectionId()
  }

  return (
    <div className="bg-main-sidebar backdrop-blur py-4 border-r">
      <div className="px-2 h-full flex flex-col items-center justify-between">
        <div className="flex flex-col gap-2 items-center">
          <Button
            variant="ghost"
            size="icon"
            className="cursor-pointer"
            title="Connections"
            aria-label="Connections"
            asChild
          >
            <Link
              to="/"
              onClick={handleGoToConnections}
              className="[&.active]:font-bold"
            >
              <Home className="size-4" />
            </Link>
          </Button>
          <QuickPanel />
          {currentConnectionId && (
            <div className="mt-2 flex flex-col gap-1 border-t border-border/50 pt-2">
              <Button
                variant={sidebarViewMode === 'schemas' ? 'secondary' : 'ghost'}
                size="icon"
                className="cursor-pointer"
                title="Schemas"
                aria-label="Schemas"
                onClick={() => setSidebarViewMode('schemas')}
              >
                <DatabaseIcon className="size-4" />
              </Button>
              <Button
                variant={sidebarViewMode === 'queries' ? 'secondary' : 'ghost'}
                size="icon"
                className="cursor-pointer"
                title="Queries"
                aria-label="Queries"
                onClick={() => setSidebarViewMode('queries')}
              >
                <FileText className="size-4" />
              </Button>
              {isFeatureEnabled('dashboard') && (
                <Button
                  variant={sidebarViewMode === 'dashboards' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="cursor-pointer"
                  title="Dashboards"
                  aria-label="Dashboards"
                  onClick={() => setSidebarViewMode('dashboards')}
                >
                  <LayoutDashboard className="size-4" />
                </Button>
              )}
              {isFeatureEnabled('schema-visualizer') && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="cursor-pointer"
                  title="Diagram"
                  aria-label="Diagram"
                  onClick={addSchemaDiagramTab}
                >
                  <Workflow className="size-4" />
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 items-center">
          {!getRuntimeConfig().embedding.ui.hideThemeControls && <ThemeToggle />}
        </div>
      </div>
    </div>
  )
}
