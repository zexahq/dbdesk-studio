import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ConnectionList } from '@/components/connections/connection-list'
import { useEffect, useRef, useState } from 'react'
import { dbdeskClient } from '@/api/client'

interface SearchParams {
  uri?: string
}

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
  const lastAttemptedUri = useRef<string | null>(null)

  useEffect(() => {
    if (!uri || isConnecting || lastAttemptedUri.current === uri) {
      return
    }

    lastAttemptedUri.current = uri
    setIsConnecting(true)
    setError(null)

    dbdeskClient
      .createConnectionFromUri(uri)
      .then((profile) => {
        // Navigate to the connection page (clears URI from address bar)
        navigate({
          to: '/connections/$connectionId',
          params: { connectionId: profile.id },
          replace: true,
        })
      })
      .catch((err) => {
        console.error('Failed to connect from URI:', err)
        setError(err instanceof Error ? err.message : 'Failed to connect')
        setIsConnecting(false)
        // Clear the URI from address bar to prevent credential leakage
        navigate({
          to: '/',
          search: {},
          replace: true,
        })
      })
  }, [uri, navigate, isConnecting])

  if (isConnecting) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <div className="mb-4 text-lg font-medium">Connecting...</div>
          <div className="text-sm text-muted-foreground">
            Establishing connection from URI
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
