import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface QueryHistoryEntry {
  id: string
  connectionId: string
  sql: string
  startedAt: string
  durationMs: number
  outcome: 'succeeded' | 'failed'
  truncated?: boolean
}

interface QueryHistoryStore {
  entries: QueryHistoryEntry[]
  record: (entry: QueryHistoryEntry) => void
  clear: (connectionId: string) => void
}

// Store SQL and outcome locally, without result rows or raw database errors.
// Bound both entry count and text size to keep localStorage use predictable.
export const useQueryHistoryStore = create<QueryHistoryStore>()(persist((set) => ({
  entries: [],
  record: (entry) => set((state) => ({
    entries: [{ ...entry, truncated: entry.truncated || entry.sql.length > 10000, sql: entry.sql.slice(0, 10000) }, ...state.entries.filter((item) => item.id !== entry.id)].slice(0, 100)
  })),
  clear: (connectionId) => set((state) => ({ entries: state.entries.filter((item) => item.connectionId !== connectionId) }))
}), {
  name: 'dbdesk-query-history',
  storage: createJSONStorage(() => ({
    getItem: (key) => { try { return localStorage.getItem(key) } catch { return null } },
    setItem: (key, value) => { try { localStorage.setItem(key, value) } catch { /* Keep in-memory history when storage is unavailable. */ } },
    removeItem: (key) => { try { localStorage.removeItem(key) } catch { /* Storage may be disabled by the embedding host. */ } }
  }))
}))
