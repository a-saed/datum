// packages/client/src/schema.ts

export interface ColumnDef {
  name:     string
  pg_type:  string
  role:     'id' | 'geom' | 'updated_at' | 'properties' | 'data'
  nullable: boolean
}

/** Maps a normalised pg_type to a PGlite-compatible DDL type string. */
export function pgTypeToDDL(pgType: string): string {
  switch (pgType) {
    case 'uuid':        return 'UUID'
    case 'geometry':    return 'GEOMETRY(Geometry, 4326)'
    case 'jsonb':       return 'JSONB'
    case 'timestamptz': return 'TIMESTAMPTZ'
    case 'float8':      return 'DOUBLE PRECISION'
    case 'int8':        return 'BIGINT'
    case 'bool':        return 'BOOLEAN'
    case 'date':        return 'DATE'
    default:            return 'TEXT'
  }
}

/** Deterministic hash of a column list. Sorted by name — order-independent. */
export function hashSchema(columns: ColumnDef[]): string {
  const sorted = [...columns].sort((a, b) => a.name.localeCompare(b.name))
  const repr   = sorted.map(c => `${c.name}:${c.pg_type}:${c.role}:${c.nullable}`).join('|')
  let h = 5381
  for (let i = 0; i < repr.length; i++) {
    h = ((h << 5) + h + repr.charCodeAt(i)) >>> 0
  }
  return h.toString(16)
}

/** Returns the column with the given role. Throws if not found. */
export function colByRole(columns: ColumnDef[], role: ColumnDef['role']): ColumnDef {
  const col = columns.find(c => c.role === role)
  if (!col) throw new Error(`datum: no column with role "${role}"`)
  return col
}

/** Returns columns with role "data" or "properties" (all non-system writable columns). */
export function dataColumns(columns: ColumnDef[]): ColumnDef[] {
  return columns.filter(c => c.role === 'data' || c.role === 'properties')
}
