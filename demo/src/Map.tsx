import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { DatumClient } from 'datum-sync'
import { useDatum } from 'datum-sync/react'
import type { AppStatus } from './App.js'

interface Props {
  onStatusChange: (status: AppStatus) => void
}

export function Map({ onStatusChange }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const clientRef = useRef<DatumClient | null>(null)
  const [client, setClient] = useState<DatumClient | null>(null)
  const onStatusChangeRef = useRef(onStatusChange)

  useEffect(() => { onStatusChangeRef.current = onStatusChange }, [onStatusChange])

  useEffect(() => {
    if (!mapContainer.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
    })
    mapRef.current = map

    let activePopup: maplibregl.Popup | null = null

    map.on('load', async () => {
      map.addSource('features', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'features-layer',
        type: 'circle',
        source: 'features',
        paint: { 'circle-radius': 8, 'circle-color': '#2563eb', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
      })

      const bounds = map.getBounds()
      const bbox: [number, number, number, number] = [
        bounds.getWest(), bounds.getSouth(),
        bounds.getEast(), bounds.getNorth(),
      ]

      onStatusChangeRef.current({ phase: 'connecting', text: 'Connecting…' })

      try {
        const c = await DatumClient.connect({
          serverUrl: import.meta.env.VITE_DATUM_SERVER_URL ?? 'ws://localhost:3000/ws',
          bbox,
        })
        clientRef.current = c
        setClient(c)
        onStatusChangeRef.current({ phase: 'ready', text: 'Ready — click map to drop a pin' })
      } catch (err) {
        onStatusChangeRef.current({ phase: 'error', text: String(err) })
      }
    })

    map.on('click', (e) => {
      const c = clientRef.current
      if (!c) return

      activePopup?.remove()

      const { lng, lat } = e.lngLat

      const container = document.createElement('div')
      container.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:200px;padding:4px 0'

      const nameInput = document.createElement('input')
      nameInput.type = 'text'
      nameInput.placeholder = 'Feature name'
      nameInput.style.cssText = 'border:1px solid #ccc;border-radius:4px;padding:6px 8px;font-size:14px;outline:none'

      const noteInput = document.createElement('input')
      noteInput.type = 'text'
      noteInput.placeholder = 'Note (optional)'
      noteInput.style.cssText = 'border:1px solid #ccc;border-radius:4px;padding:6px 8px;font-size:14px;outline:none'

      const saveBtn = document.createElement('button')
      saveBtn.textContent = 'Save feature'
      saveBtn.style.cssText = 'background:#00aaff;color:#fff;border:none;border-radius:4px;padding:7px 12px;font-size:14px;cursor:pointer'

      const coordLabel = document.createElement('div')
      coordLabel.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      coordLabel.style.cssText = 'font-size:11px;color:#888;text-align:right'

      container.append(nameInput, noteInput, saveBtn, coordLabel)

      saveBtn.onclick = async () => {
        const name = nameInput.value.trim() || `Point ${lng.toFixed(3)},${lat.toFixed(3)}`
        const note = noteInput.value.trim()
        const properties: Record<string, string> = { name }
        if (note) properties.note = note

        saveBtn.disabled = true
        saveBtn.textContent = 'Saving...'

        try {
          await c.query(
            `INSERT INTO features (geom, properties, updated_at)
             VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3::jsonb, now())`,
            [lng, lat, JSON.stringify(properties)]
          )
          activePopup?.remove()
          activePopup = null
          onStatusChangeRef.current({ phase: 'saving', text: 'Saved — syncing…' })
          setTimeout(() => {
            onStatusChangeRef.current({ phase: 'ready', text: 'Ready — click map to drop a pin' })
          }, 2000)
        } catch (err) {
          saveBtn.disabled = false
          saveBtn.textContent = 'Save feature'
          onStatusChangeRef.current({ phase: 'error', text: `Save failed: ${String(err)}` })
        }
      }

      const onEnter = (ev: KeyboardEvent) => { if (ev.key === 'Enter') saveBtn.click() }
      nameInput.addEventListener('keydown', onEnter)
      noteInput.addEventListener('keydown', onEnter)

      activePopup = new maplibregl.Popup({ closeOnClick: false, maxWidth: '280px' })
        .setLngLat([lng, lat])
        .setDOMContent(container)
        .addTo(map)

      activePopup.on('close', () => { activePopup = null })
      setTimeout(() => nameInput.focus(), 50)
    })

    return () => {
      activePopup?.remove()
      void clientRef.current?.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  const { rows } = useDatum<{ lon: number; lat: number; name: string }>(
    client,
    `SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat, properties->>'name' AS name FROM features`
  )

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('features')) return

    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: rows.map(row => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [row.lon, row.lat] },
        properties: { name: row.name },
      })),
    }
    ;(map.getSource('features') as maplibregl.GeoJSONSource).setData(geojson)
  }, [rows])

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
}
