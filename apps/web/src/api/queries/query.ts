import type { QueryBatchResult, RunQueryOptions } from '@common/types'
import { useMutation } from '@tanstack/react-query'
import { dbdeskClient } from '../../api/client'

export function useRunQuery(connectionId: string) {
  return useMutation({
    mutationFn: ({
      query,
      options
    }: {
      query: string
      options?: RunQueryOptions
    }) => dbdeskClient.runQuery(connectionId, query, options)
  })
}

export function useRunManyQueries(connectionId: string) {
  return useMutation<QueryBatchResult[], Error, { queries: string[]; options?: RunQueryOptions }>({
    mutationFn: ({ queries, options }) => dbdeskClient.runManyQueries(connectionId, queries, options)
  })
}

export function useCancelQuery(connectionId: string) {
  return useMutation<{ cancelled: boolean }, Error, string>({
    mutationFn: (queryId) => dbdeskClient.cancelQuery(connectionId, queryId)
  })
}
