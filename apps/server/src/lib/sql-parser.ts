/** SQL classification utilities used by the adapter pagination path. */

export function stripSqlComments(sql: string): string {
  let out = ''; let quote: "'" | '"' | null = null; let lineComment = false; let block = 0; let dollar: string | null = null
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i]; const n = sql[i + 1]
    if (lineComment) { if (c === '\n') { lineComment = false; out += '\n' } else out += ' '; continue }
    if (block) { if (c === '/' && n === '*') { block += 1; out += '  '; i += 1 } else if (c === '*' && n === '/') { block -= 1; out += '  '; i += 1 } else out += c === '\n' ? '\n' : ' '; continue }
    if (dollar) { if (sql.startsWith(dollar, i)) { out += dollar; i += dollar.length - 1; dollar = null } else out += c; continue }
    if (quote) { out += c; if (c === quote) { if (n === quote) { out += n; i += 1 } else quote = null } continue }
    if (c === '-' && n === '-') { lineComment = true; out += '  '; i += 1; continue }
    if (c === '/' && n === '*') { block = 1; out += '  '; i += 1; continue }
    if (c === "'" || c === '"') { quote = c; out += c; continue }
    if (c === '$') { const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/); if (match) { dollar = match[0]; out += dollar; i += dollar.length - 1; continue } }
    out += c
  }
  return out
}

export const normalizeQuery = (query: string): string => {
  const commentFree = stripSqlComments(query).trimEnd()
  if (commentFree.endsWith(';')) {
    const semicolonIndex = commentFree.lastIndexOf(';')
    return query.slice(0, semicolonIndex).trim()
  }
  return query.trim()
}

function skipQuoted(text: string, start: number, quote: string): number {
  let i = start + 1
  while (i < text.length) { if (text[i] === quote) { i += 1; if (text[i] !== quote) break } i += 1 }
  return i
}

export const hasAdditionalStatements = (query: string): boolean => {
  const clean = stripSqlComments(query)
  for (let i = 0; i < clean.length; i += 1) {
    if (clean[i] === "'" || clean[i] === '"') i = skipQuoted(clean, i, clean[i]) - 1
    else if (clean[i] === ';' && clean.slice(i + 1).trim()) return true
  }
  return false
}

function skipParenthesized(text: string, start: number): number {
  if (text[start] !== '(') return start
  let index = start + 1
  let depth = 1
  while (index < text.length && depth > 0) {
    if (text[index] === "'" || text[index] === '"') index = skipQuoted(text, index, text[index])
    else if (text[index] === '(') { depth += 1; index += 1 }
    else if (text[index] === ')') { depth -= 1; index += 1 }
    else index += 1
  }
  return index
}

export const getInitialStatementKeyword = (query: string): string | null => {
  const clean = stripSqlComments(normalizeQuery(query)).trim()
  const first = clean.match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1]?.toLowerCase()
  if (!first || first !== 'with') return first ?? null
  let index = first.length
  while (index < clean.length) {
    const name = clean.slice(index).match(/^\s*(?:[A-Za-z_][A-Za-z0-9_]*|"(?:""|[^"])+")\s*/)
    if (!name) return null
    index += name[0].length
    if (clean[index] === '(') index = skipParenthesized(clean, index)
    const as = clean.slice(index).match(/^\s+AS\s*/i)
    if (!as) return clean.slice(index).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1]?.toLowerCase() ?? null
    index += as[0].length
    if (clean[index] !== '(') return null
    index = skipParenthesized(clean, index)
    if (clean[index] === ',') { index += 1; continue }
    break
  }
  return clean.slice(index).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1]?.toLowerCase() ?? null
}

export const isSelectableQuery = (query: string): boolean => {
  const normalized = normalizeQuery(query)
  return normalized.length > 0 && !hasAdditionalStatements(normalized) &&
    ['select', 'with', 'values', 'show'].includes(getInitialStatementKeyword(normalized) ?? '')
}
