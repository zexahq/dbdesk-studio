import type { ColumnInfo } from '@common/types'
import { getCellVariant } from '@/lib/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetFooter, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEffect, useState, type FormEvent } from 'react'

interface AddRowSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  columns: ColumnInfo[]
  tableName: string
  onSubmit: (values: Record<string, unknown>) => void
  isPending?: boolean
}

export function AddRowSheet({ open, onOpenChange, columns, tableName, onSubmit, isPending }: AddRowSheetProps) {
  const [values, setValues] = useState<Record<string, string | null>>({})

  useEffect(() => {
    if (!open) setValues({})
  }, [open])

  const setValue = (name: string, value: string | null) => {
    setValues((current) => ({ ...current, [name]: value }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, value === '' ? null : value])
    )
    onSubmit(normalized)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg gap-0">
        <SheetTitle className="border-b px-6 py-4">Add row to {tableName}</SheetTitle>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {columns.map((column) => {
              const variant = getCellVariant(column.type, column.enumValues)
              const value = values[column.name] ?? ''
              return (
                <div key={column.name} className="space-y-1.5">
                  <Label htmlFor={`new-row-${column.name}`} className="flex justify-between">
                    <span>{column.name}</span>
                    <span className="text-xs text-muted-foreground">{column.type}</span>
                  </Label>
                  {variant === 'boolean' ? (
                    <Select value={value || 'null'} onValueChange={(next) => setValue(column.name, next === 'null' ? null : next)}>
                      <SelectTrigger id={`new-row-${column.name}`} className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {column.nullable && <SelectItem value="null">NULL</SelectItem>}
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : variant === 'enum' ? (
                    <Select value={value || 'null'} onValueChange={(next) => setValue(column.name, next === 'null' ? null : next)}>
                      <SelectTrigger id={`new-row-${column.name}`} className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {column.nullable && <SelectItem value="null">NULL</SelectItem>}
                        {(column.enumValues ?? []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`new-row-${column.name}`}
                      type={variant === 'numeric' ? 'number' : 'text'}
                      value={value}
                      placeholder={column.defaultValue ? String(column.defaultValue) : column.nullable ? 'NULL' : ''}
                      onChange={(event) => setValue(column.name, event.target.value || null)}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <SheetFooter className="flex-row justify-end border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? 'Adding…' : 'Add row'}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
