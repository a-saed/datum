// packages/server/main.go
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"
)

var tableNameRe = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

func main() {
	logger := newLogger(os.Getenv("LOG_LEVEL"))

	configPath := flag.String("config", os.Getenv("CONFIG"), "Path to datum.yaml config file")
	dbURL      := flag.String("db",     os.Getenv("DATABASE_URL"), "PostgreSQL connection URL (required)")
	flag.Parse()

	// Load config file if provided.
	var fileCfg Config
	if *configPath != "" {
		var err error
		fileCfg, err = loadConfig(*configPath)
		if err != nil {
			logger.Error("config error", "err", err)
			os.Exit(1)
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
		logger.Error("missing database URL", "hint", "set -db flag or DATABASE_URL env var")
		os.Exit(1)
	}

	writeLimit, err := strconv.Atoi(rateLimitStr)
	if err != nil || writeLimit < 0 {
		logger.Error("invalid rate_limit value", "value", rateLimitStr, "hint", "must be a non-negative integer")
		os.Exit(1)
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
		logger.Error("table name is required", "hint", "set table.name in datum.yaml, tables: list, or TABLE env var")
		os.Exit(1)
	}

	// Validate each table and build tableState objects.
	seen   := make(map[string]bool)
	tables := make([]*tableState, 0, len(tableConfs))
	for _, tc := range tableConfs {
		if tc.Name == "" {
			logger.Error("each tables entry must have a name")
			os.Exit(1)
		}
		if !tableNameRe.MatchString(tc.Name) {
			logger.Error("invalid table name", "table", tc.Name, "hint", "only [a-zA-Z_][a-zA-Z0-9_]* allowed")
			os.Exit(1)
		}
		if seen[tc.Name] {
			logger.Error("duplicate table name", "table", tc.Name)
			os.Exit(1)
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
				logger.Error("invalid column config value", "table", tc.Name, "field", label, "value", name, "hint", "only [a-zA-Z_][a-zA-Z0-9_]* allowed")
				os.Exit(1)
			}
		}
		tables = append(tables, &tableState{
			name:    tc.Name,
			cols:    cols,
			clients: make(map[string]*wsClient),
			logger:  logger,
		})
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, *dbURL)
	if err != nil {
		logger.Error("connect to postgres failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	// Build JWT verifier (nil when auth not configured).
	verifier, err := newVerifier(fileCfg.Auth)
	if err != nil {
		logger.Error("auth config error", "err", err)
		os.Exit(1)
	}

	// Warn if connected as superuser — RLS would be bypassed.
	if fileCfg.Auth.Enabled() {
		var isSuperuser bool
		if err := pool.QueryRow(ctx, `SELECT rolsuper FROM pg_roles WHERE rolname = current_user`).Scan(&isSuperuser); err != nil {
			logger.Warn("could not determine if database role is superuser", "err", err)
		} else if isSuperuser {
			logger.Warn("DATABASE_URL connects as a superuser; Row Level Security will be bypassed", "hint", "create a restricted role for production use")
		}
	}

	for _, ts := range tables {
		if err := runMigration(ctx, pool, ts.name, ts.cols); err != nil {
			logger.Error("migration failed", "table", ts.name, "err", err)
			os.Exit(1)
		}

		columns, err := introspectSchema(ctx, pool, ts.name, ts.cols, logger)
		if err != nil {
			logger.Error("schema introspection failed", "table", ts.name, "err", err)
			os.Exit(1)
		}
		isSpatial, err := validateColumns(ts.name, columns)
		if err != nil {
			logger.Error("column validation failed", "table", ts.name, "err", err)
			os.Exit(1)
		}
		ts.isSpatial = isSpatial
		if !isSpatial {
			logger.Info("table ready in non-spatial mode (no geometry column)", "table", ts.name)
		}

		if err := installTrigger(ctx, pool, ts.name, columns); err != nil {
			logger.Error("install trigger failed", "table", ts.name, "err", err)
			os.Exit(1)
		}

		schemaMsg, err := json.Marshal(SchemaMessage{Type: "schema", Columns: columns})
		if err != nil {
			logger.Error("serialise schema failed", "table", ts.name, "err", err)
			os.Exit(1)
		}

		ts.columns = columns
		ts.schemaMsg = schemaMsg
		logger.Info("table ready", "table", ts.name, "columns", len(columns))
	}

	srv := newServer(pool, tables, port, allowedOrigin, writeLimit, verifier, logger)
	logger.Info("listening", "port", port)
	if err := srv.run(ctx); err != nil {
		logger.Error("server error", "err", err)
		os.Exit(1)
	}
}
