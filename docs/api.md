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

### `db.onChange(callback)`

Subscribes to local database changes. The callback fires after any `INSERT`/`UPDATE`/`DELETE` executed via `query()` and after every sync event from the server (snapshot or delta). Returns an unsubscribe function.

```ts
const unsubscribe = db.onChange(() => {
  console.log('DB changed — re-render')
})

// Later:
unsubscribe()
```

Prefer `useDatum` in React apps — it wires this up automatically.

---

## React hooks (`datum-sync/react`)

```bash
npm install datum-sync   # one package — React hook is included
```

```ts
import { useDatum } from 'datum-sync/react'
```

### `useDatum<T>(client, sql, params?)`

Runs a SQL query against the local PGlite database and re-runs it automatically whenever the database changes — either from a local write or a delta from the server. No polling needed.

```tsx
const { rows, loading, error } = useDatum<{ name: string; lat: number; lon: number }>(
  client,
  `SELECT properties->>'name' AS name,
          ST_Y(geom) AS lat,
          ST_X(geom) AS lon
   FROM features`
)
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `client` | `DatumClient \| null` | The connected client. Pass `null` while connecting — hook returns empty rows and `loading: true`. |
| `sql` | `string` | SQL query to run against local PGlite. |
| `params` | `unknown[]` | Optional query parameters (`$1`, `$2`, …). |

**Returns:**

| Field | Type | Description |
|---|---|---|
| `rows` | `T[]` | Query results. Empty array while loading or on error. |
| `loading` | `boolean` | `true` until the first query completes. |
| `error` | `Error \| null` | Set if the query throws. |

**Example — full component:**

```tsx
import { useState, useEffect } from 'react'
import { DatumClient } from 'datum-sync'
import { useDatum } from 'datum-sync/react'

function FeatureList() {
  const [client, setClient] = useState<DatumClient | null>(null)

  useEffect(() => {
    DatumClient.connect({
      serverUrl: 'ws://localhost:3000/ws',
      bbox: [-180, -90, 180, 90],
    }).then(setClient)

    return () => { void client?.disconnect() }
  }, [])

  const { rows, loading } = useDatum<{ name: string }>(
    client,
    `SELECT properties->>'name' AS name FROM features ORDER BY updated_at DESC`
  )

  if (loading) return <p>Connecting…</p>
  return <ul>{rows.map((r, i) => <li key={i}>{r.name}</li>)}</ul>
}
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

### Required table schema

datum-server creates the table if it does not exist. If you are bringing an **existing** PostGIS table, it must have these four columns:

```sql
id          UUID        PRIMARY KEY DEFAULT gen_random_uuid()
geom        GEOMETRY(Geometry, 4326) NOT NULL
properties  JSONB       NOT NULL DEFAULT '{}'
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```

- **`id`** — stable UUID primary key, used for conflict resolution.
- **`geom`** — any PostGIS geometry type, in WGS-84 (EPSG:4326). Points, lines, and polygons all work.
- **`properties`** — free-form JSON for any additional attributes (name, type, tags, etc.).
- **`updated_at`** — last-write-wins conflict resolution is based on this column. Always set it to `now()` on insert/update.

datum-server will also install a spatial index on `geom` and attach the `datum_capture_changes` outbox trigger to the table.

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
