# Self-Hosting

## Server flags

| Flag | Required | Default | Description |
|---|---|---|---|
| `-db` | Yes | — | PostgreSQL connection string |
| `-table` | Yes | — | Table name to sync |
| `-port` | No | `3000` | Port to listen on |
| `-allowed-origin` | No | `*` | Allowed WebSocket `Origin`. Set to your app's domain in production. `*` allows all origins — local dev only. |

## Docker

**Local development** (from the repo root):

```bash
docker compose up -d
```

**Production** — run datum-server with your PostGIS connection and locked-down origin:

```bash
docker run ghcr.io/a-saed/datum-server \
  -db "postgres://user:pass@host:5432/mydb" \
  -table features \
  -port 3000 \
  -allowed-origin "https://myapp.com"
```

## CORS

The `-allowed-origin` flag controls which browser origins are allowed to open a WebSocket connection. Set it to your app's exact origin (scheme + host + port):

```bash
-allowed-origin "https://myapp.com"       # production
-allowed-origin "http://localhost:5173"   # local dev without Docker
-allowed-origin "*"                       # allow all (dev only)
```

The default `*` is intentionally permissive for local development. Always set a specific origin in production.

## Free-tier deployment (zero cost)

A full datum stack — PostGIS database + Go server + client app — runs for free using:

- **[Neon](https://neon.tech)** — serverless Postgres with PostGIS support (free tier: 0.5 CPU, 1 GB storage)
- **[Fly.io](https://fly.io)** — free tier includes 3 shared VMs (256 MB RAM each, enough for datum-server)
- **[GitHub Pages](https://pages.github.com)** — free static hosting for the client app

### Step 1 — Create a Neon database

1. Sign up at [neon.tech](https://neon.tech) and create a new project
2. In the Neon console, open the SQL editor and enable PostGIS:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
3. Copy the connection string — it looks like:
   ```
   postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Step 2 — Deploy datum-server to Fly.io

Install the Fly CLI, then from the repo root:

```bash
fly auth login
fly launch --image ghcr.io/a-saed/datum-server --name my-datum-server --no-deploy
fly secrets set DATABASE_URL="postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
fly deploy
```

Set the allowed origin once your client app URL is known:

```bash
fly secrets set ALLOWED_ORIGIN="https://your-app.github.io"
```

Update `fly.toml` to pass the flags:

```toml
[processes]
  app = "/datum-server -db $DATABASE_URL -table features -allowed-origin $ALLOWED_ORIGIN"
```

### Step 3 — Point your client at the Fly server

```ts
const db = await DatumClient.connect({
  serverUrl: 'wss://my-datum-server.fly.dev/ws',
  bbox: [-180, -90, 180, 90],
})
```

Your client app (built with Vite/React) can be deployed to GitHub Pages or any static host for free.
