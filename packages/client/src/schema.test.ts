// packages/client/src/schema.test.ts
import { describe, it, expect } from 'vitest'
import {
  pgTypeToDDL,
  hashSchema,
  colByRole,
  dataColumns,
  type ColumnDef,
} from './schema.js'

const BASE_COLS: ColumnDef[] = [
  { name: 'id',         pg_type: 'uuid',        role: 'id',         nullable: false },
  { name: 'geom',       pg_type: 'geometry',    role: 'geom',       nullable: false },
  { name: 'updated_at', pg_type: 'timestamptz', role: 'updated_at', nullable: false },
  { name: 'name',       pg_type: 'text',        role: 'data',       nullable: true  },
  { name: 'height',     pg_type: 'float8',      role: 'data',       nullable: true  },
  { name: 'properties', pg_type: 'jsonb',       role: 'properties', nullable: true  },
]

describe('pgTypeToDDL', () => {
  it('maps known types', () => {
    expect(pgTypeToDDL('uuid')).toBe('UUID')
    expect(pgTypeToDDL('geometry')).toBe('GEOMETRY(Geometry, 4326)')
    expect(pgTypeToDDL('jsonb')).toBe('JSONB')
    expect(pgTypeToDDL('timestamptz')).toBe('TIMESTAMPTZ')
    expect(pgTypeToDDL('float8')).toBe('DOUBLE PRECISION')
    expect(pgTypeToDDL('int8')).toBe('BIGINT')
    expect(pgTypeToDDL('bool')).toBe('BOOLEAN')
    expect(pgTypeToDDL('date')).toBe('DATE')
    expect(pgTypeToDDL('text')).toBe('TEXT')
    expect(pgTypeToDDL('unknown')).toBe('TEXT') // fallback
  })
})

describe('hashSchema', () => {
  it('returns a non-empty string', () => {
    expect(hashSchema(BASE_COLS)).toBeTruthy()
  })

  it('is deterministic', () => {
    expect(hashSchema(BASE_COLS)).toBe(hashSchema(BASE_COLS))
  })

  it('is order-independent (sorts by name)', () => {
    const reversed = [...BASE_COLS].reverse()
    expect(hashSchema(BASE_COLS)).toBe(hashSchema(reversed))
  })

  it('changes when columns differ', () => {
    const different: ColumnDef[] = [
      ...BASE_COLS,
      { name: 'extra', pg_type: 'text', role: 'data', nullable: true },
    ]
    expect(hashSchema(BASE_COLS)).not.toBe(hashSchema(different))
  })
})

describe('colByRole', () => {
  it('returns the column with the given role', () => {
    expect(colByRole(BASE_COLS, 'id').name).toBe('id')
    expect(colByRole(BASE_COLS, 'geom').name).toBe('geom')
  })

  it('throws if role not found', () => {
    expect(() => colByRole([], 'id')).toThrow()
  })
})

describe('dataColumns', () => {
  it('returns only data and properties columns', () => {
    const result = dataColumns(BASE_COLS)
    expect(result.map(c => c.name)).toEqual(['name', 'height', 'properties'])
  })

  it('excludes id, geom, updated_at', () => {
    const result = dataColumns(BASE_COLS)
    const roles = result.map(c => c.role)
    expect(roles).not.toContain('id')
    expect(roles).not.toContain('geom')
    expect(roles).not.toContain('updated_at')
  })
})
