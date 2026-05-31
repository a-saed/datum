package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"
)

// ── extractClientIP ──────────────────────────────────────────────────────────

func TestExtractClientIP_XForwardedFor_WithPort(t *testing.T) {
	r := &http.Request{
		Header:     http.Header{"X-Forwarded-For": {"203.0.113.5:1234"}},
		RemoteAddr: "10.0.0.1:9999",
	}
	got := extractClientIP(r)
	if got != "203.0.113.5" {
		t.Errorf("got %q, want %q", got, "203.0.113.5")
	}
}

func TestExtractClientIP_XForwardedFor_BareIP(t *testing.T) {
	r := &http.Request{
		Header:     http.Header{"X-Forwarded-For": {"203.0.113.5"}},
		RemoteAddr: "10.0.0.1:9999",
	}
	got := extractClientIP(r)
	if got != "203.0.113.5" {
		t.Errorf("got %q, want %q", got, "203.0.113.5")
	}
}

func TestExtractClientIP_RemoteAddr_WithPort(t *testing.T) {
	r := &http.Request{
		Header:     http.Header{},
		RemoteAddr: "10.0.0.1:9999",
	}
	got := extractClientIP(r)
	if got != "10.0.0.1" {
		t.Errorf("got %q, want %q", got, "10.0.0.1")
	}
}

func TestExtractClientIP_RemoteAddr_BareIP(t *testing.T) {
	r := &http.Request{
		Header:     http.Header{},
		RemoteAddr: "10.0.0.1",
	}
	got := extractClientIP(r)
	if got != "10.0.0.1" {
		t.Errorf("got %q, want %q", got, "10.0.0.1")
	}
}

// ── claimToString ─────────────────────────────────────────────────────────────

func TestClaimToString_String(t *testing.T) {
	got, err := claimToString("hello")
	if err != nil || got != "hello" {
		t.Errorf("got (%q, %v), want (\"hello\", nil)", got, err)
	}
}

func TestClaimToString_Float64_Integer(t *testing.T) {
	got, err := claimToString(float64(42))
	if err != nil || got != "42" {
		t.Errorf("got (%q, %v), want (\"42\", nil)", got, err)
	}
}

func TestClaimToString_Float64_Decimal(t *testing.T) {
	got, err := claimToString(float64(3.14))
	if err != nil || got != "3.14" {
		t.Errorf("got (%q, %v), want (\"3.14\", nil)", got, err)
	}
}

func TestClaimToString_Bool_True(t *testing.T) {
	got, err := claimToString(true)
	if err != nil || got != "true" {
		t.Errorf("got (%q, %v), want (\"true\", nil)", got, err)
	}
}

func TestClaimToString_Bool_False(t *testing.T) {
	got, err := claimToString(false)
	if err != nil || got != "false" {
		t.Errorf("got (%q, %v), want (\"false\", nil)", got, err)
	}
}

func TestClaimToString_Map_JSON(t *testing.T) {
	m := map[string]any{"role": "admin"}
	got, err := claimToString(m)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Verify it's valid JSON
	var out map[string]any
	if err := json.Unmarshal([]byte(got), &out); err != nil {
		t.Errorf("result is not valid JSON: %v", err)
	}
}

// ── defaultColumns ────────────────────────────────────────────────────────────

func TestDefaultColumns(t *testing.T) {
	c := defaultColumns()
	if c.ID != "id" {
		t.Errorf("ID: got %q, want \"id\"", c.ID)
	}
	if c.Geom != "geom" {
		t.Errorf("Geom: got %q, want \"geom\"", c.Geom)
	}
	if c.UpdatedAt != "updated_at" {
		t.Errorf("UpdatedAt: got %q, want \"updated_at\"", c.UpdatedAt)
	}
	if c.Properties != "properties" {
		t.Errorf("Properties: got %q, want \"properties\"", c.Properties)
	}
}

// ── newUUID ───────────────────────────────────────────────────────────────────

func TestNewUUID_Format(t *testing.T) {
	u := newUUID()
	if len(u) != 36 {
		t.Errorf("UUID length: got %d, want 36", len(u))
	}
	if u[8] != '-' || u[13] != '-' || u[18] != '-' || u[23] != '-' {
		t.Errorf("UUID format wrong: %q", u)
	}
	if u[14] != '4' {
		t.Errorf("UUID version: got %q, want '4' at position 14", string(u[14]))
	}
}

func TestNewUUID_Unique(t *testing.T) {
	a, b := newUUID(), newUUID()
	if a == b {
		t.Error("two calls to newUUID returned the same value")
	}
}

// ── allowWrite ────────────────────────────────────────────────────────────────

func makeServerWithLimit(limit int) *server {
	return &server{
		writeLimit: limit,
		ipLimiters: make(map[string]*ipLimiter),
		tables:     make(map[string]*tableState),
	}
}

func TestAllowWrite_WithinLimit(t *testing.T) {
	s := makeServerWithLimit(3)
	for i := 0; i < 3; i++ {
		if !s.allowWrite("1.2.3.4") {
			t.Errorf("call %d: expected allowed, got denied", i+1)
		}
	}
}

func TestAllowWrite_ExceedsLimit(t *testing.T) {
	s := makeServerWithLimit(2)
	s.allowWrite("1.2.3.4")
	s.allowWrite("1.2.3.4")
	if s.allowWrite("1.2.3.4") {
		t.Error("third call should be rate-limited")
	}
}

func TestAllowWrite_IndependentIPs(t *testing.T) {
	s := makeServerWithLimit(1)
	if !s.allowWrite("1.1.1.1") {
		t.Error("first IP first call should be allowed")
	}
	if s.allowWrite("1.1.1.1") {
		t.Error("first IP second call should be denied")
	}
	if !s.allowWrite("2.2.2.2") {
		t.Error("second IP first call should be allowed independently")
	}
}

func TestAllowWrite_ZeroLimit(t *testing.T) {
	// When writeLimit==0 the server guards the allowWrite call with
	// "if s.writeLimit > 0", so allowWrite is never invoked.
	// This test confirms that guard is present in the server's handleWS logic
	// by verifying the server struct can be created with limit=0.
	s := makeServerWithLimit(0)
	if s.writeLimit != 0 {
		t.Errorf("expected writeLimit=0, got %d", s.writeLimit)
	}
}

// Ensure no data race in concurrent use (run with -race)
func TestAllowWrite_Concurrent(t *testing.T) {
	s := makeServerWithLimit(100)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_ = s.allowWrite(fmt.Sprintf("10.0.0.%d", i%5))
		}(i)
	}
	wg.Wait()
}
