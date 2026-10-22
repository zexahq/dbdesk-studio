import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = fileURLToPath(new URL('../', import.meta.url))
const temporary = await mkdtemp(path.join(tmpdir(), 'dbdesk-package-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = new Set()
const servers = new Set()
const freePort = async () => {
  const server = createServer()
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const port = server.address().port
  await new Promise((done) => server.close(done))
  return port
}
const launch = (cli, args) => {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd: temporary, env: { ...process.env, HOST: '127.0.0.1', STORAGE_PATH: path.join(temporary, 'storage') },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.output = ''
  child.stdout.on('data', (data) => { child.output += data })
  child.stderr.on('data', (data) => { child.output += data })
  children.add(child)
  return child
}
const waitFor = async (condition, child) => {
  const deadline = Date.now() + 20000
  while (!await condition()) {
    assert.ok(Date.now() < deadline, `Timed out: ${child?.output || ''}`)
    if (child) assert.equal(child.exitCode, null, child.output)
    await delay(30)
  }
}
const stop = async (child) => {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
    await waitFor(() => child.exitCode !== null || child.signalCode !== null)
  }
  children.delete(child)
}
const assertPortReleased = async (port) => {
  const server = createServer()
  await new Promise((done, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', done) })
  await new Promise((done) => server.close(done))
}

try {
  execFileSync('pnpm', ['pack', '--pack-destination', temporary], { cwd: root, stdio: 'pipe' })
  const archive = (await readdir(temporary)).find((name) => name.endsWith('.tgz'))
  assert.ok(archive, 'Package archive was not created')
  await writeFile(path.join(temporary, 'package.json'), '{"name":"studio-install-check","private":true}')
  execFileSync(npm, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', path.join(temporary, archive)], { cwd: temporary, stdio: 'pipe' })
  const installed = path.join(temporary, 'node_modules/dbdesk-studio')
  const manifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'))
  assert.deepEqual(manifest.dependencies, {})
  const cli = path.join(installed, manifest.bin['dbdesk-studio'])
  assert.match(execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }), /Usage: dbdesk-studio/)
  const backendPort = await freePort()
  let frontendPort = await freePort()
  while (frontendPort === backendPort) frontendPort = await freePort()
  const child = launch(cli, ['--backend-port', String(backendPort), '--frontend-port', String(frontendPort)])
  await waitFor(() => child.output.includes('dbdesk-studio running at'), child)
  const base = `http://127.0.0.1:${frontendPort}`
  assert.match(await (await fetch(base)).text(), /<html/)
  assert.equal((await (await fetch(`${base}/api/health`)).json()).ok, true)
  assert.equal((await (await fetch(`${base}/api/connections`)).json()).length, 0)
  const runtime = await fetch(`${base}/runtime.yaml?v=1`)
  assert.match(runtime.headers.get('content-type'), /yaml/)
  assert.equal(await runtime.text(), await readFile(path.join(root, 'config/runtime.yaml'), 'utf8'))
  assert.equal((await fetch(`${base}/assets/does-not-exist.js`)).status, 404)
  const html = await (await fetch(base)).text()
  assert.match(html, /<base href="\/"/)
  assert.equal(await (await fetch(`${base}/connections/example`)).text(), html)
  const asset = html.match(/src="([^"]+\.js)"/)?.[1]
  assert.ok(asset)
  assert.match((await fetch(new URL(asset, base))).headers.get('content-type'), /javascript/)
  await stop(child)
  assert.equal(child.exitCode, 0, child.output)
  await assertPortReleased(backendPort)
  await assertPortReleased(frontendPort)

  // Occupied ports must fail quickly, and failure must clean up the sibling service.
  const occupied = createServer()
  servers.add(occupied)
  await new Promise((done) => occupied.listen(backendPort, '127.0.0.1', done))
  const collision = launch(cli, ['--backend-port', String(backendPort), '--frontend-port', String(frontendPort)])
  await waitFor(() => collision.exitCode !== null)
  assert.notEqual(collision.exitCode, 0)
  assert.match(collision.output, /already in use/)
  await assertPortReleased(frontendPort)
  await new Promise((done) => occupied.close(done))
  servers.delete(occupied)
  const occupiedFrontend = createServer()
  servers.add(occupiedFrontend)
  await new Promise((done) => occupiedFrontend.listen(frontendPort, '127.0.0.1', done))
  const frontendCollision = launch(cli, ['--backend-port', String(backendPort), '--frontend-port', String(frontendPort)])
  await waitFor(() => frontendCollision.exitCode !== null)
  assert.notEqual(frontendCollision.exitCode, 0)
  await assertPortReleased(backendPort)
  await new Promise((done) => occupiedFrontend.close(done))
  servers.delete(occupiedFrontend)

  // Explicit external mode must not try to bind the local backend port.
  const external = launch(cli, ['--backend-port', String(backendPort), '--frontend-port', String(frontendPort), '--backend-url', 'http://127.0.0.1:1'])
  await waitFor(() => external.output.includes('dbdesk-studio running at'), external)
  await assertPortReleased(backendPort)
  assert.equal((await fetch(base + '/api/health')).status, 502)
  await stop(external)
  console.log('Package smoke test passed: clean offline npm install, bundled assets, API proxy, readiness, port failures and shutdown.')
} finally {
  for (const child of children) {
    try { await stop(child) } catch { child.kill('SIGKILL') }
  }
  for (const server of servers) await new Promise((done) => server.close(done))
  await rm(temporary, { recursive: true, force: true })
}
