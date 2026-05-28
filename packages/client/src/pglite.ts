// packages/client/src/pglite.ts
import { PGlite } from '@electric-sql/pglite'
import { postgis } from '@electric-sql/pglite-postgis'

export const SCHEMA_VERSION = '2'

/**
 * Boot the local PGlite database backed by IndexedDB.
 * Returns the db instance and whether this is a first visit (empty DB).
 */
export async function bootLocalDb(dbName = 'datum', tableName = 'features'): Promise<{ db: PGlite; isFirstVisit: boolean }> {
  const db = new PGlite(`idb://datum-${dbName}`, { extensions: { postgis } })
  await db.exec('CREATE EXTENSION IF NOT EXISTS postgis')
  const isFirstVisit = await setupSchema(db, tableName)
  return { db, isFirstVisit }
}

/**
 * Create or validate the local schema. Returns true if the DB has no rows
 * (first visit or post-schema-wipe), false if existing data is present.
 * Exported for testing with in-memory PGlite instances.
 */
export async function setupSchema(db: PGlite, tableName = 'features'): Promise<boolean> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _datum_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  const { rows } = await db.query<{ value: string }>(
    `SELECT value FROM _datum_meta WHERE key = 'schema_version'`
  )

  if (rows.length > 0 && rows[0].value === SCHEMA_VERSION) {
    const { rows: countRows } = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM ${tableName}`
    )
    return countRows[0].count === 0
  }

  // Schema absent or outdated — wipe and recreate
  await db.exec(`
    DROP TABLE IF EXISTS _datum_outbox;
    DROP TABLE IF EXISTS ${tableName};
    DROP FUNCTION IF EXISTS _datum_capture_change CASCADE;
    DELETE FROM _datum_meta;
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      geom        GEOMETRY(Geometry, 4326),
      properties  JSONB DEFAULT '{}',
      updated_at  TIMESTAMPTZ DEFAULT now()
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS _datum_outbox (
      seq         BIGSERIAL PRIMARY KEY,
      write_id    UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      op          TEXT NOT NULL,
      feature_id  UUID NOT NULL,
      data        JSONB,
      updated_at  TIMESTAMPTZ DEFAULT now(),
      synced      BOOLEAN DEFAULT false
    )
  `)

  await db.exec(`
    CREATE OR REPLACE FUNCTION _datum_capture_change()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        INSERT INTO _datum_outbox (op, feature_id, data, updated_at)
        VALUES ('delete', OLD.id, NULL, now());
        RETURN OLD;
      ELSE
        INSERT INTO _datum_outbox (op, feature_id, data, updated_at)
        VALUES (
          lower(TG_OP),
          NEW.id,
          jsonb_build_object(
            'geom',       ST_AsGeoJSON(NEW.geom),
            'properties', NEW.properties,
            'updated_at', NEW.updated_at
          ),
          NEW.updated_at
        );
        RETURN NEW;
      END IF;
    END;
    $$ LANGUAGE plpgsql
  `)

  await db.exec(`
    DROP TRIGGER IF EXISTS datum_capture_changes ON ${tableName};
    CREATE TRIGGER datum_capture_changes
    AFTER INSERT OR UPDATE OR DELETE ON ${tableName}
    FOR EACH ROW EXECUTE FUNCTION _datum_capture_change()
  `)

  await db.query(
    `INSERT INTO _datum_meta (key, value) VALUES ('schema_version', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [SCHEMA_VERSION]
  )

  return true
}
