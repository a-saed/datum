// packages/client/src/client.ts
import type { PGlite } from '@electric-sql/pglite'
import { v4 as uuidv4 } from 'uuid'
import { bootLocalDb, setupSchema } from './pglite.js'
import { drainOutbox, applyDelta, applyFeatures, markSynced } from './sync.js'
import { connectWS, sendMessage } from './ws.js'
import type {
  AckMessage,
  ColumnDef,
  ConnectionStatus,
  DatumConfig,
  ServerMessage,
  SchemaMessage,
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
  private inFlight = new Set<string>()
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private columns: ColumnDef[] | null = null
  private static readonly MUTATION_RE = /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i
  private static readonly TABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

  private constructor(db: PGlite, clientId: string, config: DatumConfig, isFirstVisit: boolean) {
    this.db = db
    this.clientId = clientId
    this.config = config
    const tableName = config.table ?? 'features'
    if (!DatumClient.TABLE_NAME_RE.test(tableName)) {
      throw new Error(`datum: invalid table name "${tableName}"`)
    }
    this.tableName = tableName
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

  /**
   * Update the bounding box subscription without reconnecting.
   *
   * The server will send a new snapshot for the updated bbox. Features already
   * in the local DB remain; new features within the new bbox are merged in.
   */
  setBbox(bbox: [number, number, number, number]): void {
    this.config.bbox = bbox
    void this.sendBboxSubscribe(bbox)
  }

  private async sendBboxSubscribe(bbox: [number, number, number, number]): Promise<void> {
    const token = await this.resolveToken()
    sendMessage(this.ws, {
      type: 'subscribe',
      bbox,
      client_id: this.clientId,
      ...(this.config.table ? { table: this.config.table } : {}),
      ...(token ? { token } : {}),
    })
    if (token) this.scheduleTokenRefresh(token)
  }

  /**
   * Stop the sync cycle, cancel any pending reconnect, and close the
   * WebSocket connection.
   */
  async disconnect(): Promise<void> {
    this.isDisconnecting = true
    if (this.syncTimer) clearInterval(this.syncTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
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
    const token = await this.resolveToken()
    if (this.needsSnapshot) {
      // First visit (or reconnect before snapshot arrived): request full snapshot.
      sendMessage(this.ws, {
        type: 'subscribe',
        bbox: this.config.bbox,
        client_id: this.clientId,
        ...(this.config.table ? { table: this.config.table } : {}),
        ...(token ? { token } : {}),
      })
      if (token) this.scheduleTokenRefresh(token)
      // resolveReady is called after the snapshot is loaded (in handleMessage).
    } else {
      // Returning visit or reconnect: catch up on changes since last sync.
      await this.sendSubscribeWithSince(token)
      this.setStatus('connected')
      this.resolveReady?.()
      this.resolveReady = null
      // Flush any pending writes immediately rather than waiting for the next tick.
      void this.pushOutbox()
    }
  }

  private onWsClose(): void {
    if (this.isDisconnecting) return
    // Clear in-flight set so these writes are retried on reconnect.
    this.inFlight.clear()
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
    if (msg.type === 'schema') {
      this.columns = (msg as SchemaMessage).columns
    } else if (msg.type === 'snapshot') {
      if (!this.columns) throw new Error('datum: received snapshot before schema message')
      const columns = this.columns
      const wasRecreated = await setupSchema(this.db, this.tableName, columns)

      if (wasRecreated && !this.needsSnapshot) {
        // Schema changed on a returning visit — the snapshot was delta-filtered.
        // Wipe is done; re-request a full snapshot.
        this.needsSnapshot = true
        await this.requestFullSnapshot()
        return
      }

      await applyFeatures(this.db, msg.features, this.tableName, columns)
      this.needsSnapshot = false
      this.setStatus('connected')
      this.resolveReady?.()
      this.resolveReady = null
      this.notifyChange()
      // Flush any pending writes immediately rather than waiting for the next tick.
      void this.pushOutbox()
    } else if (msg.type === 'delta') {
      if (this.columns) {
        await applyDelta(this.db, msg as DeltaMessage, this.tableName, this.columns)
        this.notifyChange()
      }
    } else if (msg.type === 'ack') {
      const { write_ids } = msg as AckMessage
      await markSynced(this.db, write_ids)
      for (const id of write_ids) this.inFlight.delete(id)
      void this.refreshPendingCount()
    }
  }

  private async requestFullSnapshot(): Promise<void> {
    const token = await this.resolveToken()
    sendMessage(this.ws, {
      type:      'subscribe',
      bbox:      this.config.bbox,
      client_id: this.clientId,
      ...(this.config.table ? { table: this.config.table } : {}),
      ...(token ? { token } : {}),
      // No 'since' — full snapshot
    })
    if (token) this.scheduleTokenRefresh(token)
  }

  private async sendSubscribeWithSince(token?: string): Promise<void> {
    const { rows } = await this.db.query<{ since: string }>(
      `SELECT COALESCE(
         to_char(MAX(updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         '1970-01-01T00:00:00.000Z'
       ) AS since FROM ${this.tableName}`
    )
    sendMessage(this.ws, {
      type: 'subscribe',
      bbox: this.config.bbox,
      client_id: this.clientId,
      ...(this.config.table ? { table: this.config.table } : {}),
      since: rows[0].since,
      ...(token ? { token } : {}),
    })
    if (token) this.scheduleTokenRefresh(token)
  }

  private async resolveToken(): Promise<string | undefined> {
    const t = this.config.token
    if (!t) return undefined
    return typeof t === 'function' ? await t() : t
  }

  private static getTokenExpiry(token: string): number | null {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      return typeof payload.exp === 'number' ? payload.exp : null
    } catch {
      return null
    }
  }

  private scheduleTokenRefresh(token: string): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    if (typeof this.config.token !== 'function') return // static tokens can't be refreshed
    const exp = DatumClient.getTokenExpiry(token)
    if (!exp) return
    const msUntilRefresh = (exp * 1000) - Date.now() - 60_000 // 60s before expiry
    if (msUntilRefresh <= 0) return
    this.refreshTimer = setTimeout(() => { void this.sendTokenRefresh() }, msUntilRefresh)
  }

  private async sendTokenRefresh(): Promise<void> {
    this.refreshTimer = null
    if (this.ws.readyState !== WebSocket.OPEN) return
    const token = await this.resolveToken()
    if (!token) return
    sendMessage(this.ws, { type: 'auth', token })
    this.scheduleTokenRefresh(token)
  }

  private startSyncCycle(): void {
    const interval = this.config.syncInterval ?? 5000
    this.syncTimer = setInterval(() => { void this.pushOutbox() }, interval)
  }

  private async pushOutbox(): Promise<void> {
    if (this.ws.readyState !== WebSocket.OPEN) return
    const all = await drainOutbox(this.db)
    // Exclude writes already in-flight (awaiting ack) so they aren't double-sent.
    const edits = all.filter(e => !this.inFlight.has(e.write_id))
    if (edits.length === 0) return
    for (const e of edits) this.inFlight.add(e.write_id)
    sendMessage(this.ws, {
      type: 'write',
      ...(this.config.table ? { table: this.config.table } : {}),
      edits,
    })
    // markSynced is called only after the server sends an ack — see handleMessage.
  }
}
