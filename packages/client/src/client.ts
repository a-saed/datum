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
  private ws!: WebSocket
  private clientId: string
  private config: DatumConfig
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private changeListeners = new Set<() => void>()
  private static readonly MUTATION_RE = /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i

  private constructor(db: PGlite, clientId: string, config: DatumConfig) {
    this.db = db
    this.clientId = clientId
    this.config = config
  }

  /**
   * Connect to datum-server and load features into local PGlite.
   *
   * - First visit: awaits the full snapshot before resolving (~3s).
   * - Returning visit: resolves immediately with local data (~200ms),
   *   then catches up with server changes in the background.
   */
  static async connect(config: DatumConfig): Promise<DatumClient> {
    const { db, isFirstVisit } = await bootLocalDb(config.dbName ?? config.table)
    const clientId = uuidv4()
    const client = new DatumClient(db, clientId, config)

    if (isFirstVisit) {
      let resolveReady!: () => void
      const ready = new Promise<void>(resolve => { resolveReady = resolve })

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
            ...(config.table ? { table: config.table } : {}),
          })
        },
      )

      client.ws = ws
      await ready
      client.startSyncCycle()
      return client
    } else {
      // Returning visit — resolve immediately, catch up in background
      const ws = connectWS(
        config.serverUrl,
        (msg) => { void client.handleMessage(msg) },
        () => { void client.sendSubscribeWithSince() },
      )

      client.ws = ws
      client.startSyncCycle()
      return client
    }
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
    const result = this.db.query<T>(sql, params)
    if (DatumClient.MUTATION_RE.test(sql)) {
      void result.then(() => this.notifyChange())
    }
    return result
  }

  /**
   * Subscribe to local database changes. Fires after any INSERT/UPDATE/DELETE
   * executed via `query()` and after every sync event from the server.
   * Returns an unsubscribe function.
   */
  onChange(cb: () => void): () => void {
    this.changeListeners.add(cb)
    return () => this.changeListeners.delete(cb)
  }

  exec(sql: string) {
    return this.db.exec(sql)
  }

  /**
   * Update the bounding box subscription without reconnecting.
   *
   * The server will send a new snapshot for the updated bbox. Features already
   * in the local DB remain; new features within the new bbox are merged in.
   */
  setBbox(bbox: [number, number, number, number]): void {
    this.config.bbox = bbox
    sendMessage(this.ws, {
      type: 'subscribe',
      bbox,
      client_id: this.clientId,
      ...(this.config.table ? { table: this.config.table } : {}),
    })
  }

  /**
   * Stop the sync cycle and close the WebSocket connection.
   */
  async disconnect(): Promise<void> {
    if (this.syncTimer) clearInterval(this.syncTimer)
    this.ws.close()
  }

  private notifyChange(): void {
    for (const cb of this.changeListeners) cb()
  }

  private async handleMessage(msg: ServerMessage): Promise<void> {
    if (msg.type === 'snapshot') {
      await this.loadSnapshot(msg as SnapshotMessage)
      this.notifyChange()
    } else if (msg.type === 'delta') {
      await applyDelta(this.db, msg as DeltaMessage)
      this.notifyChange()
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

  // On returning visits, send subscribe with the latest local timestamp so the
  // server only returns features changed since the last sync.
  private async sendSubscribeWithSince(): Promise<void> {
    const { rows } = await this.db.query<{ since: string }>(
      `SELECT COALESCE(
         to_char(MAX(updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         '1970-01-01T00:00:00Z'
       ) AS since FROM features`
    )
    sendMessage(this.ws, {
      type: 'subscribe',
      bbox: this.config.bbox,
      client_id: this.clientId,
      ...(this.config.table ? { table: this.config.table } : {}),
      since: rows[0].since,
    })
  }

  private startSyncCycle(): void {
    const interval = this.config.syncInterval ?? 5000
    this.syncTimer = setInterval(() => { void this.pushOutbox() }, interval)
  }

  private async pushOutbox(): Promise<void> {
    const edits = await drainOutbox(this.db)
    if (edits.length === 0) return
    if (this.ws.readyState !== WebSocket.OPEN) return
    sendMessage(this.ws, {
      type: 'write',
      ...(this.config.table ? { table: this.config.table } : {}),
      edits,
    })
    await markSynced(this.db, edits.map(e => e.write_id))
  }
}
