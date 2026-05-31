import { describe, it, expect, vi } from 'vitest'
import { mapBbox } from '../src/bbox.js'

function makeMockMap(initialBounds = { west: -122.5, south: 37.7, east: -122.4, north: 37.8 }) {
  const listeners: Record<string, Array<() => void>> = {}
  return {
    getBounds: () => ({
      getWest:  () => initialBounds.west,
      getSouth: () => initialBounds.south,
      getEast:  () => initialBounds.east,
      getNorth: () => initialBounds.north,
    }),
    on:  (event: string, fn: () => void) => { (listeners[event] ??= []).push(fn) },
    off: (event: string, fn: () => void) => { listeners[event] = (listeners[event] ?? []).filter(l => l !== fn) },
    _trigger: (event: string) => { (listeners[event] ?? []).forEach(fn => fn()) },
  }
}

describe('mapBbox', () => {
  it('initial() returns the current map bounds', () => {
    const map = makeMockMap()
    const source = mapBbox(map)
    expect(source.initial()).toEqual([-122.5, 37.7, -122.4, 37.8])
  })

  it('subscribe fires onChange when the map moves', () => {
    const map = makeMockMap()
    const source = mapBbox(map)
    const onChange = vi.fn()
    source.subscribe(onChange)
    map._trigger('moveend')
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith([-122.5, 37.7, -122.4, 37.8])
  })

  it('unsubscribe removes the listener', () => {
    const map = makeMockMap()
    const source = mapBbox(map)
    const onChange = vi.fn()
    const unsub = source.subscribe(onChange)
    unsub()
    map._trigger('moveend')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('custom event name is used instead of moveend', () => {
    const map = makeMockMap()
    const source = mapBbox(map, { event: 'idle' })
    const onChange = vi.fn()
    source.subscribe(onChange)
    map._trigger('idle')
    expect(onChange).toHaveBeenCalledOnce()
    map._trigger('moveend')
    expect(onChange).toHaveBeenCalledOnce() // still only once
  })

  it('custom getBbox is called instead of default', () => {
    const map = makeMockMap()
    const customGetBbox = vi.fn().mockReturnValue([1, 2, 3, 4] as [number,number,number,number])
    const source = mapBbox(map, { getBbox: customGetBbox })
    const result = source.initial()
    expect(customGetBbox).toHaveBeenCalledWith(map)
    expect(result).toEqual([1, 2, 3, 4])
  })
})
