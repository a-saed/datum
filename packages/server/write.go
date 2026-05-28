// packages/server/write.go
package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
)

func applyWrites(ctx context.Context, s *server, clientID string, edits []WriteEdit) error {
	cols  := s.cols
	table := pgx.Identifier{s.table}.Sanitize()
	id    := pgx.Identifier{cols.ID}.Sanitize()
	geom  := pgx.Identifier{cols.Geom}.Sanitize()
	props := pgx.Identifier{cols.Properties}.Sanitize()
	upd   := pgx.Identifier{cols.UpdatedAt}.Sanitize()

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Tag the transaction so the trigger can embed origin_client_id in the NOTIFY payload.
	if _, err := tx.Exec(ctx, `SELECT set_config('datum.client_id', $1, true)`, clientID); err != nil {
		return fmt.Errorf("set client_id: %w", err)
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

	for _, edit := range edits {
		switch edit.Op {
		case "delete":
			if _, err := tx.Exec(ctx, deleteSQL, edit.FeatureID); err != nil {
				return fmt.Errorf("delete %s: %w", edit.FeatureID, err)
			}
		case "insert", "update":
			geomStr, _ := edit.Data["geom"].(string)
			propsJSON, err := json.Marshal(edit.Data["properties"])
			if err != nil {
				return fmt.Errorf("marshal properties: %w", err)
			}
			if _, err := tx.Exec(ctx, upsertSQL, edit.FeatureID, geomStr, propsJSON, edit.UpdatedAt); err != nil {
				return fmt.Errorf("upsert %s: %w", edit.FeatureID, err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}
