// packages/client/src/pglite.ts
import { PGlite } from '@electric-sql/pglite'
import { postgis } from '@electric-sql/pglite-postgis'
import { pgTypeToDDL, hashSchema, colByRole, type ColumnDef } from './schema.js'

export const SCHEMA_VERSION = '3'

/**
 * Boot the local PGlite database. Returns the db instance and whether this
 * looks like a first visit (no valid schema stored yet).
 * Full schema setup is deferred to setupSchema() once columns are known.
 */
export async function bootLocalDb(dbName = 'datum', tableName = 'features'): Promise<{ db: PGlite; isFirstVisit: boolean }> {
  const db = new PGlite(`idb://datum-${dbName}`, { extensions: { postgis } })
  await db.exec('CREATE EXTENSION IF NOT EXISTS postgis')
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _datum_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
  const { rows } = await db.query<{ value: string }>(
    `SELECT value FROM _datum_meta WHERE key = 'schema_version'`
  )
  const isFirstVisit = rows.length === 0 || rows[0].value !== SCHEMA_VERSION
  return { db, isFirstVisit }
}

/**
 * Validate and (if needed) recreate the local schema using the server's column
 * definitions. Returns true if the DB was wiped (first visit or schema change).
 * Exported for testing with in-memory PGlite instances.
 */
export async function setupSchema(db: PGlite, tableName: string, columns: ColumnDef[]): Promise<boolean> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _datum_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  const schemaHash = hashSchema(columns)

  const { rows: vRows } = await db.query<{ value: string }>(
    `SELECT value FROM _datum_meta WHERE key = 'schema_version'`
  )
  const { rows: hRows } = await db.query<{ value: string }>(
    `SELECT value FROM _datum_meta WHERE key = 'schema_hash'`
  )

  const currentVersion = vRows[0]?.value
  const currentHash    = hRows[0]?.value

  if (currentVersion === SCHEMA_VERSION && currentHash === schemaHash) {
    return false // schema is current — no wipe needed
  }

  // Wipe and recreate.
  await db.exec(`
    DROP TABLE IF EXISTS _datum_outbox;
    DROP TABLE IF EXISTS ${quote(tableName)};
    DROP FUNCTION IF EXISTS _datum_capture_change CASCADE;
    DELETE FROM _datum_meta;
  `)

  await db.exec(buildCreateTable(tableName, columns))

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

  await db.exec(buildTriggerFunction(tableName, columns))
  await db.exec(`
    DROP TRIGGER IF EXISTS datum_capture_changes ON ${quote(tableName)};
    CREATE TRIGGER datum_capture_changes
    AFTER INSERT OR UPDATE OR DELETE ON ${quote(tableName)}
    FOR EACH ROW EXECUTE FUNCTION _datum_capture_change()
  `)

  await db.query(
    `INSERT INTO _datum_meta (key, value) VALUES ('schema_version', $1), ('schema_hash', $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [SCHEMA_VERSION, schemaHash]
  )

  return true
}

function quote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function buildCreateTable(tableName: string, columns: ColumnDef[]): string {
  const defs = columns.map(col => {
    const type    = pgTypeToDDL(col.pg_type)
    const pk      = col.role === 'id'         ? ' PRIMARY KEY' : ''
    const notnull = !col.nullable && col.role !== 'id' ? ' NOT NULL' : ''
    const def     = col.role === 'id'         ? (col.pg_type === 'uuid' ? ` DEFAULT gen_random_uuid()` : '') :
                    col.role === 'properties' ? ` DEFAULT '{}'` :
                    col.role === 'updated_at'  ? ' DEFAULT now()' : ''
    return `  ${quote(col.name)} ${type}${pk}${notnull}${def}`
  })
  return `CREATE TABLE ${quote(tableName)} (\n${defs.join(',\n')}\n)`
}

function buildTriggerFunction(tableName: string, columns: ColumnDef[]): string {
  const idCol  = colByRole(columns, 'id')
  const updCol = colByRole(columns, 'updated_at')

  const cols = columns.filter(c => c.role !== 'id')

  const pairs = cols.map(col =>
    col.role === 'geom'
      ? `'${col.name.replace(/'/g, "''")}', ST_AsGeoJSON(NEW.${quote(col.name)})`
      : `'${col.name.replace(/'/g, "''")}', NEW.${quote(col.name)}`
  ).join(',\n            ')

  return `
CREATE OR REPLACE FUNCTION _datum_capture_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO _datum_outbox (op, feature_id, data, updated_at)
    VALUES ('delete', OLD.${quote(idCol.name)}, NULL, now());
    RETURN OLD;
  ELSE
    INSERT INTO _datum_outbox (op, feature_id, data, updated_at)
    VALUES (
      lower(TG_OP),
      NEW.${quote(idCol.name)},
      jsonb_build_object(
        ${pairs}
      ),
      NEW.${quote(updCol.name)}
    );
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql`
}
