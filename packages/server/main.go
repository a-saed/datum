// packages/server/main.go
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"regexp"

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
	dbURL         := flag.String("db",             envOr("DATABASE_URL", ""),   "PostgreSQL connection URL (required)")
	table         := flag.String("table",          envOr("TABLE", ""),          "Table name to sync (required)")
	port          := flag.String("port",           envOr("PORT", "3000"),       "Port to listen on")
	allowedOrigin := flag.String("allowed-origin", envOr("ALLOWED_ORIGIN", "*"), "Allowed WebSocket origin (e.g. https://myapp.com). Use * to allow all (dev only)")
	flag.Parse()

	if *dbURL == "" {
		log.Fatal("datum-server: -db flag or DATABASE_URL env var is required")
	}
	if *table == "" {
		log.Fatal("datum-server: -table flag or TABLE env var is required")
	}
	if !tableNameRe.MatchString(*table) {
		log.Fatalf("datum-server: invalid table name %q (only [a-zA-Z_][a-zA-Z0-9_]*)", *table)
	}

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, *dbURL)
	if err != nil {
		log.Fatalf("datum-server: connect to postgres: %v", err)
	}
	defer pool.Close()

	if err := runMigration(ctx, pool, *table); err != nil {
		log.Fatalf("datum-server: migration failed: %v", err)
	}
	log.Printf("datum-server: migration applied to table %q", *table)

	srv := newServer(pool, *table, *port, *allowedOrigin)
	log.Printf("datum-server: listening on :%s", *port)
	log.Fatal(srv.run(ctx))
}
