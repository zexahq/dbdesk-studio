import type { Request } from 'express'

/**
 * Project scope is deliberately carried in a header rather than a URL so the
 * same Studio build can be mounted under any host route. The browser sets it
 * from the shared runtime registry or __DBDESK_PROJECT_ID__.
 */
export const PROJECT_ID_HEADER = 'x-dbdesk-project-id'

export function getProjectId(req: Request): string | undefined {
  const value = req.header(PROJECT_ID_HEADER)
  return value && value.trim() ? value.trim() : undefined
}
