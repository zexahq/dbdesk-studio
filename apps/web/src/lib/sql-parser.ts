import type { EditorQueryBlock } from '@common/types'

type Statement = { query: string; startLine: number; endLine: number }

const dangerous = ['DELETE', 'UPDATE', 'INSERT', 'DROP', 'TRUNCATE', 'ALTER', 'RENAME']

function scanStatements(sql: string): Statement[] {
  const statements: Statement[] = []
  let buffer = ''
  let startLine: number | undefined
  let line = 1
  let endLine = 1
  let quote: "'" | '"' | null = null
  let dollarTag: string | null = null
  let lineComment = false
  let blockComment = 0

  const add = (value: string, meaningful = true) => {
    buffer += value
    if (meaningful && value.trim()) {
      startLine ??= line
      endLine = line
    }
  }
  const flush = () => {
    const query = buffer.trim()
    if (query && startLine !== undefined) statements.push({ query, startLine, endLine })
    buffer = ''
    startLine = undefined
    endLine = line
  }

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    const next = sql[i + 1]
    if (lineComment) {
      if (char === '\n') {
        lineComment = false
        add('\n', false)
        line++
      }
      continue
    }
    if (blockComment) {
      if (char === '/' && next === '*') { blockComment++; i++; continue }
      if (char === '*' && next === '/') { blockComment--; i++; continue }
      if (char === '\n') { add('\n', false); line++ }
      continue
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        add(dollarTag)
        i += dollarTag.length - 1
        dollarTag = null
      } else {
        add(char)
        if (char === '\n') line++
      }
      continue
    }
    if (quote) {
      add(char)
      if (char === quote) {
        if (next === quote) { add(next); i++ } else quote = null
      } else if (char === '\n') line++
      continue
    }
    if (char === '-' && next === '-') { lineComment = true; i++; add(' ', false); continue }
    if (char === '/' && next === '*') { blockComment = 1; i++; add(' ', false); continue }
    if (char === "'" || char === '"') { quote = char; add(char); continue }
    if (char === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
      if (match) { dollarTag = match[0]; add(dollarTag); i += dollarTag.length - 1; continue }
    }
    if (char === ';') { flush(); continue }
    add(char)
    if (char === '\n') line++
  }
  flush()
  return statements
}

export function splitQueryBySemicolons(sql: string): string[] {
  return scanStatements(sql).map(({ query }) => query)
}

export function getEditorQueries(sql: string): EditorQueryBlock[] {
  const statements = scanStatements(sql)
  if (!statements.length) return []
  const lines = sql.split(/\r?\n/)
  const blocks: EditorQueryBlock[] = []
  const firstStatement = statements[0]!
  let current = [firstStatement.query]
  let start = firstStatement.startLine
  let end = firstStatement.endLine

  const expandStart = (value: number) => {
    let result = value
    while (result > 1 && lines[result - 2]?.trim()) result--
    return result
  }
  const expandEnd = (value: number) => {
    let result = value
    while (result < lines.length && lines[result]?.trim()) result++
    return result
  }
  const push = () => blocks.push({ startLineNumber: expandStart(start), endLineNumber: expandEnd(end), queries: current })

  for (const statement of statements.slice(1)) {
    const hasBlankLine = lines.slice(end, statement.startLine - 1).some((value) => !value.trim())
    if (hasBlankLine) {
      push()
      current = [statement.query]
      start = statement.startLine
    } else {
      current.push(statement.query)
    }
    end = statement.endLine
  }
  push()
  return blocks
}

export function getQueryAtLine(sql: string, lineNumber?: number): string[] {
  const blocks = getEditorQueries(sql)
  if (!lineNumber) return blocks.flatMap((block) => block.queries)
  const block = blocks.find(({ startLineNumber, endLineNumber }) => lineNumber >= startLineNumber && lineNumber <= endLineNumber)
  return block?.queries ?? blocks.flatMap((item) => item.queries)
}

function stripSql(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""')
    .replace(/\$[A-Za-z_][A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z_][A-Za-z0-9_]*\$/g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, '')
}

export function hasDangerousSqlKeywords(sql: string): boolean {
  return new RegExp(`\\b(?:${dangerous.join('|')})\\b`, 'i').test(stripSql(sql))
}

export function getQueryTabLabel(sql: string): string {
  const clean = stripSql(sql).trim()
  const patterns: Array<[string, RegExp]> = [
    ['SELECT', /\bFROM\s+(?:["\w.]+\.)?(["\w]+)/i],
    ['INSERT INTO', /\bINSERT\s+INTO\s+(?:["\w.]+\.)?(["\w]+)/i],
    ['UPDATE', /\bUPDATE\s+(?:["\w.]+\.)?(["\w]+)/i],
    ['DELETE FROM', /\bDELETE\s+FROM\s+(?:["\w.]+\.)?(["\w]+)/i],
    ['CREATE TABLE', /\bCREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["\w.]+\.)?(["\w]+)/i]
  ]
  for (const [verb, pattern] of patterns) {
    if (new RegExp(`^${verb.replace(' ', '\\s+')}\\b`, 'i').test(clean)) {
      const table = clean.match(pattern)?.[1]?.replaceAll('"', '')
      return table ? `${verb} · ${table}` : verb
    }
  }
  return clean.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0]?.toUpperCase() ?? 'Query'
}
