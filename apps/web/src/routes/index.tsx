import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ConnectionList } from '@/components/connections/connection-list'
import { useEffect, useRef, useState } from 'react'
import { dbdeskClient } from '@/api/client'
import {
  clearLastConnectionId,
  getLastConnectionId,
  isRestorableConnection,
} from '@/lib/last-connection'

interface SearchParams {
  uri?: string
}

/**
 * Parse a postgresql:// URI into its components.
 * Handles percent-encoded userinfo and optional database / query params.
 */
function parsePostgresUri(uri: string) {
  const url = new URL(uri)
  return {
    host: decodeURIComponent(url.hostname) || 'localhost',
    port: parseInt(url.port, 10) || 5432,
    user: decodeURIComponent(url.username) || 'postgres',
    password: decodeURIComponent(url.password) || '',
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
  }
}

/**
 * Guards the auto-restore to a single attempt per full page load. Without this
 * an in-app navigation back to the connections list would immediately bounce
 * the user into the editor again; we only want to restore on a fresh load
 * (e.g. a browser refresh, or the iframe being remounted by the host app).
 */
let hasAttemptedRestore = false

export const Route = createFileRoute('/')({
  component: ConnectionPage,
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    return {
      uri: typeof search.uri === 'string' ? search.uri : undefined,
    }
  },
})

function ConnectionPage() {
  const { uri } = Route.useSearch()
  const navigate = useNavigate()
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Render the restoring state immediately on the first load when a previous
  // connection is remembered, so the connections list doesn't flash first.
  const [isRestoring, setIsRestoring] = useState(
    () => !uri && !hasAttemptedRestore && getLastConnectionId() !== null,
  )
  const lastAttemptedUri = useRef<string | null>(null)

  useEffect(() => {
    if (!uri || isConnecting || lastAttemptedUri.current === uri) {
      return
    }

    lastAttemptedUri.current = uri
    setIsConnecting(true)
    setError(null)

    // Parse the URI and save as a connection profile WITHOUT testing
    // connectivity. This avoids a 500 error when the DB is not reachable
    // from the dbdesk-studio server (e.g. different network topology).
    // The connection page handles the actual session establishment.
    const parsed = parsePostgresUri(uri)
    dbdeskClient
      .createConnection(
        `${parsed.user}@${parsed.host}`,
        'postgres',
        {
          host: parsed.host,
          port: parsed.port,
          database: parsed.database,
          user: parsed.user,
          password: parsed.password,
        },
      )
      .then((profile) => {
        // Navigate to the connection page (clears URI from address bar)
        navigate({
          to: '/connections/$connectionId',
          params: { connectionId: profile.id },
          replace: true,
        })
      })
      .catch((err) => {
        console.error('Failed to create connection from URI:', err)
        setError(err instanceof Error ? err.message : 'Failed to create connection')
        setIsConnecting(false)
        // Clear the URI from address bar to prevent credential leakage
        navigate({
          to: '/',
          search: {},
          replace: true,
        })
      })
  }, [uri, navigate, isConnecting])

  // Restore the last active connection on a fresh page load so a browser
  // refresh keeps the user in their SQL workspace instead of resetting them
  // back to the connections list. The URI flow above takes precedence.
  useEffect(() => {
    if (uri || hasAttemptedRestore) return
    hasAttemptedRestore = true

    const lastId = getLastConnectionId()
    if (!lastId) {
      setIsRestoring(false)
      return
    }

    let cancelled = false
    dbdeskClient
      .getConnection(lastId)
      .then((profile) => {
        if (cancelled) return
        // Only restore into a connection that still exists and has a target.
        if (!isRestorableConnection(profile)) {
          clearLastConnectionId()
          setIsRestoring(false)
          return
        }
        navigate({
          to: '/connections/$connectionId',
          params: { connectionId: lastId },
          replace: true,
        })
      })
      .catch(() => {
        // Deleted / unreachable profile — forget it and show the list.
        if (cancelled) return
        clearLastConnectionId()
        setIsRestoring(false)
      })

    return () => {
      cancelled = true
    }
  }, [uri, navigate])

  if (isRestoring) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <div className="mb-4 text-lg font-medium">Restoring session…</div>
          <div className="text-sm text-muted-foreground">
            Reconnecting to your last database
          </div>
        </div>
      </div>
    )
  }

  if (isConnecting) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <div className="mb-4 text-lg font-medium">Connecting...</div>
          <div className="text-sm text-muted-foreground">
            Setting up connection from URI
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <ConnectionList />
    </div>
  )
}
