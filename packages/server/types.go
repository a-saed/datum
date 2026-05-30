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

// Feature is a flat map — all columns at the top level.
type Feature = map[string]any

// Wire protocol — client → server

type SubscribeMessage struct {
	Type        string     `json:"type"`
	Table       string     `json:"table,omitempty"`
	BBox        [4]float64 `json:"bbox"`
	ClientID    string     `json:"client_id"`
	Since       string     `json:"since,omitempty"`
	Token       string     `json:"token,omitempty"`
	Where       string     `json:"where,omitempty"`
	WhereParams []any      `json:"where_params,omitempty"`
}

type AuthMessage struct {
	Type  string `json:"type"`
	Token string `json:"token"`
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

// NotifyPayload — LISTEN/NOTIFY payload from PostGIS trigger.
// Supports both old format (flat id/geom/properties/updated_at fields) and
// new format (all columns nested under "feature"). Both are parsed at
// the same time during the trigger transition period.
type NotifyPayload struct {
	Table string `json:"table"`
	Op    string `json:"op"`
	// New format: all columns nested under "feature"
	Feature map[string]any `json:"feature,omitempty"`
	// Old format: fixed 4-column flat fields (legacy trigger)
	LegacyID         string         `json:"id,omitempty"`
	LegacyGeom       string         `json:"geom,omitempty"`
	LegacyProperties map[string]any `json:"properties,omitempty"`
	LegacyUpdatedAt  string         `json:"updated_at,omitempty"`
	OriginClientID   string         `json:"origin_client_id"`
}
