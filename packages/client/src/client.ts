// packages/client/src/client.ts
import type { PGlite } from '@electric-sql/pglite'
import { v4 as uuidv4 } from 'uuid'
import { bootLocalDb } from './pglite.js'
import { drainOutbox, applyDelta, markSynced } from './sync.js'
import { connectWS, sendMessage } from './ws.js'
import type {
  ConnectionStatus,
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
 * The client automatically reconnects with exponential backoff if the
 * WebSocket drops. Use `onStatusChange` in the config to react to
 * `'connecting'` / `'connected'` / `'disconnected'` transitions.
 *
 * @example
 * ```ts
 * const db = await DatumClient.connect({
 *   serverUrl: 'ws://localhost:3000/ws',
 *   bbox: [-122.5, 37.7, -122.4, 37.8],
 *   onStatusChange: (s) => console.log('datum:', s),
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
  private readonly tableName: string
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private changeListeners = new Set<() => void>()
  private pendingListeners = new Set<(count: number) => void>()
  private _pendingCount = 0
  private _status: ConnectionStatus = 'connecting'
  private needsSnapshot: boolean
  private reconnectAttempt = 0
  private isDisconnecting = false
  private resolveReady: (() => void) | null = null
  private static readonly MUTATION_RE = /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i

  private constructor(db: PGlite, clientId: string, config: DatumConfig, isFirstVisit: boolean) {
    this.db = db
    this.clientId = clientId
    this.config = config
    this.tableName = config.table ?? 'features'
    this.needsSnapshot = isFirstVisit
  }

  /**
   * Connect to datum-server and load features into local PGlite.
   *
   * - First visit: awaits the full snapshot before resolving (~3s).
   * - Returning visit: resolves once the WebSocket opens and the
   *   catch-up subscribe is sent (~200ms), then syncs in the background.
   *
   * Rejects if `connectTimeout` (default 30 s) elapses before the
   * initial snapshot arrives. Set `connectTimeout: 0` to disable.
   */
  static async connect(config: DatumConfig): Promise<DatumClient> {
    const { db, isFirstVisit } = await bootLocalDb(config.dbName ?? config.table, config.table ?? 'features')
    const clientId = uuidv4()
    const client = new DatumClient(db, clientId, config, isFirstVisit)

    const timeout = config.connectTimeout ?? 30_000
    const ready = new Promise<void>((resolve, reject) => {
      const timer = timeout > 0
        ? setTimeout(() => {
            void client.disconnect()
            reject(new Error(`datum: connect() timed out after ${timeout}ms`))
          }, timeout)
        : null
      client.resolveReady = () => {
        if (timer !== null) clearTimeout(timer)
        resolve()
      }
    })

    client.openConnection()
    await ready
    client.startSyncCycle()
    return client
  }

  /** Current WebSocket connection status. */
  get connectionStatus(): ConnectionStatus {
    return this._status
  }

  /** Number of local writes waiting to be pushed to the server. */
  get pendingCount(): number {
    return this._pendingCount
  }

  /**
   * Subscribe to pending write count changes. Fires after every local write
   * and after every successful sync flush. Returns an unsubscribe function.
   */
  onPendingChange(cb: (count: number) => void): () => void {
    this.pendingListeners.add(cb)
    return () => this.pendingListeners.delete(cb)
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
      void result.then(() => {
        this.notifyChange()
        void this.refreshPendingCount()
      })
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
   * Stop the sync cycle, cancel any pending reconnect, and close the
   * WebSocket connection.
   */
  async disconnect(): Promise<void> {
    this.isDisconnecting = true
    if (this.syncTimer) clearInterval(this.syncTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws.close()
  }

  private setStatus(s: ConnectionStatus): void {
    if (this._status === s) return
    this._status = s
    this.config.onStatusChange?.(s)
  }

  private openConnection(): void {
    this.setStatus('connecting')
    this.ws = connectWS(
      this.config.serverUrl,
      (msg) => { void this.handleMessage(msg) },
      () => { void this.onWsOpen() },
      () => { this.onWsClose() },
    )
  }

  private async onWsOpen(): Promise<void> {
    this.reconnectAttempt = 0
    if (this.needsSnapshot) {
      // First visit (or reconnect before snapshot arrived): request full snapshot.
      sendMessage(this.ws, {
        type: 'subscribe',
        bbox: this.config.bbox,
        client_id: this.clientId,
        ...(this.config.table ? { table: this.config.table } : {}),
      })
      // resolveReady is called after the snapshot is loaded (in handleMessage).
    } else {
      // Returning visit or reconnect: catch up on changes since last sync.
      await this.sendSubscribeWithSince()
      this.setStatus('connected')
      this.resolveReady?.()
      this.resolveReady = null
    }
  }

  private onWsClose(): void {
    if (this.isDisconnecting) return
    this.setStatus('disconnected')
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1_000 * 2 ** this.reconnectAttempt, 30_000)
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(() => { this.openConnection() }, delay)
  }

  private notifyChange(): void {
    for (const cb of this.changeListeners) cb()
  }

  private async refreshPendingCount(): Promise<void> {
    const { rows } = await this.db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM _datum_outbox WHERE synced = false`
    )
    const count = rows[0].count
    if (count === this._pendingCount) return
    this._pendingCount = count
    for (const cb of this.pendingListeners) cb(count)
  }

  private async handleMessage(msg: ServerMessage): Promise<void> {
    if (msg.type === 'snapshot') {
      await this.loadSnapshot(msg as SnapshotMessage)
      this.needsSnapshot = false
      this.setStatus('connected')
      this.resolveReady?.()
      this.resolveReady = null
      this.notifyChange()
    } else if (msg.type === 'delta') {
      await applyDelta(this.db, msg as DeltaMessage, this.tableName)
      this.notifyChange()
    }
  }

  private async loadSnapshot(msg: SnapshotMessage): Promise<void> {
    await this.db.exec(`ALTER TABLE ${this.tableName} DISABLE TRIGGER datum_capture_changes`)
    try {
      for (const f of msg.features) {
        await this.db.query(`
          INSERT INTO ${this.tableName} (id, geom, properties, updated_at)
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
      await this.db.exec(`ALTER TABLE ${this.tableName} ENABLE TRIGGER datum_capture_changes`)
    }
  }

  private async sendSubscribeWithSince(): Promise<void> {
    const { rows } = await this.db.query<{ since: string }>(
      `SELECT COALESCE(
         to_char(MAX(updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         '1970-01-01T00:00:00Z'
       ) AS since FROM ${this.tableName}`
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
    void this.refreshPendingCount()
  }
}
