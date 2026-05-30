// packages/server/predicate_test.go
package main

import (
	"context"
	"testing"
)

func TestCheckBlocklist(t *testing.T) {
	safe := []string{
		"type = 'building'",
		"height > 10",
		"name LIKE '%tower%'",
		"score IS NOT NULL",
		"ST_DWithin(geom, ST_MakePoint(0,0)::geography, 100)",
		"type = $1 AND height > $2",
		"status IN ('active','pending')",
	}
	for _, s := range safe {
		if err := checkBlocklist(s); err != nil {
			t.Errorf("expected %q to be safe, got: %v", s, err)
		}
	}

	blocked := []string{
		"1=1; DROP TABLE features",
		"type = 'x'--",
		"SELECT 1",
		"1=1 /* comment */",
		"(SELECT count(*) FROM pg_shadow) > 0",
		"type = (select 'building')",
		"dblink('c','SELECT 1')",
		"pg_read_file('/etc/passwd') IS NOT NULL",
		"pg_write_file('/tmp/x','x',0)",
		"1 = EXECUTE 'DROP TABLE t'",
		"DO $$ BEGIN RAISE NOTICE 'x'; END $$",
		"lo_export(fd, '/tmp/x')",
		"copy_to('/tmp/out','csv')",
		"pg_write_binary_file('/tmp/x','\\x00'::bytea)",
	}
	for _, s := range blocked {
		if err := checkBlocklist(s); err == nil {
			t.Errorf("expected %q to be blocked", s)
		}
	}
}

func TestCheckRLSAccess_FastPaths(t *testing.T) {
	// nil claims → pass through (fail-open)
	ok, err := checkRLSAccess(context.Background(), nil, &tableState{
		name:    "t",
		columns: []ColumnDef{{Name: "id", Role: "id"}},
	}, "some-uuid", nil)
	if err != nil {
		t.Errorf("unexpected error with nil claims: %v", err)
	}
	if !ok {
		t.Error("expected true with nil claims (fail-open)")
	}

	// empty featureID → pass through
	ok2, err2 := checkRLSAccess(context.Background(), nil, &tableState{
		name:    "t",
		columns: []ColumnDef{{Name: "id", Role: "id"}},
	}, "", map[string]any{"sub": "user1"})
	if err2 != nil {
		t.Errorf("unexpected error with empty featureID: %v", err2)
	}
	if !ok2 {
		t.Error("expected true with empty featureID (fail-open)")
	}

	// no id column → pass through
	ok3, err3 := checkRLSAccess(context.Background(), nil, &tableState{
		name:    "t",
		columns: []ColumnDef{{Name: "geom", Role: "geom"}},
	}, "some-uuid", map[string]any{"sub": "user1"})
	if err3 != nil {
		t.Errorf("unexpected error with no id column: %v", err3)
	}
	if !ok3 {
		t.Error("expected true with no id column (fail-open)")
	}
}

func TestRewritePredicateParams(t *testing.T) {
	cases := []struct {
		where  string
		offset int
		want   string
	}{
		{"type = $1", 5, "type = $6"},
		{"type = $1 AND height > $2", 5, "type = $6 AND height > $7"},
		{"height > 10", 5, "height > 10"},
		{"type = $1", 1, "type = $2"},
		{"a = $1 AND b = $2 AND c = $3", 3, "a = $4 AND b = $5 AND c = $6"},
		{"height > 10 AND score < 100", 0, "height > 10 AND score < 100"},
		{"a = $10 AND b = $11", 5, "a = $15 AND b = $16"},
	}
	for _, c := range cases {
		got := rewritePredicateParams(c.where, c.offset)
		if got != c.want {
			t.Errorf("rewritePredicateParams(%q, %d) = %q, want %q", c.where, c.offset, got, c.want)
		}
	}
}
