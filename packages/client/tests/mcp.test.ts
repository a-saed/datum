import { describe, it, expect, vi } from 'vitest'
import { handleQuery, handleGetSchema, handleGetStatus } from '../src/mcp/index.js'
import type { DatumClient } from '../src/client.js'

function makeClient(overrides: Record<string, unknown> = {}): DatumClient {
  return {
    tableName: 'features',
    columns: [
      { name: 'id',         pg_type: 'uuid',        role: 'id',         nullable: false },
      { name: 'geom',       pg_type: 'geometry',    role: 'geom',       nullable: false },
      { name: 'name',       pg_type: 'text',        role: 'data',       nullable: true  },
      { name: 'updated_at', pg_type: 'timestamptz', role: 'updated_at', nullable: false },
    ],
    connectionStatus: 'connected',
    pendingCount: 2,
    query: vi.fn().mockResolvedValue({ rows: [{ count: '42' }] }),
    ...overrides,
  } as unknown as DatumClient
}

describe('handleQuery', () => {
  it('returns rows for a SELECT query', async () => {
    const client = makeClient({
      query: vi.fn().mockResolvedValue({ rows: [{ name: 'Tower Bridge' }] }),
    })
    const result = await handleQuery(client, 'SELECT name FROM features', undefined, false)
    expect(result.rows).toEqual([{ name: 'Tower Bridge' }])
    expect(result.row_count).toBe(1)
    expect(typeof result.duration_ms).toBe('number')
  })

  it('rejects mutations when allowWrites is false', async () => {
    const client = makeClient()
    await expect(
      handleQuery(client, 'INSERT INTO features (name) VALUES ($1)', ['x'], false)
    ).rejects.toThrow('Write operations are disabled')
  })

  it.each([
    ['DELETE', 'WITH x AS (DELETE FROM features) SELECT 1'],
    ['INSERT', 'WITH x AS (INSERT INTO features (name) VALUES ($1)) SELECT 1'],
    ['UPDATE', 'WITH x AS (UPDATE features SET name=$1) SELECT 1'],
  ])('rejects CTE wrapping %s when allowWrites is false', async (_verb, sql) => {
    const client = makeClient()
    await expect(
      handleQuery(client, sql, undefined, false)
    ).rejects.toThrow('Write operations are disabled')
  })

  it.each([
    ['EXPLAIN ANALYZE', 'EXPLAIN ANALYZE DELETE FROM features'],
    ['SELECT INTO',     'SELECT * INTO new_table FROM features'],
  ])('rejects %s when allowWrites is false', async (_label, sql) => {
    const client = makeClient()
    await expect(
      handleQuery(client, sql, undefined, false)
    ).rejects.toThrow('Write operations are disabled')
  })

  it('rejects EXPLAIN (ANALYZE) when allowWrites is false', async () => {
    const client = makeClient()
    await expect(
      handleQuery(client, 'EXPLAIN (ANALYZE) DELETE FROM features', undefined, false)
    ).rejects.toThrow('Write operations are disabled')
  })

  it('rejects EXPLAIN ANALYZE with block comment injection when allowWrites is false', async () => {
    const client = makeClient()
    await expect(
      handleQuery(client, 'EXPLAIN /* x */ ANALYZE DELETE FROM features', undefined, false)
    ).rejects.toThrow('Write operations are disabled')
  })

  it('rejects EXPLAIN ANALYZE with line comment injection when allowWrites is false', async () => {
    const client = makeClient()
    await expect(
      handleQuery(client, 'EXPLAIN --note\nANALYZE DELETE FROM features', undefined, false)
    ).rejects.toThrow('Write operations are disabled')
  })

  it('allows SELECT with "into" in a string literal', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [{ name: 'fall into' }] })
    const client = makeClient({ query: mockQuery })
    const result = await handleQuery(client, "SELECT name FROM features WHERE name = 'fall into'", undefined, false)
    expect(result.rows).toEqual([{ name: 'fall into' }])
  })

  it('passes sql and params to client.query', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] })
    const client = makeClient({ query: mockQuery })
    await handleQuery(client, 'SELECT $1::text', ['hello'], false)
    expect(mockQuery).toHaveBeenCalledWith('SELECT $1::text', ['hello'])
  })

  it('allows mutations when allowWrites is true', async () => {
    const client = makeClient({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    })
    const result = await handleQuery(client, 'INSERT INTO features (name) VALUES ($1)', ['x'], true)
    expect(result.rows).toEqual([])
  })

  it('returns rows without truncation fields when under maxRows', async () => {
    const client = makeClient({
      query: vi.fn().mockResolvedValue({ rows: [{ name: 'a' }, { name: 'b' }] }),
    })
    const result = await handleQuery(client, 'SELECT name FROM features', undefined, false, 10)
    expect(result.rows).toHaveLength(2)
    expect(result.row_count).toBe(2)
    expect(result).not.toHaveProperty('truncated')
    expect(result).not.toHaveProperty('total_row_count')
  })

  it('truncates rows and reports total_row_count when over maxRows', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }))
    const client = makeClient({ query: vi.fn().mockResolvedValue({ rows }) })
    const result = await handleQuery(client, 'SELECT id FROM features', undefined, false, 2)
    expect(result.rows).toEqual([{ id: 0 }, { id: 1 }])
    expect(result.row_count).toBe(2)
    expect(result.truncated).toBe(true)
    expect(result.total_row_count).toBe(5)
  })

  it('defaults maxRows to 1000 when not provided', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ id: i }))
    const client = makeClient({ query: vi.fn().mockResolvedValue({ rows }) })
    const result = await handleQuery(client, 'SELECT id FROM features', undefined, false)
    expect(result.rows).toHaveLength(1000)
    expect(result.truncated).toBe(true)
    expect(result.total_row_count).toBe(1001)
  })
})

describe('handleGetSchema', () => {
  it('returns table name and all columns', () => {
    const client = makeClient()
    const result = handleGetSchema(client)
    expect(result.table).toBe('features')
    expect(result.columns).toHaveLength(4)
    expect(result.columns[0]).toEqual({ name: 'id', pg_type: 'uuid', role: 'id', nullable: false })
  })

  it('returns empty columns array when client.columns is null', () => {
    const client = makeClient({ columns: null })
    const result = handleGetSchema(client)
    expect(result.columns).toEqual([])
  })
})

describe('handleGetStatus', () => {
  it('returns connection state, pending writes, and row count', async () => {
    const client = makeClient()
    const result = await handleGetStatus(client)
    expect(result.connection).toBe('connected')
    expect(result.table).toBe('features')
    expect(result.pending_writes).toBe(2)
    expect(result.row_count).toBe(42)
  })

  it('propagates query errors', async () => {
    const client = makeClient({ query: vi.fn().mockRejectedValue(new Error('DB error')) })
    await expect(handleGetStatus(client)).rejects.toThrow('DB error')
  })
})
