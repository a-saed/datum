# Troubleshooting

datum-server exposes structured logs, health endpoints, and Prometheus metrics
(see [API Reference → datum-server](/api#datum-server-go-binary)). This page
is the practical companion: what to look at first for common problems, and
what each signal actually means.

## Start here

1. `curl your-server:3000/readyz` — is the server up and can it reach Postgres?
2. `LOG_LEVEL=debug` — logs are JSON on stdout; every line has a `msg` field
   you can grep for (all message strings below are exact).
3. `curl your-server:3000/metrics` — Prometheus metrics, safe to scrape
   continuously.

## Health checks

| Symptom | Meaning | What to check |
|---|---|---|
| `/healthz` returns non-200 or times out | The process itself isn't serving HTTP | Is the container/process actually running? Check for a crash in the startup logs (`config error`, `connect to postgres failed`, `migration failed`, etc. — these are fatal and the process exits). |
| `/healthz` is `200` but `/readyz` is `503` | Process is alive, Postgres is not reachable | Check `DATABASE_URL`, network/firewall rules between datum-server and Postgres, and whether Postgres itself is up. The response body includes the underlying connection error. In Kubernetes this is normal and expected during a Postgres restart — the pod stays alive and traffic stops routing to it until `/readyz` recovers. |

Liveness and readiness are intentionally separate — see
[self-hosting.md](/self-hosting#health-checks-metrics-logging) for why a
combined check would be wrong for a WebSocket server.

## Reading the logs

Every log line is JSON with `component: "datum-server"`. Startup logs are
fatal (the process exits after logging); everything else is "log and
continue." A few message strings map directly to a cause:

| `msg` | Cause | Fix |
|---|---|---|
| `missing database URL` | Neither `-db` nor `DATABASE_URL` set | Set one of them. |
| `connect to postgres failed` | Can't reach Postgres at startup | Check the connection string, network, and that Postgres is running. |
| `migration failed` / `schema introspection failed` / `column validation failed` | The configured table doesn't match what datum-server expects | Check the `err` field — usually a missing/wrong-typed `id`, `updated_at`, or `geom` column. See [API Reference → required columns](/api#datum-server-go-binary). |
| `DATABASE_URL connects as a superuser; Row Level Security will be bypassed` | Auth is configured but the DB role is a superuser | RLS policies are silently not enforced. Create a restricted role for production, per the warning's hint. |
| `websocket upgrade failed` | A client's WS handshake failed | Usually a proxy/load balancer not forwarding the Upgrade header correctly, or `ALLOWED_ORIGIN` rejecting the client's origin. |
| `auth rejected` / `token refresh rejected` | JWT verification failed for a client | Check the `err` field — expired token, wrong signing key/algorithm, or clock skew. |
| `subscribe: spatial table requires a bbox` | Client subscribed to a spatial table without a `bbox` | Spatial tables always require a bbox; non-spatial tables never use one. |
| `subscribe: invalid predicate` | A client's `where` clause failed validation | Failed the blocklist or `EXPLAIN` syntax check — check the client's `where`/`whereParams`. |
| `write error` | A client's write failed to apply | Check the `err` field — commonly an invalid UUID, a type mismatch, or an RLS policy rejecting the write. |
| `rate limit exceeded` | A client IP hit `RATE_LIMIT` | Expected under abuse or a misbehaving client; raise `RATE_LIMIT` if it's blocking legitimate traffic. |
| `predicate check error` / `RLS check error` | A DB error while re-checking a delta against a client's predicate/RLS | These fail open (the delta is still sent) so a transient DB error never silently drops data — but repeated errors mean something is wrong with that query; check the `err` field. |
| `client send buffer full, dropping delta` / `... dropping gone notification` / `schema send buffer full` / `ack buffer full` | A client's outbound buffer (64 messages) is full | The client isn't draining fast enough — usually a slow/stalled connection about to be cleaned up by the ping/pong timeout. |
| `notify listener stopped, retrying` | The dedicated `LISTEN` connection to Postgres dropped | Auto-retries every 5s. Frequent occurrences mean an unstable connection to Postgres. |

Every per-client log line includes `client_id`; every per-table line includes
`table` — grep on those to follow one client or table across a busy log.

## Metrics: what to graph

All metrics and labels are listed in
[API Reference → HTTP endpoints](/api#http-endpoints). Some starting points:

- **Connections not matching expectations** — graph `datum_websocket_connections{table="..."}`.
  If it's higher than you expect, clients aren't disconnecting cleanly (check
  for `client send buffer full` spam, which precedes a forced disconnect).
- **Write failures** — `rate(datum_writes_total{result="error"}[5m])`. Pair
  with `write error` log lines (same time window) for the `err` detail.
- **Slow snapshots** — `histogram_quantile(0.95, rate(datum_db_query_duration_seconds_bucket{operation="snapshot"}[5m]))`.
  A rising p95 usually means a missing spatial index or an overly large bbox;
  see [self-hosting.md](/self-hosting#postgres-postgis).
- **Unexpected rate limiting** — `rate(datum_rate_limit_rejections_total[5m])`.
  Compare against your configured `RATE_LIMIT`.
- **RLS/predicate check cost** — `rate(datum_db_query_duration_seconds_sum{operation=~"rls_check|predicate_check"}[5m]) / rate(datum_db_query_duration_seconds_count{operation=~"rls_check|predicate_check"}[5m])`
  gives the average cost per delta re-check; this runs once per subscribed
  client per change, so it scales with (deltas × subscribers).

## Still stuck?

Open an issue on [GitHub](https://github.com/a-saed/datum/issues) with your
`datum.yaml` (redact secrets), the relevant log lines, and — if it's
performance-related — the metrics above around the time of the problem.
