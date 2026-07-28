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
    await stopDockerPostgres(state.containerName)
  }

  await unlink(opts.statePath).catch(() => {})
  return 'stopped'
}
