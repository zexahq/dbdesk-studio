import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import * as fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface Config {
  backendPort: number
  frontendPort: number
  backendUrl: string
  uri?: string
}

const DEFAULT_CONFIG: Config = {
  backendPort: 6789,
  frontendPort: 9876,
  backendUrl: 'http://localhost:6789',
  uri: undefined
}

function parseArgs() {
  const args = process.argv.slice(2)
  const config = { ...DEFAULT_CONFIG }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--backend-port') {
      const port = args[i + 1]
      if (port) config.backendPort = parseInt(port, 10)
      i++
    } else if (args[i] === '--frontend-port') {
      const port = args[i + 1]
      if (port) config.frontendPort = parseInt(port, 10)
      i++
    } else if (args[i] === '--backend-url') {
      const url = args[i + 1]
      if (url) config.backendUrl = url
      i++
    } else if (args[i] === '--uri') {
      const next = args[i + 1]
      if (!next || next.startsWith('-')) {
        console.error('Error: --uri requires a value.')
        printHelp()
        process.exit(1)
      }
      config.uri = next
      i++
    } else {
      const arg = args[i]
      if (arg && arg.startsWith('--uri=')) {
        config.uri = arg.slice('--uri='.length)
      } else if (arg === '--help' || arg === '-h') {
        printHelp()
        process.exit(0)
      }
    }
  }

  return config
}

function printHelp() {
  console.log(`
  Usage: dbdesk-studio [options]

  Options:
    --uri <connection-string>  Database connection URI (opens directly to connection)
                               Supports: postgresql://, postgres://, mysql://
    --backend-port <port>      Backend server port (default: 6789)
    --frontend-port <port>     Frontend server port (default: 9876)
    --backend-url <url>        Backend URL for frontend (default: http://localhost:6789)
    --help, -h                 Show this help message

  Examples:
    dbdesk-studio
    dbdesk-studio --uri "postgresql://user:pass@localhost:5432/mydb"
    dbdesk-studio --uri="mysql://user:pass@localhost:3306/mydb"
    dbdesk-studio --backend-port 4000 --frontend-port 8080
    dbdesk-studio --backend-url http://api.example.com
  `)
}

function getServerPath(): string {
  // Try to find the server in different possible locations
  const possiblePaths = [
    path.join(__dirname, '../../..', 'apps/server/dist/index.js'),
    path.join(__dirname, '../../../apps/server/dist/index.js'),
    path.join(__dirname, '../../server/dist/index.js'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }

  // Fallback - try using tsx to run the TS directly
  const tsPath = path.join(__dirname, '../../..', 'apps/server/src/index.ts')
  if (fs.existsSync(tsPath)) {
    return tsPath
  }

  throw new Error('Could not find server app. Make sure to run: pnpm build')
}

function getWebDistPath(): string {
  const possiblePaths = [
    path.join(__dirname, '../../..', 'apps/web/dist'),
    path.join(__dirname, '../../../apps/web/dist'),
    path.join(__dirname, '../../web/dist'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }

  throw new Error('Could not find web app dist. Make sure to run: pnpm build')
}

function startBackend(config: Config): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverPath = getServerPath()
    const useTs = serverPath.endsWith('.ts')

    const args = useTs ? [serverPath] : []
    const cmd = useTs ? 'tsx' : 'node'

    const env = {
      ...process.env,
      PORT: String(config.backendPort),
      NODE_ENV: process.env.NODE_ENV || 'production'
    }

    const backend = spawn(cmd, args, {
      env,
      stdio: 'ignore'
    })

    backend.on('error', (err) => {
      console.error('❌ Failed to start backend:', err.message)
      reject(err)
    })

    // Give backend time to start
    setTimeout(() => {
      resolve()
    }, 2000)
  })
}

function startFrontend(config: Config): Promise<void> {
  return new Promise((resolve, reject) => {
    const webDistPath = getWebDistPath()

    // Create a simple HTTP server to serve static files
    const serverScript = `
const http = require('http');
const fs = require('fs');
const path = require('path');

const distPath = '${webDistPath}';
const port = ${config.frontendPort};
const backendUrl = new URL('${config.backendUrl}');

const server = http.createServer((req, res) => {
  if (req.url && (req.url.startsWith('/api/') || req.url === '/health')) {
    const options = {
      hostname: backendUrl.hostname,
      port: backendUrl.port || 80,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: backendUrl.host },
    };
    const proxy = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });
    proxy.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend unavailable: ' + err.message }));
    });
    req.pipe(proxy, { end: true });
    return;
  }

  let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url);
  const extname = path.extname(filePath);
  
  let contentType = 'text/html';
  if (extname === '.js') contentType = 'text/javascript';
  if (extname === '.css') contentType = 'text/css';
  if (extname === '.json') contentType = 'application/json';
  if (extname === '.png') contentType = 'image/png';
  if (extname === '.jpg') contentType = 'image/jpeg';
  if (extname === '.svg') contentType = 'image/svg+xml';
  if (extname === '.woff') contentType = 'font/woff';
  if (extname === '.woff2') contentType = 'font/woff2';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (fs.existsSync(path.join(distPath, 'index.html'))) {
        fs.readFile(path.join(distPath, 'index.html'), (err, content) => {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content, 'utf-8');
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(port, () => {});
`

    const frontendServer = spawn('node', ['-e', serverScript], {
      stdio: 'inherit'
    })

    frontendServer.on('error', (err) => {
      console.error('❌ Failed to start frontend:', err.message)
      reject(err)
    })

    setTimeout(() => {
      resolve()
    }, 1000)
  })
}

async function main() {
  const config = parseArgs()

  try {
    // Start both services
    await Promise.all([
      startBackend(config),
      startFrontend(config)
    ])

    const baseUrl = `http://localhost:${config.frontendPort}`

    // If URI is provided, create connection via backend API first
    if (config.uri) {
      console.log('dbdesk-studio running...')
      console.log('Creating connection from URI...')
      
      try {
        const connectionId = await createConnectionFromUri(config.uri, config.backendPort)
        const appUrl = `${baseUrl}/connections/${connectionId}`
        console.log(`Connection created! Opening ${baseUrl}/connections/<id>`)
        openBrowser(appUrl)
      } catch (err) {
        console.error('Failed to create connection from URI:', err instanceof Error ? err.message : err)
        console.log(`You can still access the studio at ${baseUrl}`)
        openBrowser(baseUrl)
      }
    } else {
      console.log(`dbdesk-studio running at ${baseUrl}`)
    }
  } catch (err) {
    console.error('❌ Failed to start services:', err)
    process.exit(1)
  }
}

async function createConnectionFromUri(uri: string, backendPort: number): Promise<string> {
  const response = await fetch(`http://localhost:${backendPort}/api/connections/from-uri`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ uri })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string }
    throw new Error(errorData.error || `HTTP ${response.status}`)
  }

  const profile = await response.json() as { id: string }
  return profile.id
}

function openBrowser(url: string) {
  const platform = process.platform

  if (platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
  } else if (platform === 'win32') {
    // 'start' is a cmd.exe builtin, not an executable
    spawn('cmd.exe', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true }).unref()
  } else {
    spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
  }
}

main()
