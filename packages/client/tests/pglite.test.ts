// packages/client/tests/pglite.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { postgis } from '@electric-sql/pglite-postgis'
import { setupSchema, SCHEMA_VERSION } from '../src/pglite.js'

let db: PGlite

beforeAll(async () => {
  db = new PGlite({ extensions: { postgis } })
  await db.exec('CREATE EXTENSION IF NOT EXISTS postgis')
})

describe('PostGIS WASM spike — required functions', () => {
  it('ST_GeomFromGeoJSON parses a point', async () => {
    const res = await db.query<{ g: string }>(
      `SELECT ST_AsText(ST_GeomFromGeoJSON($1)) AS g`,
      ['{"type":"Point","coordinates":[10,20]}']
    )
    expect(res.rows[0].g).toBe('POINT(10 20)')
  })

  it('ST_AsGeoJSON serializes a point', async () => {
    const res = await db.query<{ g: string }>(
      `SELECT ST_AsGeoJSON(ST_GeomFromText('POINT(10 20)', 4326)) AS g`
    )
    const parsed = JSON.parse(res.rows[0].g)
    expect(parsed.type).toBe('Point')
    expect(parsed.coordinates).toEqual([10, 20])
  })

  it('ST_MakeEnvelope creates a bbox', async () => {
    const res = await db.query<{ g: string }>(
      `SELECT ST_AsText(ST_MakeEnvelope(-1, -1, 1, 1, 4326)) AS g`
    )
    expect(res.rows[0].g).toContain('POLYGON')
  })

  it('ST_Intersects detects intersection', async () => {
    const res = await db.query<{ result: boolean }>(
      `SELECT ST_Intersects(
        ST_MakeEnvelope(-1,-1,1,1,4326),
        ST_GeomFromText('POINT(0 0)', 4326)
      ) AS result`
    )
    expect(res.rows[0].result).toBe(true)
  })

  it('ST_Intersects returns false for non-intersecting', async () => {
    const res = await db.query<{ result: boolean }>(
      `SELECT ST_Intersects(
        ST_MakeEnvelope(-1,-1,1,1,4326),
        ST_GeomFromText('POINT(5 5)', 4326)
      ) AS result`
    )
    expect(res.rows[0].result).toBe(false)
  })

  it('ST_IsValid validates geometry', async () => {
    const res = await db.query<{ result: boolean }>(
      `SELECT ST_IsValid(ST_GeomFromText('POINT(0 0)', 4326)) AS result`
    )
    expect(res.rows[0].result).toBe(true)
  })

  it('ST_SRID reads spatial reference id', async () => {
    const res = await db.query<{ result: number }>(
      `SELECT ST_SRID(ST_GeomFromText('POINT(0 0)', 4326)) AS result`
    )
    expect(res.rows[0].result).toBe(4326)
  })

  it('ST_SetSRID sets spatial reference id', async () => {
    const res = await db.query<{ result: number }>(
      `SELECT ST_SRID(ST_SetSRID(ST_MakePoint(0, 0), 4326)) AS result`
    )
    expect(res.rows[0].result).toBe(4326)
  })

  it('ST_Transform reprojects geometry', async () => {
    const res = await db.query<{ g: string }>(
      `SELECT ST_AsText(ST_Transform(ST_SetSRID(ST_MakePoint(0, 0), 4326), 3857)) AS g`
    )
    expect(res.rows[0].g).toContain('POINT')
  })
})

describe('setupSchema', () => {
  const makeDb = async () => {
    const d = new PGlite({ extensions: { postgis } })
    await d.exec('CREATE EXTENSION IF NOT EXISTS postgis')
    return d
  }

  it('first call creates tables and returns isFirstVisit=true', async () => {
    const d = await makeDb()
    const isFirstVisit = await setupSchema(d)
    expect(isFirstVisit).toBe(true)
    const { rows } = await d.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM features`
    )
    expect(rows[0].count).toBe(0)
  })

  it('returns isFirstVisit=false when features exist', async () => {
    const d = await makeDb()
    await setupSchema(d)
    await d.query(
      `INSERT INTO features (geom, properties, updated_at)
       VALUES (ST_SetSRID(ST_MakePoint(10, 20), 4326), '{}', now())`
    )
    const isFirstVisit = await setupSchema(d)
    expect(isFirstVisit).toBe(false)
  })

  it('schema version mismatch wipes tables and returns isFirstVisit=true', async () => {
    const d = await makeDb()
    await setupSchema(d)
    // Insert a feature then corrupt the schema version
    await d.query(
      `INSERT INTO features (geom, properties, updated_at)
       VALUES (ST_SetSRID(ST_MakePoint(10, 20), 4326), '{}', now())`
    )
    await d.exec(`UPDATE _datum_meta SET value = '0' WHERE key = 'schema_version'`)
    // Re-run setup — should wipe features
    const isFirstVisit = await setupSchema(d)
    expect(isFirstVisit).toBe(true)
    const { rows } = await d.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM features`
    )
    expect(rows[0].count).toBe(0)
  })

  it('sets schema_version in _datum_meta', async () => {
    const d = await makeDb()
    await setupSchema(d)
    const { rows } = await d.query<{ value: string }>(
      `SELECT value FROM _datum_meta WHERE key = 'schema_version'`
    )
    expect(rows[0].value).toBe(SCHEMA_VERSION)
  })

  it('trigger writes to outbox on INSERT', async () => {
    const d = await makeDb()
    await setupSchema(d)
    await d.query(
      `INSERT INTO features (id, geom, properties, updated_at)
       VALUES (gen_random_uuid(), ST_SetSRID(ST_MakePoint(10, 20), 4326), '{"name":"test"}', now())`
    )
    const { rows } = await d.query<{ op: string }>(`SELECT op FROM _datum_outbox LIMIT 1`)
    expect(rows[0].op).toBe('insert')
  })
})
