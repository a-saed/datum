-- sql/001_datum_schema.sql
-- Datum sync protocol schema.
-- {{TABLE}} is replaced by datum-server with the configured table name (quoted identifier).
-- Run this migration via datum-server on startup; it is idempotent.

CREATE SCHEMA IF NOT EXISTS datum;

-- Create the sync table if it doesn't exist yet.
-- Users with an existing table can skip this — it is a no-op if the table is already there.
CREATE TABLE IF NOT EXISTS {{TABLE}} (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    geom        GEOMETRY(Geometry, 4326) NOT NULL,
    properties  JSONB       NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS {{TABLE_NAME}}_geom_idx ON {{TABLE}} USING GIST (geom);

-- Drop old SQL functions from v0.1.x (sync/write logic now lives in the Go server).
DROP FUNCTION IF EXISTS datum.sync(geometry, timestamptz);
DROP FUNCTION IF EXISTS datum.write(jsonb);

-- datum.notify_change_<tablename>() and the datum_notify_change trigger are created by
-- datum-server at startup because they reference the configured column names.
-- datum-server runs these separately after substituting column identifiers.
