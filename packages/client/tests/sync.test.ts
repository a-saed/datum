// packages/client/tests/sync.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { bootLocalDb } from '../src/pglite.js'
import { drainOutbox, applyDelta } from '../src/sync.js'
import type { DeltaMessage } from '../src/types.js'

let db: PGlite

beforeEach(async () => {
  db = await bootLocalDb()
})

describe('drainOutbox', () => {
  it('returns pending writes and marks them synced', async () => {
    await db.query(
      `INSERT INTO features (id, geom, properties, updated_at)
       VALUES (
         '00000000-0000-0000-0000-000000000001',
         ST_SetSRID(ST_MakePoint(10, 20), 4326),
         '{"name":"test"}',
         '2026-01-01T00:00:00Z'
       )`
    )

    const edits = await drainOutbox(db)

    expect(edits).toHaveLength(1)
    expect(edits[0].op).toBe('insert')
    expect(edits[0].feature_id).toBe('00000000-0000-0000-0000-000000000001')

    const remaining = await db.query<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM _datum_outbox WHERE synced = false`
    )
    expect(String(remaining.rows[0].count)).toBe('0')
  })
})

describe('applyDelta', () => {
  it('inserts a new feature from a delta', async () => {
    const delta: DeltaMessage = {
      type: 'delta',
      op: 'insert',
      origin_client_id: 'other-client',
      feature: {
        id: '00000000-0000-0000-0000-000000000002',
        geom: '{"type":"Point","coordinates":[5,10]}',
        properties: { name: 'remote' },
        updated_at: '2026-01-02T00:00:00Z',
      },
    }

    await applyDelta(db, delta)

    const res = await db.query<{ id: string }>(
      `SELECT id::text FROM features WHERE id = '00000000-0000-0000-0000-000000000002'`
    )
    expect(res.rows).toHaveLength(1)
  })

  it('does not write to outbox when applying a remote delta', async () => {
    const delta: DeltaMessage = {
      type: 'delta',
      op: 'insert',
      origin_client_id: 'other-client',
      feature: {
        id: '00000000-0000-0000-0000-000000000003',
        geom: '{"type":"Point","coordinates":[5,10]}',
        properties: {},
        updated_at: '2026-01-02T00:00:00Z',
      },
    }

    await applyDelta(db, delta)

    const res = await db.query<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM _datum_outbox`
    )
    expect(String(res.rows[0].count)).toBe('0')
  })
})
