# Datum

Local-first spatial sync for PostGIS. A bounding box is a first-class live sync subscription.

**[Live Demo](https://a-saed.github.io/datum/demo/) · [Docs](https://a-saed.github.io/datum/) · [npm](https://www.npmjs.com/package/datum-sync)**

<video src="https://github.com/a-saed/datum/releases/download/v0.2.0/datum-demo.mp4" autoplay loop muted playsinline width="100%"></video>

```ts
const db = await DatumClient.connect({
  serverUrl: 'ws://localhost:3000/ws',
  bbox: [-122.5, 37.7, -122.4, 37.8],
})

// Full PostGIS, runs locally in WASM — no network
const features = await db.query(`
  SELECT * FROM features WHERE ST_Area(geom) > 1000
`)
```

## Install

```bash
npm install datum-sync
```

```ts
import { DatumClient } from 'datum-sync'
import { useDatum } from 'datum-sync/react' // optional React hook
```

## Quick start (5 minutes)

**Prerequisites:** Docker, Node.js 20+

**1. Start PostGIS + datum-server**

```bash
docker compose up -d
```

**2. Install and run the demo**

```bash
npm install
npm run build -w datum-sync
npm run dev -w datum-demo
```

Open http://localhost:5173. Click the map to add features. Watch them sync.

**3. Verify sync**

Open a second browser tab — features added in one tab appear in the other within a few seconds.

## How it works

- **Client (`datum-sync` npm package):** PGlite + PostGIS WASM. Full spatial queries run locally.
- **datum-server (Go):** Thin protocol bridge. Calls PostGIS SQL functions. Contains no spatial logic.
- **SQL migration:** Installs `datum.sync()`, `datum.write()`, and a `NOTIFY` trigger into your PostGIS.

All spatial intelligence lives in PostGIS. The Go server is replaceable.

## Production deployment

Run datum-server with `-allowed-origin` set to your app's domain to prevent unauthorized WebSocket connections:

```bash
docker run ghcr.io/a-saed/datum-server \
  -db "postgres://user:pass@host/mydb" \
  -table features \
  -allowed-origin "https://myapp.com"
```

The default `*` allows all origins and is only suitable for local development.

> **Security note:** datum-server currently has no user authentication — any client that can reach the WebSocket endpoint can read and write data. Use `-allowed-origin` to restrict browser access, and firewall the port for anything sensitive. Per-user auth is on the [roadmap](ROADMAP.md).

## Documentation

- [API reference](docs/api.md) — TypeScript client, server flags, wire protocol, SQL functions

## Architecture

Client (PGlite + PostGIS WASM) ↔ WebSocket ↔ datum-server (Go, ~300 lines) ↔ pgx ↔ PostGIS

All spatial logic lives in PostGIS SQL functions (`datum` schema). The Go server is a stateless protocol bridge — no spatial operations, fully replaceable.

## License

MIT
