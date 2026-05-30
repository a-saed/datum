// packages/client/src/devtools/tabs/query.ts
import type { DatumClient } from '../../client.js'

export function mountQueryTab(container: HTMLElement, getClient: () => DatumClient): void {
  container.innerHTML = `
    <div class="datum-dt-query-top">
      <textarea class="datum-dt-sql" spellcheck="false"></textarea>
      <div class="datum-dt-run-col">
        <button class="datum-dt-run">▶ Run</button>
        <span class="datum-dt-cmd-hint">⌘ Enter</span>
      </div>
    </div>
    <div class="datum-dt-results"></div>
    <div class="datum-dt-results-bar">—</div>
  `

  const textarea  = container.querySelector<HTMLTextAreaElement>('.datum-dt-sql')!
  const runBtn    = container.querySelector<HTMLButtonElement>('.datum-dt-run')!
  const resultsEl = container.querySelector<HTMLDivElement>('.datum-dt-results')!
  const footer    = container.querySelector<HTMLDivElement>('.datum-dt-results-bar')!

  textarea.value = `SELECT * FROM ${getClient().tableName} LIMIT 10`

  async function run() {
    const sql = textarea.value.trim()
    if (!sql) return
    textarea.classList.remove('error')
    const t0 = performance.now()
    try {
      const result = await getClient().query(sql)
      const ms = Math.round(performance.now() - t0)
      const rows = result.rows as Record<string, unknown>[]

      if (rows.length === 0) {
        resultsEl.innerHTML = `<div style="padding:12px;color:#444;font-size:11px;font-family:sans-serif">No rows returned</div>`
        footer.textContent = `0 rows · ${ms}ms · local PGlite`
        return
      }

      const cols = Object.keys(rows[0])
      const th = cols.map(c => `<th>${esc(c)}</th>`).join('')
      const tbody = rows.map(row => {
        const tds = cols.map(c => {
          const v = row[c]
          if (v === null || v === undefined) return `<td class="datum-dt-cell-null">null</td>`
          const str = typeof v === 'object' ? JSON.stringify(v) : String(v)
          return `<td title="${esc(str)}">${esc(truncate(str, 80))}</td>`
        }).join('')
        return `<tr>${tds}</tr>`
      }).join('')

      resultsEl.innerHTML = `
        <table class="datum-dt-results-table">
          <thead><tr>${th}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>`
      footer.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'} · ${ms}ms · local PGlite`
    } catch (err) {
      textarea.classList.add('error')
      resultsEl.innerHTML = `<div class="datum-dt-error-msg">${esc(String(err))}</div>`
      footer.textContent = `Error · ${Math.round(performance.now() - t0)}ms`
    }
  }

  runBtn.addEventListener('click', run)
  textarea.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void run()
    }
  })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}
