import { Link } from '@tanstack/react-router'
import { Home } from 'lucide-react'
import { QuickPanel } from './quick-panel'
import { ThemeToggle } from './theme-toggle'
import { Button } from './ui/button'
import { isEmbedded } from '@/lib/embedded'
import { clearLastConnectionId } from '@/lib/last-connection'

export function MainSidebar() {
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
        </div>
        <div className="flex flex-col gap-2 items-center">
          {!isEmbedded && <ThemeToggle />}
        </div>
      </div>
    </div>
  )
}
