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
  const add = (value: string, meaningful: boolean) => {
    buffer += value
    if (meaningful && /\S/.test(value)) {
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
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i] ?? ''
    const next = sql[i + 1]
    if (lineComment) {
      add(char, false)
      if (char === '\n') { lineComment = false; line += 1 }
      continue
    }
    if (blockComment > 0) {
      add(char, false)
      if (char === '/' && next === '*') { add(next, false); i += 1; blockComment += 1 }
      else if (char === '*' && next === '/') { add(next, false); i += 1; blockComment -= 1 }
      else if (char === '\n') line += 1
      continue
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) { add(dollarTag, true); i += dollarTag.length - 1; dollarTag = null }
      else { add(char, true); if (char === '\n') line += 1 }
      continue
    }
    if (quote) {
      add(char, true)
      if (char === quote) {
        if (next === quote) { add(next, true); i += 1 } else quote = null
      } else if (char === '\n') line += 1
      continue
    }
    if (char === '-' && next === '-') { add('--', false); i += 1; lineComment = true; continue }
    if (char === '/' && next === '*') { add('/*', false); i += 1; blockComment = 1; continue }
    if (char === "'" || char === '"') { quote = char; add(char, true); continue }
    if (char === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
      if (match) { dollarTag = match[0]; add(dollarTag, true); i += dollarTag.length - 1; continue }
    }
    if (char === ';') { flush(); continue }
    add(char, true)
    if (char === '\n') line += 1
  }
  flush()
  return statements
}

export function splitQueryBySemicolons(sql: string): string[] { return scanStatements(sql).map(({ query }) => query) }

export function getEditorQueries(sql: string): EditorQueryBlock[] {
  const statements = scanStatements(sql)
  if (!statements.length) return []
  const lines = sql.split(/\r?\n/)
  const blocks: EditorQueryBlock[] = []
  let current = [statements[0].query]
  let start = statements[0].startLine
  let end = statements[0].endLine
  const expandStart = (value: number) => { let result = value; while (result > 1 && lines[result - 2]?.trim()) result -= 1; return result }
  const expandEnd = (value: number) => { let result = value; while (result < lines.length && lines[result]?.trim()) result += 1; return result }
  const push = () => blocks.push({ startLineNumber: expandStart(start), endLineNumber: expandEnd(end), queries: current })
  for (const statement of statements.slice(1)) {
    const hasBlankLine = lines.slice(end, statement.startLine - 1).some((value) => !value.trim())
    if (hasBlankLine) { push(); current = [statement.query]; start = statement.startLine }
    else current.push(statement.query)
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

/** Remove SQL comments while preserving strings and line structure. */
export function stripSqlComments(sql: string): string {
  let output = ''
  let quote: "'" | '"' | null = null
  let dollarTag: string | null = null
  let lineComment = false
  let blockComment = 0
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]
    const next = sql[i + 1]
    if (lineComment) { if (char === '\n') { lineComment = false; output += '\n' } else output += ' '; continue }
    if (blockComment > 0) {
      if (char === '/' && next === '*') { blockComment += 1; output += '  '; i += 1 }
      else if (char === '*' && next === '/') { blockComment -= 1; output += '  '; i += 1 }
      else output += char === '\n' ? '\n' : ' '
      continue
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) { output += dollarTag; i += dollarTag.length - 1; dollarTag = null }
      else { output += char }
      continue
    }
    if (quote) {
      output += char
      if (char === quote) { if (next === quote) { output += next; i += 1 } else quote = null }
      continue
    }
    if (char === '-' && next === '-') { lineComment = true; output += '  '; i += 1; continue }
    if (char === '/' && next === '*') { blockComment = 1; output += '  '; i += 1; continue }
    if (char === "'" || char === '"') { quote = char; output += char; continue }
    if (char === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
      if (match) { dollarTag = match[0]; output += dollarTag; i += dollarTag.length - 1; continue }
    }
    output += char
  }
  return output
}

export const normalizeQuery = (query: string): string => {
  const commentFree = stripSqlComments(query).trimEnd()
  if (commentFree.endsWith(';')) {
    return query.slice(0, commentFree.lastIndexOf(';')).trim()
  }
  return query.trim()
}
export const skipQuotedString = (text: string, start: number, quoteChar: string): number => {
  let index = start
  if (text[index] !== quoteChar) return start
  index += 1
  while (index < text.length) { if (text[index] === quoteChar) { index += 1; if (text[index] !== quoteChar) break } index += 1 }
  return index
}
export const skipParenthesizedSection = (text: string, start: number): number => {
  if (text[start] !== '(') return start
  let index = start + 1; let depth = 1
  while (index < text.length && depth > 0) {
    if (text[index] === "'" || text[index] === '"') index = skipQuotedString(text, index, text[index])
    else if (text[index] === '(') { depth += 1; index += 1 }
    else if (text[index] === ')') { depth -= 1; index += 1 }
    else index += 1
  }
  return index
}
export const hasAdditionalStatements = (query: string): boolean => scanStatements(query).length > 1

export const getInitialStatementKeyword = (query: string): string | null => {
  const clean = stripSqlComments(normalizeQuery(query)).trim()
  const first = clean.match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1]?.toLowerCase()
  if (!first) return null
  if (first !== 'with') return first
  let index = first.length
  while (index < clean.length) {
    const name = clean.slice(index).match(/^\s*(?:[A-Za-z_][A-Za-z0-9_]*|"(?:""|[^"])+")\s*/)
    if (!name) return null
    index += name[0].length
    if (clean[index] === '(') index = skipParenthesizedSection(clean, index)
    const as = clean.slice(index).match(/^\s+AS\s*/i)
    if (!as) return clean.slice(index).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1]?.toLowerCase() ?? null
    index += as[0].length
    if (clean[index] !== '(') return null
    index = skipParenthesizedSection(clean, index)
    if (clean[index] === ',') { index += 1; continue }
    break
  }
  return clean.slice(index).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1]?.toLowerCase() ?? null
}

export const isSelectableQuery = (query: string): boolean => {
  const normalized = normalizeQuery(query)
  return normalized.length > 0 && !hasAdditionalStatements(normalized) && ['select', 'with', 'values', 'show', 'explain'].includes(getInitialStatementKeyword(normalized) ?? '')
}
export function hasDangerousSqlKeywords(sql: string): boolean { return new RegExp(`\\b(?:${dangerous.join('|')})\\b`, 'i').test(stripSqlComments(sql)) }
export function getQueryTabLabel(sql: string): string {
  const clean = stripSqlComments(sql).trim()
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
