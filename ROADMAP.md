# Datum Roadmap

## P1 — Production-ready

These are blockers for anyone trying to use datum in a real app.

### Delete propagation
`DELETE` statements are captured by the outbox trigger and sent to datum-server, but the server does not broadcast deletes to other clients as a delta. Features deleted by one client persist on all other clients until they reconnect.

**Scope:** `packages/server/sync.go` (handle `op: delete` in the write handler and broadcast a delete delta), `packages/client/src/client.ts` (apply delete deltas to local PGlite).

---

### Authentication
Right now any WebSocket client can read and write all data. There is no access control. A shared secret on the WebSocket handshake (e.g. a token in the URL query string or an `Authorization` header) would make it safe to deploy publicly.

**Scope:** `packages/server/server.go` (check token on upgrade), new `-auth-token` flag, client sends token in `DatumClient.connect({ token })`.

---

## P2 — Developer experience

These make datum significantly easier to build on top of.

### React hooks
The demo polls every 3 seconds with `setInterval`. A `useDatum(sql, params)` hook that re-renders whenever the local DB changes would eliminate polling and feel like a proper reactive data layer.

**Scope:** new package `packages/react` or an optional export in `datum-sync`. Hook subscribes to PGlite change events and re-runs the query on each change.

---

### Multiple tables
The server is configured with a single `-table` flag. Real apps have multiple tables (e.g. `features`, `annotations`, `users`). The server needs to support syncing multiple tables, each with their own bbox subscription.

**Scope:** `packages/server/` (multi-table config and routing), `packages/client/src/types.ts` (add `table` to `DatumConfig`).

---

## P3 — Growth

These grow awareness and usage.

### Host the live demo
Deploy the demo app so anyone can try datum without cloning the repo. Uses the free-tier stack from the self-hosting guide: Neon (PostGIS) + Fly.io (datum-server) + GitHub Pages (demo).

**Scope:** follow `docs/self-hosting.md` free-tier guide, add the live URL to the docs landing page and README.

---

### Public launch
Post a "Show HN" on Hacker News and share on relevant communities (r/webdev, r/gis, PostGIS forums). The project has npm package, Docker image, and docs — enough to show.

**Scope:** write a short launch post explaining the problem (PostGIS sync is hard), the approach (local-first + bbox), and link to the live demo.

---

## Order of execution

| # | Item | Why this order |
|---|---|---|
| 1 | Delete propagation | Small scope, fixes a correctness bug |
| 2 | Host live demo | Needed before any public launch |
| 3 | Public launch | Demo must be live first |
| 4 | Authentication | Required before anyone builds a real app on it |
| 5 | React hooks | High DX value, relatively self-contained |
| 6 | Multiple tables | Larger scope, needed for complex apps |
