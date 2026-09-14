import type { QueryBatchResult, QueryResult } from '@common/types'
import { Button } from '@/components/ui/button'
import { cleanErrorMessage } from '@/lib/utils'
import { LoaderCircle, Play, Square } from 'lucide-react'
import { SimpleTable } from './simple-table'

interface QueryResultsProps {
  queryResults?: QueryResult
  batchResults?: QueryBatchResult[]
  activeResultIndex?: number
  isLoading?: boolean
  error?: Error | null
  onRun: () => void
  onCancel?: () => void
  onResultSelect?: (index: number) => void
}

export function QueryResults({
  queryResults,
  batchResults,
  activeResultIndex = 0,
  isLoading,
  error,
  onRun,
  onCancel,
  onResultSelect
}: QueryResultsProps) {
  const batchResult = batchResults?.[activeResultIndex]
  const displayedResult = batchResult?.result ?? queryResults
  const displayedError = batchResult?.error ? new Error(batchResult.error) : error
  return (
    <div className="flex h-full w-full flex-col border-t">
      <div className="flex items-center justify-end border-b p-2">
        {isLoading ? (
          <Button size="sm" variant="destructive" className="h-8 text-xs cursor-pointer" onClick={onCancel}>
            <Square className="size-3 fill-current" />
            CANCEL
          </Button>
        ) : (
          <Button size="sm" className="h-8 text-xs cursor-pointer" onClick={onRun}>
            <Play className="size-4" />
            RUN
          </Button>
        )}
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        {batchResults && batchResults.length > 1 && (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b p-1">
            {batchResults.map((result, index) => (
              <Button
                key={`${index}-${result.query}`}
                variant={index === activeResultIndex ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 max-w-56 truncate text-xs"
                onClick={() => onResultSelect?.(index)}
              >
                {index + 1}. {result.query.split(/\s+/).slice(0, 4).join(' ')}
              </Button>
            ))}
          </div>
        )}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {isLoading ? (
          <div className="flex w-full items-center justify-center text-center text-muted-foreground">
            <div>
              <LoaderCircle className="mx-auto mb-2 size-6 animate-spin" />
              <p className="text-lg font-medium">Executing query...</p>
              <p className="text-sm">Please wait</p>
            </div>
          </div>
        ) : displayedError ? (
          <div className="flex w-full items-center justify-center text-center text-destructive">
            <p>Error: {cleanErrorMessage(displayedError.message)}</p>
          </div>
          ) : displayedResult ? (
          <div className="w-full h-full">
            {displayedResult.totalRowCount !== undefined ? (
              <SimpleTable columns={displayedResult.columns} data={displayedResult.rows} />
            ) : (
              <div className="flex p-2 w-full items-center text-center text-muted-foreground">
                <p>Statement executed successfully</p>
              </div>
            )}
          </div>
          ) : (
          <div className="flex w-full items-center justify-center text-center text-muted-foreground">
            <div>
              <p className="text-lg font-medium">Query Results</p>
              <p className="text-sm">Execute a query to see results here</p>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
