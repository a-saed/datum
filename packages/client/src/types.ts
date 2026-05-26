// packages/client/src/types.ts
export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type ChangeOp = 'insert' | 'update' | 'delete'

export interface ChangeEvent {
  write_id: string
  op: ChangeOp
  feature_id: string
  data: Record<string, unknown> | null
  updated_at: string
}

export interface DatumConfig {
  serverUrl: string
  bbox: [number, number, number, number] // [minX, minY, maxX, maxY]
  syncInterval?: number // ms, default 5000
}

export interface Feature {
  id: string
  geom: string // GeoJSON string
  properties: Record<string, unknown>
  updated_at: string
}

// Wire protocol
export interface SubscribeMessage {
  type: 'subscribe'
  bbox: [number, number, number, number]
  client_id: string
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
