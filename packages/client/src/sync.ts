// packages/client/src/sync.ts
import type { PGlite } from '@electric-sql/pglite'
import type { ChangeEvent, DeltaMessage } from './types.js'

export async function drainOutbox(db: PGlite): Promise<ChangeEvent[]> {
  const res = await db.query<{
    write_id: string
    op: string
    feature_id: string
    data: Record<string, unknown> | null
    updated_at: string
  }>(`
    SELECT write_id::text, op, feature_id::text, data, updated_at::text
    FROM _datum_outbox
    WHERE synced = false
    ORDER BY seq ASC
  `)

  if (res.rows.length === 0) return []

  return res.rows.map(row => ({
    write_id: row.write_id,
    op: row.op as ChangeEvent['op'],
    feature_id: row.feature_id,
    data: row.data,
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

// applyDelta applies a remote change to local PGlite.
// It disables the outbox trigger temporarily so the remote change
// does not get re-queued as a local write.
export async function applyDelta(db: PGlite, delta: DeltaMessage, tableName = 'features'): Promise<void> {
  const f = delta.feature

  await db.exec(`ALTER TABLE ${tableName} DISABLE TRIGGER datum_capture_changes`)
  try {
    if (delta.op === 'delete') {
      await db.query(`DELETE FROM ${tableName} WHERE id = $1`, [f.id])
    } else {
      await db.query(`
        INSERT INTO ${tableName} (id, geom, properties, updated_at)
        VALUES (
          $1::uuid,
          ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
          $3::jsonb,
          $4::timestamptz
        )
        ON CONFLICT (id) DO UPDATE
        SET geom       = EXCLUDED.geom,
            properties = EXCLUDED.properties,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at > ${tableName}.updated_at
      `, [f.id, f.geom, JSON.stringify(f.properties), f.updated_at])
    }
  } finally {
    await db.exec(`ALTER TABLE ${tableName} ENABLE TRIGGER datum_capture_changes`)
  }
}
