import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { DatumClient } from 'datum-sync'
import { useDatum } from 'datum-sync/react'
import type { AppStatus } from './App.js'

interface Props {
  onStatusChange: (status: AppStatus) => void
}

type ActiveTable = 'features' | 'waypoints'

const LAYERS: { id: ActiveTable; label: string; color: string }[] = [
  { id: 'features',  label: 'Features',  color: '#2563eb' },
  { id: 'waypoints', label: 'Waypoints', color: '#ea580c' },
]

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

export function Map({ onStatusChange }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const featuresClientRef = useRef<DatumClient | null>(null)
  const waypointsClientRef = useRef<DatumClient | null>(null)
  const [featuresClient, setFeaturesClient] = useState<DatumClient | null>(null)
  const [waypointsClient, setWaypointsClient] = useState<DatumClient | null>(null)
  const [activeTable, setActiveTable] = useState<ActiveTable>('features')
  const [visible, setVisible] = useState<Record<ActiveTable, boolean>>({ features: true, waypoints: true })
  const activeTableRef = useRef<ActiveTable>('features')
  const onStatusChangeRef = useRef(onStatusChange)

  useEffect(() => { onStatusChangeRef.current = onStatusChange }, [onStatusChange])
  useEffect(() => { activeTableRef.current = activeTable }, [activeTable])

  // Sync visibility state to map layers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const layer of LAYERS) {
      if (map.getLayer(`${layer.id}-layer`)) {
        map.setLayoutProperty(`${layer.id}-layer`, 'visibility', visible[layer.id] ? 'visible' : 'none')
      }
    }
  }, [visible])

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
      for (const layer of LAYERS) {
        map.addSource(layer.id, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: `${layer.id}-layer`,
          type: 'circle',
          source: layer.id,
          paint: {
            'circle-radius': 8,
            'circle-color': layer.color,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          },
        })
      }

      const bounds = map.getBounds()
      const bbox: [number, number, number, number] = [
        bounds.getWest(), bounds.getSouth(),
        bounds.getEast(), bounds.getNorth(),
      ]

      onStatusChangeRef.current({ phase: 'connecting', text: 'Connecting…' })

      const serverUrl = import.meta.env.VITE_DATUM_SERVER_URL ?? 'ws://localhost:3000/ws'

      const onConnStatus = (s: import('datum-sync').ConnectionStatus) => {
        if (s === 'disconnected') onStatusChangeRef.current({ phase: 'error', text: 'Disconnected — reconnecting…' })
        if (s === 'connecting')   onStatusChangeRef.current({ phase: 'connecting', text: 'Reconnecting…' })
        if (s === 'connected')    onStatusChangeRef.current({ phase: 'ready', text: 'Click the map to add a point' })
      }

      try {
        const [fc, wc] = await Promise.all([
          DatumClient.connect({ serverUrl, bbox, table: 'features',  onStatusChange: onConnStatus }),
          DatumClient.connect({ serverUrl, bbox, table: 'waypoints', onStatusChange: onConnStatus }),
        ])
        featuresClientRef.current = fc
        waypointsClientRef.current = wc
        setFeaturesClient(fc)
        setWaypointsClient(wc)
        onStatusChangeRef.current({ phase: 'ready', text: 'Click the map to add a point' })
      } catch (err) {
        onStatusChangeRef.current({ phase: 'error', text: String(err) })
      }
    })

    map.on('moveend', () => {
      const b = map.getBounds()
      const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
      featuresClientRef.current?.setBbox(bbox)
      waypointsClientRef.current?.setBbox(bbox)
    })

    map.on('click', (e) => {
      const table = activeTableRef.current
      const c = table === 'features' ? featuresClientRef.current : waypointsClientRef.current
      if (!c) return

      activePopup?.remove()

      const { lng, lat } = e.lngLat
      const layer = LAYERS.find(l => l.id === table)!

      const container = document.createElement('div')
      container.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:200px;padding:4px 0'

      const nameInput = document.createElement('input')
      nameInput.type = 'text'
      nameInput.placeholder = 'Name'
      nameInput.style.cssText = 'border:1px solid #ccc;border-radius:4px;padding:6px 8px;font-size:14px;outline:none'

      // Features: free-text note. Waypoints: type dropdown.
      let getExtraProps: () => Record<string, string> = () => ({})
      if (table === 'features') {
        const noteInput = document.createElement('input')
        noteInput.type = 'text'
        noteInput.placeholder = 'Note (optional)'
        noteInput.style.cssText = 'border:1px solid #ccc;border-radius:4px;padding:6px 8px;font-size:14px;outline:none'
        container.append(nameInput, noteInput)
        noteInput.addEventListener('keydown', (ev: KeyboardEvent) => { if (ev.key === 'Enter') saveBtn.click() })
        getExtraProps = (): Record<string, string> => {
          const note = noteInput.value.trim()
          return note ? { note } : {}
        }
      } else {
        const typeSelect = document.createElement('select')
        typeSelect.style.cssText = 'border:1px solid #ccc;border-radius:4px;padding:6px 8px;font-size:14px;outline:none;background:#fff'
        for (const opt of ['Landmark', 'Campsite', 'Viewpoint', 'Trailhead']) {
          const o = document.createElement('option')
          o.value = opt.toLowerCase()
          o.textContent = opt
          typeSelect.append(o)
        }
        container.append(nameInput, typeSelect)
        getExtraProps = () => ({ type: typeSelect.value })
      }

      const saveBtn = document.createElement('button')
      saveBtn.textContent = `Add to ${layer.label}`
      saveBtn.style.cssText = `background:${layer.color};color:#fff;border:none;border-radius:4px;padding:7px 12px;font-size:14px;cursor:pointer;font-weight:600`

      const coordLabel = document.createElement('div')
      coordLabel.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      coordLabel.style.cssText = 'font-size:11px;color:#888;text-align:right'

      container.append(saveBtn, coordLabel)

      saveBtn.onclick = async () => {
        const name = nameInput.value.trim() || `Point ${lng.toFixed(3)},${lat.toFixed(3)}`
        const properties: Record<string, string> = { name, ...getExtraProps() }

        saveBtn.disabled = true
        saveBtn.textContent = 'Saving...'

        try {
          await c.query(
            `INSERT INTO ${table} (geom, properties, updated_at)
             VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3::jsonb, now())`,
            [lng, lat, JSON.stringify(properties)]
          )
          activePopup?.remove()
          activePopup = null
          onStatusChangeRef.current({ phase: 'saving', text: 'Saved — syncing…' })
          setTimeout(() => {
            onStatusChangeRef.current({ phase: 'ready', text: 'Click the map to add a point' })
          }, 2000)
        } catch (err) {
          saveBtn.disabled = false
          saveBtn.textContent = `Add to ${layer.label}`
          onStatusChangeRef.current({ phase: 'error', text: `Save failed: ${String(err)}` })
        }
      }

      nameInput.addEventListener('keydown', (ev: KeyboardEvent) => { if (ev.key === 'Enter') saveBtn.click() })

      activePopup = new maplibregl.Popup({ closeOnClick: false, maxWidth: '280px' })
        .setLngLat([lng, lat])
        .setDOMContent(container)
        .addTo(map)

      activePopup.on('close', () => { activePopup = null })
      setTimeout(() => nameInput.focus(), 50)
    })

    return () => {
      activePopup?.remove()
      void featuresClientRef.current?.disconnect()
      void waypointsClientRef.current?.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  const { rows: featureRows } = useDatum<{ lon: number; lat: number; name: string }>(
    featuresClient,
    `SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat, properties->>'name' AS name FROM features`
  )
  const { rows: waypointRows } = useDatum<{ lon: number; lat: number; name: string }>(
    waypointsClient,
    `SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat, properties->>'name' AS name FROM waypoints`
  )

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource('features')) return
    ;(map.getSource('features') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: featureRows.map(r => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: { name: r.name },
      })),
    } as FeatureCollection)
  }, [featureRows])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource('waypoints')) return
    ;(map.getSource('waypoints') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: waypointRows.map(r => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: { name: r.name },
      })),
    } as FeatureCollection)
  }, [waypointRows])

  const counts: Record<ActiveTable, number> = {
    features:  featureRows.length,
    waypoints: waypointRows.length,
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Layer panel */}
      <div style={{
        position: 'absolute', top: '12px', right: '12px',
        background: '#fff', borderRadius: '10px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        overflow: 'hidden', minWidth: '180px',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          padding: '9px 13px', fontSize: '11px', fontWeight: 700,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          color: '#888', borderBottom: '1px solid #f0f0f0',
        }}>
          Layers
        </div>

        {LAYERS.map(layer => {
          const isActive = activeTable === layer.id
          const isVisible = visible[layer.id]
          return (
            <div
              key={layer.id}
              onClick={() => setActiveTable(layer.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 13px', cursor: 'pointer',
                background: isActive ? `${layer.color}12` : 'transparent',
                borderLeft: isActive ? `3px solid ${layer.color}` : '3px solid transparent',
                transition: 'background 0.12s',
              }}
            >
              {/* Color dot */}
              <span style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: layer.color, flexShrink: 0,
                opacity: isVisible ? 1 : 0.3,
              }} />

              {/* Label */}
              <span style={{
                flex: 1, fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#111' : '#444',
                opacity: isVisible ? 1 : 0.4,
              }}>
                {layer.label}
              </span>

              {/* Count */}
              <span style={{
                fontSize: '12px', color: '#999', minWidth: '16px', textAlign: 'right',
              }}>
                {counts[layer.id]}
              </span>

              {/* Visibility toggle */}
              <button
                onClick={e => {
                  e.stopPropagation()
                  setVisible(v => ({ ...v, [layer.id]: !v[layer.id] }))
                }}
                title={isVisible ? 'Hide layer' : 'Show layer'}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '2px', color: isVisible ? '#555' : '#bbb',
                  display: 'flex', alignItems: 'center',
                }}
              >
                <EyeIcon open={isVisible} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
