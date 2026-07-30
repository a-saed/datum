// packages/cli/src/commands/mcp.ts
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

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

  return spawnFn('npx', ['datum-sync', 'datum-mcp', ...args], {
    env: process.env,
    stdio: 'inherit',
  })
}
