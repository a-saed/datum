#!/usr/bin/env node
import { DatumClient } from '../client.js'
import { initDatumMcp } from './index.js'

const args = process.argv.slice(2)
const serverUrl = args.find(a => !a.startsWith('--'))
const tableIdx  = args.indexOf('--table')
const tableNext = tableIdx >= 0 ? args[tableIdx + 1] : undefined
const tableName = (tableNext && !tableNext.startsWith('--')) ? tableNext : 'features'
const allowWrites = args.includes('--allow-writes')
const jwtIdx    = args.indexOf('--jwt')
const jwtNext   = jwtIdx >= 0 ? args[jwtIdx + 1] : undefined
const jwt       = (jwtNext && !jwtNext.startsWith('--')) ? jwtNext : undefined

if (!serverUrl) {
  process.stderr.write(
    'Usage: datum-mcp <ws://server-url> [--table <name>] [--allow-writes] [--jwt <token>]\n'
  )
  process.exit(1)
}

process.stderr.write(`datum MCP: connecting to ${serverUrl} (table: ${tableName}, writes: ${allowWrites ? 'enabled' : 'read-only'})\n`)

try {
  const client = await DatumClient.connect({
    serverUrl,
    table: tableName,
    ...(jwt ? { token: jwt } : {}),
    onStatusChange: s => process.stderr.write(`datum: ${s}\n`),
  })
  process.stderr.write('datum MCP: connected — serving tools over stdio\n')
  process.stdin.on('end', async () => {
    await client.disconnect()
  })
  await initDatumMcp(client, { allowWrites })
  // Process stays alive via StdioServerTransport's stdin listener
} catch (err) {
  process.stderr.write(`datum MCP: failed to connect — ${String(err)}\n`)
  process.exit(1)
}
