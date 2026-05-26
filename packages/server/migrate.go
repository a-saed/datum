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
	// Substitute {{TABLE}} with a safely-quoted identifier.
	quoted := pgx.Identifier{table}.Sanitize()
	expanded := strings.ReplaceAll(migrationSQL, "{{TABLE}}", quoted)

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
