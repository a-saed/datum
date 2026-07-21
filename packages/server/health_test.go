package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(io.Discard, nil))
}

// ── /healthz ──────────────────────────────────────────────────────────────────

func TestHandleHealthz_AlwaysOK(t *testing.T) {
	s := &server{logger: testLogger()}
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	s.handleHealthz(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: got %d, want %d", rec.Code, http.StatusOK)
	}
	var body healthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if body.Status != "ok" {
		t.Errorf("status field: got %q, want \"ok\"", body.Status)
	}
}

// ── /readyz ───────────────────────────────────────────────────────────────────

func TestHandleReadyz_DBReachable(t *testing.T) {
	s := &server{
		logger: testLogger(),
		pingDB: func(ctx context.Context) error { return nil },
	}
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	s.handleReadyz(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: got %d, want %d", rec.Code, http.StatusOK)
	}
	var body healthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if body.Status != "ok" {
		t.Errorf("status field: got %q, want \"ok\"", body.Status)
	}
}

func TestHandleReadyz_DBUnreachable(t *testing.T) {
	s := &server{
		logger: testLogger(),
		pingDB: func(ctx context.Context) error { return errors.New("connection refused") },
	}
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	s.handleReadyz(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status: got %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
	var body healthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if body.Status != "unavailable" {
		t.Errorf("status field: got %q, want \"unavailable\"", body.Status)
	}
	if body.Error != "connection refused" {
		t.Errorf("error field: got %q, want \"connection refused\"", body.Error)
	}
}
