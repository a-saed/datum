-- packages/server/sql/001_datum_schema.sql
-- Copy of sql/001_datum_schema.sql required for go:embed — edit the root sql/ file, not this one.
-- Datum sync protocol schema.
-- {{TABLE}} is replaced by datum-server with the configured table name (quoted identifier).
-- Run this migration via datum-server on startup; it is idempotent.

CREATE SCHEMA IF NOT EXISTS datum;

-- Returns features from {{TABLE}} that intersect p_bbox and were updated after p_since.
-- Used for initial snapshot and incremental catch-up.
CREATE OR REPLACE FUNCTION datum.sync(
    p_bbox  geometry,
    p_since timestamptz
) RETURNS TABLE (
    id         uuid,
    geom       text,
    properties jsonb,
    updated_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        ST_AsGeoJSON(t.geom)::text,
        t.properties,
        t.updated_at
    FROM {{TABLE}} t
    WHERE ST_Intersects(t.geom, p_bbox)
      AND t.updated_at > p_since;
END;
$$ LANGUAGE plpgsql STABLE;

-- Applies a batch of client edits to {{TABLE}} using last-write-wins.
-- p_edits is a JSON array of {op, feature_id, data: {geom, properties, updated_at}}.
CREATE OR REPLACE FUNCTION datum.write(
    p_edits jsonb
) RETURNS void AS $$
DECLARE
    edit jsonb;
BEGIN
    FOR edit IN SELECT * FROM jsonb_array_elements(p_edits) LOOP
        IF edit->>'op' = 'delete' THEN
            DELETE FROM {{TABLE}}
            WHERE id = (edit->>'feature_id')::uuid;

        ELSIF edit->>'op' IN ('insert', 'update') THEN
            INSERT INTO {{TABLE}} (id, geom, properties, updated_at)
            VALUES (
                (edit->>'feature_id')::uuid,
                ST_SetSRID(ST_GeomFromGeoJSON(edit->'data'->>'geom'), 4326),
                (edit->'data'->'properties'),
                (edit->'data'->>'updated_at')::timestamptz
            )
            ON CONFLICT (id) DO UPDATE
            SET geom       = EXCLUDED.geom,
                properties = EXCLUDED.properties,
                updated_at = EXCLUDED.updated_at
            WHERE EXCLUDED.updated_at > {{TABLE}}.updated_at;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Notify datum-server of row changes. Payload includes origin_client_id so the
-- server can skip echoing changes back to the originating client.
CREATE OR REPLACE FUNCTION datum.notify_change()
RETURNS TRIGGER AS $$
DECLARE
    payload jsonb;
BEGIN
    IF TG_OP = 'DELETE' THEN
        payload := jsonb_build_object(
            'op',               'delete',
            'id',               OLD.id,
            'geom',             NULL,
            'properties',       NULL,
            'updated_at',       OLD.updated_at,
            'origin_client_id', current_setting('datum.client_id', true)
        );
    ELSE
        payload := jsonb_build_object(
            'op',               lower(TG_OP),
            'id',               NEW.id,
            'geom',             ST_AsGeoJSON(NEW.geom),
            'properties',       NEW.properties,
            'updated_at',       NEW.updated_at,
            'origin_client_id', current_setting('datum.client_id', true)
        );
    END IF;

    PERFORM pg_notify('datum_changes', payload::text);

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

-- The trigger is created by datum-server after substituting {{TABLE}},
-- because CREATE TRIGGER requires the literal table name (not a variable).
-- datum-server runs this separately:
--   CREATE OR REPLACE TRIGGER datum_notify_change
--   AFTER INSERT OR UPDATE OR DELETE ON {{TABLE}}
--   FOR EACH ROW EXECUTE FUNCTION datum.notify_change();
