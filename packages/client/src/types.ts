// packages/client/src/types.ts

/** Geographic bounding box in WGS-84 (EPSG:4326). */
export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** The type of a local write operation captured by the outbox trigger. */
export type ChangeOp = 'insert' | 'update' | 'delete'

/** A single pending write captured from the local PGlite outbox. */
export interface ChangeEvent {
  write_id: string
  op: ChangeOp
  feature_id: string
  data: Record<string, unknown> | null
  updated_at: string
}

/** WebSocket connection state of a {@link DatumClient}. */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

/**
 * Configuration passed to {@link DatumClient.connect}.
 */
export interface DatumConfig {
  /** WebSocket URL of datum-server, e.g. `ws://localhost:3000/ws`. */
  serverUrl: string
  /**
   * Bounding box to sync, as `[minX, minY, maxX, maxY]` in WGS-84.
   * Only features whose geometry intersects this box are synced.
   * @example [-122.5, 37.7, -122.4, 37.8]
   */
  bbox: [number, number, number, number]
  /**
   * Server-side table name. Required when datum-server is configured with
   * multiple tables; omit (or leave undefined) for single-table setups.
   */
  table?: string
  /**
   * How often (in milliseconds) to push local writes to the server.
   * @default 5000
   */
  syncInterval?: number
  /**
   * IndexedDB database name. Use distinct names when running multiple
   * datum instances on the same origin.
   * @default config.table ?? "datum"
   */
  dbName?: string
  /**
   * How long (in milliseconds) to wait for the initial snapshot before
   * rejecting the `connect()` promise. Set to `0` to disable.
   * @default 30000
   */
  connectTimeout?: number
  /**
   * Called whenever the connection status changes.
   * Fires with `'connecting'` on each connection attempt,
   * `'connected'` once the initial data is ready,
   * and `'disconnected'` when the WebSocket drops unexpectedly.
   */
  onStatusChange?: (status: ConnectionStatus) => void
}

/** A spatial feature as returned by the server snapshot or delta. */
export interface Feature {
  /** UUID primary key. */
  id: string
  /** GeoJSON geometry string. */
  geom: string
  /** Arbitrary JSON properties. */
  properties: Record<string, unknown>
  /** ISO-8601 timestamp of last modification. */
  updated_at: string
}

// Wire protocol — internal, not part of the public API

export interface SubscribeMessage {
  type: 'subscribe'
  bbox: [number, number, number, number]
  client_id: string
  table?: string // omit for single-table configs
  since?: string // ISO-8601; omitted on first visit (server returns full snapshot)
}

export interface WriteMessage {
  type: 'write'
  table?: string // omit for single-table configs
  edits: ChangeEvent[]
}

export interface SnapshotMessage {
  type: 'snapshot'
  features: Feature[]
}

export interface DeltaMessage {
  type: 'delta'
  op: ChangeOp
  feature: Feature
  origin_client_id: string
}

export interface AckMessage {
  type: 'ack'
  write_ids: string[]
}

export type ServerMessage = SnapshotMessage | DeltaMessage | AckMessage
export type ClientMessage = SubscribeMessage | WriteMessage
