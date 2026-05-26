// packages/server/types.go
package main

// Wire protocol — client → server
type SubscribeMessage struct {
	Type     string     `json:"type"`
	BBox     [4]float64 `json:"bbox"`
	ClientID string     `json:"client_id"`
	Since    string     `json:"since,omitempty"` // ISO-8601; empty = epoch (full snapshot)
}

type WriteEdit struct {
	Op        string        `json:"op"`
	FeatureID string        `json:"feature_id"`
	Data      map[string]any `json:"data"`
	UpdatedAt string        `json:"updated_at"`
}

type WriteMessage struct {
	Type  string      `json:"type"`
	Edits []WriteEdit `json:"edits"`
}

// Wire protocol — server → client
type Feature struct {
	ID         string        `json:"id"`
	Geom       string        `json:"geom"`
	Properties map[string]any `json:"properties"`
	UpdatedAt  string        `json:"updated_at"`
}

type SnapshotMessage struct {
	Type     string    `json:"type"`
	Features []Feature `json:"features"`
}

type DeltaMessage struct {
	Type           string  `json:"type"`
	Op             string  `json:"op"`
	Feature        Feature `json:"feature"`
	OriginClientID string  `json:"origin_client_id"`
}

type AckMessage struct {
	Type string `json:"type"`
}

// Internal — LISTEN/NOTIFY payload from PostGIS trigger
type NotifyPayload struct {
	Op             string        `json:"op"`
	ID             string        `json:"id"`
	Geom           string        `json:"geom"`
	Properties     map[string]any `json:"properties"`
	UpdatedAt      string        `json:"updated_at"`
	OriginClientID string        `json:"origin_client_id"`
}
