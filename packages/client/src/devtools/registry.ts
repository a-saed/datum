// packages/client/src/devtools/registry.ts
import type { DatumClient } from '../client.js'

export function normaliseClients(input: DatumClient | DatumClient[]): DatumClient[] {
  return Array.isArray(input) ? input : [input]
}
