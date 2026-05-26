import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { DatumClient } from 'datum'

interface Props {
  onStatusChange: (status: string) => void
}

export function Map({ onStatusChange }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const clientRef = useRef<DatumClient | null>(null)

  useEffect(() => {
    if (!mapContainer.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [0, 20],
      zoom: 2,
    })

    map.on('load', async () => {
      map.addSource('features', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'features-layer',
        type: 'circle',
        source: 'features',
        paint: { 'circle-radius': 8, 'circle-color': '#00aaff' },
      })

      const bounds = map.getBounds()
      const bbox: [number, number, number, number] = [
        bounds.getWest(), bounds.getSouth(),
        bounds.getEast(), bounds.getNorth(),
      ]

      onStatusChange('Connecting to datum-server...')

      try {
        const client = await DatumClient.connect({
          serverUrl: 'ws://localhost:3000/ws',
          bbox,
        })
        clientRef.current = client
        onStatusChange('Connected — click map to add features')

        await refreshMap(map, client)
        setInterval(() => { void refreshMap(map, client) }, 3000)
      } catch (err) {
        onStatusChange(`Error: ${String(err)}`)
      }
    })

    map.on('click', async (e) => {
      const client = clientRef.current
      if (!client) return
      const { lng, lat } = e.lngLat
      await client.query(
        `INSERT INTO features (geom, properties, updated_at)
         VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3::jsonb, now())`,
        [lng, lat, JSON.stringify({ name: `Point ${lng.toFixed(3)},${lat.toFixed(3)}` })]
      )
      onStatusChange('Feature added — syncing...')
    })

    return () => {
      void clientRef.current?.disconnect()
      map.remove()
    }
  }, [])

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
}

async function refreshMap(map: maplibregl.Map, client: DatumClient): Promise<void> {
  const res = await client.query<{ lon: number; lat: number; name: string }>(
    `SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat, properties->>'name' AS name FROM features`
  )

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: res.rows.map(row => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.lon, row.lat] },
      properties: { name: row.name },
    })),
  }

  const source = map.getSource('features') as maplibregl.GeoJSONSource
  source.setData(geojson)
}
