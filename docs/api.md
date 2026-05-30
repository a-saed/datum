---
title: API Reference
---

# API Reference

## TypeScript client (`datum-sync`)

### `DatumClient.connect(config)`

Connects to datum-server and loads the initial snapshot into local PGlite.

- **First visit** — awaits the full snapshot before resolving (~3 s). Rejects after `connectTimeout` (default 30 s) if the server is unreachable.
- **Returning visit** — resolves once the WebSocket opens and a catch-up subscribe is sent (~200 ms). Local data is immediately available; the delta sync runs in the background.

The client automatically reconnects with exponential backoff if the connection drops after `connect()` resolves.

```ts
const db = await DatumClient.connect({
  serverUrl: 'ws://localhost:3000/ws',
  bbox: [-122.5, 37.7, -122.4, 37.8],
})
```

**Config options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `serverUrl` | `string` | — | WebSocket URL of datum-server |
| `bbox` | `[minX, minY, maxX, maxY]` | — | Bounding box in WGS-84. Only features intersecting this box are synced. |
| `table` | `string` | — | Server-side table name. Required when datum-server is configured with multiple tables; omit for single-table setups. |
| `syncInterval` | `number` (ms) | `5000` | How often local writes are pushed to the server. |
| `dbName` | `string` | `table` or `"datum"` | IndexedDB database name. Defaults to `table` when set, so each table gets its own database automatically. Override when you need explicit control. |
| `connectTimeout` | `number` (ms) | `30000` | How long to wait for the initial snapshot before rejecting `connect()`. Set to `0` to disable. |
| `onStatusChange` | `(status: ConnectionStatus) => void` | — | Called whenever the connection transitions between `'connecting'`, `'connected'`, and `'disconnected'`. |
| `token` | `string \| () => Promise<string>` | — | JWT for server authentication. Pass a function for automatic refresh before expiry. Required when datum-server has an `auth:` config block. |

---

### `db.query<T>(sql, params?)`

Runs a SQL query against the local PGlite database. **No network involved.** Full PostGIS is available.

```ts
// With typed columns (v0.7.0+): direct column access
const result = await db.query<{ name: string; area: number }>(
  `SELECT name, ST_Area(geom) AS area
   FROM features
   WHERE ST_Area(geom) > $1`,
  [1000]
)
// result.rows: Array<{ name: string; area: number }>

// With JSONB properties bag (also supported):
// SELECT properties->>'name' AS name, ST_Area(geom) AS area FROM features WHERE ...
```

`INSERT`, `UPDATE`, and `DELETE` statements are captured automatically by an outbox trigger and pushed to datum-server on the next sync cycle. No special API needed — just write normal SQL.

```ts
// With typed columns — insert values directly into each column
await db.query(
  `INSERT INTO features (geom, name, updated_at)
   VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, now())`,
  [lng, lat, 'My point']
)

// With JSONB properties bag (also supported):
// INSERT INTO features (geom, properties, updated_at)
// VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3::jsonb, now())
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

### `db.connectionStatus`

Read-only getter. Returns the current connection state: `'connecting'`, `'connected'`, or `'disconnected'`.

```ts
console.log(db.connectionStatus) // 'connected'
```

The client automatically reconnects with exponential backoff (1 s → 30 s cap) when the WebSocket drops unexpectedly. `'disconnected'` means a drop occurred and a reconnect is pending; the client is still operational with local data.

---

### `db.pendingCount`

Read-only getter. Number of local writes waiting to be pushed to the server.

```ts
console.log(db.pendingCount) // 3
```

---

### `db.onPendingChange(callback)`

Subscribes to pending write count changes. Fires after every local write and after every successful sync flush. Returns an unsubscribe function.

```ts
const unsub = db.onPendingChange(count => {
  setStatus(count === 0 ? 'Synced' : `${count} pending`)
})

