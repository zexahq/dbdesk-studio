import type { ConnectionWorkspace } from '@common/types'
import { z } from 'zod'
import { ValidationError } from './utils/errors'

const scalar = z.union([z.string(), z.number(), z.boolean(), z.bigint(), z.date()])
const filter = z.discriminatedUnion('operator', [
  z.object({ column: z.string(), operator: z.enum(['=', '<>', '>', '<', '>=', '<=', 'LIKE', 'ILIKE']), value: scalar }),
  z.object({ column: z.string(), operator: z.literal('IN'), value: z.array(scalar) }),
  z.object({ column: z.string(), operator: z.literal('IS'), value: z.enum(['NULL', 'NOT NULL', 'TRUE', 'FALSE']) })
])
const tab = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('table'), id: z.string(), schema: z.string(), table: z.string(),
    isTemporary: z.boolean(), view: z.enum(['tables', 'structure']), limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(), filters: z.array(filter).optional(),
    sortRules: z.array(z.object({ column: z.string(), direction: z.enum(['ASC', 'DESC']) })).optional() }),
  z.object({ kind: z.literal('query'), id: z.string(), name: z.string(), editorContent: z.string(),
    isTemporary: z.boolean(), lastSavedContent: z.string().optional(), isLocked: z.boolean().optional() }),
  z.object({ kind: z.literal('dashboard'), id: z.string(), dashboardId: z.string(), name: z.string() }),
  z.object({ kind: z.literal('schema-diagram'), id: z.string(), name: z.string() })
])
const workspaceSchema = z.object({
  connectionId: z.string().min(1),
  lastUpdated: z.union([z.iso.datetime({ offset: true }), z.date()]).transform((value) => new Date(value)),
  tabs: z.array(tab),
  activeTabId: z.string().nullable()
})

export function parseWorkspace(value: unknown, connectionId: string): ConnectionWorkspace {
  const parsed = workspaceSchema.safeParse(value)
  if (!parsed.success) throw new ValidationError('Invalid workspace payload')
  if (parsed.data.connectionId !== connectionId) throw new ValidationError('Workspace identity does not match the URL')
  if (new Set(parsed.data.tabs.map((item) => item.id)).size !== parsed.data.tabs.length) {
    throw new ValidationError('Workspace tab IDs must be unique')
  }
  if (parsed.data.activeTabId !== null && !parsed.data.tabs.some((item) => item.id === parsed.data.activeTabId)) {
    throw new ValidationError('Active tab is not present in the workspace')
  }
  return parsed.data
}
