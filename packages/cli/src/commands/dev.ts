// packages/cli/src/commands/dev.ts
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { resolvePostgres as resolvePostgresDefault, type PostgresSource } from '../postgresChain.js'
import { resolveServerBinary as resolveServerBinaryDefault } from '../platform.js'
import { spawnServerBinary as spawnServerBinaryDefault } from '../server.js'
import { isDockerAvailable as isDockerAvailableDefault, startDockerPostgres as startDockerPostgresDefault, stopDockerPostgres as stopDockerPostgresDefault } from '../docker.js'

export interface DevState {
  kind: 'docker' | 'byo'
  containerName?: string
}

export async function writeStateFile(statePath: string, state: DevState): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true })
  await writeFile(statePath, JSON.stringify(state), 'utf-8')
}

export async function readStateFile(statePath: string): Promise<DevState | undefined> {
  try {
    return JSON.parse(await readFile(statePath, 'utf-8')) as DevState
  } catch {
    return undefined
  }
}

export interface RunDevOptions {
  databaseUrl?: string
  statePath: string
  log: (msg: string) => void
  resolvePostgres?: typeof resolvePostgresDefault
  resolveServerBinary?: typeof resolveServerBinaryDefault
  spawnServerBinary?: typeof spawnServerBinaryDefault
  isDockerAvailable?: typeof isDockerAvailableDefault
  startDockerPostgres?: typeof startDockerPostgresDefault
  stopDockerPostgres: typeof stopDockerPostgresDefault
}

export async function runDev(opts: RunDevOptions): Promise<void> {
  const resolvePostgres = opts.resolvePostgres ?? resolvePostgresDefault
  const resolveServerBinary = opts.resolveServerBinary ?? resolveServerBinaryDefault
  const spawnServerBinary = opts.spawnServerBinary ?? spawnServerBinaryDefault

  const source: PostgresSource = await resolvePostgres({
    databaseUrl: opts.databaseUrl,
    log: opts.log,
    isDockerAvailable: opts.isDockerAvailable ?? isDockerAvailableDefault,
    startDockerPostgres: opts.startDockerPostgres ?? startDockerPostgresDefault,
  })

  // Idempotent: safe to call more than once (e.g. once from a SIGINT/SIGTERM handler and
  // again from the `finally` below once the child subsequently closes).
  let cleanedUp = false
  const cleanup = async (): Promise<void> => {
    if (cleanedUp) return
    cleanedUp = true
    if (source.kind === 'docker') await opts.stopDockerPostgres(source.containerName)
  }

  let sigintHandler: (() => void) | undefined
  let sigtermHandler: (() => void) | undefined

  // Everything below can throw (writeStateFile, resolveServerBinary, spawnServerBinary) or
  // reject (the child's 'error' event) after Postgres has already been started — the
  // try/finally guarantees `cleanup()` still runs on any of those exit paths, not just a
  // clean child 'close'.
  try {
    const state: DevState =
      source.kind === 'docker'
        ? { kind: 'docker', containerName: source.containerName }
        : { kind: source.kind }
    await writeStateFile(opts.statePath, state)

    const binaryPath = resolveServerBinary()
    const child: ChildProcess = spawnServerBinary(binaryPath, { DATABASE_URL: source.connectionString })
    child.stdout?.on('data', chunk => process.stdout.write(chunk))
    child.stderr?.on('data', chunk => process.stderr.write(chunk))

    const onSignal = (signal: 'SIGINT' | 'SIGTERM') => {
      void cleanup()
        .catch(err => opts.log(`cleanup failed: ${err instanceof Error ? err.message : String(err)}`))
        .then(() => child.kill(signal))
    }
    sigintHandler = () => onSignal('SIGINT')
    sigtermHandler = () => onSignal('SIGTERM')
    process.once('SIGINT', sigintHandler)
    process.once('SIGTERM', sigtermHandler)

    await new Promise<void>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', () => resolve())
    })
  } finally {
    if (sigintHandler) process.off('SIGINT', sigintHandler)
    if (sigtermHandler) process.off('SIGTERM', sigtermHandler)
    try {
      await cleanup()
    } catch (err) {
      // Don't let a cleanup failure mask an in-flight exception from the try block above.
      opts.log(`cleanup failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
