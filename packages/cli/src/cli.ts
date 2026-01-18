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
}

const DEFAULT_CONFIG: Config = {
  backendPort: 3000,
  frontendPort: 9876,
  backendUrl: 'http://localhost:3000'
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
    } else if (args[i] === '--help' || args[i] === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return config
}

function printHelp() {
  console.log(`
  Usage: dbdesk-studio [options]

  Options:
    --backend-port <port>     Backend server port (default: 3000)
    --frontend-port <port>    Frontend server port (default: 9876)
    --backend-url <url>       Backend URL for frontend (default: http://localhost:3000)
    --help, -h               Show this help message

  Examples:
    dbdesk-studio
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

    console.log(`🚀 Starting backend on port ${config.backendPort}...`)

    const env = {
      ...process.env,
      PORT: String(config.backendPort),
      NODE_ENV: process.env.NODE_ENV || 'production'
    }

    const backend = spawn(cmd, args, {
      env,
      stdio: 'inherit'
    })

    backend.on('error', (err) => {
      console.error('❌ Failed to start backend:', err.message)
      reject(err)
    })

    // Give backend time to start
    setTimeout(() => {
      console.log(`✅ Backend started on port ${config.backendPort}`)
      resolve()
    }, 2000)
  })
}

function startFrontend(config: Config): Promise<void> {
  return new Promise((resolve, reject) => {
    const webDistPath = getWebDistPath()

    console.log(`🚀 Starting frontend on port ${config.frontendPort}...`)

    // Create a simple HTTP server to serve static files
    const serverScript = `
const http = require('http');
const fs = require('fs');
const path = require('path');

const distPath = '${webDistPath}';
const port = ${config.frontendPort};

const server = http.createServer((req, res) => {
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

server.listen(port, () => {
  console.log('✅ Frontend started on port ' + port);
});
`

    const frontendServer = spawn('node', ['-e', serverScript], {
      stdio: 'inherit'
    })

    frontendServer.on('error', (err) => {
      console.error('❌ Failed to start frontend:', err.message)
      reject(err)
    })

    setTimeout(() => {
      console.log(`🌐 Open http://localhost:${config.frontendPort} in your browser`)
      resolve()
    }, 1000)
  })
}

async function main() {
  const config = parseArgs()

  console.log(`
╔═══════════════════════════════════════════╗
║   dbdesk-studio v0.0.1                    ║
║   Database Management Studio              ║
╚═══════════════════════════════════════════╝
  `)

  console.log('Configuration:')
  console.log(`  Backend Port: ${config.backendPort}`)
  console.log(`  Frontend Port: ${config.frontendPort}`)
  console.log(`  Backend URL: ${config.backendUrl}`)
  console.log('')

  try {
    // Start both services
    await Promise.all([
      startBackend(config),
      startFrontend(config)
    ])

    console.log('')
    console.log('🎉 All services started successfully!')
    console.log(`📖 Frontend: http://localhost:${config.frontendPort}`)
    console.log(`🔌 Backend: http://localhost:${config.backendPort}`)
    console.log('')
    console.log('Press Ctrl+C to stop all services')
  } catch (err) {
    console.error('❌ Failed to start services:', err)
    process.exit(1)
  }
}

main()
