// packages/client/src/devtools/tabs/status.ts
import type { DatumClient } from '../../client.js'
import type { ColumnDef } from '../../schema.js'

export interface SchemaChange {
  prev: ColumnDef[] | null
  next: ColumnDef[]
  time: Date
}

export function mountStatusTab(
  container: HTMLElement,
  getClient: () => DatumClient,
  schemaChange: SchemaChange | null,
): void {
  const prev = (container as any).__dtStatusInterval as ReturnType<typeof setInterval> | undefined
  if (prev !== undefined) clearInterval(prev)

  container.innerHTML = `
    <div class="datum-dt-stat-grid">
      <div class="datum-dt-stat-cell" id="datum-dt-s-conn">
        <div class="datum-dt-stat-lbl">connection</div>
        <div class="datum-dt-stat-val">—</div>
        <div class="datum-dt-stat-sub">—</div>
      </div>
      <div class="datum-dt-stat-cell" id="datum-dt-s-pending">
        <div class="datum-dt-stat-lbl">pending writes</div>
        <div class="datum-dt-stat-val">0</div>
        <div class="datum-dt-stat-sub">nothing queued</div>
      </div>
      <div class="datum-dt-stat-cell" id="datum-dt-s-snap">
        <div class="datum-dt-stat-lbl">last snapshot</div>
        <div class="datum-dt-stat-val">—</div>
        <div class="datum-dt-stat-sub">—</div>
      </div>
      <div class="datum-dt-stat-cell" id="datum-dt-s-schema">
        <div class="datum-dt-stat-lbl">schema</div>
        <div class="datum-dt-stat-val datum-dt-hash" style="font-size:13px">—</div>
        <div class="datum-dt-stat-sub">—</div>
      </div>
    </div>
    <div id="datum-dt-notice-area"></div>
  `

  const connVal    = container.querySelector<HTMLElement>('#datum-dt-s-conn .datum-dt-stat-val')!
  const connSub    = container.querySelector<HTMLElement>('#datum-dt-s-conn .datum-dt-stat-sub')!
  const pendVal    = container.querySelector<HTMLElement>('#datum-dt-s-pending .datum-dt-stat-val')!
  const pendSub    = container.querySelector<HTMLElement>('#datum-dt-s-pending .datum-dt-stat-sub')!
  const schemaVal  = container.querySelector<HTMLElement>('#datum-dt-s-schema .datum-dt-stat-val')!
  const schemaSub  = container.querySelector<HTMLElement>('#datum-dt-s-schema .datum-dt-stat-sub')!
  const noticeArea = container.querySelector<HTMLElement>('#datum-dt-notice-area')!

  if (schemaChange) {
    const { prev, next, time } = schemaChange
    const prevNames = new Set((prev ?? []).map(c => c.name))
    const nextNames = new Set(next.map(c => c.name))
    const allNames  = [...new Set([...(prev ?? []).map(c => c.name), ...next.map(c => c.name)])]

    const diffLines = allNames.map(name => {
      const inPrev = prevNames.has(name)
      const inNext = nextNames.has(name)
      if (!inPrev) {
        const col = next.find(c => c.name === name)!
        return `<div class="datum-dt-diff-row a">+ ${esc(name)} · <span style="opacity:0.7">${esc(col.pg_type)}</span></div>`
      }
      if (!inNext) {
        const col = (prev ?? []).find(c => c.name === name)!
        return `<div class="datum-dt-diff-row r">- ${esc(name)} · <span style="opacity:0.7">${esc(col.pg_type)}</span></div>`
      }
      const col = next.find(c => c.name === name)!
      return `<div class="datum-dt-diff-row s">&nbsp; ${esc(name)} · <span style="opacity:0.5">${esc(col.pg_type)}</span></div>`
    }).join('')

    noticeArea.innerHTML = `
      <div class="datum-dt-notice">
        <div class="datum-dt-notice-hdr">⚡ Schema changed — local DB wiped &amp; resynced</div>
        <div class="datum-dt-diff">${diffLines}</div>
        <div class="datum-dt-notice-time">${formatRelTime(time)} · triggered by server schema change</div>
      </div>`
  }

  function update() {
    const client  = getClient()
    const status  = client.connectionStatus
    const pending = client.pendingCount

    const dotClass = status === 'connected' ? 'datum-dt-dot-g' : status === 'connecting' ? 'datum-dt-dot-o' : 'datum-dt-dot-r'
    const valClass = status === 'connected' ? 'ok' : status === 'connecting' ? 'warn' : 'err'
    connVal.className = `datum-dt-stat-val ${valClass}`
    connVal.innerHTML = `<span class="datum-dt-dot ${dotClass}"></span>${status}`
    connSub.textContent = client.tableName

    pendVal.className = `datum-dt-stat-val ${pending > 0 ? 'warn' : ''}`
    pendVal.textContent = String(pending)
    pendSub.textContent = pending > 0 ? 'in outbox · syncing soon' : 'nothing queued'

    void client.query<{ value: string }>(
      `SELECT value FROM _datum_meta WHERE key = 'schema_hash'`
    ).then(r => {
      const hash = r.rows[0]?.value?.slice(0, 8) ?? '—'
      const cols = client.columns?.length ?? 0
      schemaVal.textContent = hash
      schemaSub.textContent = `${cols} cols · v3 · in sync`
    }).catch(() => {})
  }

  update()
  const interval = setInterval(update, 1000)
  ;(container as any).__dtStatusInterval = interval
}

function formatRelTime(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000)
  if (secs < 60)   return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
