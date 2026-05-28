// packages/server/migrate.go
package main

import (
	"context"
	_ "embed"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed sql/001_datum_schema.sql
var migrationSQL string

func runMigration(ctx context.Context, pool *pgxpool.Pool, table string, cols ColumnConfig) error {
	quoted := pgx.Identifier{table}.Sanitize()
	expanded := strings.ReplaceAll(migrationSQL, "{{TABLE}}", quoted)
	expanded = strings.ReplaceAll(expanded, "{{TABLE_NAME}}", table)

	if _, err := pool.Exec(ctx, expanded); err != nil {
		return fmt.Errorf("run migration: %w", err)
	}

	// Generate the notify trigger function with the configured column names.
	idCol         := pgx.Identifier{cols.ID}.Sanitize()
	geomCol       := pgx.Identifier{cols.Geom}.Sanitize()
	propsCol      := pgx.Identifier{cols.Properties}.Sanitize()
	updatedAtCol  := pgx.Identifier{cols.UpdatedAt}.Sanitize()

	triggerFnSQL := fmt.Sprintf(`
		CREATE OR REPLACE FUNCTION datum.notify_change()
		RETURNS TRIGGER AS $$
		DECLARE payload jsonb;
		BEGIN
			IF TG_OP = 'DELETE' THEN
				payload := jsonb_build_object(
					'op',               'delete',
					'id',               OLD.%s,
					'geom',             ST_AsGeoJSON(OLD.%s),
					'properties',       OLD.%s,
					'updated_at',       OLD.%s,
					'origin_client_id', current_setting('datum.client_id', true)
				);
			ELSE
				payload := jsonb_build_object(
					'op',               lower(TG_OP),
					'id',               NEW.%s,
					'geom',             ST_AsGeoJSON(NEW.%s),
					'properties',       NEW.%s,
					'updated_at',       NEW.%s,
					'origin_client_id', current_setting('datum.client_id', true)
				);
			END IF;
			PERFORM pg_notify('datum_changes', payload::text);
			IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
		END;
		$$ LANGUAGE plpgsql;`,
		idCol, geomCol, propsCol, updatedAtCol,
		idCol, geomCol, propsCol, updatedAtCol,
	)

	if _, err := pool.Exec(ctx, triggerFnSQL); err != nil {
		return fmt.Errorf("create trigger function: %w", err)
	}

	triggerSQL := fmt.Sprintf(`
		CREATE OR REPLACE TRIGGER datum_notify_change
		AFTER INSERT OR UPDATE OR DELETE ON %s
		FOR EACH ROW EXECUTE FUNCTION datum.notify_change()
	`, quoted)

	if _, err := pool.Exec(ctx, triggerSQL); err != nil {
		return fmt.Errorf("create trigger: %w", err)
	}

	return nil
}
