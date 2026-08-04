#!/usr/bin/env node
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { runDev } from './commands/dev.js'
import { runStop } from './commands/stop.js'
import { runInit } from './commands/init.js'
import { runMcp } from './commands/mcp.js'
import { stopDockerPostgres } from './docker.js'
import { CLI_VERSION } from './version.js'

export type ParsedCommand =
  | { command: 'dev'; databaseUrl?: string }
  | { command: 'dev-invalid-db' }
  | { command: 'mcp'; databaseUrl?: string; table?: string; allowWrites: boolean; jwt?: string; bbox?: string; maxRows?: number }
  | { command: 'mcp-invalid-flag'; flag: string }
  | { command: 'stop' }
  | { command: 'init' }
  | { command: 'help' }
  | { command: 'version' }
  | { command: 'unknown' }

export function parseCommand(args: string[]): ParsedCommand {
  const [command, ...rest] = args
  if (command === '--help' || command === '-h' || command === 'help') return { command: 'help' }
  if (command === '--version' || command === '-v') return { command: 'version' }
  if (command === 'dev') {
    const dbIdx = rest.indexOf('--db')
    if (dbIdx < 0) return { command: 'dev', databaseUrl: undefined }
    const value = rest[dbIdx + 1]
    if (value === undefined || value.startsWith('-')) return { command: 'dev-invalid-db' }
    return { command: 'dev', databaseUrl: value }
  }
  if (command === 'mcp') {
    // Every flag with a value is validated the same way: present-but-missing-value, or a value
    // that looks like another flag (starts with `--`), is rejected as `mcp-invalid-flag` rather
    // than silently swallowing the next flag as this one's value (e.g. `mcp --table --allow-writes`
    // must not treat "--allow-writes" as the table name). Mirrors the guard style already used in
    // packages/client/src/mcp/cli.ts for the same five flags.
    const dbIdx = rest.indexOf('--db')
    if (dbIdx >= 0 && (rest[dbIdx + 1] === undefined || rest[dbIdx + 1].startsWith('--'))) {
      return { command: 'mcp-invalid-flag', flag: '--db' }
    }
    const databaseUrl = dbIdx >= 0 ? rest[dbIdx + 1] : undefined

    const tableIdx = rest.indexOf('--table')
    if (tableIdx >= 0 && (rest[tableIdx + 1] === undefined || rest[tableIdx + 1].startsWith('--'))) {
      return { command: 'mcp-invalid-flag', flag: '--table' }
    }
    const table = tableIdx >= 0 ? rest[tableIdx + 1] : undefined

    const allowWrites = rest.includes('--allow-writes')

    const jwtIdx = rest.indexOf('--jwt')
    if (jwtIdx >= 0 && (rest[jwtIdx + 1] === undefined || rest[jwtIdx + 1].startsWith('--'))) {
      return { command: 'mcp-invalid-flag', flag: '--jwt' }
    }
    const jwt = jwtIdx >= 0 ? rest[jwtIdx + 1] : undefined

    const bboxIdx = rest.indexOf('--bbox')
    if (bboxIdx >= 0 && (rest[bboxIdx + 1] === undefined || rest[bboxIdx + 1].startsWith('--'))) {
      return { command: 'mcp-invalid-flag', flag: '--bbox' }
    }
    const bbox = bboxIdx >= 0 ? rest[bboxIdx + 1] : undefined

    const maxRowsIdx = rest.indexOf('--max-rows')
    let maxRows: number | undefined
    if (maxRowsIdx >= 0) {
      const maxRowsStr = rest[maxRowsIdx + 1]
      if (maxRowsStr === undefined || maxRowsStr.startsWith('--')) {
        return { command: 'mcp-invalid-flag', flag: '--max-rows' }
      }
      const parsedMaxRows = Number(maxRowsStr)
      if (!Number.isFinite(parsedMaxRows) || parsedMaxRows < 0) {
        return { command: 'mcp-invalid-flag', flag: '--max-rows' }
      }
      maxRows = parsedMaxRows
    }

    return { command: 'mcp', databaseUrl, table, allowWrites, jwt, bbox, maxRows }
  }
  if (command === 'stop') return { command: 'stop' }
  if (command === 'init') return { command: 'init' }
  return { command: 'unknown' }
}

const USAGE = `datum-cli ${CLI_VERSION}\nUsage: datum <dev|stop|init|mcp> [--db <connection-string>]\n       datum mcp [--table <name>] [--allow-writes] [--jwt <token>] [--bbox <minX,minY,maxX,maxY>] [--max-rows <n>]\n       datum --help | --version\n`

const STATE_PATH = path.join(os.homedir(), '.datum', 'dev-state.json')

async function main() {
  const parsed = parseCommand(process.argv.slice(2))
  const log = (msg: string) => process.stderr.write(`datum: ${msg}\n`)

  switch (parsed.command) {
    case 'dev': {
      const code = await runDev({
        databaseUrl: parsed.databaseUrl ?? process.env.DATABASE_URL,
        statePath: STATE_PATH,
        log,
        stopDockerPostgres,
      })
      if (code !== 0) process.exit(code)
      break
    }
    case 'mcp': {
      const code = await runMcp({
        databaseUrl: parsed.databaseUrl ?? process.env.DATABASE_URL,
        table: parsed.table,
        allowWrites: parsed.allowWrites,
        jwt: parsed.jwt,
        bbox: parsed.bbox,
        maxRows: parsed.maxRows,
        statePath: STATE_PATH,
        logFilePath: path.join(os.homedir(), '.datum', 'mcp-server.log'),
        log,
        stopDockerPostgres,
      })
      if (code !== 0) process.exit(code)
      break
    }
    case 'stop':
      await runStop({ statePath: STATE_PATH, log })
      break
    case 'init':
      await runInit({ cwd: process.cwd() })
      break
    case 'help':
      process.stdout.write(USAGE)
      break
    case 'version':
      process.stdout.write(`datum-cli ${CLI_VERSION}\n`)
      break
    case 'dev-invalid-db':
      process.stderr.write('datum: --db requires a value: datum dev --db postgres://...\n')
      process.exit(1)
      break
    case 'mcp-invalid-flag':
      process.stderr.write(`datum: ${parsed.flag} requires a value: datum mcp ${parsed.flag} <value>\n`)
      process.exit(1)
      break
    default:
      process.stderr.write(USAGE)
      process.exit(1)
  }
}

// Only run when executed directly (e.g. `node dist/cli.js`), not when imported — this file is
// imported by tests to exercise `parseCommand` without triggering the whole CLI dispatch.
// `process.argv[1]` is resolved with `realpathSync` because npm's `bin` entry (`datum` ->
// `dist/cli.js`) is installed as a symlink: Node does not resolve symlinks for `process.argv[1]`,
// but `import.meta.url` always reflects the real (resolved) path, so comparing them unresolved
// would never match when the CLI is actually run via its installed `datum` bin.
const isMain =
  process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch(err => {
    process.stderr.write(`datum: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
