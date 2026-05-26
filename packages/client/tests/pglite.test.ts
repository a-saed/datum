// packages/client/tests/pglite.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { postgis } from '@electric-sql/pglite-postgis'

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
