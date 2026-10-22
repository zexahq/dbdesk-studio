import type { SavedQueriesStorage, SavedQuery } from '@common/types'
import { env } from '@dbdesk-studio/env/server'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readJsonFile, updateJsonFile } from './json-storage'

const QUERIES_FILENAME = 'saved-queries.json'
const DEFAULT_STORAGE_DIR = join(homedir(), '.config', 'dbdesk-studio')

type StoredQuery = Omit<SavedQuery, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt: string
}

type StoredQueriesStorage = {
  [connectionId: string]: StoredQuery[]
}

const getSavedQueriesStoragePath = (): string => {
  const storageDir = env.STORAGE_PATH || DEFAULT_STORAGE_DIR
  return join(storageDir, QUERIES_FILENAME)
}

const serializeQuery = (query: SavedQuery): StoredQuery => ({
  ...query,
  createdAt: query.createdAt.toISOString(),
  updatedAt: query.updatedAt.toISOString()
})

const deserializeQuery = (stored: StoredQuery): SavedQuery => ({
  ...stored,
  createdAt: new Date(stored.createdAt),
  updatedAt: new Date(stored.updatedAt)
})

const readQueriesFromDisk = async (): Promise<StoredQueriesStorage> => {
  return readJsonFile(getSavedQueriesStoragePath(), () => ({}))
}

export const saveQuery = async (
  connectionId: string,
  id: string,
  name: string,
  content: string
): Promise<SavedQuery> => {
  return updateJsonFile<StoredQueriesStorage, SavedQuery>(getSavedQueriesStoragePath(), () => ({}), (queries) => {
    const now = new Date()

    const query: SavedQuery = {
      id,
      name,
      content,
      createdAt: now,
      updatedAt: now
    }

    if (!queries[connectionId]) {
      queries[connectionId] = []
    }

    queries[connectionId]!.push(serializeQuery(query))
    return query
  })
}

export const updateQuery = async (
  connectionId: string,
  queryId: string,
  name: string,
  content: string
): Promise<SavedQuery | undefined> => {
  return updateJsonFile<StoredQueriesStorage, SavedQuery | undefined>(getSavedQueriesStoragePath(), () => ({}), (queries) => {
    const connectionQueries = queries[connectionId]

    if (!connectionQueries) {
      return undefined
    }

    const index = connectionQueries.findIndex((q) => q.id === queryId)
    if (index === -1) {
      return undefined
    }

    const now = new Date()
    const updated: StoredQuery = {
      ...connectionQueries[index]!,
      name,
      content,
      updatedAt: now.toISOString()
    }

    connectionQueries[index] = updated
    return deserializeQuery(updated)
  })
}

export const deleteQuery = async (connectionId: string, queryId: string): Promise<void> => {
  await updateJsonFile<StoredQueriesStorage, void>(getSavedQueriesStoragePath(), () => ({}), (queries) => {

    if (queries[connectionId]) {
      queries[connectionId] = queries[connectionId]!.filter((q) => q.id !== queryId)
    }
  })
}

export const loadQueries = async (connectionId: string): Promise<SavedQuery[]> => {
  const queries = await readQueriesFromDisk()
  const connectionQueries = queries[connectionId] || []

  return connectionQueries.map((q) => deserializeQuery(q))
}

export const loadAllQueries = async (): Promise<SavedQueriesStorage> => {
  const storedQueries = await readQueriesFromDisk()
  const queries: SavedQueriesStorage = {}

  for (const [connectionId, storedQueryList] of Object.entries(storedQueries)) {
    queries[connectionId] = storedQueryList.map((q) => deserializeQuery(q))
  }

  return queries
}

export const deleteAllQueriesForConnection = async (connectionId: string): Promise<void> => {
  await updateJsonFile<StoredQueriesStorage, void>(getSavedQueriesStoragePath(), () => ({}), (queries) => {
    delete queries[connectionId]
  })
}
