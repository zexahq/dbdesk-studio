import { ValidationError } from '../utils/errors'

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function pattern(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.replaceAll('*', '%').replaceAll('?', '_')
}

function relationParts(value: string | undefined): { schema?: string; table?: string } {
  if (!value) return {}
  const clean = value.replace(/^['"]|['"]$/g, '')
  const [schema, table] = clean.split('.', 2)
  return table ? { schema, table } : { table: schema }
}

/** Translate the portable, read-only psql inspection commands to SQL. */
export function translatePsqlMetaCommand(query: string): string {
  const clean = query
    .replace(/^\s*(?:--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/\s*)+/g, '')
    .trim()
    .replace(/;\s*$/, '')
  if (!clean.startsWith('\\')) return query

  const [command = '', ...args] = clean.split(/\s+/)
  const name = command.slice(1).toLowerCase()
  const argument = args.join(' ').trim() || undefined

  if (name === 'dt' || name === 'd' && !argument) {
    const tablePattern = pattern(name === 'dt' ? argument : undefined)
    return `SELECT schemaname AS schema_name, tablename AS table_name
      FROM pg_catalog.pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ${tablePattern ? `AND tablename ILIKE ${quote(tablePattern)}` : ''}
      ORDER BY schemaname, tablename`
  }
  if (name === 'dn') {
    return `SELECT nspname AS schema_name
      FROM pg_catalog.pg_namespace
      WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
      ORDER BY nspname`
  }
  if (name === 'l' || name === 'list') {
    return `SELECT datname AS database_name, pg_catalog.pg_get_userbyid(datdba) AS owner
      FROM pg_catalog.pg_database ORDER BY datname`
  }
  if (name === 'du') {
    return `SELECT rolname AS role_name, rolsuper AS is_superuser, rolcanlogin AS can_login
      FROM pg_catalog.pg_roles ORDER BY rolname`
  }
  if (name === 'di') {
    const indexPattern = pattern(argument)
    return `SELECT schemaname AS schema_name, tablename AS table_name, indexname AS index_name, indexdef
      FROM pg_catalog.pg_indexes
      ${indexPattern ? `WHERE indexname ILIKE ${quote(indexPattern)}` : ''}
      ORDER BY schemaname, tablename, indexname`
  }
  if (name === 'd' || name === 'd+') {
    const parts = relationParts(argument)
    if (!parts.table) throw new ValidationError('Usage: \\d [schema.]table')
    const schema = parts.schema ?? 'public'
    return `SELECT ordinal_position, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = ${quote(schema)} AND table_name = ${quote(parts.table)}
      ORDER BY ordinal_position`
  }

  throw new ValidationError(`Unsupported psql command "${command}". Supported commands: \\dt, \\d, \\dn, \\di, \\l, \\du`)
}
