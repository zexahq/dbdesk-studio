import type { ConnectionWorkspace } from '@common/types'
import { dbdeskClient } from '@/api/client'
import { useSqlWorkspaceStore } from '@/store/sql-workspace-store'
import { useTabStore } from '@/store/tab-store'

const activeAutosaves = new Map<string, () => Promise<void>>()

export async function saveCurrentWorkspace() {
  const currentConnectionId = useSqlWorkspaceStore.getState().currentConnectionId
  const tabState = useTabStore.getState().serializeState()

  const state = useSqlWorkspaceStore.getState()
  if (!currentConnectionId || state.workspaceReadyId !== currentConnectionId || state.disconnectingId === currentConnectionId) return
  const flush = activeAutosaves.get(currentConnectionId)
  if (flush) {
    await flush()
    return
  }

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
    throw error
  }
}

export const registerWorkspaceFlushListener = () => {
  // Studio is browser-hosted; workspace persistence is handled by its regular
  // debounced save flow instead of Electron's shutdown IPC event.
}

export function subscribeWorkspaceAutosave(connectionId: string, debounceMs = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: ConnectionWorkspace | undefined
  let previous = JSON.stringify(useTabStore.getState().serializeState())
  let writes = Promise.resolve()
  let changeVersion = 0
  const flush = () => {
    if (timer) clearTimeout(timer)
    const snapshot = pending
    pending = undefined
    if (!snapshot) return writes
    const version = changeVersion
    writes = writes.catch(() => {}).then(() => dbdeskClient.saveWorkspace(snapshot)).catch((error: unknown) => {
      // Preserve the latest failed draft for a later flush, without restoring
      // an older snapshot over a newer edit that is already queued for saving.
      if (version === changeVersion && !pending) pending = snapshot
      throw error
    })
    return writes
  }
  const flushInBackground = () => {
    void flush().catch((error: unknown) => console.warn('Failed to save workspace:', error))
  }
  const unsubscribeTabs = useTabStore.subscribe(() => {
    const state = useSqlWorkspaceStore.getState()
    if (state.currentConnectionId !== connectionId || state.workspaceReadyId !== connectionId || state.disconnectingId === connectionId) return
    const tabs = useTabStore.getState().serializeState()
    const serialized = JSON.stringify(tabs)
    if (serialized === previous) return
    previous = serialized
    changeVersion += 1
    pending = { connectionId, ...tabs, lastUpdated: new Date() }
    if (timer) clearTimeout(timer)
    timer = setTimeout(flushInBackground, debounceMs)
  })
  const unsubscribeScope = useSqlWorkspaceStore.subscribe((state, old) => {
    if (state.workspaceReadyId === connectionId && old.workspaceReadyId !== connectionId) {
      previous = JSON.stringify(useTabStore.getState().serializeState())
    }
  })
  activeAutosaves.set(connectionId, flush)
  const onPageHide = flushInBackground
  window.addEventListener('pagehide', onPageHide)
  return () => {
    unsubscribeTabs()
    unsubscribeScope()
    window.removeEventListener('pagehide', onPageHide)
    if (activeAutosaves.get(connectionId) === flush) activeAutosaves.delete(connectionId)
    flushInBackground()
  }
}
