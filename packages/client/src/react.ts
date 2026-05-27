import { useState, useEffect } from 'react'
import type { DatumClient } from './client.js'

export function useDatum<T = Record<string, unknown>>(
  client: DatumClient | null,
  sql: string,
  params?: unknown[]
): { rows: T[]; loading: boolean; error: Error | null } {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const serialisedParams = JSON.stringify(params)

  useEffect(() => {
    if (!client) return

    let cancelled = false

    const run = async () => {
      try {
        const result = await client.query<T>(sql, params)
        if (!cancelled) {
          setRows(result.rows)
          setLoading(false)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setLoading(false)
        }
      }
    }

    void run()
    const unsubscribe = client.onChange(() => { void run() })

    return () => {
      cancelled = true
      unsubscribe()
    }
  // params array identity changes every render — compare by value instead
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, sql, serialisedParams])

  return { rows, loading, error }
}
