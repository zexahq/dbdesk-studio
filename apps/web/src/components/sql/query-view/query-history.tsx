import { useState } from 'react'
import { History, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useQueryHistoryStore } from '@/store/query-history-store'
import { useTabStore } from '@/store/tab-store'

export function QueryHistory({ connectionId }: { connectionId: string }) {
  const [open, setOpen] = useState(false)
  const entries = useQueryHistoryStore((state) => state.entries)
  const clear = useQueryHistoryStore((state) => state.clear)
  const history = entries.filter((entry) => entry.connectionId === connectionId)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs"><History className="size-4" />History</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[90vw] p-0">
        <div className="flex items-center justify-between border-b p-3">
          <div><p className="text-sm font-medium">Query history</p><p className="text-xs text-muted-foreground">Saved in this browser. Open an entry to edit it.</p></div>
          <Button variant="ghost" size="icon" aria-label="Clear history for this connection" disabled={!history.length} onClick={() => clear(connectionId)}><Trash2 className="size-4" /></Button>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {history.length === 0 && <p className="p-3 text-sm text-muted-foreground">No queries run yet.</p>}
          {history.map((entry) => (
            <button key={entry.id} disabled={entry.truncated} title={entry.truncated ? 'Preview truncated; open the original query to run it.' : 'Open in a new query tab'} className="w-full rounded p-2 text-left hover:bg-muted focus-visible:outline focus-visible:outline-ring disabled:opacity-60" onClick={() => {
              const store = useTabStore.getState()
              const id = store.addQueryTab()
              store.updateQueryTab(id, { editorContent: entry.sql, name: 'History query' })
              setOpen(false)
            }}>
              <p className="truncate font-mono text-xs">{entry.sql}</p>
              <p className="mt-1 text-xs text-muted-foreground">{entry.outcome === 'succeeded' ? 'Succeeded' : 'Failed'} · {Math.round(entry.durationMs)} ms · {new Date(entry.startedAt).toLocaleString()}{entry.truncated ? ' · Preview truncated' : ''}</p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
