import { timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { RequestHandler } from 'express'

export interface AssistantAccess {
  token?: string
  allowWrites?: boolean
  projectId?: string
}

export async function assistantAccess(): Promise<AssistantAccess> {
  let token = process.env.DBDESK_ASSISTANT_TOKEN
  if (!token) {
    try {
      token = (await readFile(process.env.DBDESK_ASSISTANT_TOKEN_FILE ||
        join(process.env.STORAGE_PATH || join(homedir(), '.config', 'dbdesk-studio'), 'assistant-token'), 'utf8')).trim()
    } catch { /* Unconfigured installations leave the assistant API disabled. */ }
  }
  return {
    token,
    allowWrites: process.env.DBDESK_ASSISTANT_ALLOW_WRITES === 'true',
    projectId: process.env.DBDESK_ASSISTANT_PROJECT_ID || undefined
  }
}

export function authenticate(access: AssistantAccess): RequestHandler {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    // Bearer credentials are host-side authority, never model arguments or URL parameters.
    if (!access.token || access.token.length < 32) {
      res.status(503).json({ error: { code: 'assistant_disabled', message: 'Configure an assistant API token of at least 32 characters.' } })
      return
    }
    const actual = Buffer.from(req.header('authorization') || '')
    const expected = Buffer.from(`Bearer ${access.token}`)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Assistant API authentication required.' } })
      return
    }
    if (access.projectId && req.header('x-dbdesk-project-id') !== access.projectId) {
      res.status(403).json({ error: { code: 'project_forbidden', message: 'This token is restricted to its configured project.' } })
      return
    }
    next()
  }
}
