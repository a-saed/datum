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
