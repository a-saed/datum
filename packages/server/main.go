// packages/server/main.go
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"regexp"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

var tableNameRe = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	defaults      := defaultColumns()
	dbURL         := flag.String("db",             envOr("DATABASE_URL", ""),             "PostgreSQL connection URL (required)")
	table         := flag.String("table",          envOr("TABLE", ""),                    "Table name to sync (required)")
	port          := flag.String("port",           envOr("PORT", "3000"),                 "Port to listen on")
	allowedOrigin := flag.String("allowed-origin", envOr("ALLOWED_ORIGIN", "*"),          "Allowed WebSocket origin (e.g. https://myapp.com). Use * to allow all (dev only)")
	rateLimitStr  := flag.String("rate-limit",     envOr("RATE_LIMIT", "0"),              "Max write messages per minute per IP. 0 = disabled.")
	colID         := flag.String("col-id",         envOr("COL_ID", defaults.ID),         "UUID primary key column name")
	colGeom       := flag.String("col-geom",       envOr("COL_GEOM", defaults.Geom),     "Geometry column name")
	colUpdatedAt  := flag.String("col-updated-at", envOr("COL_UPDATED_AT", defaults.UpdatedAt),  "Updated-at timestamp column name")
	colProperties := flag.String("col-properties", envOr("COL_PROPERTIES", defaults.Properties), "JSONB properties column name")
	flag.Parse()

	writeLimit, err := strconv.Atoi(*rateLimitStr)
	if err != nil || writeLimit < 0 {
		log.Fatalf("datum-server: invalid -rate-limit value %q (must be a non-negative integer)", *rateLimitStr)
	}

	if *dbURL == "" {
		log.Fatal("datum-server: -db flag or DATABASE_URL env var is required")
	}
	if *table == "" {
		log.Fatal("datum-server: -table flag or TABLE env var is required")
	}
	if !tableNameRe.MatchString(*table) {
		log.Fatalf("datum-server: invalid table name %q (only [a-zA-Z_][a-zA-Z0-9_]*)", *table)
	}

	cols := ColumnConfig{ID: *colID, Geom: *colGeom, UpdatedAt: *colUpdatedAt, Properties: *colProperties}
	for label, name := range map[string]string{"col-id": cols.ID, "col-geom": cols.Geom, "col-updated-at": cols.UpdatedAt, "col-properties": cols.Properties} {
		if !tableNameRe.MatchString(name) {
			log.Fatalf("datum-server: invalid -%s value %q (only [a-zA-Z_][a-zA-Z0-9_]*)", label, name)
		}
	}

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, *dbURL)
	if err != nil {
		log.Fatalf("datum-server: connect to postgres: %v", err)
	}
	defer pool.Close()

	if err := runMigration(ctx, pool, *table, cols); err != nil {
		log.Fatalf("datum-server: migration failed: %v", err)
	}
	log.Printf("datum-server: migration applied to table %q", *table)

	srv := newServer(pool, *table, *port, *allowedOrigin, writeLimit, cols)
	log.Printf("datum-server: listening on :%s", *port)
	log.Fatal(srv.run(ctx))
}
