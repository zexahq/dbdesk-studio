import type { ConnectionProfile } from '@common/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { PostgresConnectionForm } from './connection-forms/postgres/postgres-connection-form'

interface ConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: ConnectionProfile | null
}

export function ConnectionDialog({
  open,
  onOpenChange,
  connection,
}: ConnectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-2xl max-w-none!">
        <DialogHeader>
          <DialogTitle>{connection ? 'Edit Connection' : 'New Connection'}</DialogTitle>
          <DialogDescription>
            {connection
              ? 'Update the connection details.'
              : 'Create a new database connection profile.'}
          </DialogDescription>
        </DialogHeader>
        <PostgresConnectionForm connection={connection} onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
