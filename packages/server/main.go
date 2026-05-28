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
	configPath    := flag.String("config",         os.Getenv("CONFIG"),         "Path to datum.yaml config file")
	dbURL         := flag.String("db",             os.Getenv("DATABASE_URL"),   "PostgreSQL connection URL (required)")
	tableFlag     := flag.String("table",          "",                          "Table name to sync (overrides config file)")
	portFlag      := flag.String("port",           "",                          "Port to listen on (overrides config file)")
	originFlag    := flag.String("allowed-origin", "",                          "Allowed WebSocket origin (overrides config file)")
	rateLimitFlag := flag.String("rate-limit",     "",                          "Max write messages per minute per IP, 0=disabled (overrides config file)")
	colIDFlag     := flag.String("col-id",         "",                          "UUID primary key column name (overrides config file)")
	colGeomFlag   := flag.String("col-geom",       "",                          "Geometry column name (overrides config file)")
	colUpdAtFlag  := flag.String("col-updated-at", "",                          "Updated-at column name (overrides config file)")
	colPropsFlag  := flag.String("col-properties", "",                          "JSONB properties column name (overrides config file)")
	flag.Parse()

	// Load config file if provided, then apply env vars and flags as overrides.
	var fileCfg Config
	if *configPath != "" {
		var err error
		fileCfg, err = loadConfig(*configPath)
		if err != nil {
			log.Fatalf("datum-server: %v", err)
		}
	}

	// Precedence: flag > env var > config file > hardcoded default
	defaults := defaultColumns()
	port          := coalesce(*portFlag,      os.Getenv("PORT"),           fileCfg.Port,                   "3000")
	allowedOrigin := coalesce(*originFlag,    os.Getenv("ALLOWED_ORIGIN"), fileCfg.AllowedOrigin,          "*")
	table         := coalesce(*tableFlag,     os.Getenv("TABLE"),          fileCfg.Table.Name)
	colID         := coalesce(*colIDFlag,     os.Getenv("COL_ID"),         fileCfg.Table.ColID,            defaults.ID)
	colGeom       := coalesce(*colGeomFlag,   os.Getenv("COL_GEOM"),       fileCfg.Table.ColGeom,          defaults.Geom)
	colUpdAt      := coalesce(*colUpdAtFlag,  os.Getenv("COL_UPDATED_AT"), fileCfg.Table.ColUpdatedAt,     defaults.UpdatedAt)
	colProps      := coalesce(*colPropsFlag,  os.Getenv("COL_PROPERTIES"), fileCfg.Table.ColProperties,    defaults.Properties)

	// rate_limit: treat config file value of 0 as "unset" (0 is also the default).
	fileRateLimit := ""
	if fileCfg.RateLimit > 0 {
		fileRateLimit = fmt.Sprintf("%d", fileCfg.RateLimit)
	}
	rateLimitStr := coalesce(*rateLimitFlag, os.Getenv("RATE_LIMIT"), fileRateLimit, "0")

	// Validate
	if *dbURL == "" {
		log.Fatal("datum-server: -db flag or DATABASE_URL env var is required")
	}
	if table == "" {
		log.Fatal("datum-server: table name is required (set in config file under table.name or via -table flag)")
	}
	if !tableNameRe.MatchString(table) {
		log.Fatalf("datum-server: invalid table name %q (only [a-zA-Z_][a-zA-Z0-9_]*)", table)
	}

	writeLimit, err := strconv.Atoi(rateLimitStr)
	if err != nil || writeLimit < 0 {
		log.Fatalf("datum-server: invalid rate-limit value %q (must be a non-negative integer)", rateLimitStr)
	}

	cols := ColumnConfig{ID: colID, Geom: colGeom, UpdatedAt: colUpdAt, Properties: colProps}
	for label, name := range map[string]string{
		"col-id": cols.ID, "col-geom": cols.Geom,
		"col-updated-at": cols.UpdatedAt, "col-properties": cols.Properties,
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
