// packages/client/src/devtools/index.ts
import type { DatumClient } from '../client.js'
import type { ColumnDef } from '../schema.js'
import { normaliseClients } from './registry.js'
import { createPanel } from './panel.js'
import { mountQueryTab }  from './tabs/query.js'
import { mountSchemaTab } from './tabs/schema.js'
import { mountStatusTab, type SchemaChange } from './tabs/status.js'

let initialised = false

/**
 * Mount the datum devtools panel. Call once after DatumClient.connect() in dev only.
 *
 * @example
 * if (import.meta.env.DEV) {
 *   const { initDatumDevtools } = await import('datum-sync/devtools')
 *   initDatumDevtools(db)
 * }
 */
export function initDatumDevtools(input: DatumClient | DatumClient[]): void {
  if (initialised) return
  initialised = true

  const clients = normaliseClients(input)
  if (clients.length === 0) return

  // Track latest schema change per table (captured via onSchemaChange config callback).
  // Note: this only captures changes that happen AFTER initDatumDevtools is called.
  const schemaChanges = new Map<string, SchemaChange>()

  const panel = createPanel(clients)

  // Create the three tab panel elements
  const queryEl  = makePanel(true)
  const schemaEl = makePanel(false)
  const statusEl = makePanel(false)
  panel.tabPanels.append(queryEl, schemaEl, statusEl)

  // Mount the initial (query) tab
  mountQueryTab(queryEl, panel.getActiveClient)

  // Re-mount active tab when user switches tab or client
  panel.onTabChange((tab: string) => {
    const client = panel.getActiveClient()
    const change = schemaChanges.get(client.tableName) ?? null

    queryEl.classList.toggle('active',  tab === 'query')
    schemaEl.classList.toggle('active', tab === 'schema')
    statusEl.classList.toggle('active', tab === 'status')

    if (tab === 'query')  mountQueryTab(queryEl, panel.getActiveClient)
    if (tab === 'schema') mountSchemaTab(schemaEl, panel.getActiveClient)
    if (tab === 'status') mountStatusTab(statusEl, panel.getActiveClient, change)
  })
}

function makePanel(active: boolean): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'datum-dt-panel' + (active ? ' active' : '')
  return el
}
