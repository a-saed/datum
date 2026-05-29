# Datum

Local-first spatial sync for PostGIS. A bounding box is a first-class live sync subscription.

**[Live Demo](https://a-saed.github.io/datum/demo/) · [Docs](https://a-saed.github.io/datum/) · [npm](https://www.npmjs.com/package/datum-sync)**


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
- **datum-server (Go):** Handles WebSocket connections, runs snapshot/write queries directly against PostGIS, and listens for change notifications.
- **Migration:** Installs a `NOTIFY` trigger into your PostGIS table on startup. That's the only database-side object datum adds.

## Production deployment

Configure datum-server via a `datum.yaml` file:

```yaml
port: 3000
allowed_origin: "https://myapp.com"

# Single table:
table:
  name: features
  col_id: id               # optional — defaults match standard column names

# Or multiple tables, each with its own column mapping:
# tables:
#   - name: sites
#   - name: parcels
#     col_updated_at: modified_at
```

```bash
docker run -v ./datum.yaml:/app/datum.yaml \
  -e DATABASE_URL="postgres://user:pass@host/mydb" \
  ghcr.io/a-saed/datum-server -config /app/datum.yaml
```

Or use env vars without a config file:

```bash
docker run \
  -e DATABASE_URL="postgres://user:pass@host/mydb" \
  -e TABLE=features \
  -e ALLOWED_ORIGIN=https://myapp.com \
  ghcr.io/a-saed/datum-server
```

> **Security note:** Set `allowed_origin` to restrict browser access, and firewall the port in production. datum-server supports JWT authentication (HS256/RS256/ES256) — see [Authentication](/auth) in the docs.

## Documentation

- [API reference](docs/api.md) — TypeScript client, config file, env vars, wire protocol

## Architecture

Client (PGlite + PostGIS WASM) ↔ WebSocket ↔ datum-server (Go) ↔ pgx ↔ PostGIS

## License

MIT
