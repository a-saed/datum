// packages/client/src/devtools/tabs/schema.ts
import type { DatumClient } from '../../client.js'

const ROLE_CLASS: Record<string, string> = {
  id:         'datum-dt-rb-id',
  geom:       'datum-dt-rb-geom',
  updated_at: 'datum-dt-rb-upd',
  properties: 'datum-dt-rb-prop',
  data:       'datum-dt-rb-data',
}

export function mountSchemaTab(container: HTMLElement, getClient: () => DatumClient): void {
  container.innerHTML = `
    <div class="datum-dt-schema-wrap"></div>
    <div class="datum-dt-schema-bar">—</div>
  `
  const wrap   = container.querySelector<HTMLDivElement>('.datum-dt-schema-wrap')!
  const footer = container.querySelector<HTMLDivElement>('.datum-dt-schema-bar')!

  async function render() {
    const client  = getClient()
    const columns = client.columns

    if (!columns) {
      wrap.innerHTML = `<div style="padding:12px;color:#444;font-size:11px;font-family:sans-serif">Waiting for schema message…</div>`
      footer.textContent = '—'
      return
    }

    const rows = columns.map(col => {
      const roleClass = ROLE_CLASS[col.role] ?? 'datum-dt-rb-data'
      const nullText  = col.nullable
        ? '<span class="datum-dt-col-nul">nullable</span>'
        : '<span class="datum-dt-col-nn">NOT NULL</span>'
      return `<tr>
        <td class="datum-dt-col-name">${esc(col.name)}</td>
        <td class="datum-dt-col-type">${esc(col.pg_type)}</td>
        <td><span class="datum-dt-rb ${roleClass}">${esc(col.role)}</span></td>
        <td>${nullText}</td>
      </tr>`
    }).join('')

    wrap.innerHTML = `
      <table class="datum-dt-schema-table">
        <thead><tr><th>column</th><th>pg_type</th><th>role</th><th>nullable</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`

    const typedCount = columns.filter(c => c.role === 'data').length
    let hash = '—'
    try {
      const r = await client.query<{ value: string }>(
        `SELECT value FROM _datum_meta WHERE key = 'schema_hash'`
      )
      hash = r.rows[0]?.value?.slice(0, 8) ?? '—'
    } catch { /* ignore */ }

    footer.innerHTML = `
      <span>table <b>${esc(client.tableName)}</b></span>
      <span>${columns.length} columns · ${typedCount} typed</span>
      <span>hash <b class="datum-dt-hash">${esc(hash)}</b></span>
      <span>mirrored from server ✓</span>
    `
  }

  void render()
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
