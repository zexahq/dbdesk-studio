import type { SQLConnectionOptions } from '@common/types'
import type { PostgreSQLSslMode } from '@common/types/sql'
import type { PoolConfig } from 'pg'
import { ConnectionError, ValidationError } from '../../utils/errors'

export type PostgresConnectionOptions = SQLConnectionOptions & { connectionString?: string }

const modes = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'] as const

/** Keep the URI for pg's supported parameters instead of reconstructing credentials. */
export function parseConnectionURI(value: unknown): {
  type: 'postgres'; name: string; options: PostgresConnectionOptions
} {
  if (typeof value !== 'string' || !value.trim() || value.length > 16384) {
    throw new ValidationError('Enter a PostgreSQL connection string of at most 16 KiB.')
  }
  let url: URL
  try { url = new URL(value.trim()) }
  catch { throw new ValidationError('Invalid PostgreSQL connection string.') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) {
    throw new ValidationError('Use a postgres:// or postgresql:// connection string without a fragment.')
  }
  // A browser request must never ask pg to read server-side certificate/key files.
  for (const key of ['sslcert', 'sslkey', 'sslrootcert', 'passfile', 'service', 'servicefile']) {
    if (url.searchParams.has(key)) throw new ValidationError(`The ${key} option requires server-side configuration.`)
  }
  const decode = (text: string) => {
    try { return decodeURIComponent(text) }
    catch { throw new ValidationError('Invalid percent encoding in the connection string.') }
  }
  const host = url.searchParams.get('host') ?? decode(url.hostname).replace(/^\[|\]$/g, '')
  const user = url.searchParams.get('user') ?? decode(url.username)
  const database = url.searchParams.get('dbname') ?? (decode(url.pathname.slice(1)) || user)
  const password = url.searchParams.get('password') ?? decode(url.password)
  const port = Number(url.searchParams.get('port') ?? (url.port || 5432))
  if (!host || host.includes(',') || host.includes('/') || /\s/.test(host)) {
    throw new ValidationError('Specify one database hostname or IP address. Unix sockets and multi-host URIs are not supported.')
  }
  if (!user || !database) throw new ValidationError('The connection string must specify a user and database.')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ValidationError('Invalid PostgreSQL port.')
  const ssl = url.searchParams.get('ssl')
  const mode = url.searchParams.get('sslmode') ?? url.searchParams.get('ssl-mode') ??
    (ssl === 'true' || ssl === '1' ? 'require' : 'disable')
  if (!modes.includes(mode as PostgreSQLSslMode)) throw new ValidationError('Invalid PostgreSQL SSL mode.')
  return {
    type: 'postgres', name: `${database}@${host}`,
    options: { host, port, database, user, password, sslMode: mode as PostgreSQLSslMode, connectionString: value.trim() }
  }
}

function sslConfig(mode?: PostgreSQLSslMode): PoolConfig['ssl'] {
  switch (mode) {
    case 'prefer': case 'require': return { rejectUnauthorized: false }
    case 'verify-ca': return { rejectUnauthorized: true, checkServerIdentity: () => undefined }
    case 'verify-full': return true
    default: return false
  }
}

export function postgresPoolConfig(options: PostgresConnectionOptions, gateway = process.env.DBDESK_HOST_GATEWAY): PoolConfig {
  if (options.connectionString) options = parseConnectionURI(options.connectionString).options
  // Only container deployments opt in. Never alter a remote hostname or a saved profile.
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(options.host.toLowerCase())
  const host = local && gateway ? gateway : options.host.replace(/^\[|\]$/g, '')
  let connectionString: string | undefined
  if (options.connectionString) {
    const url = new URL(options.connectionString)
    // The decoded profile fields are authoritative, including the container gateway.
    url.hostname = host.includes(':') ? `[${host}]` : host
    url.port = String(options.port)
    url.username = encodeURIComponent(options.user)
    url.password = encodeURIComponent(options.password)
    url.pathname = '/' + encodeURIComponent(options.database)
    for (const key of ['user', 'password', 'port', 'dbname', 'database', 'ssl', 'sslmode', 'ssl-mode']) url.searchParams.delete(key)
    // pg's URI parser otherwise retains IPv6 brackets as part of the DNS name.
    url.searchParams.set('host', host)
    connectionString = url.toString()
  }
  const ssl = sslConfig(options.sslMode)
  const resolvedSSL = local && gateway && ssl ? { ...(typeof ssl === 'object' ? ssl : { rejectUnauthorized: true }), servername: options.host } : ssl
  return {
    connectionString, host, port: options.port, user: options.user,
    database: options.database, password: options.password,
    ssl: resolvedSSL, max: 10,
    idleTimeoutMillis: 30000, connectionTimeoutMillis: 30000, statement_timeout: 20000
  }
}

export function sslFallback(mode: PostgreSQLSslMode | undefined, error: unknown): PoolConfig['ssl'] | undefined {
  const failure = error as { code?: string; message?: string }
  // Retry only the explicit libpq negotiation cases; authentication and certificate
  // failures never silently downgrade require/verify modes or prefer TLS failures.
  if (mode === 'prefer' && failure.message === 'The server does not support SSL connections') return false
  if (mode === 'allow' && failure.code === '28000' && /no encryption|SSL off/i.test(failure.message ?? '')) {
    return { rejectUnauthorized: false }
  }
  return undefined
}

export function postgresConnectionError(error: unknown, options: PostgresConnectionOptions): ConnectionError {
  const failure = error as { code?: string; message?: string }
  const messages: Record<string, string> = {
    ECONNREFUSED: 'Cannot reach PostgreSQL. Check the host, published port, and whether the database is running.',
    ENOTFOUND: 'The PostgreSQL hostname could not be resolved. Check the hostname and VPN or DNS connection.',
    ETIMEDOUT: 'The PostgreSQL connection timed out. Check the network, VPN, firewall, and port.',
    '28P01': 'PostgreSQL rejected the username or password.',
    '3D000': 'The requested PostgreSQL database does not exist.'
  }
  let message = messages[failure.code ?? ''] ?? failure.message ?? 'PostgreSQL connection failed.'
  // Some drivers include connection strings in errors. Never return credentials.
  message = message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted connection string]')
  for (const secret of [options.password, encodeURIComponent(options.password)]) {
    if (secret) message = message.split(secret).join('[redacted]')
  }
  return new ConnectionError(message.slice(0, 1000))
}
