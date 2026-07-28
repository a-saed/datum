// packages/cli/src/server.ts
import { spawn, type ChildProcess } from 'node:child_process'

export function spawnServerBinary(
  binaryPath: string,
  env: Record<string, string>,
  opts: { spawn?: typeof spawn } = {}
): ChildProcess {
  const spawnFn = opts.spawn ?? spawn
  return spawnFn(binaryPath, [], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}
