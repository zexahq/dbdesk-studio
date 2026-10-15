import type { ConnectionProfile } from '@common/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PostgresConnectionForm } from './postgres-connection-form'
import { PostgresQuickConnect } from './postgres-quick-connect'

export function PostgresConnectionEntry({ connection, onSuccess }: {
  connection?: ConnectionProfile | null
  onSuccess: (profile: ConnectionProfile) => void
}) {
  if (connection) return <PostgresConnectionForm connection={connection} onSuccess={onSuccess} />
  return (
    <Tabs defaultValue="uri" className="gap-4">
      <TabsList aria-label="Connection method">
        <TabsTrigger value="uri">Connection string</TabsTrigger>
        <TabsTrigger value="fields">Manual details</TabsTrigger>
      </TabsList>
      <TabsContent value="uri"><PostgresQuickConnect onConnected={onSuccess} /></TabsContent>
      <TabsContent value="fields"><PostgresConnectionForm onSuccess={onSuccess} /></TabsContent>
    </Tabs>
  )
}
