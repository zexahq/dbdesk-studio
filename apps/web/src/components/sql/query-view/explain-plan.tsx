import type { QueryResult } from '@common/types'

type PlanNode = Record<string, unknown> & { Plans?: PlanNode[] }

type ExecutionPlan = {
  root: PlanNode
  planningTime?: number
  executionTime?: number
  raw: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const formatNumber = (value: unknown) => {
  const number = asNumber(value)
  return number === undefined ? undefined : new Intl.NumberFormat().format(number)
}

const formatMilliseconds = (value: unknown) => {
  const number = asNumber(value)
  return number === undefined ? undefined : `${number.toFixed(2)} ms`
}

/** Decode PostgreSQL's single-row result from EXPLAIN (FORMAT JSON). */
export function getExecutionPlan(result?: QueryResult): ExecutionPlan | undefined {
  const row = result?.rows[0]
  if (!row) return undefined

  const value = row['QUERY PLAN'] ?? row['query plan'] ?? Object.values(row)[0]
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return undefined
    }
  }

  const summary = Array.isArray(parsed) ? parsed[0] : parsed
  if (!isRecord(summary) || !isRecord(summary.Plan)) return undefined

  return {
    root: summary.Plan as PlanNode,
    planningTime: asNumber(summary['Planning Time']),
    executionTime: asNumber(summary['Execution Time']),
    raw: parsed
  }
}

function Metric({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <span className="text-xs text-muted-foreground">
      {label}: <span className="font-mono text-foreground">{value}</span>
    </span>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex min-h-28 flex-col justify-between rounded-md border bg-background px-4 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="my-1.5 font-medium tabular-nums">{value}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  )
}

const operationDescriptions: Record<string, (relation?: string, index?: string) => string> = {
  Result: () => 'Produces a computed value without reading a table.',
  'Seq Scan': (relation) => `Reads every row in ${relation ?? 'a table'} and filters matches.`,
  'Index Scan': (relation, index) => `Finds matching rows in ${relation ?? 'a table'}${index ? ` through ${index}` : ' through an index'}.`,
  'Index Only Scan': (relation, index) => `Reads matching values from ${index ?? 'an index'} without visiting most ${relation ?? 'table'} rows.`,
  'Bitmap Heap Scan': (relation) => `Fetches matching ${relation ?? 'table'} rows found by a bitmap index lookup.`,
  'Bitmap Index Scan': (_relation, index) => `Builds a set of matching row locations from ${index ?? 'an index'}.`,
  'Nested Loop': () => 'Combines each row from one input with matching rows from another input.',
  'Hash Join': () => 'Builds an in-memory hash table to join two inputs.',
  'Merge Join': () => 'Joins two already-sorted inputs by walking them together.',
  Aggregate: () => 'Groups or summarizes rows into aggregate values.',
  Sort: () => 'Sorts rows before passing them to the next step.',
  Limit: () => 'Stops after the requested number of rows.',
  'CTE Scan': () => 'Reads rows produced by a common table expression.',
  'Subquery Scan': () => 'Reads rows produced by a nested query.'
}

const describeOperation = (nodeType: string, relation?: string, index?: string) =>
  operationDescriptions[nodeType]?.(relation, index) ?? 'Passes rows to the next operation in the plan.'

function PlanTreeNode({ node, depth = 0 }: { node: PlanNode; depth?: number }) {
  const nodeType = typeof node['Node Type'] === 'string' ? node['Node Type'] : 'Plan node'
  const relation = typeof node['Relation Name'] === 'string' ? node['Relation Name'] : undefined
  const index = typeof node['Index Name'] === 'string' ? node['Index Name'] : undefined
  const filter = typeof node.Filter === 'string' ? node.Filter : undefined
  const actualRows = formatNumber(node['Actual Rows'])
  const estimatedRows = formatNumber(node['Plan Rows'])
  const actualTime = formatMilliseconds(node['Actual Total Time'])
  const loops = formatNumber(node['Actual Loops'])
  const sharedHits = formatNumber(node['Shared Hit Blocks'])
  const sharedReads = formatNumber(node['Shared Read Blocks'])
  const children = Array.isArray(node.Plans) ? node.Plans.filter(isRecord) as PlanNode[] : []

  return (
    <div className={depth > 0 ? 'ml-5 border-l border-border pl-5' : ''}>
      <div className="rounded-lg border bg-muted/30 p-5 flex flex-col gap-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
          <span className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Step {depth + 1}</span>
          <span className="font-medium">{nodeType}</span>
          {relation && <span className="font-mono text-sm text-muted-foreground">on {relation}</span>}
          {index && <span className="font-mono text-xs text-muted-foreground">using {index}</span>}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{describeOperation(nodeType, relation, index)}</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Actual rows" value={actualRows ?? '—'} hint={loops ? `across ${loops} loop${loops === '1' ? '' : 's'}` : 'rows returned by this step'} />
          <Stat label="Estimated rows" value={estimatedRows ?? '—'} hint="PostgreSQL’s prediction" />
          <Stat label="Time in this step" value={actualTime ?? '—'} hint="measured while running" />
          <Stat
            label="Data pages"
            value={sharedHits || sharedReads ? `${sharedHits ?? 0} cached · ${sharedReads ?? 0} read` : '—'}
            hint="cache hits · disk reads"
          />
        </div>
        {filter && <p className="break-all rounded-md border bg-background px-4 py-3 font-mono text-xs leading-relaxed text-muted-foreground">Filter: {filter}</p>}
        <details className="rounded-md border bg-background px-4 py-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1">Technical details</summary>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t pt-4">
            <Metric
              label="planner cost"
              value={
                asNumber(node['Startup Cost']) !== undefined && asNumber(node['Total Cost']) !== undefined
                  ? `${asNumber(node['Startup Cost'])}..${asNumber(node['Total Cost'])}`
                  : undefined
              }
            />
            <Metric label="loops" value={loops} />
          </div>
        </details>
      </div>
      {children.length > 0 && (
        <div className="mt-5 space-y-5">
          {children.map((child, index) => <PlanTreeNode key={index} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  )
}

export function ExplainPlan({ result }: { result?: QueryResult }) {
  const plan = getExecutionPlan(result)
  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center text-center text-muted-foreground">
        <p>Unable to read the PostgreSQL execution plan.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-auto p-6">
      <div className="rounded-lg border bg-muted/20 p-6">
        <h2 className="font-semibold leading-tight">How PostgreSQL ran this query</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          These are measurements from one read-only execution. Start at the top, then follow the nested input steps below.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Planning time" value={formatMilliseconds(plan.planningTime) ?? '—'} hint="time spent choosing a plan" />
          <Stat label="Execution time" value={formatMilliseconds(plan.executionTime) ?? '—'} hint="time spent running the plan" />
          <Stat label="Final rows" value={formatNumber(plan.root['Actual Rows']) ?? '—'} hint="rows returned by the top step" />
        </div>
      </div>
      <PlanTreeNode node={plan.root} />
      <details className="w-full rounded-lg border bg-muted/20 px-5 py-4">
        <summary className="cursor-pointer py-1 text-sm text-muted-foreground">Developer details: raw PostgreSQL JSON</summary>
        <pre className="mt-5 overflow-auto border-t pt-5 text-xs">{JSON.stringify(plan.raw, null, 2)}</pre>
      </details>
    </div>
  )
}
