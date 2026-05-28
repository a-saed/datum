# Self-Hosting

## Configuration

datum-server is configured via a `datum.yaml` file and/or environment variables. Only two CLI flags exist:

| Flag | Env var | Required | Description |
|---|---|---|---|
| `-db` | `DATABASE_URL` | Yes | PostgreSQL connection string. Keep out of the config file to avoid committing credentials. |
| `-config` | `CONFIG` | No | Path to `datum.yaml`. |

Everything else — port, origin, tables, column names — goes in `datum.yaml` or as env vars. See [API Reference → datum-server](/api#datum-server-go-binary) for the full config reference.

## Docker

**Local development** (from the repo root):

```bash
docker compose up -d
```

**Production** — run datum-server with your PostGIS connection:

```bash
docker run ghcr.io/a-saed/datum-server \
  -e DATABASE_URL="postgres://user:pass@host:5432/mydb" \
  -e TABLE=features \
  -e ALLOWED_ORIGIN="https://myapp.com"
```

Or mount a config file:

```bash
docker run \
  -v ./datum.yaml:/app/datum.yaml \
  -e DATABASE_URL="postgres://user:pass@host:5432/mydb" \
  ghcr.io/a-saed/datum-server -config /app/datum.yaml
```

## CORS

`ALLOWED_ORIGIN` (or `allowed_origin` in `datum.yaml`) controls which browser origins are allowed to open a WebSocket connection. Set it to your app's exact origin (scheme + host + port):

```
https://myapp.com          # production
http://localhost:5173      # local dev
*                          # allow all (dev only, the default)
```

Always set a specific origin in production.

## Free-tier deployment (zero cost)

A full datum stack — PostGIS database + Go server + client app — runs for free using:

- **[Neon](https://neon.tech)** — serverless Postgres with PostGIS support (free tier: 0.5 CPU, 1 GB storage)
- **[Fly.io](https://fly.io)** — free tier includes 3 shared VMs (256 MB RAM each, enough for datum-server)
- **[GitHub Pages](https://pages.github.com)** — free static hosting for the client app

### Step 1 — Create a Neon database

1. Sign up at [neon.tech](https://neon.tech) and create a new project.
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
fly secrets set TABLE="features"
```

A minimal `fly.toml`:

```toml
app = 'my-datum-server'
primary_region = 'cdg'

[build]
  image = 'ghcr.io/a-saed/datum-server'

[env]
  TABLE = "features"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = 'off'
  min_machines_running = 1

[[vm]]
  memory = '256mb'
  cpu_kind = 'shared'
  cpus = 1
```

### Step 3 — Point your client at the Fly server

```ts
const db = await DatumClient.connect({
  serverUrl: 'wss://my-datum-server.fly.dev/ws',
  bbox: [-180, -90, 180, 90],
})
```

Your client app (built with Vite/React) can be deployed to GitHub Pages or any static host for free.
