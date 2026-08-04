// packages/cli/src/commands/mcp.ts
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { existsSync, createWriteStream } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { resolvePostgres as resolvePostgresDefault, type PostgresSource } from '../postgresChain.js'
import { resolveServerBinary as resolveServerBinaryDefault } from '../platform.js'
import { spawnServerBinary as spawnServerBinaryDefault } from '../server.js'
import { isDockerAvailable as isDockerAvailableDefault, startDockerPostgres as startDockerPostgresDefault, stopDockerPostgres as stopDockerPostgresDefault } from '../docker.js'
import { writeStateFile, type DevState } from './dev.js'

export interface ResolveTableNameOptions {
  cwd: string
  explicitTable?: string
}

export async function resolveTableName(opts: ResolveTableNameOptions): Promise<string> {
  if (opts.explicitTable) return opts.explicitTable

  const configPath = path.join(opts.cwd, 'datum.yaml')
  if (!existsSync(configPath)) {
    throw new Error('No --table given and no datum.yaml found in the current directory. Pass --table <name>.')
  }

  const raw = await readFile(configPath, 'utf-8')
  const config = parseYaml(raw) as { table?: { name?: string }; tables?: { name: string }[] } | null

  if (config?.tables && config.tables.length > 0) {
    const names = config.tables.map(t => t.name).join(', ')
    throw new Error(`datum.yaml defines multiple tables (${names}) — pass --table <name> to pick one.`)
  }

  if (config?.table?.name) {
    return config.table.name
  }

  throw new Error('Could not determine a table name from datum.yaml. Pass --table <name>.')
}

export async function resolvePort(cwd: string): Promise<string> {
  if (process.env.PORT) return process.env.PORT

  const configPath = path.join(cwd, 'datum.yaml')
  if (!existsSync(configPath)) return '3000'

  const raw = await readFile(configPath, 'utf-8')
  const config = parseYaml(raw) as { port?: number | string } | null
  return config?.port !== undefined ? String(config.port) : '3000'
}

export interface McpBridgeOptions {
  table: string
  allowWrites?: boolean
  jwt?: string
  bbox?: string
  maxRows?: number
}

// The bridge's `--max-rows` guardrail only exists starting with this datum-sync release (shipped
// as part of this same feature branch). `npm exec`/`npx --package=` prefers a locally-installed
// datum-sync over the registry when one exists in the user's project, so an unpinned `datum-sync`
// specifier can silently resolve to an older local install whose datum-mcp bin doesn't understand
// `--max-rows` at all (unknown flags are ignored by its simple arg parser) — the guardrail would
// then silently no-op instead of erroring. Pinning to `^MIN_DATUM_SYNC_VERSION` guarantees the
// resolved datum-sync always supports the flag we're passing it.
//
// NOTE: 0.14.0 is a placeholder for "the next minor after 0.13.1" (datum-sync's version as of this
// branch) — confirm/bump this to the actual published version datum-sync ships as once this
// feature branch's client changes are released.
export const MIN_DATUM_SYNC_VERSION = '0.14.0'

export function spawnMcpBridge(
  wsUrl: string,
  opts: McpBridgeOptions,
  spawnFn: typeof spawn = spawn
): ChildProcess {
  const args = [wsUrl, '--table', opts.table]
  if (opts.allowWrites) args.push('--allow-writes')
  if (opts.jwt) args.push('--jwt', opts.jwt)
  if (opts.bbox) args.push('--bbox', opts.bbox)
  if (opts.maxRows !== undefined) args.push('--max-rows', String(opts.maxRows))

  // npx has no notion of "package, then command" as two separate positional args: given
  // `npx datum-sync datum-mcp <url> ...`, npx resolves the package "datum-sync" and treats
  // *everything* after it — including the literal string "datum-mcp" — as argv for the
  // resolved bin. Since datum-sync's only bin is named "datum-mcp" (not "datum-sync"), that
  // extra literal token ends up as datum-mcp's first argv entry, shifting the real ws:// URL
  // out of the position cli.ts expects and silently breaking every real invocation. Using
  // `--package=` makes the package and the command being invoked within it explicit and
  // independent, so only the real args make it through.
  return spawnFn('npx', [`--package=datum-sync@^${MIN_DATUM_SYNC_VERSION}`, 'datum-mcp', ...args], {
    env: process.env,
    stdio: 'inherit',
  })
}

export interface RunMcpOptions {
  databaseUrl?: string
  table?: string
  allowWrites?: boolean
  jwt?: string
  bbox?: string
  maxRows?: number
  statePath: string
  logFilePath: string
  cwd?: string
  log: (msg: string) => void
  resolvePostgres?: typeof resolvePostgresDefault
  resolveServerBinary?: typeof resolveServerBinaryDefault
  spawnServerBinary?: typeof spawnServerBinaryDefault
  spawnMcpBridge?: typeof spawnMcpBridge
  isDockerAvailable?: typeof isDockerAvailableDefault
  startDockerPostgres?: typeof startDockerPostgresDefault
  stopDockerPostgres: typeof stopDockerPostgresDefault
}

