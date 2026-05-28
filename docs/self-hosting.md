# Self-Hosting

## Configuration

datum-server is configured via a `datum.yaml` file and/or environment variables. Only two CLI flags exist:

| Flag | Env var | Required | Description |
|---|---|---|---|
| `-db` | `DATABASE_URL` | Yes | PostgreSQL connection string. Keep out of the config file to avoid committing credentials. |
| `-config` | `CONFIG` | No | Path to `datum.yaml`. |

Everything else — port, origin, tables, column names — goes in `datum.yaml` or as env vars. See [API Reference → datum-server](/api#datum-server-go-binary) for the full config reference.

## Docker

datum-server is distributed as a Docker image: `ghcr.io/a-saed/datum-server`.

**Local development** (from the repo root):

```bash
docker compose up -d
```

**Production — env vars:**

```bash
docker run \
  -e DATABASE_URL="postgres://user:pass@host:5432/mydb" \
  -e TABLE=features \
  -e ALLOWED_ORIGIN="https://myapp.com" \
  -p 3000:3000 \
  ghcr.io/a-saed/datum-server
```

**Production — config file:**

```bash
docker run \
  -v ./datum.yaml:/app/datum.yaml \
  -e DATABASE_URL="postgres://user:pass@host:5432/mydb" \
  -p 3000:3000 \
  ghcr.io/a-saed/datum-server -config /app/datum.yaml
```

datum-server needs outbound access to Postgres and inbound WebSocket access from your clients. It has no disk state — restarts are safe.

## CORS

`ALLOWED_ORIGIN` controls which browser origins are allowed to open a WebSocket connection. Set it to your app's exact origin (scheme + host + port):

```
ALLOWED_ORIGIN=https://myapp.com        # production
ALLOWED_ORIGIN=http://localhost:5173    # local dev
ALLOWED_ORIGIN=*                        # allow all (default, dev only)
```

Always set a specific origin in production.

## Deployment options

datum-server is a stateless Docker container — it runs anywhere Docker runs.

**Container platforms** — Fly.io, Railway, Render, Google Cloud Run, AWS ECS, Azure Container Apps, etc. Pull `ghcr.io/a-saed/datum-server`, set `DATABASE_URL` as a secret, and expose port 3000.

**VPS / bare metal** — run the container with Docker or Docker Compose behind an nginx/Caddy reverse proxy that handles TLS. WebSocket upgrades work with a standard proxy config.

**Kubernetes** — deploy as a Deployment with one replica per region. datum-server holds client connections in memory, so sticky sessions (or a single replica) are required for correct delta fan-out.

## Postgres / PostGIS

datum-server works with any PostgreSQL 14+ instance that has the PostGIS extension enabled:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Managed options that support PostGIS: Neon, Supabase, Aiven, AWS RDS, Google Cloud SQL, Azure Database for PostgreSQL, and a self-hosted PostGIS instance.

datum-server runs its migration on startup (idempotent) and needs `CREATE`, `INSERT`, `UPDATE`, `DELETE`, and `TRIGGER` privileges on the configured table.

## Minimum resources

datum-server is lightweight — 256 MB RAM and a single shared CPU handle hundreds of concurrent WebSocket connections. The bottleneck is almost always Postgres, not the Go server.
