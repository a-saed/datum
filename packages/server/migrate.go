// packages/server/migrate.go
package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func runMigration(ctx context.Context, pool *pgxpool.Pool, table string) error {
	sql, err := os.ReadFile("./sql/001_datum_schema.sql")
	if err != nil {
		return fmt.Errorf("read migration: %w", err)
	}

	// Substitute {{TABLE}} with a safely-quoted identifier.
	quoted := pgx.Identifier{table}.Sanitize()
	migrationSQL := strings.ReplaceAll(string(sql), "{{TABLE}}", quoted)

	_, err = pool.Exec(ctx, migrationSQL)
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
