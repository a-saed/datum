// packages/server/sync.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
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

	cols  := ts.cols
	table := pgx.Identifier{ts.name}.Sanitize()
	id    := pgx.Identifier{cols.ID}.Sanitize()
	geom  := pgx.Identifier{cols.Geom}.Sanitize()
	props := pgx.Identifier{cols.Properties}.Sanitize()
	upd   := pgx.Identifier{cols.UpdatedAt}.Sanitize()

	query := fmt.Sprintf(
		`SELECT %s::text, ST_AsGeoJSON(%s)::text, %s, %s::text
		 FROM %s
		 WHERE ST_Intersects(%s, ST_MakeEnvelope($1, $2, $3, $4, 4326))
		 AND %s > $5`,
		id, geom, props, upd, table, geom, upd,
	)

	bbox := client.bbox
	rows, err := s.pool.Query(ctx, query, bbox[0], bbox[1], bbox[2], bbox[3], sinceTime)
	if err != nil {
		return fmt.Errorf("snapshot query: %w", err)
	}
	defer rows.Close()

	features := make([]Feature, 0, 64)
	for rows.Next() {
		var f Feature
		var rawProps []byte
		if err := rows.Scan(&f.ID, &f.Geom, &rawProps, &f.UpdatedAt); err != nil {
			return fmt.Errorf("scan feature: %w", err)
		}
		if err := json.Unmarshal(rawProps, &f.Properties); err != nil {
			f.Properties = map[string]any{}
		}
		features = append(features, f)
	}
	if err := rows.Err(); err != nil {
		return err
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
