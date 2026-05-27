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
   * How often (in milliseconds) to push local writes to the server.
   * @default 5000
   */
  syncInterval?: number
  /**
   * IndexedDB database name. Use distinct names when running multiple
   * datum instances on the same origin.
   * @default "datum"
   */
  dbName?: string
  /**
   * Shared secret token. Must match the `-auth-token` flag on datum-server.
   * Passed as `?token=<value>` in the WebSocket URL.
   * If omitted, no token is sent (server must also have no token configured).
   */
  token?: string
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
  since?: string // ISO-8601; omitted on first visit (server returns full snapshot)
}

export interface WriteMessage {
  type: 'write'
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
}

export type ServerMessage = SnapshotMessage | DeltaMessage | AckMessage
export type ClientMessage = SubscribeMessage | WriteMessage
