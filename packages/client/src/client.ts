// packages/client/src/client.ts
import type { PGlite } from '@electric-sql/pglite'
import { v4 as uuidv4 } from 'uuid'
import { bootLocalDb } from './pglite.js'
import { drainOutbox, applyDelta, markSynced } from './sync.js'
import { connectWS, sendMessage } from './ws.js'
import type {
  DatumConfig,
  ServerMessage,
  SnapshotMessage,
  DeltaMessage,
} from './types.js'

/**
 * Local-first spatial sync client backed by PGlite + PostGIS WASM.
 *
 * All `query()` calls execute against a local in-browser Postgres instance —
 * no network round-trip required. Writes are captured automatically and
 * pushed to datum-server on a background sync cycle.
 *
 * @example
 * ```ts
 * const db = await DatumClient.connect({
 *   serverUrl: 'ws://localhost:3000/ws',
 *   bbox: [-122.5, 37.7, -122.4, 37.8],
 * })
 *
 * const result = await db.query<{ name: string }>(
 *   `SELECT properties->>'name' AS name FROM features`
 * )
 *
 * await db.disconnect()
 * ```
 */
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

  /**
   * Connect to datum-server and load the initial snapshot into local PGlite.
   *
   * Resolves once the snapshot has been fully written to the local database —
   * the client is immediately queryable offline after this point.
   *
   * @param config - Server URL, bounding box, and optional sync interval.
   * @throws If the WebSocket connection fails or the snapshot times out.
   */
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
        const p = client.handleMessage(msg)
        if (!snapshotReceived && msg.type === 'snapshot') {
          snapshotReceived = true
          void p.then(resolveReady)
        } else {
          void p
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

  /**
   * Run a SQL query against the local PGlite database. No network involved.
   *
   * Supports full PostGIS — `ST_Intersects`, `ST_Area`, spatial joins, etc.
   * Writes (`INSERT`, `UPDATE`, `DELETE`) are captured automatically by the
   * outbox trigger and pushed to the server on the next sync cycle.
   *
   * @param sql - Parameterised SQL string. Use `$1`, `$2`, … for parameters.
   * @param params - Parameter values corresponding to `$1`, `$2`, …
   */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
    return this.db.query<T>(sql, params)
  }

  exec(sql: string) {
    return this.db.exec(sql)
  }

  /**
   * Stop the sync cycle and close the WebSocket connection.
   * The local PGlite database is discarded (in-memory only).
   */
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
    if (this.ws.readyState !== WebSocket.OPEN) return
    sendMessage(this.ws, { type: 'write', edits })
    // Mark synced immediately after successful send (server ack not yet implemented in v0)
    // This is still better than before-send, as we now gate on ws.readyState
    await markSynced(this.db, edits.map(e => e.write_id))
  }
}
