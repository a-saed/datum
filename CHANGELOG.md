# Changelog

Notable changes to `datum-sync`. For the full feature history, see the
"Recently shipped" section of [ROADMAP.md](./ROADMAP.md).

## 0.13.1 — 2026-07-16

### Fixed
- **MCP in Node.js** — the MCP entrypoint (`datum-sync/mcp`, `datum-mcp` CLI)
  used the browser IndexedDB storage backend, which does not exist in Node.js,
  crashing on startup. PGlite now falls back to filesystem storage outside the
  browser.
- **Spatial tables via MCP** — connecting to a spatial table without a bounding
  box now defaults to the world bbox instead of being rejected.

_Both fixes landed on `main` in `897fc39` but were missing from the published
0.13.0. This is the release that gets them to npm users._

## 0.13.0 — 2026-06-09

### Added
- **MCP server (`datum-mcp`)** — exposes a connected `DatumClient` as a Model
  Context Protocol stdio server. AI agents query synced PostGIS data with
  `query` (full SQL + PostGIS), `get_schema`, and `get_status`. Read-only by
  default; opt-in writes with `--allow-writes`.
