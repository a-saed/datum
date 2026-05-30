// packages/server/predicate_test.go
package main

import (
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
	}
	for _, s := range blocked {
		if err := checkBlocklist(s); err == nil {
			t.Errorf("expected %q to be blocked", s)
		}
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
	}
	for _, c := range cases {
		got := rewritePredicateParams(c.where, c.offset)
		if got != c.want {
			t.Errorf("rewritePredicateParams(%q, %d) = %q, want %q", c.where, c.offset, got, c.want)
		}
	}
}
