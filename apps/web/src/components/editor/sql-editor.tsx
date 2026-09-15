import type { ColumnInfo, SQLDatabaseType, SchemaWithTables } from '@common/types'
import Editor from '@monaco-editor/react'
import { useTheme } from '@/hooks/use-theme'
import type { editor } from 'monaco-editor'
import { KeyCode, KeyMod } from 'monaco-editor'
import { LanguageIdEnum } from 'monaco-sql-languages/esm/common/constants.js'
// Studio currently exposes PostgreSQL connections. Loading its contribution
// directly avoids bundling optional Flink, Hive, Spark, Trino, and MySQL modes.
import 'monaco-sql-languages/esm/languages/pgsql/pgsql.contribution.js'
import { format } from 'sql-formatter'
import { registerSqlFeatures, setSqlCompletionContext } from '@/lib/monaco/sql-features'
import { useEffect, useRef } from 'react'

interface SqlEditorProps {
  tabId: string
  value: string
  onChange: (value: string) => void
  language: SQLDatabaseType
  onExecute?: (cursorLine?: number) => void
  readOnly?: boolean
  schemasWithTables?: SchemaWithTables[]
  tableColumns?: Record<string, ColumnInfo[]>
}

const getLanguageId = (type: SQLDatabaseType): LanguageIdEnum => {
  return type === 'postgres' ? LanguageIdEnum.PG : LanguageIdEnum.PG
}

export default function SqlEditor({
  tabId,
  value,
  onChange,
  language,
  onExecute,
  readOnly,
  schemasWithTables = [],
  tableColumns = {}
}: SqlEditorProps) {
  const { theme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const onExecuteRef = useRef(onExecute)
  const resizeFrameRef = useRef<number | null>(null)

  const editorTheme = theme === 'dark' ? 'vs-dark' : 'vs'
  const languageId = getLanguageId(language)

  useEffect(() => {
    setSqlCompletionContext({ schemas: schemasWithTables, columns: tableColumns })
    registerSqlFeatures()
  }, [schemasWithTables, tableColumns])

  // Keep onExecute ref updated
  useEffect(() => {
    onExecuteRef.current = onExecute
  }, [onExecute])

  const layoutEditor = () => {
    const container = containerRef.current
    const editor = editorRef.current
    // Lazy loading can resolve while the resizable panel is still measuring
    // at 0px. Never persist that transient size or the editor becomes an
    // invisible, unfocusable surface.
    if (!container || !editor || container.clientWidth === 0 || container.clientHeight === 0) {
      return
    }

    editor.layout({ width: container.clientWidth, height: container.clientHeight })
  }

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current)
      resizeFrameRef.current = requestAnimationFrame(layoutEditor)
    })
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    layoutEditor()

    return () => {
      resizeObserver.disconnect()
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current)
    }
  }, [])

  const handleEditorDidMount = (editorInstance: editor.IStandaloneCodeEditor) => {
    editorRef.current = editorInstance
    requestAnimationFrame(layoutEditor)

    // Register Ctrl+Enter keybinding for query execution
    editorInstance.addAction({
      id: 'execute-query',
      label: 'Execute Query',
      keybindings: [KeyMod.CtrlCmd | KeyCode.Enter],
      run: (instance) => {
        onExecuteRef.current?.(instance.getPosition()?.lineNumber)
      }
    })
    editorInstance.addAction({
      id: 'format-sql',
      label: 'Format SQL',
      keybindings: [KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF],
      run: (instance) => {
        const model = instance.getModel()
        if (!model || readOnly) return
        try {
          const formatted = format(model.getValue(), {
            language: language === 'postgres' ? 'postgresql' : 'mysql',
            keywordCase: 'upper',
            indentStyle: 'standard'
          })
          instance.executeEdits('format-sql', [{ range: model.getFullModelRange(), text: formatted }])
          onChange(formatted)
        } catch {
          // Keep the original SQL if the formatter cannot parse an incomplete query.
        }
      }
    })
  }

  return (
    <div ref={containerRef} className="h-full min-h-0 w-full">
      <Editor
        height="100%"
        path={tabId}
        language={languageId}
        theme={editorTheme}
        value={value}
        onChange={(val) => onChange(val ?? '')}
        onMount={handleEditorDidMount}
        options={{
          readOnly,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          smoothScrolling: false,
          automaticLayout: false,
          wordBasedSuggestions: 'off',
          quickSuggestions: { other: true, comments: false, strings: false },
          suggestSelection: 'first',
          snippetSuggestions: 'bottom',
          inlineSuggest: { enabled: true },
          suggestOnTriggerCharacters: true,
          folding: false,
          stickyScroll: { enabled: false },
          renderWhitespace: 'selection',
          tabSize: 2,
          bracketPairColorization: { enabled: false }
        }}
      />
    </div>
  )
}
