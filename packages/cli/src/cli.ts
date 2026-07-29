#!/usr/bin/env node
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { runDev } from './commands/dev.js'
import { runStop } from './commands/stop.js'
import { runInit } from './commands/init.js'
import { stopDockerPostgres } from './docker.js'
import { CLI_VERSION } from './version.js'

export type ParsedCommand =
  | { command: 'dev'; databaseUrl?: string }
  | { command: 'dev-invalid-db' }
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
  if (command === 'stop') return { command: 'stop' }
  if (command === 'init') return { command: 'init' }
  return { command: 'unknown' }
}

const USAGE = `datum-cli ${CLI_VERSION}\nUsage: datum <dev|stop|init> [--db <connection-string>]\n       datum --help | --version\n`

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
