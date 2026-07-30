import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import type { DatumClient } from '../client.js'

export interface McpOptions {
  allowWrites?: boolean
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')          // strip -- line comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ')  // strip /* */ block comments (non-nested)
}

function hasUnquotedInto(sql: string): boolean {
  // Split on single quotes; even-indexed segments are outside quotes
  const segments = sql.split("'")
  for (let i = 0; i < segments.length; i += 2) {
    if (/\bINTO\b/i.test(segments[i]!)) return true
  }
  return false
}

function isReadOnlySql(sql: string): boolean {
  const s = stripSqlComments(sql).trimStart()
  if (!/^(SELECT|EXPLAIN)\b/i.test(s)) return false
  if (/^EXPLAIN\s*\(/i.test(s)) return false   // parenthesized EXPLAIN may include ANALYZE
  if (/^EXPLAIN\s+ANALYZE\b/i.test(s)) return false   // EXPLAIN ANALYZE executes DML
  if (/^SELECT\b/i.test(s) && hasUnquotedInto(s)) return false  // SELECT INTO creates a table
  return true
}

export async function handleQuery(
  client: DatumClient,
  sql: string,
  params: unknown[] | undefined,
  allowWrites: boolean,
  maxRows: number = 1000,
): Promise<{
  rows: Record<string, unknown>[]
  row_count: number
  duration_ms: number
  truncated?: boolean
  total_row_count?: number
}> {
  if (!allowWrites && !isReadOnlySql(sql)) {
    throw new Error('Write operations are disabled. Only SELECT and EXPLAIN (without ANALYZE) are permitted. Start the MCP server with --allow-writes to enable writes.')
  }
  const start = Date.now()
  const result = await client.query<Record<string, unknown>>(sql, params)
  const totalRows = result.rows.length
  const rows = totalRows > maxRows ? result.rows.slice(0, maxRows) : result.rows
  const response: {
    rows: Record<string, unknown>[]
    row_count: number
    duration_ms: number
    truncated?: boolean
    total_row_count?: number
  } = {
    rows,
    row_count: rows.length,
    duration_ms: Date.now() - start,
  }
  if (totalRows > maxRows) {
    response.truncated = true
    response.total_row_count = totalRows
  }
  return response
}

export function handleGetSchema(client: DatumClient): {
  table: string
  columns: { name: string; pg_type: string; role: string; nullable: boolean }[]
} {
  return {
    table: client.tableName,
    columns: (client.columns ?? []).map(col => ({
      name: col.name,
      pg_type: col.pg_type,
      role: col.role,
      nullable: col.nullable,
    })),
  }
}

export async function handleGetStatus(client: DatumClient): Promise<{
  connection: string
  table: string
  pending_writes: number
  row_count: number
}> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM "${client.tableName}"`
  )
  return {
    connection: client.connectionStatus,
    table: client.tableName,
    pending_writes: client.pendingCount,
    row_count: parseInt(result.rows[0]?.count ?? '0', 10),
  }
}

export async function initDatumMcp(client: DatumClient, opts: McpOptions = {}): Promise<void> {
  const allowWrites = opts.allowWrites ?? false

  const server = new McpServer({ name: 'datum', version: '0.13.0' /* keep in sync with package.json */ })

  server.tool(
    'query',
    `Run SQL against the local PGlite database synced from datum-server. Full PostGIS available (ST_Distance, ST_Within, ST_DWithin, ST_AsGeoJSON, etc.). Table: ${client.tableName}.${allowWrites ? '' : ' Read-only: mutations are disabled.'}`,
    {
      sql:    z.string().describe('SQL query to execute'),
      params: z.array(z.unknown()).optional().describe('Positional parameters ($1, $2, …)'),
    },
    async ({ sql, params }) => {
      try {
        if (client.connectionStatus !== 'connected') {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'disconnected — reconnecting' }) }], isError: true }
        }
        const result = await handleQuery(client, sql, params, allowWrites)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${String(err)}` }], isError: true }
      }
    },
  )

  server.tool(
    'get_schema',
    'Get the table schema: column names, PostgreSQL types, and datum roles (id, geom, updated_at, properties, data).',
    {},
    async () => {
      const result = handleGetSchema(client)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.tool(
    'get_status',
    'Get current sync status: WebSocket connection state, pending outbox writes, and total row count.',
    {},
    async () => {
      try {
        const result = await handleGetStatus(client)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${String(err)}` }], isError: true }
      }
    },
  )

  await server.connect(new StdioServerTransport())
}
