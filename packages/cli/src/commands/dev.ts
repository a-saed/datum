// packages/cli/src/commands/dev.ts
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
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
  cwd?: string
  log: (msg: string) => void
  resolvePostgres?: typeof resolvePostgresDefault
  resolveServerBinary?: typeof resolveServerBinaryDefault
  spawnServerBinary?: typeof spawnServerBinaryDefault
  isDockerAvailable?: typeof isDockerAvailableDefault
  startDockerPostgres?: typeof startDockerPostgresDefault
  stopDockerPostgres: typeof stopDockerPostgresDefault
}

export async function runDev(opts: RunDevOptions): Promise<number> {
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
    if (source.kind === 'docker') {
      try {
        await opts.stopDockerPostgres(source.containerName)
      } catch (err) {
        // The container may already be gone (e.g. a previous `dev` already tore it down) —
        // that shouldn't stop us from unlinking the state file below.
        opts.log(
          `warning: failed to stop Docker container ${source.containerName}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    // Best-effort: a later `datum stop` should see "nothing to stop" once `dev` has already
    // torn everything down, rather than trying (and failing) to stop an already-gone container.
    await unlink(opts.statePath).catch(() => {})
  }

  let sigintHandler: (() => void) | undefined
  let sigtermHandler: (() => void) | undefined
  let exitCode = 0

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

    const cwd = opts.cwd ?? process.cwd()
    const configPath = path.join(cwd, 'datum.yaml')
    const env: Record<string, string> = { DATABASE_URL: source.connectionString }
    if (existsSync(configPath)) {
      env.CONFIG = configPath
    } else if (!process.env.TABLE) {
      opts.log('no datum.yaml found — run `npx datum-cli init` to create one, or set the TABLE env var')
    }

    const binaryPath = resolveServerBinary()
    const child: ChildProcess = spawnServerBinary(binaryPath, env)
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

    exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject)
      // A `null` code means the child was terminated by a signal (e.g. our own SIGINT/SIGTERM
      // kill above) rather than exiting on its own — treat that as a clean exit (0) rather
      // than a failure.
      child.once('close', (code: number | null) => resolve(code ?? 0))
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

  return exitCode
}
