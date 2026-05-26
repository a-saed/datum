// packages/client/src/client.ts
import type { PGlite } from '@electric-sql/pglite'
import { v4 as uuidv4 } from 'uuid'
import { bootLocalDb } from './pglite.js'
import { drainOutbox, applyDelta } from './sync.js'
import { connectWS, sendMessage } from './ws.js'
import type {
  DatumConfig,
  ServerMessage,
  SnapshotMessage,
  DeltaMessage,
} from './types.js'

export class DatumClient {
  private db: PGlite
  private ws: WebSocket
  private clientId: string
  private config: DatumConfig
  private syncTimer: ReturnType<typeof setInterval> | null = null

  private constructor(db: PGlite, ws: WebSocket, clientId: string, config: DatumConfig) {
    this.db = db
    this.ws = ws
    this.clientId = clientId
    this.config = config
  }

  static async connect(config: DatumConfig): Promise<DatumClient> {
    const db = await bootLocalDb()
    const clientId = uuidv4()

    let resolveReady!: () => void
    const ready = new Promise<void>(resolve => { resolveReady = resolve })

    const client = new DatumClient(db, null!, clientId, config)

    let snapshotReceived = false
    const ws = connectWS(
      config.serverUrl,
      (msg) => {
        void client.handleMessage(msg)
        if (!snapshotReceived && msg.type === 'snapshot') {
          snapshotReceived = true
          resolveReady()
        }
      },
      () => {
        sendMessage(ws, {
          type: 'subscribe',
          bbox: config.bbox,
          client_id: clientId,
        })
      },
    )

    client.ws = ws
    await ready
    client.startSyncCycle()
    return client
  }

  query(sql: string, params?: unknown[]) {
    return this.db.query(sql, params)
  }

  exec(sql: string) {
    return this.db.exec(sql)
  }

  async disconnect(): Promise<void> {
    if (this.syncTimer) clearInterval(this.syncTimer)
    this.ws.close()
  }

  private async handleMessage(msg: ServerMessage): Promise<void> {
    if (msg.type === 'snapshot') {
      await this.loadSnapshot(msg as SnapshotMessage)
    } else if (msg.type === 'delta') {
      await applyDelta(this.db, msg as DeltaMessage)
    }
  }

  private async loadSnapshot(msg: SnapshotMessage): Promise<void> {
    await this.db.exec(`ALTER TABLE features DISABLE TRIGGER datum_capture_changes`)
    try {
      for (const f of msg.features) {
        await this.db.query(`
          INSERT INTO features (id, geom, properties, updated_at)
          VALUES (
            $1::uuid,
            ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
            $3::jsonb,
            $4::timestamptz
          )
          ON CONFLICT (id) DO UPDATE
          SET geom       = EXCLUDED.geom,
              properties = EXCLUDED.properties,
              updated_at = EXCLUDED.updated_at
        `, [f.id, f.geom, JSON.stringify(f.properties), f.updated_at])
      }
    } finally {
      await this.db.exec(`ALTER TABLE features ENABLE TRIGGER datum_capture_changes`)
    }
  }

  private startSyncCycle(): void {
    const interval = this.config.syncInterval ?? 5000
    this.syncTimer = setInterval(() => { void this.pushOutbox() }, interval)
  }

  private async pushOutbox(): Promise<void> {
    const edits = await drainOutbox(this.db)
    if (edits.length === 0) return
    sendMessage(this.ws, { type: 'write', edits })
  }
}
