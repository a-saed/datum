// packages/server/write.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
)

func applyWrites(ctx context.Context, s *server, clientID string, edits []WriteEdit) error {
	editsJSON, err := json.Marshal(edits)
	if err != nil {
		return fmt.Errorf("marshal edits: %w", err)
	}

	// Tag this transaction with the originating client_id so the trigger
	// can embed it in the NOTIFY payload for deduplication.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`SELECT set_config('datum.client_id', $1, true)`, clientID)
	if err != nil {
		return fmt.Errorf("set client_id config: %w", err)
	}

	_, err = tx.Exec(ctx, `SELECT datum.write($1)`, editsJSON)
	if err != nil {
		return fmt.Errorf("datum.write: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	return nil
}
