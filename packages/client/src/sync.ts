// packages/client/src/sync.ts
import type { PGlite } from '@electric-sql/pglite'
import type { ChangeEvent, DeltaMessage, Feature } from './types.js'
import type { ColumnDef } from './schema.js'

const q = (name: string) => `"${name.replace(/"/g, '""')}"`

export async function drainOutbox(db: PGlite): Promise<ChangeEvent[]> {
  const res = await db.query<{
    write_id:   string
    op:         string
    feature_id: string
    data:       Record<string, unknown> | null
    updated_at: string
  }>(`
    SELECT write_id::text, op, feature_id::text, data, updated_at::text
    FROM _datum_outbox
    WHERE synced = false
    ORDER BY seq ASC
  `)

  if (res.rows.length === 0) return []

  return res.rows.map(row => ({
    write_id:   row.write_id,
    op:         row.op as ChangeEvent['op'],
    feature_id: row.feature_id,
    data:       row.data,
    updated_at: row.updated_at,
  }))
}

export async function markSynced(db: PGlite, writeIds: string[]): Promise<void> {
  if (writeIds.length === 0) return
  await db.query(
    `UPDATE _datum_outbox SET synced = true WHERE write_id = ANY($1::uuid[])`,
    [writeIds]
  )
}

/**
 * Apply a single remote delta to local PGlite. Disables the outbox trigger
 * so the remote change is not re-queued as a local write.
 */
export async function applyDelta(db: PGlite, delta: DeltaMessage, tableName: string, columns: ColumnDef[]): Promise<void> {
  const f = delta.feature as Record<string, unknown>
  await db.exec(`ALTER TABLE ${q(tableName)} DISABLE TRIGGER datum_capture_changes`)
  try {
    if (delta.op === 'delete') {
      await db.query(`DELETE FROM ${q(tableName)} WHERE id = $1`, [f['id']])
    } else {
      await upsertFeature(db, tableName, f, columns)
    }
  } finally {
    await db.exec(`ALTER TABLE ${q(tableName)} ENABLE TRIGGER datum_capture_changes`)
  }
}

/**
 * Batch-upsert an array of features into the local table inside a single
 * transaction. Trigger is disabled for the duration. Used by loadSnapshot.
 */
export async function applyFeatures(db: PGlite, features: Feature[], tableName: string, columns: ColumnDef[]): Promise<void> {
  await db.exec(`ALTER TABLE ${q(tableName)} DISABLE TRIGGER datum_capture_changes`)
  try {
    await db.exec('BEGIN')
    try {
      for (const f of features) {
        await upsertFeature(db, tableName, f as Record<string, unknown>, columns)
      }
      await db.exec('COMMIT')
    } catch (err) {
      await db.exec('ROLLBACK')
      throw err
    }
  } finally {
    await db.exec(`ALTER TABLE ${q(tableName)} ENABLE TRIGGER datum_capture_changes`)
  }
}

/** Build and execute a single feature upsert using the column definitions. */
async function upsertFeature(db: PGlite, tableName: string, feature: Record<string, unknown>, columns: ColumnDef[]): Promise<void> {
  const writeCols = columns.filter(c => c.role !== 'id')

  const idCol  = columns.find(c => c.role === 'id')
  const updCol = columns.find(c => c.role === 'updated_at')
  if (!idCol)  throw new Error(`datum: no id column for table "${tableName}"`)
  if (!updCol) throw new Error(`datum: no updated_at column for table "${tableName}"`)

  const insertCols  = [q(idCol.name), ...writeCols.map(c => q(c.name))]
  const args: unknown[] = [feature[idCol.name] ?? null]

  const valuePhs: string[] = [`$1::uuid`]
  let paramIdx = 2
  for (const col of writeCols) {
    const val = feature[col.name] ?? null
    let ph: string
    switch (col.role) {
      case 'geom':
        ph = `ST_SetSRID(ST_GeomFromGeoJSON($${paramIdx}), 4326)`
        args.push(val)
        break
      case 'updated_at':
        ph = `$${paramIdx}::timestamptz`
        args.push(val)
        break
      default:
        if (col.pg_type === 'jsonb' && val !== null && typeof val === 'object') {
          ph = `$${paramIdx}::jsonb`
          args.push(JSON.stringify(val))
        } else {
          ph = `$${paramIdx}`
          args.push(val)
        }
    }
    valuePhs.push(ph)
    paramIdx++
  }

  const setClauses = writeCols.map(c => `${q(c.name)} = EXCLUDED.${q(c.name)}`).join(', ')
  const updQ = q(updCol.name)

  const sql = `
    INSERT INTO ${q(tableName)} (${insertCols.join(', ')})
    VALUES (${valuePhs.join(', ')})
    ON CONFLICT (${q(idCol.name)}) DO UPDATE
    SET ${setClauses}
    WHERE EXCLUDED.${updQ} > ${q(tableName)}.${updQ}
  `

  await db.query(sql, args)
}
