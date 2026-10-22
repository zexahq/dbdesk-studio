import type { ConnectionWorkspace, WorkspaceStorage } from '@common/types'
import { env } from '@dbdesk-studio/env/server'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readJsonFile, updateJsonFile } from './json-storage'

const WORKSPACE_FILENAME = 'workspaces.json'
const DEFAULT_STORAGE_DIR = join(homedir(), '.config', 'dbdesk-studio')

type StoredWorkspace = Omit<ConnectionWorkspace, 'lastUpdated'> & {
  lastUpdated: string
}

type StoredWorkspaceStorage = {
  [connectionId: string]: StoredWorkspace
}

const getWorkspaceStoragePath = (): string => {
  const storageDir = env.STORAGE_PATH || DEFAULT_STORAGE_DIR
  return join(storageDir, WORKSPACE_FILENAME)
}

const serializeWorkspace = (workspace: ConnectionWorkspace): StoredWorkspace => ({
  ...workspace,
  lastUpdated: new Date(workspace.lastUpdated).toISOString()
})

const deserializeWorkspace = (stored: StoredWorkspace): ConnectionWorkspace => ({
  ...stored,
  lastUpdated: new Date(stored.lastUpdated)
})

const readWorkspacesFromDisk = async (): Promise<StoredWorkspaceStorage> => {
  return readJsonFile(getWorkspaceStoragePath(), () => ({}))
}

export const loadWorkspace = async (
  connectionId: string
): Promise<ConnectionWorkspace | undefined> => {
  const workspaces = await readWorkspacesFromDisk()
  const storedWorkspace = workspaces[connectionId]

  if (!storedWorkspace) {
    return undefined
  }

  return deserializeWorkspace(storedWorkspace)
}

export const saveWorkspace = async (workspace: ConnectionWorkspace): Promise<void> => {
  await updateJsonFile<StoredWorkspaceStorage, void>(getWorkspaceStoragePath(), () => ({}), (workspaces) => {
    const serializedWorkspace = serializeWorkspace(workspace)

    workspaces[workspace.connectionId] = serializedWorkspace

  })
}

export const deleteWorkspace = async (connectionId: string): Promise<void> => {
  await updateJsonFile<StoredWorkspaceStorage, void>(getWorkspaceStoragePath(), () => ({}), (workspaces) => {
    delete workspaces[connectionId]
  })
}

export const loadAllWorkspaces = async (): Promise<WorkspaceStorage> => {
  const storedWorkspaces = await readWorkspacesFromDisk()
  const workspaces: WorkspaceStorage = {}

  for (const [connectionId, storedWorkspace] of Object.entries(storedWorkspaces)) {
    workspaces[connectionId] = deserializeWorkspace(storedWorkspace)
  }

  return workspaces
}
