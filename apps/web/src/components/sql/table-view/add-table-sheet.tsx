import type { ColumnDefinition } from '@common/types'
import { useCreateTable } from '@/api/queries/schema'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetFooter, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

const DATA_TYPES = [
  'bigint', 'boolean', 'date', 'double precision', 'integer', 'jsonb', 'numeric',
  'real', 'smallint', 'text', 'timestamp', 'timestamp with time zone', 'uuid', 'varchar'
]

type ForeignKeyDraft = { schema: string; table: string; column: string }

interface AddTableSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  schema: string
}

export function AddTableSheet({ open, onOpenChange, connectionId, schema }: AddTableSheetProps) {
  const [tableName, setTableName] = useState('')
  const [columns, setColumns] = useState<ColumnDefinition[]>([])
  const [foreignKeys, setForeignKeys] = useState<Record<number, ForeignKeyDraft>>({})
  const createTableMutation = useCreateTable(connectionId)

  const reset = () => {
    setTableName('')
    setColumns([])
    setForeignKeys({})
  }

  const updateColumn = (index: number, patch: Partial<ColumnDefinition>) => {
    setColumns((current) => current.map((column, currentIndex) => currentIndex === index ? { ...column, ...patch } : column))
  }

  const isValid = useMemo(
    () => Boolean(tableName.trim() && columns.length && columns.every((column) => column.name.trim() && column.type)),
    [tableName, columns]
  )

  const handleSubmit = () => {
    if (!isValid) return
    const payload = columns.map((column, index) => {
      const foreignKey = foreignKeys[index]
      return {
        ...column,
        foreignKey: foreignKey?.schema && foreignKey.table && foreignKey.column
          ? { ...foreignKey, onDelete: 'NO ACTION' as const, onUpdate: 'NO ACTION' as const }
          : undefined
      }
    })
    createTableMutation.mutate({ schema, table: tableName.trim(), columns: payload }, {
      onSuccess: () => {
        reset()
        onOpenChange(false)
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { onOpenChange(nextOpen); if (!nextOpen) reset() }}>
      <SheetContent side="right" className="w-full sm:max-w-3xl gap-0">
        <SheetTitle className="border-b px-6 py-4">Create table in {schema}</SheetTitle>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="new-table-name">Table name</Label>
            <Input id="new-table-name" value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="users" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Columns</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setColumns((current) => [...current, { name: '', type: 'text', nullable: true }])}>
                <Plus className="mr-2 size-4" /> Add column
              </Button>
            </div>
            {columns.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Add at least one column.</div>
            ) : columns.map((column, index) => (
              <div key={index} className="space-y-3 rounded-md border p-3">
                <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr_auto]">
                  <Input value={column.name} placeholder="Column name" onChange={(event) => updateColumn(index, { name: event.target.value })} />
                  <Select value={column.type} onValueChange={(type) => updateColumn(index, { type })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DATA_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setColumns((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
                    <Trash2 className="size-4" /><span className="sr-only">Remove column</span>
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                  <Input value={column.defaultValue ?? ''} placeholder="Default expression" onChange={(event) => updateColumn(index, { defaultValue: event.target.value || undefined })} />
                  <label className="flex items-center gap-2 text-xs"><Checkbox checked={column.nullable !== false} onCheckedChange={(checked) => updateColumn(index, { nullable: checked === true })} /> Nullable</label>
                  <label className="flex items-center gap-2 text-xs"><Checkbox checked={column.isPrimaryKey === true} onCheckedChange={(checked) => updateColumn(index, { isPrimaryKey: checked === true })} /> Primary</label>
                  <label className="flex items-center gap-2 text-xs"><Checkbox checked={column.isUnique === true} onCheckedChange={(checked) => updateColumn(index, { isUnique: checked === true })} /> Unique</label>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input placeholder="FK schema" value={foreignKeys[index]?.schema ?? ''} onChange={(event) => setForeignKeys((current) => ({ ...current, [index]: { ...(current[index] ?? { schema: '', table: '', column: '' }), schema: event.target.value } }))} />
                  <Input placeholder="FK table" value={foreignKeys[index]?.table ?? ''} onChange={(event) => setForeignKeys((current) => ({ ...current, [index]: { ...(current[index] ?? { schema: '', table: '', column: '' }), table: event.target.value } }))} />
                  <Input placeholder="FK column" value={foreignKeys[index]?.column ?? ''} onChange={(event) => setForeignKeys((current) => ({ ...current, [index]: { ...(current[index] ?? { schema: '', table: '', column: '' }), column: event.target.value } }))} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <SheetFooter className="flex-row justify-end border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createTableMutation.isPending}>Cancel</Button>
          <Button type="button" onClick={handleSubmit} disabled={!isValid || createTableMutation.isPending}>{createTableMutation.isPending ? 'Creating…' : 'Create table'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
