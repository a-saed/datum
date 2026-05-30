// packages/server/schema_test.go
package main

import "testing"

func TestNormalizeType(t *testing.T) {
	cases := []struct{ in, want string }{
		{"text", "text"}, {"varchar", "text"}, {"bpchar", "text"}, {"char", "text"},
		{"int2", "int8"}, {"int4", "int8"}, {"int8", "int8"},
		{"float4", "float8"}, {"float8", "float8"}, {"numeric", "float8"},
		{"bool", "bool"}, {"uuid", "uuid"},
		{"jsonb", "jsonb"}, {"json", "jsonb"},
		{"timestamptz", "timestamptz"}, {"timestamp", "timestamptz"},
		{"date", "date"}, {"geometry", "geometry"},
		{"unknown_xyz", "text"}, // fallback
	}
	for _, c := range cases {
		got := normalizeType(c.in)
		if got != c.want {
			t.Errorf("normalizeType(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestValidateColumns_AllPresent(t *testing.T) {
	cols := []ColumnDef{
		{Name: "id", PGType: "uuid", Role: "id"},
		{Name: "geom", PGType: "geometry", Role: "geom"},
		{Name: "updated_at", PGType: "timestamptz", Role: "updated_at"},
		{Name: "name", PGType: "text", Role: "data", Nullable: true},
	}
	if _, err := validateColumns("t", cols); err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestValidateColumns_MissingID(t *testing.T) {
	cols := []ColumnDef{
		{Name: "geom", PGType: "geometry", Role: "geom"},
		{Name: "updated_at", PGType: "timestamptz", Role: "updated_at"},
	}
	if _, err := validateColumns("t", cols); err == nil {
		t.Error("expected error for missing id column")
	}
}

func TestValidateColumns_MissingGeom(t *testing.T) {
	cols := []ColumnDef{
		{Name: "id", PGType: "uuid", Role: "id"},
		{Name: "updated_at", PGType: "timestamptz", Role: "updated_at"},
	}
	if _, err := validateColumns("t", cols); err == nil {
		t.Error("expected error for missing geom column")
	}
}

func TestValidateColumns_MissingUpdatedAt(t *testing.T) {
	cols := []ColumnDef{
		{Name: "id", PGType: "uuid", Role: "id"},
		{Name: "geom", PGType: "geometry", Role: "geom"},
	}
	if _, err := validateColumns("t", cols); err == nil {
		t.Error("expected error for missing updated_at column")
	}
}

func TestValidateColumns_WrongIDType(t *testing.T) {
	cols := []ColumnDef{
		{Name: "id", PGType: "text", Role: "id"}, // wrong
		{Name: "geom", PGType: "geometry", Role: "geom"},
		{Name: "updated_at", PGType: "timestamptz", Role: "updated_at"},
	}
	if _, err := validateColumns("t", cols); err == nil {
		t.Error("expected error for non-uuid id")
	}
}

func TestValidateColumns_WrongGeomType(t *testing.T) {
	cols := []ColumnDef{
		{Name: "id", PGType: "uuid", Role: "id"},
		{Name: "geom", PGType: "text", Role: "geom"}, // wrong
		{Name: "updated_at", PGType: "timestamptz", Role: "updated_at"},
	}
	if _, err := validateColumns("t", cols); err == nil {
		t.Error("expected error for non-geometry geom column")
	}
}

func TestValidateColumns_WrongUpdatedAtType(t *testing.T) {
	cols := []ColumnDef{
		{Name: "id", PGType: "uuid", Role: "id"},
		{Name: "geom", PGType: "geometry", Role: "geom"},
		{Name: "updated_at", PGType: "date", Role: "updated_at"}, // wrong
	}
	if _, err := validateColumns("t", cols); err == nil {
		t.Error("expected error for non-timestamptz updated_at column")
	}
}

func TestValidateColumns_NonSpatial(t *testing.T) {
	cols := []ColumnDef{
		{Name: "id",         PGType: "uuid",        Role: "id"},
		{Name: "updated_at", PGType: "timestamptz", Role: "updated_at"},
		{Name: "name",       PGType: "text",        Role: "data", Nullable: true},
	}
	isSpatial, err := validateColumns("messages", cols)
	if err != nil {
		t.Errorf("unexpected error for non-spatial table: %v", err)
	}
	if isSpatial {
		t.Error("expected isSpatial=false for table without geom column")
	}
}

func TestValidateColumns_Spatial(t *testing.T) {
	cols := []ColumnDef{
		{Name: "id",         PGType: "uuid",        Role: "id"},
		{Name: "geom",       PGType: "geometry",    Role: "geom"},
		{Name: "updated_at", PGType: "timestamptz", Role: "updated_at"},
	}
	isSpatial, err := validateColumns("features", cols)
	if err != nil {
		t.Errorf("unexpected error for spatial table: %v", err)
	}
	if !isSpatial {
		t.Error("expected isSpatial=true for table with geom column")
	}
}
