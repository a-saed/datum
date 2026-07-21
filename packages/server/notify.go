// packages/server/notify.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"

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

	s.logger.Info("listening for datum_changes notifications")

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
			s.logger.Error("malformed notify payload", "err", err)
			continue
		}

		// Support both old trigger format (flat fields) and new format (feature: {...}).
		feature := payload.Feature
		if feature == nil {
			feature = Feature{
				"id":         payload.LegacyID,
				"geom":       payload.LegacyGeom,
				"properties": payload.LegacyProperties,
				"updated_at": payload.LegacyUpdatedAt,
			}
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
			s.logger.Warn("notify for unknown table, ignoring", "table", payload.Table)
			continue
		}

		// Extract geom bbox only for spatial tables.
		var geomBbox [4]float64
		if ts.isSpatial {
			geomStr, _ := feature["geom"].(string)
			geomBbox = extractBbox(geomStr)
		}

		// Extract feature ID for predicate and RLS matching.
		var featureID string
		for _, col := range ts.columns {
			if col.Role == "id" {
				if v, ok := feature[col.Name]; ok {
					featureID, _ = v.(string)
				}
				break
			}
		}

		// Pass 1: collect candidates under a brief read lock.
		// Spatial: check bbox intersection. Non-spatial: include all subscribers.
		type candidate struct {
			client *wsClient
			id     string
		}
		ts.mu.RLock()
		var candidates []candidate
		for id, c := range ts.clients {
			if id == payload.OriginClientID {
				continue
			}
			if ts.isSpatial {
				if bboxesIntersect(c.bbox, geomBbox) {
					candidates = append(candidates, candidate{c, id})
				}
			} else {
				candidates = append(candidates, candidate{c, id})
			}
		}
		ts.mu.RUnlock()

		// Pass 2: predicate check outside the lock, then send.
		for _, cand := range candidates {
			if cand.client.where != "" {
				matched, err := checkPredicateMatch(ctx, s.pool, ts, featureID, cand.client.where, cand.client.whereParams)
				if err != nil {
					s.logger.Error("predicate check error", "client_id", cand.id, "err", err)
					continue
				}
				if !matched {
					// For updates: the feature was in the client's subscription but no longer matches.
					// Send a synthetic delete so the client removes the stale row.
					// For inserts: the row was never in the client's DB — nothing to remove.
					if payload.Op == "update" {
						gone := DeltaMessage{
							Type:           "delta",
							Op:             "delete",
							Feature:        Feature{"id": featureID},
							OriginClientID: payload.OriginClientID,
						}
						if goneMsg, err := json.Marshal(gone); err == nil {
							select {
							case cand.client.send <- goneMsg:
							default:
								s.logger.Warn("client send buffer full, dropping gone notification", "client_id", cand.id)
							}
						}
					}
					continue
				}
			}

			// Pass 3: RLS check — only when auth is configured, client is authenticated,
			// and this is not a delete (deleted rows can't be queried through RLS).
			if s.verifier != nil && cand.client.claims != nil && payload.Op != "delete" {
				allowed, rlsErr := checkRLSAccess(ctx, s.pool, ts, featureID, cand.client.claims)
				if rlsErr != nil {
					s.logger.Error("RLS check error", "client_id", cand.id, "err", rlsErr)
					// fail-open: send the delta despite the error
				} else if !allowed {
					continue
				}
			}

			select {
			case cand.client.send <- msg:
			default:
				s.logger.Warn("client send buffer full, dropping delta", "client_id", cand.id)
			}
		}
	}
}

// extractBbox returns the bounding box [minX, minY, maxX, maxY] of a GeoJSON geometry string.
func extractBbox(geojson string) [4]float64 {
	if geojson == "" {
		return [4]float64{}
	}
	var g struct {
		Type        string `json:"type"`
		Coordinates any    `json:"coordinates"`
	}
	if err := json.Unmarshal([]byte(geojson), &g); err != nil {
		return [4]float64{}
	}

	minX, minY := math.MaxFloat64, math.MaxFloat64
	maxX, maxY := -math.MaxFloat64, -math.MaxFloat64

	var walk func(v any)
	walk = func(v any) {
		switch val := v.(type) {
		case []any:
			if len(val) >= 2 {
				if x, ok := val[0].(float64); ok {
					if y, ok := val[1].(float64); ok {
						// Check if this looks like a coordinate pair (numbers), not a nested array.
						if _, nested := val[0].([]any); !nested {
							if x < minX { minX = x }
							if x > maxX { maxX = x }
							if y < minY { minY = y }
							if y > maxY { maxY = y }
							return
						}
					}
				}
			}
			for _, item := range val {
				walk(item)
			}
		}
	}
	walk(g.Coordinates)

	if minX == math.MaxFloat64 {
		return [4]float64{}
	}
	return [4]float64{minX, minY, maxX, maxY}
}

// bboxesIntersect returns true when two [minX, minY, maxX, maxY] boxes overlap.
func bboxesIntersect(a, b [4]float64) bool {
	return a[0] <= b[2] && a[2] >= b[0] &&
		a[1] <= b[3] && a[3] >= b[1]
}
