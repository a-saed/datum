# Datum

Local-first spatial sync for PostGIS. A bounding box is a first-class live sync subscription.

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

## Quick start (5 minutes)

**Prerequisites:** Docker, Node.js 20+

**1. Start PostGIS + datum-server**

```bash
docker compose up -d
```

**2. Install and run the demo**

```bash
npm install
npm run build -w datum
npm run dev -w datum-demo
```

Open http://localhost:5173. Click the map to add features. Watch them sync.

**3. Verify sync**

Open a second browser tab — features added in one tab appear in the other within 5 seconds.

## How it works

- **Client (`datum` npm package):** PGlite + PostGIS WASM. Full spatial queries run locally.
- **datum-server (Go):** Thin protocol bridge. Calls PostGIS SQL functions. Contains no spatial logic.
- **SQL migration:** Installs `datum.sync()`, `datum.write()`, and a `NOTIFY` trigger into your PostGIS.

All spatial intelligence lives in PostGIS. The Go server is replaceable.

## Architecture

See [docs/superpowers/specs/2026-05-26-datum-design.md](docs/superpowers/specs/2026-05-26-datum-design.md).

## License

MIT
