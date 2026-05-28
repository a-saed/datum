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

A `_datum_meta` table tracks the schema version. If the client library updates the local schema, it automatically wipes IndexedDB and performs a full re-sync on the next visit.

## Connection status and auto-reconnect

The client exposes a `connectionStatus` getter (`'connecting' | 'connected' | 'disconnected'`) and an `onStatusChange` callback so your application can react to network changes.

If the WebSocket drops mid-session, the client automatically reconnects with exponential backoff — 1 s, 2 s, 4 s, … up to 30 s. On reconnect, it sends a subscribe message with `since = MAX(updated_at)` so only missed deltas are returned; no full re-sync is needed.

During a disconnected period, local reads and writes continue working normally against PGlite. Pending writes are queued in `_datum_outbox` and pushed as soon as the connection recovers. You can check how many writes are waiting at any time via `client.pendingCount` or subscribe to changes with `client.onPendingChange(cb)`.

On first connect, `connect()` rejects with an error after `connectTimeout` (default 30 s) if the server never responds — rather than hanging forever.
