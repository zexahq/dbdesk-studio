import { createFileRoute } from '@tanstack/react-router'
import { ConnectionList } from '@/components/connections/connection-list'

export const Route = createFileRoute('/')({
  component: ConnectionPage,
})

function ConnectionPage() {
  return (
    <div className="p-6">
      <ConnectionList />
    </div>

  )
}
