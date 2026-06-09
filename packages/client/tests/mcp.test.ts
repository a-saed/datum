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
    expect(result.rowCount).toBe(1)
    expect(typeof result.duration_ms).toBe('number')
  })

  it('rejects mutations when allowWrites is false', async () => {
    const client = makeClient()
    await expect(
      handleQuery(client, 'INSERT INTO features (name) VALUES ($1)', ['x'], false)
    ).rejects.toThrow('Write operations are disabled')
  })

  it('allows mutations when allowWrites is true', async () => {
    const client = makeClient({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    })
    const result = await handleQuery(client, 'INSERT INTO features (name) VALUES ($1)', ['x'], true)
    expect(result.rows).toEqual([])
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
})
