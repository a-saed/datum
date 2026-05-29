# Authentication

datum supports opt-in JWT authentication. When configured, every client must present a valid JWT on connection. Claims from the token are forwarded to Postgres as session variables so your Row Level Security policies can filter data per user.

If you don't configure auth, datum works exactly as before — no breaking changes.

## Quick start

### 1. Configure datum-server

```yaml
# datum.yaml
auth:
  jwt_algorithm: "HS256"   # or RS256, ES256
  # jwt_secret comes from JWT_SECRET env var — never put it here
```

```bash
JWT_SECRET=your-secret datum-server -config datum.yaml -db $DATABASE_URL
```

For RS256/ES256, use a public key file instead:

```yaml
auth:
  jwt_algorithm: "RS256"
  jwt_public_key: "/run/secrets/jwt.pub"
```

### 2. Connect as a non-superuser

RLS only applies to non-superuser Postgres roles. Create a restricted role and use it in `DATABASE_URL`:

```sql
CREATE ROLE datum_app LOGIN PASSWORD 'your-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON features TO datum_app;
GRANT USAGE ON SCHEMA public TO datum_app;
ALTER TABLE features ENABLE ROW LEVEL SECURITY;
ALTER TABLE features FORCE ROW LEVEL SECURITY;
```

```bash
DATABASE_URL=postgres://datum_app:your-password@host/db
```

datum-server warns on startup if it detects a superuser connection.

### 3. Pass the token in the client

```ts
const db = await DatumClient.connect({
  serverUrl: 'wss://your-server/ws',
  bbox: [-122.5, 37.7, -122.4, 37.8],
  token: async () => yourAuth.getValidToken(), // called on connect + auto-refreshed
})
```

Static string also works for testing:

```ts
token: 'eyJ...'
```

### 4. Write RLS policies

datum sets every JWT claim as a Postgres session variable under `datum.<claim>`. For a JWT like `{ "sub": "user-abc", "org_id": "org-123", "role": "member" }`:

```sql
-- datum.sub    = 'user-abc'
-- datum.org_id = 'org-123'
-- datum.role   = 'member'

CREATE POLICY tenant_isolation ON features
  USING (org_id = current_setting('datum.org_id', true)::uuid);

CREATE POLICY user_writes_own ON features
  WITH CHECK (owner_id = current_setting('datum.sub', true)::uuid);
```

## Supported algorithms

| Algorithm | Key config |
|---|---|
| `HS256`, `HS384`, `HS512` | `JWT_SECRET` env var |
| `RS256`, `RS384`, `RS512` | `jwt_public_key` PEM file |
| `ES256`, `ES384`, `ES512` | `jwt_public_key` PEM file |

## Token refresh

If `token` is a function, datum reads the `exp` claim from the JWT and automatically calls your function 60 seconds before expiry. It sends a fresh token to the server mid-connection — no reconnect, no snapshot re-fetch.

## Security notes

- **Use WSS in production.** `ws://` sends the token in plaintext.
- **`jwt_secret` via env var only.** Never put secrets in `datum.yaml` — it gets committed to git.
- **Public keys are safe in config.** A public key can only verify tokens, not create them.
- **Non-superuser role required.** Superusers bypass RLS silently.

## Known limitation: delta broadcast

In this release, real-time delta messages are routed by bounding box only — not filtered by RLS. A delta for a feature in your bbox will be pushed to you even if an RLS policy would block you from seeing it in a snapshot query. The data arrives in the local PGlite database, but the next snapshot catch-up will reflect the correct RLS-filtered state.

Per-delta RLS filtering (`auth.broadcast_rls_check`) is designed and on the roadmap.

## What datum does not own

- **Token issuance** — use Auth0, Supabase Auth, your own backend, or any JWT library.
- **Authorization rules** — write Postgres RLS policies using your JWT claims.
- **User management** — datum has no concept of users or roles.
