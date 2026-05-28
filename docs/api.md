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
| `table` | `string` | No | Server-side table name. Required when datum-server is configured with multiple tables; omit for single-table setups. |
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

### `db.setBbox(bbox)`

Updates the bounding box subscription without reconnecting. The server sends a fresh snapshot for the new area; features already in the local DB are merged in via `ON CONFLICT DO UPDATE`.

Use this when the user pans or zooms the map.

```ts
db.setBbox([-122.6, 37.6, -122.3, 37.9])
```

In a map app, wire it to the `moveend` event:

```ts
map.on('moveend', () => {
  const b = map.getBounds()
  db.setBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
})
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

### Config file

The recommended way to configure datum-server is a `datum.yaml` file:

**Single table:**
```yaml
port: 3000
allowed_origin: "https://myapp.com"
rate_limit: 0  # writes per minute per IP, 0 = disabled

table:
  name: sites
  col_id: site_id           # default: id
  col_geom: location        # default: geom
  col_updated_at: modified_at  # default: updated_at
  col_properties: attrs     # default: properties
```

**Multiple tables:**
```yaml
port: 3000
allowed_origin: "https://myapp.com"

tables:
  - name: sites
    col_id: site_id
    col_geom: location
  - name: parcels
    col_updated_at: modified_at
```

Each table can have its own column mapping; any omitted column uses the default name (`id`, `geom`, `updated_at`, `properties`).

When using multiple tables, pass `table` in the client config to tell the server which table to subscribe to:

```ts
const sitesDb = await DatumClient.connect({
  serverUrl: 'ws://localhost:3000/ws',
  bbox: [-122.5, 37.7, -122.4, 37.8],
  table: 'sites',
})

const parcelsDb = await DatumClient.connect({
  serverUrl: 'ws://localhost:3000/ws',
  bbox: [-122.5, 37.7, -122.4, 37.8],
  table: 'parcels',
})
```

Run with:

```bash
datum-server -config datum.yaml -db $DATABASE_URL
```

The `-db` flag (or `DATABASE_URL` env var) is always required and is intentionally kept out of the config file to avoid committing credentials.

### Flags

Only two flags exist — everything else goes in the config file:

| Flag | Env var | Required | Description |
|---|---|---|---|
| `-db` | `DATABASE_URL` | Yes | PostgreSQL connection URL. Keep this out of the config file. |
| `-config` | `CONFIG` | No | Path to `datum.yaml` |

### Env var overrides

All config file fields can be overridden via env vars — useful for Docker and deployment environments where you don't want to mount a config file. **Precedence: env var > config file > default.**

> Env var overrides apply to single-table mode only. For multiple tables, use a `datum.yaml` with the `tables:` list.

| Env var | Config file key | Default |
|---|---|---|
| `TABLE` | `table.name` | — |
| `PORT` | `port` | `3000` |
| `ALLOWED_ORIGIN` | `allowed_origin` | `*` |
| `RATE_LIMIT` | `rate_limit` | `0` |
| `COL_ID` | `table.col_id` | `id` |
| `COL_GEOM` | `table.col_geom` | `geom` |
| `COL_UPDATED_AT` | `table.col_updated_at` | `updated_at` |
| `COL_PROPERTIES` | `table.col_properties` | `properties` |

**Example (Docker with env vars):**
```bash
docker run ghcr.io/a-saed/datum-server \
  -db $DATABASE_URL \
  -e TABLE=sites \
  -e ALLOWED_ORIGIN=https://myapp.com
```

---

## WebSocket wire protocol

datum-server speaks JSON over WebSocket at `/ws`.

### Client → Server

**Subscribe** — sent on connect and whenever the bbox changes (e.g. map pan/zoom). The server updates the client's bbox and sends a new snapshot for the updated area:
```json
{
  "type": "subscribe",
  "bbox": [-122.5, 37.7, -122.4, 37.8],
  "client_id": "uuid",
  "table": "sites",
  "since": "2026-05-01T00:00:00Z"
}
```

`table` — omit when the server is configured with a single table. Required when using `tables:` in the server config.

`since` is an ISO-8601 timestamp. Omit it (or set it to the epoch) to receive the full snapshot. On returning visits, datum automatically sets this to `MAX(updated_at)` from the local database so the server only returns changed features.

**Write** — push local edits to the server:
```json
{
  "type": "write",
  "table": "sites",
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

`op` is one of `"insert"`, `"update"`, `"delete"`. `table` follows the same rule as subscribe — omit for single-table setups.

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

datum-server creates the table if it does not exist. If you are bringing an **existing** PostGIS table, it must have four columns that map to these roles — use `col_id`, `col_geom`, etc. in `datum.yaml` to point datum at your actual column names:

| Role | Default column | Config key |
|---|---|---|
| UUID primary key | `id` | `col_id` |
| PostGIS geometry (WGS-84) | `geom` | `col_geom` |
| JSONB properties bag | `properties` | `col_properties` |
| Last-modified timestamp | `updated_at` | `col_updated_at` |

- **geometry** — any PostGIS geometry type in EPSG:4326. Points, lines, and polygons all work.
- **properties** — free-form JSONB for any additional attributes. Must be a single `JSONB` column today — typed columns (`name TEXT`, `height FLOAT`) are on the roadmap.
- **updated_at** — last-write-wins conflict resolution is based on this column. Always set it to `now()` on insert/update.

datum-server installs a spatial index on the geometry column and attaches the `datum_notify_change` trigger to the table.

### `datum.notify_change_<tablename>()` trigger

One trigger function is created per configured table (e.g. `datum.notify_change_features`, `datum.notify_change_sites`). It fires on INSERT/UPDATE/DELETE and calls `pg_notify('datum_changes', payload)`. The payload includes the table name and `origin_client_id` (from the session variable `datum.client_id` set by datum-server during write transactions) so the server can route deltas to the correct subscribers and skip echoing changes back to the originating client.

These trigger functions, the `datum_notify_change` trigger on each table, and any spatial indices are the only database-side objects datum installs beyond the tables themselves. Snapshot queries and write logic run in the Go server directly.
