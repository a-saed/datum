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
  | { command: 'stop' }
  | { command: 'init' }
  | { command: 'unknown' }

export function parseCommand(args: string[]): ParsedCommand {
  const [command, ...rest] = args
  if (command === 'dev') {
    const dbIdx = rest.indexOf('--db')
    const databaseUrl = dbIdx >= 0 ? rest[dbIdx + 1] : undefined
    return { command: 'dev', databaseUrl }
  }
  if (command === 'stop') return { command: 'stop' }
  if (command === 'init') return { command: 'init' }
  return { command: 'unknown' }
}

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
    default:
      process.stderr.write(
        `datum-cli ${CLI_VERSION}\nUsage: datum <dev|stop|init> [--db <connection-string>]\n`
      )
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
