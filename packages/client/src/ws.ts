// packages/client/src/ws.ts
import type { ClientMessage, ServerMessage } from './types.js'

export function connectWS(
  serverUrl: string,
  onMessage: (msg: ServerMessage) => void,
  onOpen: () => void,
): WebSocket {
  const ws = new WebSocket(serverUrl)
  ws.addEventListener('open', onOpen)
  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage
      onMessage(msg)
    } catch {
      // ignore malformed messages
    }
  })
  return ws
}

export function sendMessage(ws: WebSocket, msg: ClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}
