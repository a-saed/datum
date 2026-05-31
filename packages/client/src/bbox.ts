// packages/client/src/bbox.ts
import type { BboxArray, BboxSource } from './types.js'

const defaultGetBbox = (map: any): BboxArray => {
  const b = map.getBounds()
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
}

/**
 * Creates a live bbox source from any map library instance.
 * Works out-of-the-box with MapLibre GL, Mapbox GL, and Leaflet.
 *
 * @example
 * // MapLibre / Mapbox / Leaflet — zero config
 * const db = await DatumClient.connect({ serverUrl, bbox: mapBbox(map) })
 *
 * @example
 * // Google Maps
 * const db = await DatumClient.connect({
 *   serverUrl,
 *   bbox: mapBbox(map, {
 *     event: 'idle',
 *     getBbox: m => { const b = m.getBounds().toJSON(); return [b.west, b.south, b.east, b.north] }
 *   })
 * })
 */
export function mapBbox(
  map: any,
  options?: {
    /** Map event to listen to. Default: 'moveend' (MapLibre, Mapbox, Leaflet). */
    event?:   string
    /** Extract bbox from the map object. Default works for MapLibre, Mapbox GL, Leaflet. */
    getBbox?: (map: any) => BboxArray
  }
): BboxSource {
  const event  = options?.event   ?? 'moveend'
  const getter = options?.getBbox ?? defaultGetBbox

  return {
    initial:   () => getter(map),
    subscribe: (onChange) => {
      const handler = () => onChange(getter(map))
      map.on(event, handler)
      return () => map.off(event, handler)
    },
  }
}