// Later:
unsub()
```

---

### `db.disconnect()`

Stops the sync cycle, cancels any pending reconnect, and closes the WebSocket.

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

## DevTools (`datum-sync/devtools`)

A floating browser panel for inspecting the local PGlite database, schema, and sync state while building. Zero production bundle impact — loaded only when you import it.

```ts
import { initDatumDevtools } from 'datum-sync/devtools'
```

### `initDatumDevtools(client)`

Injects the devtools panel into the page. Call once after `DatumClient.connect()`.

```ts
const db = await DatumClient.connect({ serverUrl, bbox })

// Dev only — tree-shaken out of production builds when using dynamic import
if (import.meta.env.DEV) {
  const { initDatumDevtools } = await import('datum-sync/devtools')
  initDatumDevtools(db)
}
```

For multiple tables, pass an array — a dropdown appears in the toolbar to switch between clients:

```ts
initDatumDevtools([featuresDb, waypointsDb])
```

Calling `initDatumDevtools` more than once is a no-op (idempotent).

**Toggle:** `Ctrl+Shift+D` (Windows/Linux) or `Cmd+Shift+D` (Mac). The panel remembers its open/closed state and height across page reloads via `localStorage`.

### Tabs

| Tab | What it shows |
|---|---|
| **Query** | SQL REPL against local PGlite. Full PostGIS available. `Cmd+Enter` to run. |
| **Schema** | Every column from the server's schema message — name, type, role badge, nullable. Schema hash and "mirrored from server ✓" confirmation. |
| **Status** | Connection state, pending write count, schema hash, schema version. When a schema wipe occurs, shows a diff of added/removed columns. |

### `onSchemaChange` callback

Called whenever the local DB is wiped and recreated (schema changed or first visit). Available in `DatumConfig` and as a post-connect subscription:

```ts
// In config (set at connect time):
const db = await DatumClient.connect({
  serverUrl,
  bbox,
  onSchemaChange: ({ prev, next }) => {
    console.log('Schema changed — columns now:', next.map(c => c.name))
  },
})

// Post-connect subscription (returns unsubscribe function):
const unsub = db.onSchemaChange(({ prev, next }) => {
  console.log('added columns:', next.filter(c => !prev?.find(p => p.name === c.name)))
})
```

`prev` is `null` on first visit (no previous schema). `next` is the full column list after the wipe.

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

# Optional — JWT authentication
auth:
  jwt_algorithm: "HS256"    # HS256 | RS256 | ES256 (and 384/512 variants)
  # jwt_secret comes from JWT_SECRET env var — never written here
  # jwt_public_key: "/run/secrets/jwt.pub"  # RS256/ES256 only
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
| `JWT_SECRET` | — (env only) | — |

**Example (Docker with env vars):**
```bash
docker run \
  -e DATABASE_URL=$DATABASE_URL \
  -e TABLE=sites \
  -e ALLOWED_ORIGIN=https://myapp.com \
  ghcr.io/a-saed/datum-server
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

