import type { ColumnInfo, SchemaWithTables } from '@common/types'
import * as monaco from 'monaco-editor'
import { LanguageIdEnum } from 'monaco-sql-languages/esm/common/constants.js'

type CompletionContext = {
  schemas: SchemaWithTables[]
  columns: Record<string, ColumnInfo[]>
}

let context: CompletionContext = { schemas: [], columns: {} }
let registered = false

const keywords = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'ON', 'GROUP BY',
  'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'VALUES', 'INSERT INTO', 'UPDATE', 'SET',
  'DELETE FROM', 'RETURNING', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'AS', 'AND', 'OR',
  'NOT', 'NULL', 'TRUE', 'FALSE', 'DISTINCT', 'IN', 'LIKE', 'ILIKE', 'IS NULL', 'IS NOT NULL'
]

const key = (schema: string, table: string) => `${schema}.${table}`
const unquote = (value: string) => value.replace(/^"|"$/g, '')

function getTablesForName(name: string) {
  const normalized = unquote(name)
  return context.schemas.flatMap(({ schema, tables }) =>
    tables.includes(normalized) ? [{ schema, table: normalized }] : []
  )
}

function getStatementTables(text: string) {
  const refs: Array<{ schema: string; table: string; alias?: string }> = []
  const pattern = /\b(?:FROM|JOIN|UPDATE|INTO)\s+((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?)(?:\s+(?:AS\s+)?("[^"]+"|[A-Za-z_][\w$]*))?/gi
  for (const match of text.matchAll(pattern)) {
    const parts = match[1].split('.').map((part) => unquote(part.trim()))
    const candidates = parts.length === 2
      ? [{ schema: parts[0], table: parts[1] }]
      : getTablesForName(parts[0])
    const candidate = candidates[0]
    if (candidate) refs.push({ ...candidate, alias: match[2] ? unquote(match[2]) : undefined })
  }
  return refs
}

export function setSqlCompletionContext(next: CompletionContext) {
  context = next
}

export function registerSqlFeatures() {
  if (registered) return
  registered = true
  const languages = [LanguageIdEnum.PG, LanguageIdEnum.MYSQL]
  monaco.languages.registerCompletionItemProvider(languages, {
    triggerCharacters: ['.', ' '],
    provideCompletionItems(model, position) {
      const line = model.getLineContent(position.lineNumber)
      const before = line.slice(0, position.column - 1)
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, position.column)
      const allText = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column })
      const refs = getStatementTables(allText)
      const qualified = before.match(/(?:^|\s|,)([A-Za-z_][\w$]*)\.([A-Za-z_][\w$]*)?$/)
      const items: monaco.languages.CompletionItem[] = []
      const seen = new Set<string>()
      const add = (label: string, kind: monaco.languages.CompletionItemKind, detail: string) => {
        if (seen.has(label)) return
        seen.add(label)
        items.push({ label, insertText: label, kind, detail, range })
      }

      if (qualified) {
        const qualifier = qualified[1]
        const schema = context.schemas.find((entry) => entry.schema === qualifier)
        if (schema) schema.tables.forEach((table) => add(table, monaco.languages.CompletionItemKind.Class, 'table'))
        for (const ref of refs.filter((item) => item.table === qualifier || item.alias === qualifier)) {
          for (const column of context.columns[key(ref.schema, ref.table)] ?? []) add(column.name, monaco.languages.CompletionItemKind.Field, column.type)
        }
        return { suggestions: items }
      }

      if (/\b(?:FROM|JOIN|UPDATE|INTO)\s+[\w$]*$/i.test(before)) {
        context.schemas.forEach(({ schema, tables }) => tables.forEach((table) => add(table, monaco.languages.CompletionItemKind.Class, `table (${schema})`)))
      } else {
        for (const ref of refs) {
          for (const column of context.columns[key(ref.schema, ref.table)] ?? []) add(column.name, monaco.languages.CompletionItemKind.Field, `${ref.schema}.${ref.table}`)
        }
        context.schemas.forEach(({ schema, tables }) => tables.forEach((table) => add(`${schema}.${table}`, monaco.languages.CompletionItemKind.Class, 'table')))
        keywords.forEach((keyword) => add(keyword, monaco.languages.CompletionItemKind.Keyword, 'SQL keyword'))
      }
      return { suggestions: items }
    }
  })
  monaco.languages.registerInlineCompletionsProvider(languages, {
    provideInlineCompletions(model, position) {
      const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
      const after = model.getLineContent(position.lineNumber).slice(position.column - 1)
      if (/^[A-Za-z0-9_$]/.test(after)) return { items: [] }
      const match = before.match(/([A-Za-z_][A-Za-z0-9_]*)$/)
      if (!match || match[1].length < 2) return { items: [] }
      const typed = match[1]
      const keyword = keywords.find((item) => item.startsWith(typed.toUpperCase()) && item.length > typed.length)
      if (!keyword) return { items: [] }
      const remainder = keyword.slice(typed.length)
      return {
        items: [{
          insertText: typed === typed.toLowerCase() ? remainder.toLowerCase() : remainder,
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
        }]
      }
    },
    disposeInlineCompletions() {}
  })
}
