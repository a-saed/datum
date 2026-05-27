---
layout: home

hero:
  name: "datum"
  tagline: "Local-first spatial sync for PostGIS."
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Live Demo
      link: https://a-saed.github.io/datum/demo/
    - theme: alt
      text: GitHub
      link: https://github.com/a-saed/datum

features:
  - title: Full PostGIS in WASM
    details: Spatial queries run locally in the browser — no network round-trip. ST_Area, ST_Intersects, spatial joins, everything PostGIS supports.
  - title: Bbox live subscriptions
    details: Declare a bounding box on connect. Only features that intersect your viewport are synced. Scales to large datasets with no extra config.
  - title: Fast reconnect
    details: PGlite persists to IndexedDB. Returning visits resolve in ~200ms with local data already queryable while delta catch-up runs in the background.
---

## What it looks like

```ts
import { DatumClient } from 'datum-sync'

const db = await DatumClient.connect({
  serverUrl: 'ws://localhost:3000/ws',
  bbox: [-122.5, 37.7, -122.4, 37.8],
})

// Full PostGIS — runs locally in WASM, no network
const result = await db.query<{ name: string; area: number }>(`
  SELECT properties->>'name' AS name,
         ST_Area(geom::geography) AS area
  FROM features
  WHERE ST_Area(geom::geography) > 1000
`)

// Writes are captured automatically and synced in the background
await db.query(
  `INSERT INTO features (geom, properties, updated_at)
   VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3::jsonb, now())`,
  [lng, lat, JSON.stringify({ name: 'Field site A' })]
)
```
