import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { postgis } from '@electric-sql/pglite-postgis'
import { setupSchema } from '../src/pglite.js'
import type { ColumnDef } from '../src/schema.js'

const BASE_COLS: ColumnDef[] = [
  { name: 'id',         pg_type: 'uuid',        role: 'id',         nullable: false },
  { name: 'geom',       pg_type: 'geometry',    role: 'geom',       nullable: false },
  { name: 'properties', pg_type: 'jsonb',       role: 'properties', nullable: true  },
  { name: 'updated_at', pg_type: 'timestamptz', role: 'updated_at', nullable: false },
]

const EXTENDED_COLS: ColumnDef[] = [
  ...BASE_COLS,
  { name: 'name', pg_type: 'text', role: 'data', nullable: true },
]

async function makeDb() {
  const db = new PGlite({ extensions: { postgis } })
  await db.exec('CREATE EXTENSION IF NOT EXISTS postgis')
  return db
}

describe('setupSchema return type', () => {
  it('returns { wiped: true, prevColumns: null } on first visit', async () => {
    const db = await makeDb()
    const result = await setupSchema(db, 'features', BASE_COLS)
    expect(result.wiped).toBe(true)
    expect(result.prevColumns).toBeNull()
  })

  it('returns { wiped: false, prevColumns: null } when schema is current', async () => {
    const db = await makeDb()
    await setupSchema(db, 'features', BASE_COLS)
    const result = await setupSchema(db, 'features', BASE_COLS)
    expect(result.wiped).toBe(false)
    expect(result.prevColumns).toBeNull()
  })

  it('returns { wiped: true, prevColumns: BASE_COLS } when schema changes', async () => {
    const db = await makeDb()
    await setupSchema(db, 'features', BASE_COLS)
    const result = await setupSchema(db, 'features', EXTENDED_COLS)
    expect(result.wiped).toBe(true)
    expect(result.prevColumns).toEqual(BASE_COLS)
  })
})
