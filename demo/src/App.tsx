import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Map } from './Map.js'

function App() {
  const [status, setStatus] = useState('Initializing...')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div id="status-bar">datum demo | {status}</div>
      <Map onStatusChange={setStatus} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
