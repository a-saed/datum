// packages/server/sync.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func sendSnapshot(ctx context.Context, s *server, ts *tableState, client *wsClient, since string) error {
	var sinceTime time.Time
	if since != "" {
		if t, err := time.Parse(time.RFC3339Nano, since); err == nil {
			sinceTime = t
		}
	}

	table := pgx.Identifier{ts.name}.Sanitize()
	bbox  := client.bbox

	// Build SELECT list from introspected columns.
	var selects []string
	var geomCol, updCol string
	for _, c := range ts.columns {
		q := pgx.Identifier{c.Name}.Sanitize()
		switch c.Role {
		case "id", "updated_at":
			selects = append(selects, fmt.Sprintf("%s::text AS %s", q, q))
			if c.Role == "updated_at" {
				updCol = q
			}
		case "geom":
			selects = append(selects, fmt.Sprintf("ST_AsGeoJSON(%s)::text AS %s", q, q))
			geomCol = q
		default:
			selects = append(selects, fmt.Sprintf("%s AS %s", q, q))
		}
	}

	query := fmt.Sprintf(
		`SELECT %s FROM %s
		 WHERE ST_Intersects(%s, ST_MakeEnvelope($1, $2, $3, $4, 4326))
		 AND %s > $5`,
		strings.Join(selects, ", "),
		table, geomCol, updCol,
	)

	// Use a transaction so SET LOCAL session vars apply to the snapshot query.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin snapshot tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := setSessionClaims(ctx, tx, client.claims); err != nil {
		return err
	}

	rows, err := tx.Query(ctx, query, bbox[0], bbox[1], bbox[2], bbox[3], sinceTime)
	if err != nil {
		return fmt.Errorf("snapshot query: %w", err)
	}

	features, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		return fmt.Errorf("collect snapshot rows: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit snapshot tx: %w", err)
	}

	if features == nil {
		features = []map[string]any{}
	}

	msg, err := json.Marshal(SnapshotMessage{Type: "snapshot", Features: features})
	if err != nil {
		return err
	}

	select {
	case client.send <- msg:
	default:
		return fmt.Errorf("client send buffer full")
	}
	return nil
}
