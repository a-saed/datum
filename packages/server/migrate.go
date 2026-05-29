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

// runMigration applies the base SQL schema (idempotent). It does NOT install
// the trigger — call installTrigger separately after introspecting columns.
func runMigration(ctx context.Context, pool *pgxpool.Pool, table string, cols ColumnConfig) error {
	quoted := pgx.Identifier{table}.Sanitize()
	expanded := strings.ReplaceAll(migrationSQL, "{{TABLE}}", quoted)
	expanded = strings.ReplaceAll(expanded, "{{TABLE_NAME}}", table)

	if _, err := pool.Exec(ctx, expanded); err != nil {
		return fmt.Errorf("run migration: %w", err)
	}

	// Drop the legacy generic trigger function (pre-multi-table).
	if _, err := pool.Exec(ctx, `DROP FUNCTION IF EXISTS datum.notify_change() CASCADE`); err != nil {
		return fmt.Errorf("drop legacy trigger function: %w", err)
	}

	return nil
}

// installTrigger creates (or replaces) the per-table NOTIFY trigger that sends
// all columns — including typed data columns — in a flat "feature" JSON object.
// Must be called after introspectSchema so columns is fully populated.
func installTrigger(ctx context.Context, pool *pgxpool.Pool, tableName string, columns []ColumnDef) error {
	quoted    := pgx.Identifier{tableName}.Sanitize()
	funcIdent := pgx.Identifier{"datum", "notify_change_" + tableName}.Sanitize()

	// Find the id column name.
	var idCol string
	for _, c := range columns {
		if c.Role == "id" {
			idCol = c.Name
			break
		}
	}

	// Build jsonb_build_object(...) pairs for all columns except id.
	// geom columns use ST_AsGeoJSON; all others use the raw value.
	var newPairs, oldPairs []string
	for _, c := range columns {
		if c.Role == "id" {
			continue
		}
		key := "'" + c.Name + "'"
		colQ := pgx.Identifier{c.Name}.Sanitize()
		if c.Role == "geom" {
			newPairs = append(newPairs, key+", ST_AsGeoJSON(NEW."+colQ+")")
			oldPairs = append(oldPairs, key+", ST_AsGeoJSON(OLD."+colQ+")")
		} else {
			newPairs = append(newPairs, key+", NEW."+colQ)
			oldPairs = append(oldPairs, key+", OLD."+colQ)
		}
	}
	idQuoted := pgx.Identifier{idCol}.Sanitize()

	triggerFnSQL := fmt.Sprintf(`
		CREATE OR REPLACE FUNCTION %s()
		RETURNS TRIGGER AS $$
		DECLARE payload jsonb;
		BEGIN
		    IF TG_OP = 'DELETE' THEN
		        payload := jsonb_build_object(
		            'table',            TG_TABLE_NAME,
		            'op',               'delete',
		            'feature',          jsonb_build_object(
		                                    'id', OLD.%s,
		                                    %s
		                                ),
		            'origin_client_id', current_setting('datum.client_id', true)
		        );
		    ELSE
		        payload := jsonb_build_object(
		            'table',            TG_TABLE_NAME,
		            'op',               lower(TG_OP),
		            'feature',          jsonb_build_object(
		                                    'id', NEW.%s,
		                                    %s
		                                ),
		            'origin_client_id', current_setting('datum.client_id', true)
		        );
		    END IF;
		    PERFORM pg_notify('datum_changes', payload::text);
		    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
		END;
		$$ LANGUAGE plpgsql;`,
		funcIdent,
		idQuoted, strings.Join(oldPairs, ",\n\t\t\t\t\t\t\t\t    "),
		idQuoted, strings.Join(newPairs, ",\n\t\t\t\t\t\t\t\t    "),
	)

	if _, err := pool.Exec(ctx, triggerFnSQL); err != nil {
		return fmt.Errorf("create trigger function: %w", err)
	}

	triggerSQL := fmt.Sprintf(`
		CREATE OR REPLACE TRIGGER datum_notify_change
		AFTER INSERT OR UPDATE OR DELETE ON %s
		FOR EACH ROW EXECUTE FUNCTION %s()
	`, quoted, funcIdent)

	if _, err := pool.Exec(ctx, triggerSQL); err != nil {
		return fmt.Errorf("create trigger: %w", err)
	}

	return nil
}
