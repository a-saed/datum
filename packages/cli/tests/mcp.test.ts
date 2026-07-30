// packages/cli/tests/mcp.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { resolveTableName, resolvePort, spawnMcpBridge } from '../src/commands/mcp.js'

describe('resolveTableName', () => {
  it('returns the explicit table when given, ignoring datum.yaml', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-mcp-test-'))
    const result = await resolveTableName({ cwd: tmp, explicitTable: 'parcels' })
    expect(result).toBe('parcels')
  })

  it('reads a single table name from datum.yaml', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-mcp-test-'))
    writeFileSync(path.join(tmp, 'datum.yaml'), 'table:\n  name: features\n', 'utf-8')
    const result = await resolveTableName({ cwd: tmp })
    expect(result).toBe('features')
  })

  it('throws naming the tables found when datum.yaml defines multiple tables', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-mcp-test-'))
    writeFileSync(path.join(tmp, 'datum.yaml'), 'tables:\n  - name: sites\n  - name: parcels\n', 'utf-8')
    await expect(resolveTableName({ cwd: tmp })).rejects.toThrow('sites, parcels')
  })

  it('throws asking for --table when no datum.yaml exists', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-mcp-test-'))
    await expect(resolveTableName({ cwd: tmp })).rejects.toThrow('Pass --table <name>')
  })
})

describe('resolvePort', () => {
  it('prefers the PORT env var over datum.yaml', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-mcp-test-'))
    writeFileSync(path.join(tmp, 'datum.yaml'), 'port: 4000\n', 'utf-8')
    const original = process.env.PORT
    process.env.PORT = '5000'
    try {
      expect(await resolvePort(tmp)).toBe('5000')
    } finally {
      if (original !== undefined) process.env.PORT = original
      else delete process.env.PORT
    }
  })

  it('reads port from datum.yaml when PORT is unset', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-mcp-test-'))
    writeFileSync(path.join(tmp, 'datum.yaml'), 'port: 4000\n', 'utf-8')
    const original = process.env.PORT
    delete process.env.PORT
    try {
      expect(await resolvePort(tmp)).toBe('4000')
    } finally {
      if (original !== undefined) process.env.PORT = original
    }
  })

  it('defaults to 3000 when neither PORT nor datum.yaml specify a port', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-mcp-test-'))
    const original = process.env.PORT
    delete process.env.PORT
    try {
      expect(await resolvePort(tmp)).toBe('3000')
    } finally {
      if (original !== undefined) process.env.PORT = original
    }
  })
})

describe('spawnMcpBridge', () => {
  it('builds the npx datum-sync datum-mcp argv with all flags', () => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 123 })
    spawnMcpBridge(
      'ws://127.0.0.1:3000/ws',
      { table: 'parcels', allowWrites: true, jwt: 'tok', bbox: '-1,-1,1,1', maxRows: 500 },
      spawnFn as any
    )
    expect(spawnFn).toHaveBeenCalledWith(
      'npx',
      ['datum-sync', 'datum-mcp', 'ws://127.0.0.1:3000/ws', '--table', 'parcels', '--allow-writes', '--jwt', 'tok', '--bbox', '-1,-1,1,1', '--max-rows', '500'],
      expect.objectContaining({ stdio: 'inherit' })
    )
  })

  it('omits optional flags when not provided', () => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 123 })
    spawnMcpBridge('ws://127.0.0.1:3000/ws', { table: 'features' }, spawnFn as any)
    expect(spawnFn).toHaveBeenCalledWith(
      'npx',
      ['datum-sync', 'datum-mcp', 'ws://127.0.0.1:3000/ws', '--table', 'features'],
      expect.objectContaining({ stdio: 'inherit' })
    )
  })
})
