// packages/server/main.go
package main

import (
	"context"
	"flag"
	"log"
	"regexp"

	"github.com/jackc/pgx/v5/pgxpool"
)

var tableNameRe = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

func main() {
	dbURL         := flag.String("db",             "",     "PostgreSQL connection URL (required)")
	table         := flag.String("table",          "",     "Table name to sync (required)")
	port          := flag.String("port",           "3000", "Port to listen on")
	allowedOrigin := flag.String("allowed-origin", "*",    "Allowed WebSocket origin (e.g. https://myapp.com). Use * to allow all (dev only)")
	flag.Parse()

	if *dbURL == "" {
		log.Fatal("datum-server: -db flag is required")
	}
	if *table == "" {
		log.Fatal("datum-server: -table flag is required")
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
