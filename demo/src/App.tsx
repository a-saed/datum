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
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="7" stroke="#2563eb" strokeWidth="1.8" />
      <line x1="9" y1="1"    x2="9" y2="4"    stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="9" y1="14"   x2="9" y2="17"   stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="1"   y1="9"  x2="4"   y2="9"  stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="14"  y1="9"  x2="17"  y2="9"  stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="9" r="2.2" fill="#2563eb" />
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

createRoot(document.getElementById('root')!).render(<App />)
