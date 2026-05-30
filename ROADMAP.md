# Datum Roadmap

## Medium priority



### Webhook auth mode
`auth.mode: webhook` — datum calls your app's endpoint to verify opaque tokens (session cookies, API keys) or perform real-time revocation checks. Config key `auth.webhook_url` reserved. JWT mode covers most cases.

### Per-delta RLS check (`broadcast_rls_check`)
Before pushing a delta to a client, datum runs a `SELECT 1` filtered through that client's RLS. Drops the delta if RLS blocks it — correct per-row visibility at the cost of one DB query per delta per recipient. Config key `auth.broadcast_rls_check: true` reserved.

### Subscription predicates beyond bbox
bbox is the only subscription filter today. Some use cases need arbitrary predicates — sync all features of type "building", sync features belonging to a project, etc. A WHERE clause on the subscribe message would cover most cases.

### Conflict resolution strategies
Today datum uses last-write-wins based on `updated_at`. For collaborative editing, applications may need custom merge strategies or CRDT-based resolution. This likely needs to be an application-level hook rather than a built-in strategy.

---

## Recently shipped

- **DevTools (v0.8.0)** — `datum-sync/devtools` adds a floating browser panel with a SQL REPL (full PostGIS), schema inspector, and live sync status. Activated by `initDatumDevtools(db)`. Toggle with `Ctrl+Shift+D`. Zero production bundle impact via dynamic import. Try it at the [live demo](https://a-saed.github.io/datum/demo/).
- **Typed column support (v0.7.0)** — datum auto-introspects the server table at startup and mirrors the exact column structure in PGlite. Any columns beyond the 4 required ones (`id`, `geom`, `updated_at`, `properties`) are synced automatically and queryable with normal SQL on both sides — no extra configuration.
- **Per-user authentication (v0.6.0)** — JWT auth (HS256/RS256/ES256). Token in `subscribe` message, all claims forwarded as `datum.<key>` Postgres session variables for RLS. Auto token refresh before expiry. Startup warning when connected as superuser. Fully opt-in.
- **Security and correctness hardening (0.5.0)** — Ack-based write sync (server acks writes before client marks synced; retries on reconnect). WS per-connection read limits, read deadlines, ping/pong keepalive. Write batch capped at 500. Rate limiter uses real client IP (X-Forwarded-For aware). Delta broadcast uses full geometry bbox (not just first vertex) for correct routing of polygons and lines. Graceful shutdown on SIGTERM. Outbox ordered by insertion seq not feature timestamp.
- **Pending writes visibility** — `client.pendingCount` getter and `client.onPendingChange(cb)` subscription expose the outbox backlog in real time. Fires after every local write and after every sync flush.
- **Connection status + auto-reconnect** — `connectionStatus` getter and `onStatusChange` callback expose `'connecting' | 'connected' | 'disconnected'`. Client auto-reconnects with exponential backoff (1 s → 30 s cap) when the WebSocket drops. `connectTimeout` (default 30 s) rejects `connect()` if the initial snapshot never arrives.
- **Local table name matches server** — the local PGlite table is now named after `config.table`, so queries mirror the server schema exactly. `dbName` also defaults to `config.table` to prevent IndexedDB collisions in multi-table setups.
- **Multiple tables** — configure multiple tables in `datum.yaml` under `tables:`, each with its own column mapping. Each `DatumClient` instance subscribes to one table by passing `table` in the config.
- **Configurable column mapping** — set `col_id`, `col_geom`, `col_updated_at`, `col_properties` in `datum.yaml` (or via env vars) to point datum at any existing PostGIS table without renaming columns.
- **Dynamic bounding box** — `client.setBbox(bbox)` updates the subscription without reconnecting. Server sends a new snapshot for the updated area.
- **React hooks** — `useDatum(client, sql)` from `datum-sync/react`. Reactive queries, no polling.
- **Live demo** — [a-saed.github.io/datum/demo](https://a-saed.github.io/datum/demo/)
- **Delete propagation** — deletes from one client are broadcast to all other clients in range.
- **IndexedDB persistence** — returning visits load local data instantly (~200ms), catch up in the background. Unsynced writes survive browser crashes.
- **npm + Docker** — `datum-sync` on npm, `ghcr.io/a-saed/datum-server` on GHCR.
