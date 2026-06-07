// packages/client/src/devtools/panel.ts
import type { DatumClient } from '../client.js'
import { PANEL_CSS } from './styles.js'

const STORAGE_KEY = 'datum-devtools:state'
const DEFAULT_HEIGHT = 320

interface PanelState {
  open: boolean
  height: number
}

function loadState(): PanelState {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) return JSON.parse(s) as PanelState
  } catch { /* ignore */ }
  return { open: true, height: DEFAULT_HEIGHT }
}

function saveState(s: PanelState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

const LOGO_SVG = `<svg width="13" height="13" viewBox="0 0 48 48" fill="none">
  <polyline points="17,10 6,24 17,38" stroke="#2563eb" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="31,10 42,24 31,38" stroke="#2563eb" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24" cy="24" r="8" stroke="#2563eb" stroke-width="1.5" fill="none" opacity="0.5"/>
  <circle cx="24" cy="24" r="3.5" fill="#2563eb"/>
</svg>`

export interface PanelHandle {
  root: HTMLElement
  tabPanels: HTMLElement
  getActiveClient: () => DatumClient
  onTabChange: (cb: (tab: string) => void) => void
}

export function createPanel(clients: DatumClient[]): PanelHandle {
  if (!document.getElementById('datum-devtools-css')) {
    const style = document.createElement('style')
    style.id = 'datum-devtools-css'
    style.textContent = PANEL_CSS
    document.head.appendChild(style)
  }

  const state = loadState()
  let activeClientIdx = 0
  let activeTab = 'query'
  const tabChangeListeners: Array<(tab: string) => void> = []

  const fab = document.createElement('button')
  fab.id = 'datum-dt-fab'
  fab.title = 'Open datum devtools'
  fab.innerHTML = LOGO_SVG
  fab.addEventListener('click', () => toggle())
  document.body.appendChild(fab)

  const root = document.createElement('div')
  root.id = 'datum-devtools'
  if (!state.open) {
    root.classList.add('hidden')
    fab.classList.add('visible')
  }
  root.style.height = `${state.height}px`

  const resizeHandle = document.createElement('div')
  resizeHandle.id = 'datum-devtools-resize'
  root.appendChild(resizeHandle)

  const toolbar = document.createElement('div')
  toolbar.id = 'datum-dt-toolbar'
  toolbar.innerHTML = `<div class="datum-dt-brand">${LOGO_SVG} datum</div>`

  if (clients.length > 1) {
    const select = document.createElement('select')
    select.className = 'datum-dt-client-select'
    clients.forEach((c, i) => {
      const opt = document.createElement('option')
      opt.value = String(i)
      opt.textContent = c.tableName
      select.appendChild(opt)
    })
    select.addEventListener('change', () => {
      activeClientIdx = Number(select.value)
      tabChangeListeners.forEach(cb => cb(activeTab))
    })
    toolbar.appendChild(select)
  }

  const tabsEl = document.createElement('div')
  tabsEl.className = 'datum-dt-tabs'
  const TABS = ['Query', 'Schema', 'Status']
  TABS.forEach(name => {
    const tab = document.createElement('div')
    tab.className = 'datum-dt-tab' + (name.toLowerCase() === activeTab ? ' active' : '')
    tab.textContent = name
    tab.addEventListener('click', () => {
      document.querySelectorAll('.datum-dt-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      activeTab = name.toLowerCase()
      tabChangeListeners.forEach(cb => cb(activeTab))
    })
    tabsEl.appendChild(tab)
  })
  toolbar.appendChild(tabsEl)

  const right = document.createElement('div')
  right.className = 'datum-dt-right'
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
  right.innerHTML = `
    <span class="datum-dt-kbd">${isMac ? '⌘' : 'Ctrl'}+Shift+D</span>
    <button class="datum-dt-close">✕</button>
  `
  right.querySelector('.datum-dt-close')!.addEventListener('click', () => toggle())
  toolbar.appendChild(right)
  root.appendChild(toolbar)

  const tabPanels = document.createElement('div')
  tabPanels.id = 'datum-dt-panels'
  tabPanels.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column'
  root.appendChild(tabPanels)

  document.body.appendChild(root)

  function toggle() {
    const hidden = root.classList.toggle('hidden')
    fab.classList.toggle('visible', hidden)
    state.open = !hidden
    saveState({ ...state, open: state.open })
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        toggle()
      }
    })
  }

  let dragStart = 0
  let dragHeight = 0

  function applyDrag(clientY: number) {
    const delta = dragStart - clientY
    const newH = Math.max(120, Math.min(window.innerHeight * 0.8, dragHeight + delta))
    root.style.height = `${newH}px`
    state.height = newH
  }

  resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
    dragStart = e.clientY
    dragHeight = root.getBoundingClientRect().height
    const onMove = (ev: MouseEvent) => applyDrag(ev.clientY)
    const onUp = () => {
      saveState(state)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  resizeHandle.addEventListener('touchstart', (e: TouchEvent) => {
    e.preventDefault()
    dragStart = e.touches[0].clientY
    dragHeight = root.getBoundingClientRect().height
    const onMove = (ev: TouchEvent) => applyDrag(ev.touches[0].clientY)
    const onEnd = () => {
      saveState(state)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
  }, { passive: false })

  return {
    root,
    tabPanels,
    getActiveClient: () => clients[activeClientIdx],
    onTabChange: (cb) => { tabChangeListeners.push(cb) },
  }
}
