---
title: API Reference
---

# API Reference

## TypeScript client (`datum-sync`)

### `DatumClient.connect(config)`

Connects to datum-server and loads the initial snapshot into local PGlite. Resolves once the snapshot is fully written — the client is immediately queryable offline after this point.

```ts
const db = await DatumClient.connect({
  serverUrl: 'ws://localhost:3000/ws',
  bbox: [-122.5, 37.7, -122.4, 37.8],
})
```

**Config options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `serverUrl` | `string` | Yes | WebSocket URL of datum-server |
| `bbox` | `[minX, minY, maxX, maxY]` | Yes | Bounding box in WGS-84. Only features intersecting this box are synced. |
| `syncInterval` | `number` (ms) | No | How often local writes are pushed to the server. Default: `5000` |
| `dbName` | `string` | No | IndexedDB database name. Use distinct names when running multiple datum instances on the same origin. Default: `"datum"` |

---

### `db.query<T>(sql, params?)`

Runs a SQL query against the local PGlite database. **No network involved.** Full PostGIS is available.

```ts
const result = await db.query<{ name: string; area: number }>(
  `SELECT properties->>'name' AS name, ST_Area(geom) AS area
   FROM features
   WHERE ST_Area(geom) > $1`,
  [1000]
)
// result.rows: Array<{ name: string; area: number }>
```

`INSERT`, `UPDATE`, and `DELETE` statements are captured automatically by an outbox trigger and pushed to datum-server on the next sync cycle. No special API needed — just write normal SQL.

```ts
await db.query(
  `INSERT INTO features (geom, properties, updated_at)
   VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3::jsonb, now())`,
  [lng, lat, JSON.stringify({ name: 'My point' })]
)
```

---

### `db.disconnect()`

Stops the sync cycle and closes the WebSocket. The local PGlite database is in-memory and discarded.

```ts
await db.disconnect()
```

---

## datum-server (Go binary)

### Flags

| Flag | Required | Default | Description |
|---|---|---|---|
| `-db` | Yes | — | PostgreSQL connection URL |
| `-table` | Yes | — | Table name to sync. Server config only — never client-supplied. |
| `-port` | No | `3000` | Port to listen on |
| `-allowed-origin` | No | `*` | Allowed WebSocket `Origin` header. Set to your app's domain in production. `*` allows all origins (local dev only). |

**Example (production):**
```bash
datum-server \
  -db "postgres://user:pass@host/mydb" \
  -table features \
  -port 3000 \
  -allowed-origin "https://myapp.com"
```

**Example (Docker):**
```bash
docker run ghcr.io/a-saed/datum-server \
  -db "postgres://user:pass@host/mydb" \
  -table features \
  -allowed-origin "https://myapp.com"
```

---

## WebSocket wire protocol

datum-server speaks JSON over WebSocket at `/ws`.

### Client → Server

**Subscribe** — sent once on connect to declare the client's bounding box:
```json
{
  "type": "subscribe",
  "bbox": [-122.5, 37.7, -122.4, 37.8],
  "client_id": "uuid",
  "since": "2026-05-01T00:00:00Z"
}
```

`since` is an ISO-8601 timestamp. Omit it (or set it to the epoch) to receive the full snapshot. On returning visits, datum automatically sets this to `MAX(updated_at)` from the local database so the server only returns changed features.

**Write** — push local edits to the server:
```json
{
  "type": "write",
  "edits": [
    {
      "write_id": "uuid",
      "op": "insert",
      "feature_id": "uuid",
      "data": {
        "geom": "{\"type\":\"Point\",\"coordinates\":[-122.4,37.8]}",
        "properties": { "name": "Site A" },
        "updated_at": "2026-05-26T10:00:00Z"
      },
      "updated_at": "2026-05-26T10:00:00Z"
    }
  ]
}
```

`op` is one of `"insert"`, `"update"`, `"delete"`.

### Server → Client

**Snapshot** — full initial state on subscribe:
```json
{
  "type": "snapshot",
  "features": [
    {
      "id": "uuid",
      "geom": "{\"type\":\"Point\",\"coordinates\":[-122.4,37.8]}",
      "properties": { "name": "Site A" },
      "updated_at": "2026-05-26T10:00:00Z"
    }
  ]
}
```

**Delta** — real-time push when another client edits a feature in your bbox:
```json
{
  "type": "delta",
  "op": "update",
  "feature": {
    "id": "uuid",
    "geom": "{\"type\":\"Point\",\"coordinates\":[-122.4,37.8]}",
    "properties": { "name": "Site A (updated)" },
    "updated_at": "2026-05-26T10:05:00Z"
  },
  "origin_client_id": "uuid"
}
```

Deltas are only sent to clients whose bounding box intersects the changed feature. The originating client never receives its own delta.

---

## PostGIS schema (`datum` schema)

Installed automatically by datum-server on startup. Idempotent — safe to run multiple times.

### `datum.sync(p_bbox, p_since)`

Returns all features from the configured table that intersect `p_bbox` and were updated after `p_since`. Used for the initial snapshot and incremental catch-up.

```sql
SELECT * FROM datum.sync(
  ST_MakeEnvelope(-122.5, 37.7, -122.4, 37.8, 4326),
  '1970-01-01'::timestamptz
)
```

### `datum.write(p_edits)`

Applies a batch of client edits using last-write-wins. Newer `updated_at` wins on conflict.

```sql
SELECT datum.write('[
  {
    "op": "insert",
    "feature_id": "...",
    "data": { "geom": "...", "properties": {}, "updated_at": "..." }
  }
]'::jsonb)
```

### `datum.notify_change()` trigger

Fires on INSERT/UPDATE/DELETE and calls `pg_notify('datum_changes', payload)`. Payload includes `origin_client_id` from the session variable `datum.client_id` (set by datum-server during write transactions) so the server can skip echoing changes back to the originating client.
