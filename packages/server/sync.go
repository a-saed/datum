// packages/server/sync.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

func sendSnapshot(ctx context.Context, s *server, client *wsClient, since string) error {
	bbox := client.bbox
	bboxWKT := fmt.Sprintf(
		"ST_MakeEnvelope(%f, %f, %f, %f, 4326)",
		bbox[0], bbox[1], bbox[2], bbox[3],
	)

	var sinceTime time.Time
	if since != "" {
		if t, err := time.Parse(time.RFC3339Nano, since); err == nil {
			sinceTime = t
		}
	}

	rows, err := s.pool.Query(ctx, fmt.Sprintf(
		`SELECT id::text, geom, properties, updated_at::text FROM datum.sync(%s, $1)`,
		bboxWKT,
	), sinceTime)
	if err != nil {
		return fmt.Errorf("datum.sync query: %w", err)
	}
	defer rows.Close()

	features := make([]Feature, 0, 64)
	for rows.Next() {
		var f Feature
		var props []byte
		if err := rows.Scan(&f.ID, &f.Geom, &props, &f.UpdatedAt); err != nil {
			return fmt.Errorf("scan feature: %w", err)
		}
		if err := json.Unmarshal(props, &f.Properties); err != nil {
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
