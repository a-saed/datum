# Datum Roadmap

## High priority

### Configurable column mapping
datum currently requires a specific table shape (`id`, `geom`, `properties`, `updated_at`). Most existing PostGIS users have typed columns (`name TEXT`, `height FLOAT`, etc.) rather than a JSON properties bag. Column mapping would let users point datum at any existing PostGIS table by specifying which columns map to each role.

### Multiple tables
The server is configured with a single `-table` flag. Real apps need to sync multiple tables together with a single connection. Each table would have its own bbox subscription and outbox.

### Per-user authentication
Any client that can reach the WebSocket endpoint can read and write all data. Proper per-user auth (JWT / row-level security) is needed before datum is safe for multi-tenant apps. The `-allowed-origin` flag limits browser origins but is not a substitute for user-level access control.

---

## Medium priority

### Subscription predicates beyond bbox
bbox is the only subscription filter today. Some use cases need arbitrary predicates — sync all features of type "building", sync features belonging to a project, etc. A WHERE clause on the subscribe message would cover most cases.

### Conflict resolution strategies
Today datum uses last-write-wins based on `updated_at`. For collaborative editing, applications may need custom merge strategies or CRDT-based resolution. This likely needs to be an application-level hook rather than a built-in strategy.

---

## Recently shipped

- **Dynamic bounding box** — `client.setBbox(bbox)` updates the subscription without reconnecting. Server sends a new snapshot for the updated area.
- **React hooks** — `useDatum(client, sql)` from `datum-sync/react`. Reactive queries, no polling.
- **Live demo** — [a-saed.github.io/datum/demo](https://a-saed.github.io/datum/demo/)
- **Delete propagation** — deletes from one client are broadcast to all other clients in range.
- **IndexedDB persistence** — returning visits load local data instantly (~200ms), catch up in the background. Unsynced writes survive browser crashes.
- **npm + Docker** — `datum-sync` on npm, `ghcr.io/a-saed/datum-server` on GHCR.
