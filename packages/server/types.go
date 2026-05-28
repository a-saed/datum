// packages/server/types.go
package main

// ColumnConfig maps datum's logical column roles to the actual column names in the user's table.
type ColumnConfig struct {
	ID         string // primary key UUID column (default: "id")
	Geom       string // PostGIS geometry column (default: "geom")
	UpdatedAt  string // last-modified timestamp column (default: "updated_at")
	Properties string // JSONB properties column (default: "properties")
}

func defaultColumns() ColumnConfig {
	return ColumnConfig{ID: "id", Geom: "geom", UpdatedAt: "updated_at", Properties: "properties"}
}

// Wire protocol — client → server

type SubscribeMessage struct {
	Type     string     `json:"type"`
	Table    string     `json:"table,omitempty"` // optional; omit when only one table is configured
	BBox     [4]float64 `json:"bbox"`
	ClientID string     `json:"client_id"`
	Since    string     `json:"since,omitempty"`
}

type WriteEdit struct {
	WriteID   string         `json:"write_id"`
	Op        string         `json:"op"`
	FeatureID string         `json:"feature_id"`
	Data      map[string]any `json:"data"`
	UpdatedAt string         `json:"updated_at"`
}

type WriteMessage struct {
	Type  string      `json:"type"`
	Table string      `json:"table,omitempty"`
	Edits []WriteEdit `json:"edits"`
}

// Wire protocol — server → client

type Feature struct {
	ID         string         `json:"id"`
	Geom       string         `json:"geom"`
	Properties map[string]any `json:"properties"`
	UpdatedAt  string         `json:"updated_at"`
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
	Type     string   `json:"type"`
	WriteIDs []string `json:"write_ids"`
}

// Internal — LISTEN/NOTIFY payload from PostGIS trigger

type NotifyPayload struct {
	Table          string         `json:"table"`
	Op             string         `json:"op"`
	ID             string         `json:"id"`
	Geom           string         `json:"geom"`
	Properties     map[string]any `json:"properties"`
	UpdatedAt      string         `json:"updated_at"`
	OriginClientID string         `json:"origin_client_id"`
}
