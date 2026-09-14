import { useConnection } from '@/api/queries/connections'
import { dbdeskClient } from '@/api/client'
import { SqlWorkspace } from '@/components/sql'
import { Button } from '@/components/ui/button'
import { clearLastConnectionId, setLastConnectionId } from '@/lib/last-connection'
import { useSqlWorkspaceStore } from '@/store/sql-workspace-store'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

export const Route = createFileRoute('/connections/$connectionId')({
  component: ConnectionPage,
})

function ConnectionPage() {
  const { connectionId } = Route.useParams()
  const navigate = useNavigate()
  const { data: profile, isLoading, isError } = useConnection(connectionId)
  const currentConnectionId = useSqlWorkspaceStore((s) => s.currentConnectionId)

  // When the user arrives via the connections list the server session is
  // already open (the store holds the id). On a hard refresh or a restored
  // deep link the store is empty, so we must (re)establish the session.
  const alreadyConnected = currentConnectionId === connectionId
  const [isEnsuring, setIsEnsuring] = useState(!alreadyConnected)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const ensuredRef = useRef<string | null>(null)

  // The profile no longer exists (deleted, or a stale remembered id): forget
  // it and return to the connections list.
  useEffect(() => {
    if (isError) {
      clearLastConnectionId()
      navigate({ to: '/', replace: true })
    }
  }, [isError, navigate])

  // Ensure a live server-side session for this connection. connect() is
  // idempotent on the server (it reuses an existing pool entry), so this is
  // safe to call on every fresh load without disturbing an open connection.
  useEffect(() => {
    if (!profile) return

    if (alreadyConnected) {
      setLastConnectionId(connectionId)
      setIsEnsuring(false)
      return
    }

    if (ensuredRef.current === connectionId) return
    ensuredRef.current = connectionId

    let cancelled = false
    setIsEnsuring(true)
    setConnectError(null)

    dbdeskClient
      .connect(connectionId)
      .then(() => {
        if (cancelled) return
        setLastConnectionId(connectionId)
        setIsEnsuring(false)
      })
      .catch((err) => {
        if (cancelled) return
        setConnectError(err instanceof Error ? err.message : 'Failed to connect')
        setIsEnsuring(false)
      })

    return () => {
      cancelled = true
    }
    // retryTick lets the "Retry" action re-run this effect.
  }, [profile, connectionId, alreadyConnected, retryTick])

  const handleRetry = () => {
    ensuredRef.current = null
    setConnectError(null)
    setIsEnsuring(true)
    setRetryTick((tick) => tick + 1)
  }

  const handleBackToConnections = () => {
    clearLastConnectionId()
    navigate({ to: '/', replace: true })
  }

  if (isLoading) {
    return <div className="p-6">Loading connection…</div>
  }

  if (isError || !profile) {
    // The redirect effect handles navigation; this is a brief fallback.
    return <div className="p-6">Connection not found. Redirecting…</div>
  }

  if (connectError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <div className="space-y-1">
            <div className="text-lg font-medium">
              Couldn’t connect to “{profile.name}”
            </div>
            <div className="text-sm break-words text-muted-foreground">{connectError}</div>
          </div>
          <div className="flex justify-center gap-2">
            <Button onClick={handleRetry}>Retry</Button>
            <Button variant="secondary" onClick={handleBackToConnections}>
              Back to connections
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (isEnsuring) {
    return <div className="p-6">Connecting to {profile.name}…</div>
  }

  // SQL databases: 'postgres'
  const isSql = profile.type === 'postgres'

  if (isSql) {
    return <SqlWorkspace profile={profile} />
  }

  // Non-SQL placeholders
  if (profile.type === 'mongodb') {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-2xl font-semibold">MongoDB</h1>
        <p className="text-muted-foreground">Connection: {profile.name}</p>
        <p>MongoDB UI coming soon.</p>
      </div>
    )
  }

  if (profile.type === 'redis') {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-2xl font-semibold">Redis</h1>
        <p className="text-muted-foreground">Connection: {profile.name}</p>
        <p>Redis UI coming soon.</p>
      </div>
    )
  }

  return <div className="p-6">Unsupported database type.</div>
}
