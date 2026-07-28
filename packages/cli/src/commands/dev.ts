// packages/cli/src/commands/dev.ts
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { resolvePostgres as resolvePostgresDefault, type PostgresSource } from '../postgresChain.js'
import { resolveServerBinary as resolveServerBinaryDefault } from '../platform.js'
import { spawnServerBinary as spawnServerBinaryDefault } from '../server.js'
import { isDockerAvailable as isDockerAvailableDefault, startDockerPostgres as startDockerPostgresDefault, stopDockerPostgres as stopDockerPostgresDefault } from '../docker.js'
import { startEmbeddedPostgres as startEmbeddedPostgresDefault, stopEmbeddedPostgres as stopEmbeddedPostgresDefault } from '../embedded.js'

export interface DevState {
  kind: 'docker' | 'embedded' | 'byo'
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
  dataDir: string
  statePath: string
  log: (msg: string) => void
  resolvePostgres?: typeof resolvePostgresDefault
  resolveServerBinary?: typeof resolveServerBinaryDefault
  spawnServerBinary?: typeof spawnServerBinaryDefault
  isDockerAvailable?: typeof isDockerAvailableDefault
  startDockerPostgres?: typeof startDockerPostgresDefault
  startEmbeddedPostgres?: typeof startEmbeddedPostgresDefault
  stopDockerPostgres: typeof stopDockerPostgresDefault
  stopEmbeddedPostgres: typeof stopEmbeddedPostgresDefault
}

export async function runDev(opts: RunDevOptions): Promise<void> {
  const resolvePostgres = opts.resolvePostgres ?? resolvePostgresDefault
  const resolveServerBinary = opts.resolveServerBinary ?? resolveServerBinaryDefault
  const spawnServerBinary = opts.spawnServerBinary ?? spawnServerBinaryDefault

  const source: PostgresSource = await resolvePostgres({
    databaseUrl: opts.databaseUrl,
    dataDir: opts.dataDir,
    log: opts.log,
    isDockerAvailable: opts.isDockerAvailable ?? isDockerAvailableDefault,
    startDockerPostgres: opts.startDockerPostgres ?? startDockerPostgresDefault,
    startEmbeddedPostgres: opts.startEmbeddedPostgres ?? startEmbeddedPostgresDefault,
  })

  const state: DevState =
    source.kind === 'docker'
      ? { kind: 'docker', containerName: source.containerName }
      : { kind: source.kind }
  await writeStateFile(opts.statePath, state)

  const binaryPath = resolveServerBinary()
  const child: ChildProcess = spawnServerBinary(binaryPath, { DATABASE_URL: source.connectionString })
  child.stdout?.on('data', chunk => process.stdout.write(chunk))
  child.stderr?.on('data', chunk => process.stderr.write(chunk))

  const cleanup = async () => {
    if (source.kind === 'docker') await opts.stopDockerPostgres(source.containerName)
    if (source.kind === 'embedded') await opts.stopEmbeddedPostgres(source.instance)
  }

  process.once('SIGINT', () => { void cleanup().then(() => child.kill('SIGINT')) })
  process.once('SIGTERM', () => { void cleanup().then(() => child.kill('SIGTERM')) })

  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', () => resolve())
  })

  await cleanup()
}
