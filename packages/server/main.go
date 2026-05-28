// packages/server/main.go
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"syscall"

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

	// Global settings — env vars override config file.
	port          := coalesce(os.Getenv("PORT"),           fileCfg.Port,          "3000")
	allowedOrigin := coalesce(os.Getenv("ALLOWED_ORIGIN"), fileCfg.AllowedOrigin, "*")

	fileRateLimit := ""
	if fileCfg.RateLimit > 0 {
		fileRateLimit = fmt.Sprintf("%d", fileCfg.RateLimit)
	}
	rateLimitStr := coalesce(os.Getenv("RATE_LIMIT"), fileRateLimit, "0")

	if *dbURL == "" {
		log.Fatal("datum-server: -db flag or DATABASE_URL env var is required")
	}

	writeLimit, err := strconv.Atoi(rateLimitStr)
	if err != nil || writeLimit < 0 {
		log.Fatalf("datum-server: invalid rate_limit value %q (must be a non-negative integer)", rateLimitStr)
	}

	defaults := defaultColumns()

	// Collect table configurations.
	// tables: list takes priority; fall back to single table: entry with env var overrides.
	var tableConfs []TableConf
	if len(fileCfg.Tables) > 0 {
		tableConfs = fileCfg.Tables
	} else {
		name     := coalesce(os.Getenv("TABLE"),          fileCfg.Table.Name)
		colID    := coalesce(os.Getenv("COL_ID"),         fileCfg.Table.ColID,         defaults.ID)
		colGeom  := coalesce(os.Getenv("COL_GEOM"),       fileCfg.Table.ColGeom,       defaults.Geom)
		colUpdAt := coalesce(os.Getenv("COL_UPDATED_AT"), fileCfg.Table.ColUpdatedAt,  defaults.UpdatedAt)
		colProps := coalesce(os.Getenv("COL_PROPERTIES"), fileCfg.Table.ColProperties, defaults.Properties)
		tableConfs = []TableConf{{
			Name:          name,
			ColID:         colID,
			ColGeom:       colGeom,
			ColUpdatedAt:  colUpdAt,
			ColProperties: colProps,
		}}
	}

	if len(tableConfs) == 0 || tableConfs[0].Name == "" {
		log.Fatal("datum-server: table name is required (set table.name in datum.yaml, tables: list, or TABLE env var)")
	}

	// Validate each table and build tableState objects.
	seen   := make(map[string]bool)
	tables := make([]*tableState, 0, len(tableConfs))
	for _, tc := range tableConfs {
		if tc.Name == "" {
			log.Fatal("datum-server: each tables entry must have a name")
		}
		if !tableNameRe.MatchString(tc.Name) {
			log.Fatalf("datum-server: invalid table name %q (only [a-zA-Z_][a-zA-Z0-9_]*)", tc.Name)
		}
		if seen[tc.Name] {
			log.Fatalf("datum-server: duplicate table name %q", tc.Name)
		}
		seen[tc.Name] = true

		cols := ColumnConfig{
			ID:         coalesce(tc.ColID,         defaults.ID),
			Geom:       coalesce(tc.ColGeom,       defaults.Geom),
			UpdatedAt:  coalesce(tc.ColUpdatedAt,  defaults.UpdatedAt),
			Properties: coalesce(tc.ColProperties, defaults.Properties),
		}
		for label, name := range map[string]string{
			"col_id":         cols.ID,
			"col_geom":       cols.Geom,
			"col_updated_at": cols.UpdatedAt,
			"col_properties": cols.Properties,
		} {
			if !tableNameRe.MatchString(name) {
				log.Fatalf("datum-server: table %q: invalid %s value %q (only [a-zA-Z_][a-zA-Z0-9_]*)", tc.Name, label, name)
			}
		}
		tables = append(tables, &tableState{
			name:    tc.Name,
			cols:    cols,
			clients: make(map[string]*wsClient),
		})
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, *dbURL)
	if err != nil {
		log.Fatalf("datum-server: connect to postgres: %v", err)
	}
	defer pool.Close()

	for _, ts := range tables {
		if err := runMigration(ctx, pool, ts.name, ts.cols); err != nil {
			log.Fatalf("datum-server: migration failed for table %q: %v", ts.name, err)
		}
		log.Printf("datum-server: migration applied to table %q", ts.name)
	}

	srv := newServer(pool, tables, port, allowedOrigin, writeLimit)
	log.Printf("datum-server: listening on :%s", port)
	if err := srv.run(ctx); err != nil {
		log.Fatalf("datum-server: %v", err)
	}
}
