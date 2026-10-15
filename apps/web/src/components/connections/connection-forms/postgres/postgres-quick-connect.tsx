import type { ConnectionProfile } from '@common/types'
import { dbdeskClient } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getRuntimeConfig } from '@common/config'
import { setLastConnectionId } from '@/lib/last-connection'
import { useSqlWorkspaceStore } from '@/store/sql-workspace-store'
import { useState } from 'react'

export function PostgresQuickConnect({ onConnected }: { onConnected: (profile: ConnectionProfile) => void }) {
  const [dsn, setDsn] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const client = useQueryClient()
  const navigate = useNavigate()

  const connect = async () => {
    if (!dsn.trim() || pending) return
    setPending(true)
    setError(null)
    try {
      const profile = await dbdeskClient.createConnectionFromUri(dsn.trim())
      const workspace = useSqlWorkspaceStore.getState()
      workspace.setDisconnecting(null)
      workspace.setCurrentConnection(profile.id)
      if (getRuntimeConfig().embedding.connection.restoreLastConnection) setLastConnectionId(profile.id)
      void client.invalidateQueries({ queryKey: ['connections'] })
      setDsn('')
      onConnected(profile)
      await navigate({ to: '/connections/$connectionId', params: { connectionId: profile.id } })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not connect to PostgreSQL.')
    } finally { setPending(false) }
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); void connect() }} className="flex flex-col gap-4">
      <div className="space-y-2">
        <label htmlFor="postgres-quick-connect" className="text-sm font-medium">Connection string</label>
        <Input id="postgres-quick-connect" type="password" autoComplete="off" spellCheck={false}
          placeholder="postgresql://user:password@localhost:5435/testDb"
          value={dsn} disabled={pending} aria-invalid={Boolean(error)} aria-describedby="postgres-uri-help postgres-uri-error"
          onChange={(event) => { setDsn(event.target.value); setError(null) }} />
        <p id="postgres-uri-help" className="text-xs text-muted-foreground">
          Paste a PostgreSQL URI and connect directly. No separate form fields are required.
        </p>
      </div>
      {error && <p id="postgres-uri-error" role="alert" className="text-sm text-destructive break-words">{error}</p>}
      <Button type="submit" disabled={pending || !dsn.trim()}>{pending ? 'Connecting…' : 'Connect'}</Button>
    </form>
  )
}
