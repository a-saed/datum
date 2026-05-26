// packages/client/src/pglite.ts
import { PGlite } from '@electric-sql/pglite'
import { postgis } from '@electric-sql/pglite-postgis'

export async function bootLocalDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { postgis } })
  await db.exec('CREATE EXTENSION IF NOT EXISTS postgis')

  await db.exec(`
    CREATE TABLE IF NOT EXISTS features (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      geom        GEOMETRY(Geometry, 4326),
      properties  JSONB DEFAULT '{}',
      updated_at  TIMESTAMPTZ DEFAULT now()
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS _datum_outbox (
      write_id    UUID NOT NULL DEFAULT gen_random_uuid(),
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
    DROP TRIGGER IF EXISTS datum_capture_changes ON features;
    CREATE TRIGGER datum_capture_changes
    AFTER INSERT OR UPDATE OR DELETE ON features
    FOR EACH ROW EXECUTE FUNCTION _datum_capture_change()
  `)

  return db
}
