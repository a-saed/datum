# How It Works

datum has five moving parts: a local PGlite database in the browser, a bounding box subscription model, a write outbox sync cycle, IndexedDB persistence for fast reconnect, and automatic reconnection with live status reporting.

## Local-first model

When you call `DatumClient.connect()`, datum boots a full PostgreSQL instance in the browser using [PGlite](https://pglite.dev) — a WASM build of Postgres with PostGIS. All `query()` calls run against this local instance. There is no network round-trip for reads.

```ts
// This runs locally — no server involved
const result = await db.query(`
  SELECT * FROM features
  WHERE ST_Intersects(geom, ST_MakeEnvelope(-122.5, 37.7, -122.4, 37.8, 4326))
`)
```

Writes (`INSERT`, `UPDATE`, `DELETE`) are captured by an outbox trigger in the local schema and pushed to datum-server asynchronously on a configurable sync cycle (default: every 5 seconds).

## Bounding box subscriptions

On connect, the client sends a `subscribe` message declaring a bounding box. datum-server runs a spatial query directly against your PostGIS table and returns only features that intersect the box. This is the initial snapshot.

From that point on, the server only pushes delta messages to clients whose bounding box intersects the changed feature. A feature updated in San Francisco is never sent to a client subscribed to London. This keeps the wire protocol efficient regardless of total dataset size.

### Subscription predicates

Beyond the bbox, subscriptions can include an additional SQL WHERE clause to filter by any column:

```ts
DatumClient.connect({
  bbox: [-122.5, 37.7, -122.4, 37.8],
  where: "type = 'building' AND height > 10",
})
```

The predicate is applied server-side to both the initial snapshot and real-time delta routing — clients only receive features that match. For user-derived values, use `whereParams` to pass bound parameters safely:

```ts
DatumClient.connect({
  bbox,
  where: "type = $1",
  whereParams: [userSelectedType],
})
```

The predicate is validated via a blocklist and `EXPLAIN` in a `READ ONLY` transaction before any data flows. PostGIS operators like `ST_DWithin` work naturally.

## Sync cycle

The full write path:

1. Client writes to local PGlite via `db.query('INSERT ...')`
2. The `_datum_capture_change` trigger captures the write into `_datum_outbox` with an auto-incrementing `seq` column
3. Every `syncInterval` ms (default 5000), the client drains unsynced outbox entries (ordered by `seq`) and sends a `write` message to datum-server over WebSocket. Writes already in-flight are skipped.
4. datum-server applies each edit directly to PostGIS — last-write-wins on conflict
5. datum-server sends an `ack` back to the originating client with the `write_ids` that were applied
6. The client marks those writes as synced only after receiving the ack; if the connection drops mid-flight the writes are retried on reconnect
7. The `datum_notify_change` trigger fires on the PostGIS table
8. datum-server listens for `NOTIFY` and broadcasts a `delta` message to all other clients whose bbox intersects the changed feature's bounding box

The originating client never receives its own delta back. Delta routing uses the full geometry bounding box, so polygons and lines are correctly broadcast to all overlapping clients — not just those containing the first vertex.

## IndexedDB persistence and fast reconnect

On the **first visit**, PGlite boots in-memory, downloads a full snapshot from the server, and writes it to IndexedDB. This takes ~3 seconds.

On **returning visits**, PGlite loads directly from IndexedDB (~200ms). Local data is immediately queryable. In the background, datum connects to the server and requests only features updated since `MAX(updated_at)` in the local database — a delta catch-up that runs without blocking the UI.

A `_datum_meta` table tracks two values: `schema_version` (bumped when the client library changes its internal schema) and `schema_hash` (a fingerprint of the server table's column list, sent with every connection). On the next visit the client compares both. If either has changed — a client library upgrade or a server-side `ALTER TABLE` — PGlite wipes IndexedDB and performs a full re-sync automatically.

## Schema cloning

When datum-server starts, it introspects the configured table via `pg_catalog` and caches the full column list — names, types, and roles. On every new WebSocket connection the server sends a `schema` message before the first snapshot:

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

The client hashes the column list and compares it to the stored `schema_hash`. If they differ — because a column was added or removed on the server — the client automatically wipes its local PGlite database and recreates the table with the correct column structure before loading the snapshot. No configuration required.

This means users write the same SQL locally as they do on the server:

```ts
// A table with name TEXT and height FLOAT8 columns —
// works identically against local PGlite and the remote PostGIS
const result = await db.query(`
  SELECT name, height
  FROM features
  WHERE height > 10
`)
```

The `properties` JSONB column is optional and coexists with typed columns. A table can have both.

## Connection status and auto-reconnect

The client exposes a `connectionStatus` getter (`'connecting' | 'connected' | 'disconnected'`) and an `onStatusChange` callback so your application can react to network changes.

If the WebSocket drops mid-session, the client automatically reconnects with exponential backoff — 1 s, 2 s, 4 s, … up to 30 s. On reconnect, it sends a subscribe message with `since = MAX(updated_at)` so only missed deltas are returned; no full re-sync is needed.

During a disconnected period, local reads and writes continue working normally against PGlite. Pending writes are queued in `_datum_outbox` and pushed as soon as the connection recovers. You can check how many writes are waiting at any time via `client.pendingCount` or subscribe to changes with `client.onPendingChange(cb)`.

On first connect, `connect()` rejects with an error after `connectTimeout` (default 30 s) if the server never responds — rather than hanging forever.
