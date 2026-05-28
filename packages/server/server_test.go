// packages/server/server_test.go
package main

import (
	"testing"
)

func TestBBoxIntersects(t *testing.T) {
	tests := []struct {
		name       string
		clientBBox [4]float64
		point      [2]float64
		want       bool
	}{
		{"inside",  [4]float64{-1, -1, 1, 1}, [2]float64{0, 0}, true},
		{"outside", [4]float64{-1, -1, 1, 1}, [2]float64{5, 5}, false},
		{"on edge", [4]float64{-1, -1, 1, 1}, [2]float64{1, 1}, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := bboxContainsPoint(tc.clientBBox, tc.point)
			if got != tc.want {
				t.Errorf("bboxContainsPoint(%v, %v) = %v, want %v",
					tc.clientBBox, tc.point, got, tc.want)
			}
		})
	}
}

func TestResolveTable(t *testing.T) {
	features := &tableState{name: "features", clients: make(map[string]*wsClient)}
	sites    := &tableState{name: "sites",    clients: make(map[string]*wsClient)}

	// Multi-table server — no default
	multi := &server{
		tables: map[string]*tableState{"features": features, "sites": sites},
	}
	if multi.resolveTable("features") != features {
		t.Error("expected features table")
	}
	if multi.resolveTable("sites") != sites {
		t.Error("expected sites table")
	}
	if multi.resolveTable("") != nil {
		t.Error("empty name on multi-table server should return nil")
	}
	if multi.resolveTable("unknown") != nil {
		t.Error("unknown table should return nil")
	}

	// Single-table server — has a default
	single := &server{
		tables:       map[string]*tableState{"features": features},
		defaultTable: "features",
	}
	if single.resolveTable("") != features {
		t.Error("empty name on single-table server should return defaultTable")
	}
	if single.resolveTable("features") != features {
		t.Error("explicit name should still work on single-table server")
	}
}
