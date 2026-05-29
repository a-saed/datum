// packages/server/write.go
package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
)

const maxEditsPerBatch = 500

func applyWrites(ctx context.Context, s *server, ts *tableState, clientID string, claims map[string]any, edits []WriteEdit) ([]string, error) {
	if len(edits) > maxEditsPerBatch {
		return nil, fmt.Errorf("batch too large: %d edits (max %d)", len(edits), maxEditsPerBatch)
	}

	cols  := ts.cols
	table := pgx.Identifier{ts.name}.Sanitize()
	id    := pgx.Identifier{cols.ID}.Sanitize()
	geom  := pgx.Identifier{cols.Geom}.Sanitize()
	props := pgx.Identifier{cols.Properties}.Sanitize()
	upd   := pgx.Identifier{cols.UpdatedAt}.Sanitize()

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Tag the transaction so the trigger can embed origin_client_id in the NOTIFY payload.
	if _, err := tx.Exec(ctx, `SELECT set_config('datum.client_id', $1, true)`, clientID); err != nil {
		return nil, fmt.Errorf("set client_id: %w", err)
	}

	// Set JWT claims as transaction-local session vars for RLS.
	if err := setSessionClaims(ctx, tx, claims); err != nil {
		return nil, err
	}

	deleteSQL := fmt.Sprintf(`DELETE FROM %s WHERE %s = $1::uuid`, table, id)

	upsertSQL := fmt.Sprintf(`
		INSERT INTO %s (%s, %s, %s, %s)
		VALUES ($1::uuid, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), $3::jsonb, $4::timestamptz)
		ON CONFLICT (%s) DO UPDATE
		SET %s = EXCLUDED.%s,
		    %s = EXCLUDED.%s,
		    %s = EXCLUDED.%s
		WHERE EXCLUDED.%s > %s.%s`,
		table, id, geom, props, upd,
		id,
		geom, geom,
		props, props,
		upd, upd,
		upd, table, upd,
	)

	writeIDs := make([]string, 0, len(edits))
	for _, edit := range edits {
		switch edit.Op {
		case "delete":
			if _, err := tx.Exec(ctx, deleteSQL, edit.FeatureID); err != nil {
				return nil, fmt.Errorf("delete %s: %w", edit.FeatureID, err)
			}
		case "insert", "update":
			geomStr, _ := edit.Data["geom"].(string)
			if geomStr == "" {
				return nil, fmt.Errorf("edit %s: missing geom", edit.FeatureID)
			}
			propsJSON, err := json.Marshal(edit.Data["properties"])
			if err != nil {
				return nil, fmt.Errorf("marshal properties: %w", err)
			}
			if _, err := tx.Exec(ctx, upsertSQL, edit.FeatureID, geomStr, propsJSON, edit.UpdatedAt); err != nil {
				return nil, fmt.Errorf("upsert %s: %w", edit.FeatureID, err)
			}
		default:
			return nil, fmt.Errorf("unknown op %q for edit %s", edit.Op, edit.FeatureID)
		}
		if edit.WriteID != "" {
			writeIDs = append(writeIDs, edit.WriteID)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return writeIDs, nil
}

// setSessionClaims sets datum.<key> = val for each claim as a transaction-local
// session variable. No-op when claims is nil or empty.
func setSessionClaims(ctx context.Context, tx pgx.Tx, claims map[string]any) error {
	for key, val := range claims {
		if _, err := tx.Exec(ctx,
			`SELECT set_config($1, $2, true)`,
			"datum."+key,
			fmt.Sprintf("%v", val),
		); err != nil {
			return fmt.Errorf("set claim %s: %w", key, err)
		}
	}
	return nil
}
