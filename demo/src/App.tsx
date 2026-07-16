import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Map } from './Map.js'

export type StatusPhase = 'connecting' | 'ready' | 'saving' | 'error'
export interface AppStatus { phase: StatusPhase; text: string }

const DOT_COLOR: Record<StatusPhase, string> = {
  connecting: '#f59e0b',
  ready:      '#16a34a',
  saving:     '#2563eb',
  error:      '#dc2626',
}

// Surveying crosshair — outer ring + axis ticks + center dot.
// A datum in surveying is the precise reference point everything is measured from.
function DatumIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <polyline points="17,10 6,24 17,38" stroke="#2563eb" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="31,10 42,24 31,38" stroke="#2563eb" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="8" stroke="#2563eb" strokeWidth="1.5" fill="none" opacity="0.5" />
      <circle cx="24" cy="24" r="3.5" fill="#2563eb" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function DocsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

function Topbar({ status }: { status: AppStatus }) {
  const pulse = status.phase === 'connecting' || status.phase === 'saving'
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: '48px', flexShrink: 0,
      background: '#fff',
      boxShadow: '0 1px 6px rgba(0,0,0,0.09)',
      zIndex: 10,
    }}>

      {/* Branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <DatumIcon />
        <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '0.02em', color: '#111' }}>
          datum
        </span>
      </div>

      {/* Status + links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span
            className={pulse ? 'status-dot-pulse' : undefined}
            style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: DOT_COLOR[status.phase], flexShrink: 0,
            }}
          />
          <span style={{ fontSize: '13px', color: '#555' }}>{status.text}</span>
        </div>

        {/* Links — new tab: the demo holds live socket and PGlite state */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a className="topbar-link" href="https://github.com/a-saed/datum"
             target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="datum on GitHub">
            <GitHubIcon />
          </a>
          <a className="topbar-link" href="https://a-saed.github.io/datum/"
             target="_blank" rel="noopener noreferrer" title="Docs" aria-label="datum documentation">
            <DocsIcon />
          </a>
        </div>

      </div>

    </header>
  )
}

function App() {
  const [status, setStatus] = useState<AppStatus>({ phase: 'connecting', text: 'Initializing…' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Topbar status={status} />
      <Map onStatusChange={setStatus} />
    </div>
  )
}

// ?reset: wipe local datum-* IDB databases and reload without the param
if (new URLSearchParams(location.search).has('reset')) {
  void indexedDB.databases()
    .then(dbs => Promise.all(
      dbs
        .filter(db => db.name?.startsWith('datum-'))
        .map(db => new Promise<void>(res => {
          const req = indexedDB.deleteDatabase(db.name!)
          req.onsuccess = req.onerror = () => res()
        }))
    ))
    .then(() => location.replace(location.pathname))
    .catch(() => location.replace(location.pathname))
} else {
  createRoot(document.getElementById('root')!).render(<App />)
}
