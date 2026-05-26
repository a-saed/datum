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

func runMigration(ctx context.Context, pool *pgxpool.Pool, table string) error {
	// {{TABLE}} → quoted identifier (e.g. "features") for use in SQL expressions.
	// {{TABLE_NAME}} → unquoted name for use in identifier positions like index names.
	// The table name is pre-validated by regex so it is safe unquoted.
	quoted := pgx.Identifier{table}.Sanitize()
	expanded := strings.ReplaceAll(migrationSQL, "{{TABLE}}", quoted)
	expanded = strings.ReplaceAll(expanded, "{{TABLE_NAME}}", table)

	_, err := pool.Exec(ctx, expanded)
	if err != nil {
		return fmt.Errorf("run migration: %w", err)
	}

	// Create the trigger separately (requires literal table name in DDL).
	triggerSQL := fmt.Sprintf(`
		CREATE OR REPLACE TRIGGER datum_notify_change
		AFTER INSERT OR UPDATE OR DELETE ON %s
		FOR EACH ROW EXECUTE FUNCTION datum.notify_change()
	`, quoted)

	_, err = pool.Exec(ctx, triggerSQL)
	if err != nil {
		return fmt.Errorf("create trigger: %w", err)
	}

	return nil
}
