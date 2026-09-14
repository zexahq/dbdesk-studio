import type { ConnectionWorkspace } from '@common/types'
import { dbdeskClient } from '@/api/client'
import { useSqlWorkspaceStore } from '@/store/sql-workspace-store'
import { useTabStore } from '@/store/tab-store'

export async function saveCurrentWorkspace() {
  const currentConnectionId = useSqlWorkspaceStore.getState().currentConnectionId
  const tabState = useTabStore.getState().serializeState()

  if (!currentConnectionId) return

  try {
    const workspace: ConnectionWorkspace = {
      connectionId: currentConnectionId,
      lastUpdated: new Date(),
      tabs: tabState.tabs,
      activeTabId: tabState.activeTabId
    }

    await dbdeskClient.saveWorkspace(workspace)
    console.debug('Workspace saved for connection:', currentConnectionId)
  } catch (error) {
    console.warn('Failed to save workspace:', error)
  }
}

export const registerWorkspaceFlushListener = () => {
  // Studio is browser-hosted; workspace persistence is handled by its regular
  // debounced save flow instead of Electron's shutdown IPC event.
}