export async function runMcp(opts: RunMcpOptions): Promise<number> {
  const resolvePostgres = opts.resolvePostgres ?? resolvePostgresDefault
  const resolveServerBinary = opts.resolveServerBinary ?? resolveServerBinaryDefault
  const spawnServerBinary = opts.spawnServerBinary ?? spawnServerBinaryDefault
  const spawnBridge = opts.spawnMcpBridge ?? spawnMcpBridge

  const cwd = opts.cwd ?? process.cwd()
  const tableName = await resolveTableName({ cwd, explicitTable: opts.table })

  const source: PostgresSource = await resolvePostgres({
    databaseUrl: opts.databaseUrl,
    log: opts.log,
    isDockerAvailable: opts.isDockerAvailable ?? isDockerAvailableDefault,
    startDockerPostgres: opts.startDockerPostgres ?? startDockerPostgresDefault,
  })

  let cleanedUp = false
  const cleanup = async (): Promise<void> => {
    if (cleanedUp) return
    cleanedUp = true
    if (source.kind === 'docker') {
      try {
        await opts.stopDockerPostgres(source.containerName)
      } catch (err) {
        opts.log(
          `warning: failed to stop Docker container ${source.containerName}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    await unlink(opts.statePath).catch(() => {})
  }

  let sigintHandler: (() => void) | undefined
  let sigtermHandler: (() => void) | undefined
  let exitCode = 0

  try {
    const state: DevState =
      source.kind === 'docker'
        ? { kind: 'docker', containerName: source.containerName }
        : { kind: source.kind }
    await writeStateFile(opts.statePath, state)

    const configPath = path.join(cwd, 'datum.yaml')
    const env: Record<string, string> = { DATABASE_URL: source.connectionString }
    if (existsSync(configPath)) env.CONFIG = configPath

    await mkdir(path.dirname(opts.logFilePath), { recursive: true })
    const logStream = createWriteStream(opts.logFilePath, { flags: 'a' })
    // An async write error (disk full, permission denied, etc.) on this stream would otherwise be
    // an unhandled 'error' event and crash the process with a raw stack trace. Logging is best
    // effort — the server itself can keep running even if we can't write its output to disk — so
    // this just warns via the CLI's own log callback instead of being fatal.
    logStream.on('error', err => {
      opts.log(`warning: failed to write datum-server log to ${opts.logFilePath}: ${err instanceof Error ? err.message : String(err)}`)
    })
    // datum-server's stdout/stderr are redirected here (not inherited) so the MCP bridge's stdio
    // pipe stays clean for the protocol — which also means a failed server start (bad
    // DATABASE_URL, port in use, missing table, ...) produces no visible output at all unless the
    // user knows to look here. Tell them up front.
    opts.log(`datum-server output: ${opts.logFilePath}`)

    const binaryPath = resolveServerBinary()
    const serverChild = spawnServerBinary(binaryPath, env)

    serverChild.stdout?.pipe(logStream)
    serverChild.stderr?.pipe(logStream)

    const port = await resolvePort(cwd)
    const wsUrl = `ws://127.0.0.1:${port}/ws`
    const mcpChild = spawnBridge(wsUrl, {
      table: tableName,
      allowWrites: opts.allowWrites,
      jwt: opts.jwt,
      bbox: opts.bbox,
      maxRows: opts.maxRows,
    })

    const onSignal = (signal: 'SIGINT' | 'SIGTERM') => {
      void cleanup()
        .catch(err => opts.log(`cleanup failed: ${err instanceof Error ? err.message : String(err)}`))
        .then(() => {
          mcpChild.kill(signal)
          serverChild.kill(signal)
        })
    }
    sigintHandler = () => onSignal('SIGINT')
    sigtermHandler = () => onSignal('SIGTERM')
    process.once('SIGINT', sigintHandler)
    process.once('SIGTERM', sigtermHandler)

    exitCode = await new Promise<number>((resolve, reject) => {
      let settled = false
      const settle = (code: number) => {
        if (settled) return
        settled = true
        resolve(code)
      }
      const fail = (err: Error) => {
        if (settled) return
        settled = true
        serverChild.kill('SIGTERM')
        mcpChild.kill('SIGTERM')
        reject(err)
      }
      mcpChild.once('error', fail)
      serverChild.once('error', fail)
      mcpChild.once('close', (code: number | null) => {
        serverChild.kill('SIGTERM')
        settle(code ?? 0)
      })
      serverChild.once('close', (code: number | null) => {
        mcpChild.kill('SIGTERM')
        settle(code ?? 0)
      })
    })
  } finally {
    if (sigintHandler) process.off('SIGINT', sigintHandler)
    if (sigtermHandler) process.off('SIGTERM', sigtermHandler)
    try {
      await cleanup()
    } catch (err) {
      opts.log(`cleanup failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return exitCode
}
