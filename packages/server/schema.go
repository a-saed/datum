// packages/server/schema.go
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ColumnDef describes one column as sent to the client.
type ColumnDef struct {
	Name     string `json:"name"`
	PGType   string `json:"pg_type"`
	Role     string `json:"role"`     // "id" | "geom" | "updated_at" | "properties" | "data"
	Nullable bool   `json:"nullable"`
}

// SchemaMessage is sent once per connection before the first snapshot.
type SchemaMessage struct {
	Type    string      `json:"type"` // always "schema"
	Columns []ColumnDef `json:"columns"`
}

// normalizeType maps a Postgres typname (from pg_catalog) to the normalised
// pg_type string sent to clients. Unknown types fall back to "text".
func normalizeType(pgTypeName string) string {
	switch pgTypeName {
	case "text", "varchar", "bpchar", "char":
		return "text"
	case "int2", "int4", "int8":
		return "int8"
	case "float4", "float8", "numeric":
		return "float8"
	case "bool":
		return "bool"
	case "uuid":
		return "uuid"
	case "jsonb", "json":
		return "jsonb"
	case "timestamptz", "timestamp":
		return "timestamptz"
	case "date":
		return "date"
	case "geometry":
		return "geometry"
	default:
		log.Printf("WARN datum-server: unknown postgres type %q — treating as text", pgTypeName)
		return "text"
	}
}

// introspectSchema queries pg_catalog for the table's columns and assigns
// roles from ColumnConfig. Returns columns in attnum order.
func introspectSchema(ctx context.Context, pool *pgxpool.Pool, tableName string, cols ColumnConfig) ([]ColumnDef, error) {
	rows, err := pool.Query(ctx, `
		SELECT
		    a.attname        AS name,
		    t.typname        AS pg_type,
		    NOT a.attnotnull AS nullable
		FROM pg_catalog.pg_attribute a
		JOIN pg_catalog.pg_type      t ON t.oid = a.atttypid
		JOIN pg_catalog.pg_class     c ON c.oid = a.attrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE c.relname  = $1
		  AND n.nspname  = current_schema()
		  AND a.attnum   > 0
		  AND NOT a.attisdropped
		  AND a.attgenerated = ''
		ORDER BY a.attnum
	`, tableName)
	if err != nil {
		return nil, fmt.Errorf("introspect %q: %w", tableName, err)
	}
	defer rows.Close()

	var defs []ColumnDef
	for rows.Next() {
		var name, rawType string
		var nullable bool
		if err := rows.Scan(&name, &rawType, &nullable); err != nil {
			return nil, fmt.Errorf("scan column: %w", err)
		}
		pgType := normalizeType(rawType)

		role := "data"
		switch {
		case name == cols.ID:
			role = "id"
		case name == cols.Geom:
			role = "geom"
		case name == cols.UpdatedAt:
			role = "updated_at"
		case cols.Properties != "" && name == cols.Properties:
			role = "properties"
		}
		defs = append(defs, ColumnDef{Name: name, PGType: pgType, Role: role, Nullable: nullable})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(defs) == 0 {
		return nil, fmt.Errorf("datum-server: table %q not found in current schema — check that the table exists and search_path is correct", tableName)
	}
	return defs, nil
}

// validateColumns checks that the required columns (id UUID, updated_at timestamptz) are present.
// Returns (isSpatial, error) where isSpatial is true when a valid geometry column is present.
// Missing geometry is not fatal — tables without geometry are synced in non-spatial mode.
func validateColumns(tableName string, cols []ColumnDef) (bool, error) {
	var hasID, hasGeom, hasUpdAt bool
	for _, c := range cols {
		switch c.Role {
		case "id":
			if c.PGType != "uuid" {
				return false, fmt.Errorf("datum-server: table %q: id column %q must be uuid, got %s", tableName, c.Name, c.PGType)
			}
			hasID = true
		case "geom":
			if c.PGType != "geometry" {
				return false, fmt.Errorf("datum-server: table %q: geom column %q must be geometry, got %s", tableName, c.Name, c.PGType)
			}
			hasGeom = true
		case "updated_at":
			if c.PGType != "timestamptz" {
				return false, fmt.Errorf("datum-server: table %q: updated_at column %q must be timestamptz, got %s", tableName, c.Name, c.PGType)
			}
			hasUpdAt = true
		}
	}
	if !hasID {
		return false, fmt.Errorf("datum-server: table %q is missing a UUID primary key column.\nSet col_id in datum.yaml to point to an existing UUID column.", tableName)
	}
	if !hasUpdAt {
		return false, fmt.Errorf("datum-server: table %q is missing a timestamptz updated_at column.\nSet col_updated_at in datum.yaml to point to an existing TIMESTAMPTZ column.", tableName)
	}
	return hasGeom, nil
}
