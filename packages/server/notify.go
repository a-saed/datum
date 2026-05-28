// packages/server/notify.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5"
)

func listenForNotifications(ctx context.Context, s *server) error {
	// Use a dedicated single connection for LISTEN (not the pool).
	conn, err := pgx.Connect(ctx, s.pool.Config().ConnString())
	if err != nil {
		return fmt.Errorf("connect for LISTEN: %w", err)
	}
	defer conn.Close(ctx)

	_, err = conn.Exec(ctx, "LISTEN datum_changes")
	if err != nil {
		return fmt.Errorf("LISTEN: %w", err)
	}

	log.Println("datum-server: listening for datum_changes notifications")

	for {
		notification, err := conn.WaitForNotification(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("WaitForNotification: %w", err)
		}

		var payload NotifyPayload
		if err := json.Unmarshal([]byte(notification.Payload), &payload); err != nil {
			log.Printf("datum-server: malformed notify payload: %v", err)
			continue
		}

		feature := Feature{
			ID:         payload.ID,
			Geom:       payload.Geom,
			Properties: payload.Properties,
			UpdatedAt:  payload.UpdatedAt,
		}
		delta := DeltaMessage{
			Type:           "delta",
			Op:             payload.Op,
			Feature:        feature,
			OriginClientID: payload.OriginClientID,
		}
		msg, err := json.Marshal(delta)
		if err != nil {
			continue
		}

		ts := s.tables[payload.Table]
		if ts == nil {
			log.Printf("datum-server: notify for unknown table %q, ignoring", payload.Table)
			continue
		}

		// Extract centroid lon/lat from GeoJSON for bbox intersection check.
		// For v0, use the first coordinate of the geometry as an approximation.
		lon, lat := extractFirstCoordinate(payload.Geom)
		ts.broadcast(msg, payload.OriginClientID, lon, lat)
	}
}

// extractFirstCoordinate parses a GeoJSON string and returns the first [lon, lat].
// For points this is exact. For polygons/lines this is an approximation sufficient
// for v0 bbox intersection — a feature that starts inside the bbox is broadcast.
func extractFirstCoordinate(geojson string) (float64, float64) {
	if geojson == "" {
		return 0, 0
	}
	var g struct {
		Type        string  `json:"type"`
		Coordinates []any `json:"coordinates"`
	}
	if err := json.Unmarshal([]byte(geojson), &g); err != nil {
		return 0, 0
	}
	switch g.Type {
	case "Point":
		if coords, ok := g.Coordinates[0].(float64); ok {
			lat, _ := g.Coordinates[1].(float64)
			return coords, lat
		}
	case "LineString", "MultiPoint":
		if first, ok := g.Coordinates[0].([]any); ok && len(first) >= 2 {
			lon, _ := first[0].(float64)
			lat, _ := first[1].(float64)
			return lon, lat
		}
	case "Polygon", "MultiLineString":
		if ring, ok := g.Coordinates[0].([]any); ok && len(ring) > 0 {
			if first, ok := ring[0].([]any); ok && len(first) >= 2 {
				lon, _ := first[0].(float64)
				lat, _ := first[1].(float64)
				return lon, lat
			}
		}
	}
	return 0, 0
}
