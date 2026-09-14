import type { Tab } from '@/store/tab-store'
import { useTabStore } from '@/store/tab-store'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Lock, SquareCode, Table2Icon, Unlock, X } from 'lucide-react'

interface SortableTabButtonProps {
  tab: Tab
  isActive: boolean
  isDirty: boolean
  onClick: () => void
  onClose: () => void
}

export function SortableTabButton({ tab, isActive, isDirty, onClick, onClose }: SortableTabButtonProps) {
  const toggleQueryTabLock = useTabStore((s) => s.toggleQueryTabLock)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString({
      x: transform?.x || 0,
      y: 0, // Constrain to horizontal axis only
      scaleX: 1, // Prevent horizontal scaling during drag
      scaleY: 1 // Prevent vertical scaling during drag
    }),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1
  }

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`group flex items-center gap-2 px-4 text-sm transition-colors whitespace-nowrap h-full border-r border-border/50 min-w-[120px] max-w-[200px] hover:bg-background/60 cursor-pointer ${
        isActive
          ? 'bg-background text-foreground border-t-2 border-t-primary pt-0.5'
          : 'text-muted-foreground border-t-2 border-t-transparent pt-0.5'
      } ${tab.kind === 'table' && tab.isTemporary ? 'italic' : ''} ${
        isDragging ? 'cursor-grabbing shadow-lg' : ''
      }`}
      aria-label={`${tab.kind === 'table' ? tab.table : tab.name} tab${isDirty ? ' (modified)' : ''}`}
    >
      {tab.kind === 'table' ? (
        <Table2Icon className="size-3.5 shrink-0" />
      ) : (
        <SquareCode className="size-3.5 shrink-0" />
      )}
      <span className="truncate flex-1 text-left">
        {tab.kind === 'table' ? tab.table : tab.name}
      </span>
      {isDirty && <span className="size-2 rounded-full bg-white shrink-0" />}
      {tab.kind === 'query' && (
        <div
          role="button"
          tabIndex={0}
          title={tab.isLocked ? 'Unlock query tab' : 'Lock query tab'}
          aria-label={tab.isLocked ? 'Unlock query tab' : 'Lock query tab'}
          aria-pressed={tab.isLocked}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            if (!isDragging) toggleQueryTabLock(tab.id)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              if (!isDragging) toggleQueryTabLock(tab.id)
            }
          }}
          className={`rounded-sm p-0.5 transition-colors hover:bg-muted-foreground/20 shrink-0 cursor-pointer ${
            isDragging ? 'opacity-0 cursor-not-allowed' : ''
          }`}
        >
          {tab.isLocked ? <Lock className="size-3" /> : <Unlock className="size-3 opacity-50" />}
          <span className="sr-only">{tab.isLocked ? 'Unlock query tab' : 'Lock query tab'}</span>
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        aria-label="Close tab"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          if (!isDragging) onClose()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            if (!isDragging) onClose()
          }
        }}
        className={`rounded-sm opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 p-0.5 transition-opacity ${
          isActive ? 'opacity-100' : ''
        } ${isDragging ? 'opacity-0 cursor-not-allowed' : ''}`}
      >
        <X className="size-3" />
        <span className="sr-only">Close tab</span>
      </div>
    </button>
  )
}
