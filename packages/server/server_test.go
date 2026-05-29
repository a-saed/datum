// packages/server/server_test.go
package main

import (
	"testing"
	"time"
)

func TestBBoxesIntersect(t *testing.T) {
	tests := []struct {
		name       string
		clientBBox [4]float64
		geomBbox   [4]float64
		want       bool
	}{
		{"point inside",   [4]float64{-1, -1, 1, 1}, [4]float64{0, 0, 0, 0}, true},
		{"point outside",  [4]float64{-1, -1, 1, 1}, [4]float64{5, 5, 5, 5}, false},
		{"point on edge",  [4]float64{-1, -1, 1, 1}, [4]float64{1, 1, 1, 1}, true},
		{"boxes overlap",  [4]float64{0, 0, 2, 2},   [4]float64{1, 1, 3, 3}, true},
		{"boxes adjacent", [4]float64{0, 0, 1, 1},   [4]float64{1, 0, 2, 1}, true},
		{"boxes disjoint", [4]float64{0, 0, 1, 1},   [4]float64{2, 0, 3, 1}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := bboxesIntersect(tc.clientBBox, tc.geomBbox)
			if got != tc.want {
				t.Errorf("bboxesIntersect(%v, %v) = %v, want %v",
					tc.clientBBox, tc.geomBbox, got, tc.want)
			}
		})
	}
}

func TestExtractBbox(t *testing.T) {
	tests := []struct {
		name    string
		geojson string
		want    [4]float64
	}{
		{
			"point",
			`{"type":"Point","coordinates":[10.0,20.0]}`,
			[4]float64{10, 20, 10, 20},
		},
		{
			"linestring",
			`{"type":"LineString","coordinates":[[0,0],[5,10],[3,7]]}`,
			[4]float64{0, 0, 5, 10},
		},
		{
			"polygon",
			`{"type":"Polygon","coordinates":[[[0,0],[4,0],[4,4],[0,4],[0,0]]]}`,
			[4]float64{0, 0, 4, 4},
		},
		{
			"empty string",
			"",
			[4]float64{},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := extractBbox(tc.geojson)
			if got != tc.want {
				t.Errorf("extractBbox(%q) = %v, want %v", tc.geojson, got, tc.want)
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

func TestVerifyToken_MissingToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-that-is-long-enough-x")
	v, err := newVerifier(AuthConfig{JWTAlgorithm: "HS256"})
	if err != nil {
		t.Fatalf("newVerifier: %v", err)
	}
	_, err = verifyToken(v, "")
	if err == nil {
		t.Fatal("expected error when token is missing and auth is configured")
	}
}

func TestVerifyToken_ValidToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-that-is-long-enough-x")
	v, err := newVerifier(AuthConfig{JWTAlgorithm: "HS256"})
	if err != nil {
		t.Fatalf("newVerifier: %v", err)
	}
	tok := makeHS256Token(t, "test-secret-that-is-long-enough-x",
		map[string]any{"sub": "user-1"},
		time.Now().Add(time.Hour),
	)
	claims, err := verifyToken(v, tok)
	if err != nil {
		t.Fatalf("unexpected error for valid token: %v", err)
	}
	if claims["sub"] != "user-1" {
		t.Errorf("sub: got %v, want user-1", claims["sub"])
	}
}

func TestVerifyToken_NoAuth(t *testing.T) {
	claims, err := verifyToken(nil, "")
	if err != nil {
		t.Fatalf("unexpected error in unauthenticated mode: %v", err)
	}
	if claims != nil {
		t.Fatalf("expected nil claims in unauthenticated mode")
	}
}
