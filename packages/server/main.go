// packages/server/main.go
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"regexp"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

var tableNameRe = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

func main() {
	configPath := flag.String("config", os.Getenv("CONFIG"), "Path to datum.yaml config file")
	dbURL      := flag.String("db",     os.Getenv("DATABASE_URL"), "PostgreSQL connection URL (required)")
	flag.Parse()

	// Load config file if provided.
	var fileCfg Config
	if *configPath != "" {
		var err error
		fileCfg, err = loadConfig(*configPath)
		if err != nil {
			log.Fatalf("datum-server: %v", err)
		}
	}

	// Env vars override config file. Precedence: env var > config file > default.
	defaults      := defaultColumns()
	port          := coalesce(os.Getenv("PORT"),           fileCfg.Port,                "3000")
	allowedOrigin := coalesce(os.Getenv("ALLOWED_ORIGIN"), fileCfg.AllowedOrigin,       "*")
	table         := coalesce(os.Getenv("TABLE"),          fileCfg.Table.Name)
	colID         := coalesce(os.Getenv("COL_ID"),         fileCfg.Table.ColID,         defaults.ID)
	colGeom       := coalesce(os.Getenv("COL_GEOM"),       fileCfg.Table.ColGeom,       defaults.Geom)
	colUpdAt      := coalesce(os.Getenv("COL_UPDATED_AT"), fileCfg.Table.ColUpdatedAt,  defaults.UpdatedAt)
	colProps      := coalesce(os.Getenv("COL_PROPERTIES"), fileCfg.Table.ColProperties, defaults.Properties)

	fileRateLimit := ""
	if fileCfg.RateLimit > 0 {
		fileRateLimit = fmt.Sprintf("%d", fileCfg.RateLimit)
	}
	rateLimitStr := coalesce(os.Getenv("RATE_LIMIT"), fileRateLimit, "0")

	// Validate
	if *dbURL == "" {
		log.Fatal("datum-server: -db flag or DATABASE_URL env var is required")
	}
	if table == "" {
		log.Fatal("datum-server: table name is required (set table.name in datum.yaml or TABLE env var)")
	}
	if !tableNameRe.MatchString(table) {
		log.Fatalf("datum-server: invalid table name %q (only [a-zA-Z_][a-zA-Z0-9_]*)", table)
	}

	writeLimit, err := strconv.Atoi(rateLimitStr)
	if err != nil || writeLimit < 0 {
		log.Fatalf("datum-server: invalid rate_limit value %q (must be a non-negative integer)", rateLimitStr)
	}

	cols := ColumnConfig{ID: colID, Geom: colGeom, UpdatedAt: colUpdAt, Properties: colProps}
	for label, name := range map[string]string{
		"col_id": cols.ID, "col_geom": cols.Geom,
		"col_updated_at": cols.UpdatedAt, "col_properties": cols.Properties,
	} {
		if !tableNameRe.MatchString(name) {
			log.Fatalf("datum-server: invalid %s value %q (only [a-zA-Z_][a-zA-Z0-9_]*)", label, name)
		}
	}

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, *dbURL)
	if err != nil {
		log.Fatalf("datum-server: connect to postgres: %v", err)
	}
	defer pool.Close()

	if err := runMigration(ctx, pool, table, cols); err != nil {
		log.Fatalf("datum-server: migration failed: %v", err)
	}
	log.Printf("datum-server: migration applied to table %q", table)

	srv := newServer(pool, table, port, allowedOrigin, writeLimit, cols)
	log.Printf("datum-server: listening on :%s", port)
	log.Fatal(srv.run(ctx))
}
