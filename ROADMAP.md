# Datum Roadmap

## Planned

### Per-user authentication
Right now any client that can reach the WebSocket endpoint can read and write all data. Proper per-user auth (JWT / OAuth) would make datum safe for multi-tenant apps. The `-allowed-origin` flag limits which browser origins can connect, but is not a substitute for user-level access control.

---

### Multiple tables
The server is configured with a single `-table` flag. Real apps have multiple tables (e.g. `features`, `annotations`, `users`). The server needs to support syncing multiple tables, each with their own bbox subscription.

---

### Dynamic bbox
The client's bounding box is fixed at connect time. Resending a new `subscribe` message when the user pans or zooms the map would make datum usable for large datasets without loading everything upfront.

---

## Recently shipped

- **React hooks** — `useDatum(client, sql)` from `datum-sync/react`. Reactive queries, no polling.
- **Live demo** — [a-saed.github.io/datum/demo](https://a-saed.github.io/datum/demo/)
- **Delete propagation** — deletes from one client are broadcast to all other clients in range.
- **IndexedDB persistence** — returning visits load local data instantly (~200ms), catch up in the background.
- **npm + Docker** — `datum-sync` on npm, `ghcr.io/a-saed/datum-server` on GHCR.
