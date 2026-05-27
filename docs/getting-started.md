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

## 3. Add a feature

Click anywhere on the map. Enter a name in the popup and click **Save feature**. The point appears on the map immediately — it was written to the local PGlite database and will sync to the server within 5 seconds.

## Verify real-time sync

Open a second browser tab at [http://localhost:5173](http://localhost:5173). Features added in the first tab appear in the second tab within 5 seconds (the default sync interval).

## Next steps

- [How It Works](/how-it-works) — understand the local-first model, bbox subscriptions, and sync cycle
- [API Reference](/api) — full TypeScript client and server documentation
- [Self-Hosting](/self-hosting) — deploy to production (free-tier guide included)
