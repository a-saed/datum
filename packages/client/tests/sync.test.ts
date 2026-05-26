// packages/client/tests/sync.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { postgis } from '@electric-sql/pglite-postgis'
import { setupSchema } from '../src/pglite.js'
import { drainOutbox, applyDelta, markSynced } from '../src/sync.js'
import type { DeltaMessage } from '../src/types.js'

let db: PGlite

beforeEach(async () => {
  db = new PGlite({ extensions: { postgis } })
  await db.exec('CREATE EXTENSION IF NOT EXISTS postgis')
  await setupSchema(db)
})

describe('drainOutbox', () => {
  it('returns pending writes without marking them synced', async () => {
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

    // drainOutbox no longer marks rows synced — they must still be pending
    const stillPending = await db.query<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM _datum_outbox WHERE synced = false`
    )
    expect(String(stillPending.rows[0].count)).toBe('1')
  })

  it('marks rows synced after markSynced is called', async () => {
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

    await markSynced(db, edits.map(e => e.write_id))

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

describe('since timestamp derivation', () => {
  it('MAX(updated_at) returns epoch string when table is empty', async () => {
    const { rows } = await db.query<{ since: string }>(
      `SELECT COALESCE(MAX(updated_at)::text, '1970-01-01T00:00:00Z') AS since FROM features`
    )
    expect(rows[0].since).toBe('1970-01-01T00:00:00Z')
  })

  it('MAX(updated_at) returns latest timestamp when features exist', async () => {
    await db.exec(`ALTER TABLE features DISABLE TRIGGER datum_capture_changes`)
    await db.query(
      `INSERT INTO features (geom, properties, updated_at)
       VALUES (ST_SetSRID(ST_MakePoint(0,0),4326), '{}', '2026-05-01T12:00:00Z'::timestamptz)`
    )
    await db.exec(`ALTER TABLE features ENABLE TRIGGER datum_capture_changes`)

    const { rows } = await db.query<{ since: string }>(
      `SELECT COALESCE(MAX(updated_at)::text, '1970-01-01T00:00:00Z') AS since FROM features`
    )
    expect(rows[0].since).toContain('2026-05-01')
  })
})
