// packages/server/sync.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

func sendSnapshot(ctx context.Context, s *server, client *wsClient) error {
	bbox := client.bbox
	bboxWKT := fmt.Sprintf(
		"ST_MakeEnvelope(%f, %f, %f, %f, 4326)",
		bbox[0], bbox[1], bbox[2], bbox[3],
	)

	rows, err := s.pool.Query(ctx, fmt.Sprintf(
		`SELECT id::text, geom, properties, updated_at FROM datum.sync(%s, $1)`,
		bboxWKT,
	), time.Time{}) // epoch — return everything in bbox
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
			f.Properties = map[string]interface{}{}
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
