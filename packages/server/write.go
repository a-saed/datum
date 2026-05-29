// packages/server/write.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

const maxEditsPerBatch = 500

func applyWrites(ctx context.Context, s *server, ts *tableState, clientID string, claims map[string]any, edits []WriteEdit) ([]string, error) {
	if len(edits) > maxEditsPerBatch {
		return nil, fmt.Errorf("batch too large: %d edits (max %d)", len(edits), maxEditsPerBatch)
	}

	table := pgx.Identifier{ts.name}.Sanitize()
	var idCol string
	for _, c := range ts.columns {
		if c.Role == "id" {
			idCol = pgx.Identifier{c.Name}.Sanitize()
			break
		}
	}

	// Build write columns (everything except id).
	type writeCol struct {
		name   string // original column name (for Data lookup)
		quoted string // quoted identifier
		role   string
	}
	var writeCols []writeCol
	for _, c := range ts.columns {
		if c.Role == "id" {
			continue
		}
		writeCols = append(writeCols, writeCol{
			name:   c.Name,
			quoted: pgx.Identifier{c.Name}.Sanitize(),
			role:   c.Role,
		})
	}

	// INSERT column list: id first, then write cols.
	insertCols := make([]string, 0, len(writeCols)+1)
	insertCols = append(insertCols, idCol)
	for _, wc := range writeCols {
		insertCols = append(insertCols, wc.quoted)
	}

	// VALUE placeholders with casts.
	valuePlaceholders := make([]string, 0, len(writeCols)+1)
	valuePlaceholders = append(valuePlaceholders, "$1::uuid") // id
	for i, wc := range writeCols {
		ph := fmt.Sprintf("$%d", i+2)
		switch wc.role {
		case "geom":
			valuePlaceholders = append(valuePlaceholders, fmt.Sprintf("ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)", ph))
		case "updated_at":
			valuePlaceholders = append(valuePlaceholders, ph+"::timestamptz")
		default:
			valuePlaceholders = append(valuePlaceholders, ph)
		}
	}

	// ON CONFLICT SET list (all write cols).
	setClauses := make([]string, 0, len(writeCols))
	for _, wc := range writeCols {
		setClauses = append(setClauses, fmt.Sprintf("%s = EXCLUDED.%s", wc.quoted, wc.quoted))
	}

	// updated_at quoted identifier for WHERE clause.
	var updQuoted string
	for _, wc := range writeCols {
		if wc.role == "updated_at" {
			updQuoted = wc.quoted
			break
		}
	}

	upsertSQL := fmt.Sprintf(`
		INSERT INTO %s (%s)
		VALUES (%s)
		ON CONFLICT (%s) DO UPDATE
		SET %s
		WHERE EXCLUDED.%s > %s.%s`,
		table,
		strings.Join(insertCols, ", "),
		strings.Join(valuePlaceholders, ", "),
		idCol,
		strings.Join(setClauses, ",\n    "),
		updQuoted, table, updQuoted,
	)

	deleteSQL := fmt.Sprintf(`DELETE FROM %s WHERE %s = $1::uuid`, table, idCol)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT set_config('datum.client_id', $1, true)`, clientID); err != nil {
		return nil, fmt.Errorf("set client_id: %w", err)
	}
	if err := setSessionClaims(ctx, tx, claims); err != nil {
		return nil, err
	}

	writeIDs := make([]string, 0, len(edits))
	for _, edit := range edits {
		switch edit.Op {
		case "delete":
			if _, err := tx.Exec(ctx, deleteSQL, edit.FeatureID); err != nil {
				return nil, fmt.Errorf("delete %s: %w", edit.FeatureID, err)
			}
		case "insert", "update":
			// Build args: id first, then values for each write column.
			args := make([]any, len(writeCols)+1)
			args[0] = edit.FeatureID
			for i, wc := range writeCols {
				val := edit.Data[wc.name]
				// jsonb columns: marshal objects/arrays to JSON string for Postgres to parse.
				if val != nil {
					switch v := val.(type) {
					case map[string]any, []any:
						b, err := json.Marshal(v)
						if err != nil {
							return nil, fmt.Errorf("marshal column %s: %w", wc.name, err)
						}
						val = string(b)
					}
				}
				args[i+1] = val
			}
			if _, err := tx.Exec(ctx, upsertSQL, args...); err != nil {
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
		str, err := claimToString(val)
		if err != nil {
			return fmt.Errorf("set claim %s: %w", key, err)
		}
		if _, err := tx.Exec(ctx,
			`SELECT set_config($1, $2, true)`,
			"datum."+key,
			str,
		); err != nil {
			return fmt.Errorf("set claim %s: %w", key, err)
		}
	}
	return nil
}

// claimToString converts a JWT claim value to a string suitable for Postgres set_config.
// Strings are passed through. Numbers are formatted without scientific notation.
// Booleans become "true"/"false". Arrays and objects are JSON-encoded.
func claimToString(v any) (string, error) {
	switch c := v.(type) {
	case string:
		return c, nil
	case float64:
		// JSON numbers arrive as float64. Preserve integer semantics when the
		// value has no fractional part so Postgres can cast to bigint/int.
		if c == float64(int64(c)) {
			return strconv.FormatInt(int64(c), 10), nil
		}
		return strconv.FormatFloat(c, 'f', -1, 64), nil
	case bool:
		return strconv.FormatBool(c), nil
	default:
		// Arrays, objects, and other types → JSON so Postgres can cast to jsonb.
		b, err := json.Marshal(c)
		if err != nil {
			return "", err
		}
		return string(b), nil
	}
}
