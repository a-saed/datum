// packages/server/predicate.go
package main

import (
	"context"
	"fmt"
	"regexp"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// blocklistRe matches dangerous SQL patterns forbidden in WHERE predicates.
var blocklistRe = regexp.MustCompile(
	`(?i)\b(select|insert|update|delete|drop|alter|truncate|execute|do|call|copy)\b` +
		`|;|--|/\*|\*/` +
		`|\bdblink\b|\bpg_read_file\b|\bpg_write_file\b|\bpg_write_binary_file\b` +
		`|\bcopy_to\b|\blo_export\b`,
)

// paramRe matches $1, $2, ... placeholders.
var paramRe = regexp.MustCompile(`\$(\d+)`)

// checkBlocklist rejects predicates containing dangerous SQL keywords or characters.
func checkBlocklist(where string) error {
	if blocklistRe.MatchString(where) {
		return fmt.Errorf("predicate contains disallowed keyword or character")
	}
	return nil
}

// validatePredicate checks a WHERE clause is safe (blocklist) and syntactically valid
// (EXPLAIN in a READ ONLY transaction). Returns nil if valid.
func validatePredicate(ctx context.Context, pool *pgxpool.Pool, tableName string, where string, params []any) error {
	if err := checkBlocklist(where); err != nil {
		return err
	}

	// Replace $n with NULL for Postgres parser validation.
	// NULL is syntactically valid in any expression position.
	dummyWhere := paramRe.ReplaceAllString(where, "NULL")

	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire connection for predicate validation: %w", err)
	}
	defer conn.Release()

	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin validation tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET TRANSACTION READ ONLY"); err != nil {
		return fmt.Errorf("set read only: %w", err)
	}

	quoted := pgx.Identifier{tableName}.Sanitize()
	explainSQL := fmt.Sprintf("EXPLAIN SELECT 1 FROM %s WHERE (%s)", quoted, dummyWhere)
	if _, err := tx.Exec(ctx, explainSQL); err != nil {
		return fmt.Errorf("invalid predicate: %w", err)
	}

	return nil
}

// rewritePredicateParams increments all $n placeholders in where by offset.
// E.g. rewritePredicateParams("type=$1 AND h>$2", 5) → "type=$6 AND h>$7"
func rewritePredicateParams(where string, offset int) string {
	if offset == 0 {
		return where
	}
	return paramRe.ReplaceAllStringFunc(where, func(match string) string {
		n, _ := strconv.Atoi(match[1:])
		return fmt.Sprintf("$%d", n+offset)
	})
}

// checkPredicateMatch runs SELECT EXISTS to verify a feature matches a client's predicate.
// Returns true if it matches, or if featureID/idColName is empty (fail-open).
func checkPredicateMatch(ctx context.Context, pool *pgxpool.Pool, ts *tableState, featureID string, where string, whereParams []any) (bool, error) {
	if featureID == "" {
		return true, nil
	}

	var idColName string
	for _, c := range ts.columns {
		if c.Role == "id" {
			idColName = c.Name
			break
		}
	}
	if idColName == "" {
		return true, nil
	}

	table := pgx.Identifier{ts.name}.Sanitize()
	idCol := pgx.Identifier{idColName}.Sanitize()

	// $1 is featureID; shift user's $n by 1.
	rewritten := rewritePredicateParams(where, 1)

	sql := fmt.Sprintf(
		`SELECT EXISTS(SELECT 1 FROM %s WHERE %s = $1::uuid AND (%s))`,
		table, idCol, rewritten,
	)

	args := append([]any{featureID}, whereParams...)

	var exists bool
	if err := pool.QueryRow(ctx, sql, args...).Scan(&exists); err != nil {
		return false, fmt.Errorf("predicate match check: %w", err)
	}
	return exists, nil
}
