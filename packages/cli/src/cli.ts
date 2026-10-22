import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function parseArgs() {
  const config = { backendPort: 6789, frontendPort: 9876, backendUrl: '', uri: '' }
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: dbdesk-studio [options]
  --backend-port <port>  Local API port (default: 6789)
  --frontend-port <port> Local UI port (default: 9876)
  --backend-url <url>    Use an existing backend instead of starting one
  --uri <uri>            Open a PostgreSQL connection
  --help, -h            Show this help message

Local services bind to 127.0.0.1. Set HOST explicitly for container embedding.`)
      process.exit(0)
    }
    if (arg.startsWith('--uri=')) {
      config.uri = arg.slice(6)
      if (!config.uri) throw new Error('--uri requires a value')
      continue
    }
    if (!['--backend-port', '--frontend-port', '--backend-url', '--uri'].includes(arg)) {
      throw new Error(`Unknown option: ${arg}`)
    }
    const value = args[++i]
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
    if (arg === '--uri') config.uri = value
    else if (arg === '--backend-url') {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('--backend-url requires an HTTP(S) URL without credentials, query or fragment')
      }
      config.backendUrl = value.replace(/\/$/, '')
    } else {
      const port = Number(value)
      if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${arg} must be an integer between 1 and 65535`)
      }
      if (arg === '--backend-port') config.backendPort = port
      else config.frontendPort = port
    }
  }
  if (!config.backendUrl && config.backendPort === config.frontendPort) throw new Error('Frontend and backend ports must be different')
  return config
}

let backend: ChildProcess | undefined
let frontend: Server | undefined
let stopping = false

async function stop(code: number) {
  if (stopping) return
  stopping = true
  const shutdown = setTimeout(() => { backend?.kill('SIGKILL'); process.exit(code) }, 6000)
  shutdown.unref()
  if (frontend) {
    frontend.closeAllConnections()
    await new Promise<void>((resolve) => frontend!.close(() => resolve()))
  }
  if (backend && backend.exitCode === null && backend.signalCode === null) {
    const exited = new Promise<void>((resolve) => backend!.once('exit', () => resolve()))
    backend.kill('SIGTERM')
    await exited
  }
  clearTimeout(shutdown)
  process.exitCode = code
}

async function startBackend(port: number): Promise<void> {
  const serverPath = ['index.mjs', 'index.js'].map((name) => path.join(root, 'apps/server/dist', name)).find(existsSync)
  if (!serverPath) throw new Error('Server build is missing. Run pnpm build before starting Studio.')
  await new Promise<void>((resolve, reject) => {
    backend = spawn(process.execPath, [serverPath], {
      env: { ...process.env, PORT: String(port), HOST: process.env.HOST || '127.0.0.1', NODE_ENV: process.env.NODE_ENV || 'production' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    })
    const timeout = setTimeout(() => reject(new Error('Backend did not become ready within 15 seconds')), 15000)
    backend.once('error', (error) => { clearTimeout(timeout); reject(error) })
    backend.once('exit', (code, signal) => {
      clearTimeout(timeout)
      if (!stopping) {
        reject(new Error(`Backend exited before or during operation (${signal || code})`))
        void stop(code || 1)
      }
    })
    backend.on('message', (message) => {
      if (message && typeof message === 'object' && 'type' in message && message.type === 'dbdesk-ready') {
        clearTimeout(timeout)
        resolve()
      }
    })
  })
}

async function startFrontend(port: number, backendUrl: string): Promise<void> {
  const dist = path.join(root, 'apps/web/dist')
  await fs.access(path.join(dist, 'index.html'))
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.yaml': 'application/yaml', '.yml': 'application/yaml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' }
  frontend = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const target = new URL(backendUrl + url.pathname + url.search)
      const proxy = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, {
        method: req.method, headers: { ...req.headers, host: target.host }
      }, (response) => {
        res.writeHead(response.statusCode || 502, response.headers)
        response.pipe(res)
      })
      proxy.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Backend unavailable' }))
      })
      req.on('aborted', () => proxy.destroy())
      req.pipe(proxy)
      return
    }
    try {
      const pathname = decodeURIComponent(url.pathname)
      let file = path.resolve(dist, '.' + pathname)
      if (file !== dist && !file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return }
      if (pathname.endsWith('/')) file = path.join(file, 'index.html')
      let content: Buffer
      try { content = await fs.readFile(file) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        if (path.extname(pathname)) { res.writeHead(404); res.end('Not found'); return }
        file = path.join(dist, 'index.html')
        content = await fs.readFile(file)
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' })
      res.end(req.method === 'HEAD' ? undefined : content)
    } catch {
      res.writeHead(400)
      res.end('Invalid request')
    }
  })
  await new Promise<void>((resolve, reject) => {
    frontend!.once('error', reject)
    frontend!.listen(port, process.env.HOST || '127.0.0.1', () => resolve())
  })
}

async function main() {
  const config = parseArgs()
  process.once('SIGINT', () => { void stop(0) })
  process.once('SIGTERM', () => { void stop(0) })
  const backendUrl = config.backendUrl || `http://127.0.0.1:${config.backendPort}`
  if (!config.backendUrl) await startBackend(config.backendPort)
  await startFrontend(config.frontendPort, backendUrl)
  const baseUrl = `http://localhost:${config.frontendPort}`
  console.log(`dbdesk-studio running at ${baseUrl}`)
  if (config.uri) {
    const response = await fetch(`${backendUrl}/api/connections/from-uri`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uri: config.uri })
    })
    const profile = await response.json() as { id?: string; error?: string }
    if (!response.ok || !profile.id) {
      console.error('Connection could not be created. Check the connection details in Studio.')
      return
    }
    const url = `${baseUrl}/connections/${encodeURIComponent(profile.id)}`
    const opener = process.platform === 'darwin' ? ['open', url] : process.platform === 'win32'
      ? ['cmd.exe', '/c', 'start', '""', url] : ['xdg-open', url]
    const child = spawn(opener[0]!, opener.slice(1), { stdio: 'ignore', detached: true })
    child.on('error', () => console.log(`Open ${baseUrl} in your browser`))
    child.unref()
  }
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Studio could not start')
  await stop(1)
})
