import express, { type Application, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { assistantAccess, authenticate, type AssistantAccess } from './access'
import { AssistantError, AssistantService } from './service'
import { getProjectId } from '../project-scope'

const uuid = z.string().uuid()
const querySchema = z.object({
  queryId: uuid,
  connectionId: uuid,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  sql: z.string().min(1).max(8192),
  mode: z.enum(['read', 'write']).default('read'),
  limit: z.number().int().min(1).max(100).default(100),
  offset: z.number().int().min(0).max(1000000).default(0)
}).strict()

export function registerAssistantRoutes(app: Application, options?: AssistantAccess, service = new AssistantService()): void {
  const router = express.Router()
  router.use(async (req, res, next) => {
    try {
      const access = options || await assistantAccess()
      res.locals.assistantAccess = access
      authenticate(access)(req, res, next)
    } catch { res.status(503).json({ error: { code: 'assistant_unavailable', message: 'Assistant API configuration is unavailable.' } }) }
  })
  // Never reuse Express's permissive/default body parser for executable arguments.
  router.use(express.json({ limit: '32kb', strict: true }))
  const route = (fn: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res) } catch (error) { next(error) } }
  const id = (req: Request, key = 'connectionId') => uuid.parse(req.params[key])
  const expected = (req: Request) => z.string().regex(/^[a-f0-9]{64}$/).parse(req.header('if-match'))
  const empty = (req: Request) => z.object({}).strict().parse(req.body || {})

  router.get('/capabilities', (_req, res) => res.json({
    version: 1, authentication: 'bearer', writesEnabled: !!res.locals.assistantAccess.allowWrites,
    supportedQueryAdapters: ['postgres'], maxSQLLength: 8192, maxRows: 100, maxResponseBytes: 491520,
    maxQueryIDs: 256, queryIDRetention: 'process lifetime', automaticRetries: false,
    projectHeader: 'X-DBDesk-Project-ID', profileRevisionHeader: 'If-Match',
    endpoints: [
      { method: 'GET', path: '/status', description: 'Live connection and query-state metadata; no SQL or credentials.' },
      { method: 'GET', path: '/connections', description: 'Credential-free profiles with revision and connected state.' },
      { method: 'POST', path: '/connections/{connectionId}/connect', requires: ['If-Match'], body: {} },
      { method: 'POST', path: '/connections/{connectionId}/disconnect', requires: ['If-Match'], body: {} },
      { method: 'GET', path: '/connections/{connectionId}/schema', requires: ['If-Match'] },
      { method: 'POST', path: '/queries', bodySchema: {
        type: 'object', additionalProperties: false, required: ['queryId', 'connectionId', 'revision', 'sql'],
        properties: {
          queryId: { type: 'string', format: 'uuid' }, connectionId: { type: 'string', format: 'uuid' },
          revision: { type: 'string', pattern: '^[a-f0-9]{64}$' }, sql: { type: 'string', minLength: 1, maxLength: 8192 },
          mode: { type: 'string', enum: ['read', 'write'], default: 'read' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
          offset: { type: 'integer', minimum: 0, maximum: 1000000, default: 0 }
        }
      } },
      { method: 'GET', path: '/queries/{queryId}', description: 'Inspect state without replaying SQL.' },
      { method: 'POST', path: '/queries/{queryId}/cancel', body: {}, description: 'Request cancellation; never proof of rollback.' }
    ]
  }))
  router.get('/connections', route(async (req, res) => { res.json(await service.connections(getProjectId(req))) }))
  router.get('/status', route(async (req, res) => {
    const project = getProjectId(req)
    res.json({ version: 1, connections: await service.connections(project), queries: service.status(project) })
  }))
  for (const action of ['connect', 'disconnect'] as const) {
    router.post(`/connections/:connectionId/${action}`, route(async (req, res) => {
      empty(req)
      res.json(await service.control(id(req), expected(req), action, getProjectId(req)))
    }))
  }
  router.get('/connections/:connectionId/schema', route(async (req, res) => {
    const schema = await service.schema(id(req), expected(req), getProjectId(req))
    if (Buffer.byteLength(JSON.stringify(schema)) > 480 * 1024) throw new AssistantError(413, 'schema_too_large', 'Schema exceeds the response limit. Inspect it in Studio.')
    res.json(schema)
  }))
  router.post('/queries', route(async (req, res) => {
    const input = querySchema.parse(req.body)
    if (input.mode === 'write' && !res.locals.assistantAccess.allowWrites) {
      throw new AssistantError(403, 'writes_disabled', 'This deployment permits read-only assistant queries.')
    }
    res.json(await service.query(input, getProjectId(req)))
  }))
  router.get('/queries/:queryId', route(async (req, res) => {
    const record = service.status(getProjectId(req)).find(record => record.queryId === id(req, 'queryId'))
    if (!record) throw new AssistantError(404, 'query_not_found', 'Query not found in this project.')
    res.json(record)
  }))
  router.post('/queries/:queryId/cancel', route(async (req, res) => {
    empty(req)
    res.json(await service.cancel(id(req, 'queryId'), getProjectId(req)))
  }))
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AssistantError) res.status(error.status).json({ error: { code: error.code, message: error.message } })
    else if (error instanceof z.ZodError || (error as { status?: number })?.status === 400) {
      res.status(400).json({ error: { code: 'invalid_arguments', message: 'Arguments do not match the assistant API contract.' } })
    } else if ((error as { status?: number })?.status === 413) {
      res.status(413).json({ error: { code: 'body_too_large', message: 'Request exceeds 32 KiB.' } })
    } else res.status(500).json({ error: { code: 'operation_failed', message: 'Database operation failed. Check connectivity and permissions in Studio.' } })
  })
  app.use('/api/assistant/v1', router)
}