`token` — JWT token. Required when the server has `auth:` configured. Omit when auth is not configured.

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
        "updated_at": "2026-05-26T10:00:00.000Z"
      },
      "updated_at": "2026-05-26T10:00:00.000Z"
    }
  ]
}
```

`op` is one of `"insert"`, `"update"`, `"delete"`. `table` follows the same rule as subscribe — omit for single-table setups. Batches are limited to 500 edits.

**Auth** — sent by the client to refresh the token mid-connection. datum sends this automatically before the token expires (60 s before the JWT `exp` claim):
```json
{ "type": "auth", "token": "eyJ..." }
```

Server closes with code 4401 if the token is missing, invalid, or expired. The client's `token` function is called automatically to refresh before this happens.

### Server → Client

**Snapshot** — full initial state on subscribe:
```json
{
  "type": "snapshot",
  "features": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "geom": "{\"type\":\"Point\",\"coordinates\":[-122.4,37.8]}",
      "name": "Site A",
      "properties": { "note": "check annually" },
      "updated_at": "2026-05-26T10:00:00Z"
    }
  ]
}
```

Features are flat maps — every column is a top-level key. Geometry is always a GeoJSON string.

**Schema** — sent once per connection, immediately before the first snapshot. Describes every column in the server table:
```json
{
  "type": "schema",
  "columns": [
    { "name": "id",         "pg_type": "uuid",        "role": "id",         "nullable": false },
    { "name": "geom",       "pg_type": "geometry",    "role": "geom",       "nullable": false },
    { "name": "name",       "pg_type": "text",        "role": "data",       "nullable": true  },
    { "name": "properties", "pg_type": "jsonb",       "role": "properties", "nullable": true  },
    { "name": "updated_at", "pg_type": "timestamptz", "role": "updated_at", "nullable": false }
  ]
}
```

`role` is one of `"id"`, `"geom"`, `"updated_at"`, `"properties"`, or `"data"` (any extra typed column). The client uses this to recreate the local PGlite table and build dynamic SQL for upserts. Not re-sent on bbox updates.

**Ack** — sent by the server after a `write` batch is applied successfully:
```json
{
  "type": "ack",
  "write_ids": ["uuid", "uuid"]
}
```

The client marks outbox entries as synced only after receiving the ack. If the connection drops before the ack arrives the writes are retried on reconnect.

**Delta** — real-time push when another client edits a feature in your bbox:
```json
{
  "type": "delta",
  "op": "update",
  "feature": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "geom": "{\"type\":\"Point\",\"coordinates\":[-122.4,37.8]}",
    "name": "Site A (updated)",
    "properties": { "note": "check annually" },
    "updated_at": "2026-05-26T10:05:00.000Z"
  },
  "origin_client_id": "550e8400-e29b-41d4-a716-446655440001"
}
```

Deltas are only sent to clients whose bounding box intersects the changed feature's bounding box. For polygons and lines the full geometry bbox is used, not just the first vertex. The originating client never receives its own delta.

---

## PostGIS schema (`datum` schema)

Installed automatically by datum-server on startup. Idempotent — safe to run multiple times.

### Required table schema

datum-server creates the table if it does not exist. If you are bringing an **existing** PostGIS table, it must have four columns that map to these roles — use `col_id`, `col_geom`, etc. in `datum.yaml` to point datum at your actual column names:

| Role | Default column | Config key |
|---|---|---|
| UUID primary key | `id` | `col_id` |
| PostGIS geometry (WGS-84) | `geom` | `col_geom` |
| JSONB properties bag *(optional)* | `properties` | `col_properties` |
| Last-modified timestamp | `updated_at` | `col_updated_at` |

- **geometry** — any PostGIS geometry type in EPSG:4326. Points, lines, and polygons all work.
- **properties** — optional free-form JSONB for additional attributes. If present, it coexists with typed columns.
- **typed columns** — any additional columns (`name TEXT`, `height FLOAT8`, `score INT`, etc.) are automatically synced. datum introspects the table at startup and mirrors the exact schema in PGlite. Users query typed columns with normal SQL on both sides.
- **updated_at** — last-write-wins conflict resolution is based on this column. Always set it to `now()` on insert/update.

datum-server installs a spatial index on the geometry column and attaches the `datum_notify_change` trigger to the table.

### `datum.notify_change_<tablename>()` trigger

One trigger function is created per configured table (e.g. `datum.notify_change_features`, `datum.notify_change_sites`). It fires on INSERT/UPDATE/DELETE and calls `pg_notify('datum_changes', payload)`. The payload includes the table name and `origin_client_id` (from the session variable `datum.client_id` set by datum-server during write transactions) so the server can route deltas to the correct subscribers and skip echoing changes back to the originating client.

These trigger functions, the `datum_notify_change` trigger on each table, and any spatial indices are the only database-side objects datum installs beyond the tables themselves. Snapshot queries and write logic run in the Go server directly.
