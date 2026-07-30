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
const bboxIdx   = args.indexOf('--bbox')
const bboxNext  = bboxIdx >= 0 ? args[bboxIdx + 1] : undefined
const bbox: [number, number, number, number] | undefined = bboxNext && !bboxNext.startsWith('--')
  ? bboxNext.split(',').map(Number) as [number, number, number, number]
  : undefined
const maxRowsIdx  = args.indexOf('--max-rows')
const maxRowsNext = maxRowsIdx >= 0 ? args[maxRowsIdx + 1] : undefined
const maxRows: number | undefined = maxRowsNext && !maxRowsNext.startsWith('--') ? Number(maxRowsNext) : undefined

if (!serverUrl) {
  process.stderr.write(
    'Usage: datum-mcp <ws://server-url> [--table <name>] [--bbox minX,minY,maxX,maxY] [--allow-writes] [--jwt <token>] [--max-rows <n>]\n'
  )
  process.exit(1)
}

process.stderr.write(`datum MCP: connecting to ${serverUrl} (table: ${tableName}, writes: ${allowWrites ? 'enabled' : 'read-only'})\n`)

try {
  // Default to world bbox for spatial tables — MCP clients query all data, not a viewport.
  // Pass --bbox minX,minY,maxX,maxY to restrict the sync area.
  const client = await DatumClient.connect({
    serverUrl,
    table: tableName,
    bbox: bbox ?? [-180, -90, 180, 90],
    ...(jwt ? { token: jwt } : {}),
    onStatusChange: s => process.stderr.write(`datum: ${s}\n`),
  })
  process.stderr.write('datum MCP: connected — serving tools over stdio\n')
  process.stdin.on('end', async () => {
    await client.disconnect()
  })
  await initDatumMcp(client, { allowWrites, maxRows })
  // Process stays alive via StdioServerTransport's stdin listener
} catch (err) {
  process.stderr.write(`datum MCP: failed to connect — ${String(err)}\n`)
  process.exit(1)
}
