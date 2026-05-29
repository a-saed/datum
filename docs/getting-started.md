# Getting Started

Get datum running locally in under 5 minutes.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) 20 or later

## 1. Start PostGIS and datum-server

Clone the repository and start the backend:

```bash
git clone https://github.com/a-saed/datum.git
cd datum
docker compose up -d
```

This starts two containers:
- **postgis** — PostgreSQL 16 with PostGIS 3.4. datum-server runs the SQL migration on first boot and installs the `datum` schema automatically.
- **datum-server** — the Go sync server, listening on `ws://localhost:3000/ws`.

Verify both are running:

```bash
docker compose ps
```

Expected: both `postgis` and `datum-server` show `running`.

## 2. Run the demo app

```bash
npm install
npm run build -w datum-sync
npm run dev -w datum-demo
```

Open [http://localhost:5173](http://localhost:5173).

## 3. Add points to the map

The demo has two layers — **Features** (blue) and **Waypoints** (orange) — shown in the layer panel in the top-right corner.

- Select a layer by clicking it in the panel
- Click anywhere on the map to open the add popup
- Features have a **name** and optional **note**; Waypoints have a **name** and a **type** (Landmark / Campsite / Viewpoint / Trailhead)
- The point appears immediately — it was written to the local PGlite database and will sync to the server within 5 seconds

Use the eye icon in the layer panel to show or hide each layer independently.

## Verify real-time sync

Open a second browser tab at [http://localhost:5173](http://localhost:5173). Points added in the first tab appear in the second tab within 5 seconds (the default sync interval). Both tables sync independently.

## Using datum-sync in your own app

Install the package:

```bash
npm install datum-sync
```

Connect and query:

```ts
import { DatumClient } from 'datum-sync'

const db = await DatumClient.connect({
  serverUrl: 'ws://your-server/ws',
  bbox: [-122.5, 37.7, -122.4, 37.8],
  onStatusChange: (status) => console.log('datum:', status),
})

const result = await db.query(`SELECT * FROM features`)
```

For multiple tables, create one client per table:

```ts
const featuresDb = await DatumClient.connect({ serverUrl, bbox, table: 'features' })
const waypointsDb = await DatumClient.connect({ serverUrl, bbox, table: 'waypoints' })
```

In React, use the `useDatum` hook for reactive queries that update automatically:

```tsx
import { useDatum } from 'datum-sync/react'

const { rows } = useDatum(db, `SELECT * FROM features`)
```

## Next steps

- [How It Works](/how-it-works) — understand the local-first model, bbox subscriptions, and sync cycle
- [API Reference](/api) — full TypeScript client, React hooks, and server documentation
- [Authentication](/auth) — add per-user JWT auth and Postgres Row Level Security
- [Self-Hosting](/self-hosting) — deploy to production (free-tier guide included)
