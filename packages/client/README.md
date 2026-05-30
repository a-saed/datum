# datum-sync

Local-first live sync for PostGIS. Spatial tables use bounding box subscriptions; all tables support flexible filtering via subscription predicates.

```ts
import { DatumClient } from 'datum-sync'

const db = await DatumClient.connect({
  serverUrl: 'ws://localhost:3000/ws',
  bbox: [-122.5, 37.7, -122.4, 37.8],
})

// Full PostGIS runs locally in WASM — no network round-trip
// datum mirrors the server schema locally — query typed columns directly
const result = await db.query<{ name: string }>(
  `SELECT name FROM features
   WHERE ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))`,
  [-122.5, 37.7, -122.4, 37.8]
)

// Writes sync to the server automatically in the background
await db.query(
  `INSERT INTO features (geom, name, updated_at)
   VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, now())`,
  [lng, lat, 'Field site A']
)
```

## How it works

- **Local-first** — PGlite boots a full Postgres instance in WASM in the browser. All queries run locally with no network latency.
- **Bbox subscriptions** — declare a bounding box on connect; only features in your viewport are synced.
- **Fast reconnect** — PGlite persists to IndexedDB. Returning visits load in ~200ms with local data immediately queryable.

## Installation

```bash
npm install datum-sync
```

Requires a running [datum-server](https://github.com/a-saed/datum) instance and a PostGIS database.

## Documentation

Full docs at [a-saed.github.io/datum](https://a-saed.github.io/datum)

## License

MIT
