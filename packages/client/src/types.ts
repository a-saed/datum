// packages/client/src/types.ts
import type { ColumnDef } from './schema.js'
export type { ColumnDef } from './schema.js'

/** Geographic bounding box in WGS-84 (EPSG:4326). */
export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Tuple: [west, south, east, north] in WGS-84. */
export type BboxArray = [number, number, number, number]

/**
 * A live source of bbox values. Returned by mapBbox().
 * Implement this interface to connect any map library.
 */
export interface BboxSource {
  /** Called once at connect to get the initial bbox. */
  initial:   () => BboxArray
  /**
   * Called once at connect. Receives a callback to invoke whenever the bbox
   * changes. Must return an unsubscribe function.
   */
  subscribe: (onChange: (bbox: BboxArray) => void) => () => void
}

/** bbox option: either a static array or a live source. */
export type BboxLike = BboxArray | BboxSource

/** The type of a local write operation captured by the outbox trigger. */
export type ChangeOp = 'insert' | 'update' | 'delete'

/** A single pending write captured from the local PGlite outbox. */
export interface ChangeEvent {
  write_id:   string
  op:         ChangeOp
  feature_id: string
  data:       Record<string, unknown> | null
  /** @deprecated since v0.7.0 — server reads updated_at from data map */
  updated_at: string
}

/** WebSocket connection state of a {@link DatumClient}. */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export interface SchemaChangeEvent {
  prev: ColumnDef[] | null
  next: ColumnDef[]
}

export interface DatumConfig {
  serverUrl:      string
  bbox?:          BboxLike  // static array OR live BboxSource (e.g. mapBbox(map))
  table?:         string
  syncInterval?:  number
  dbName?:        string
  connectTimeout?: number
  onStatusChange?: (status: ConnectionStatus) => void
  onSchemaChange?: (event: SchemaChangeEvent) => void
  where?:       string      // SQL WHERE clause template (developer-written)
  whereParams?: unknown[]   // Bound values for $1, $2, ... (never interpolated into SQL)
  token?:         string | (() => Promise<string>)
}

/**
 * A spatial feature — all server columns at the top level.
 * geom is a GeoJSON string. id and updated_at are always strings.
 */
export type Feature = Record<string, unknown> & {
  id:         string
  geom:       string
  updated_at: string
}

// Wire protocol — internal

export interface SubscribeMessage {
  type:       'subscribe'
  bbox?:      BboxArray
  client_id:  string
  table?:     string
  since?:     string
  token?:     string
  where?:        string
  where_params?: unknown[]
}

export interface AuthMessage {
  type:  'auth'
  token: string
}

export interface WriteMessage {
  type:  'write'
  table?: string
  edits: ChangeEvent[]
}

export interface SchemaMessage {
  type:    'schema'
  columns: import('./schema.js').ColumnDef[]
}

export interface SnapshotMessage {
  type:     'snapshot'
  features: Feature[]
}

export interface DeltaMessage {
  type:             'delta'
  op:               ChangeOp
  feature:          Feature
  origin_client_id: string
}

export interface AckMessage {
  type:      'ack'
  write_ids: string[]
}

export type ServerMessage = SchemaMessage | SnapshotMessage | DeltaMessage | AckMessage
export type ClientMessage = SubscribeMessage | WriteMessage | AuthMessage
