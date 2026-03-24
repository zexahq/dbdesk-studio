import { useQuery } from '@tanstack/react-query'
import { dbdeskClient } from '../client'

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => dbdeskClient.getConfig(),
    staleTime: Infinity,
  })
}
