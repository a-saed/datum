// packages/cli/src/commands/stop.ts
import { unlink } from 'node:fs/promises'
import { readStateFile } from './dev.js'
import { stopDockerPostgres as stopDockerPostgresDefault } from '../docker.js'

export interface RunStopOptions {
  statePath: string
  log: (msg: string) => void
  stopDockerPostgres?: typeof stopDockerPostgresDefault
}

export async function runStop(opts: RunStopOptions): Promise<'stopped' | 'nothing-to-stop'> {
  const state = await readStateFile(opts.statePath)
  if (!state) {
    opts.log('nothing to stop')
    return 'nothing-to-stop'
  }

  if (state.kind === 'docker' && state.containerName) {
    const stopDockerPostgres = opts.stopDockerPostgres ?? stopDockerPostgresDefault
    opts.log(`stopping Docker container ${state.containerName}`)
    try {
      await stopDockerPostgres(state.containerName)
    } catch (err) {
      // The container may already be gone (e.g. `datum dev` already tore it down on Ctrl-C) —
      // that shouldn't leave a stale state file that fails every subsequent `datum stop`.
      opts.log(
        `warning: failed to stop Docker container ${state.containerName}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  await unlink(opts.statePath).catch(() => {})
  return 'stopped'
}
