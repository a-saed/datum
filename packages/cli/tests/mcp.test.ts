// packages/cli/tests/mcp.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { resolveTableName, resolvePort, spawnMcpBridge, runMcp } from '../src/commands/mcp.js'

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

function fakeChild() {
  const child: any = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stdout.pipe = vi.fn()
  child.stderr = new EventEmitter()
  child.stderr.pipe = vi.fn()
  child.kill = vi.fn(() => {
    setImmediate(() => child.emit('close', 0))
  })
  return child
}

describe('runMcp', () => {
  it('resolves the table from datum.yaml, spawns both children, and tears down on the MCP child closing', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-mcp-test-'))
    const statePath = path.join(tmp, 'dev-state.json')
    const logFilePath = path.join(tmp, 'mcp-server.log')
    writeFileSync(path.join(tmp, 'datum.yaml'), 'table:\n  name: features\n', 'utf-8')

    const serverChild = fakeChild()
    const mcpChild = fakeChild()

    const resolvePostgres = vi.fn().mockResolvedValue({ kind: 'byo', connectionString: 'postgres://x' })
    const spawnServerBinary = vi.fn().mockReturnValue(serverChild)
    const spawnMcpBridgeFn = vi.fn().mockImplementation(() => {
      setImmediate(() => mcpChild.emit('close', 0))
      return mcpChild
    })

    const exitCode = await runMcp({
      databaseUrl: 'postgres://x',
      statePath,
      logFilePath,
      cwd: tmp,
      log: vi.fn(),
      resolvePostgres,
      resolveServerBinary: vi.fn().mockReturnValue('/fake/datum-server'),
      spawnServerBinary,
      spawnMcpBridge: spawnMcpBridgeFn,
      stopDockerPostgres: vi.fn(),
    })

    expect(spawnMcpBridgeFn).toHaveBeenCalledWith(
      expect.stringMatching(/^ws:\/\/127\.0\.0\.1:\d+\/ws$/),
      expect.objectContaining({ table: 'features' })
    )
    expect(exitCode).toBe(0)
    expect(existsSync(statePath)).toBe(false)
  })

  it('tears down the server child and stops Postgres when the MCP child errors', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-mcp-test-'))
    const statePath = path.join(tmp, 'dev-state.json')
    const logFilePath = path.join(tmp, 'mcp-server.log')
    writeFileSync(path.join(tmp, 'datum.yaml'), 'table:\n  name: features\n', 'utf-8')

    const serverChild = fakeChild()
    const mcpChild = fakeChild()

    const resolvePostgres = vi.fn().mockResolvedValue({
      kind: 'docker',
      connectionString: 'postgres://datum:datum@127.0.0.1:5433/datum',
      containerName: 'datum-dev-postgres-1',
    })
    const spawnServerBinary = vi.fn().mockReturnValue(serverChild)
    const spawnMcpBridgeFn = vi.fn().mockImplementation(() => {
      setImmediate(() => mcpChild.emit('error', new Error('npx not found')))
      return mcpChild
    })
    const stopDockerPostgres = vi.fn().mockResolvedValue(undefined)

    await expect(
      runMcp({
        statePath,
        logFilePath,
        cwd: tmp,
        log: vi.fn(),
        resolvePostgres,
        resolveServerBinary: vi.fn().mockReturnValue('/fake/datum-server'),
        spawnServerBinary,
        spawnMcpBridge: spawnMcpBridgeFn,
        stopDockerPostgres,
      })
    ).rejects.toThrow('npx not found')

    expect(serverChild.kill).toHaveBeenCalledWith('SIGTERM')
    expect(stopDockerPostgres).toHaveBeenCalledWith('datum-dev-postgres-1')
  })

  it('forwards --allow-writes, --jwt, --bbox, and --max-rows to the MCP bridge', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-mcp-test-'))
    const statePath = path.join(tmp, 'dev-state.json')
    const logFilePath = path.join(tmp, 'mcp-server.log')

    const serverChild = fakeChild()
    const mcpChild = fakeChild()
    const spawnMcpBridgeFn = vi.fn().mockImplementation(() => {
      setImmediate(() => mcpChild.emit('close', 0))
      return mcpChild
    })

    await runMcp({
      databaseUrl: 'postgres://x',
      table: 'parcels',
      allowWrites: true,
      jwt: 'token123',
      bbox: '-1,-1,1,1',
      maxRows: 500,
      statePath,
      logFilePath,
      cwd: tmp,
      log: vi.fn(),
      resolvePostgres: vi.fn().mockResolvedValue({ kind: 'byo', connectionString: 'postgres://x' }),
      resolveServerBinary: vi.fn().mockReturnValue('/fake/datum-server'),
      spawnServerBinary: vi.fn().mockReturnValue(serverChild),
      spawnMcpBridge: spawnMcpBridgeFn,
      stopDockerPostgres: vi.fn(),
    })

    expect(spawnMcpBridgeFn).toHaveBeenCalledWith(expect.any(String), {
      table: 'parcels',
      allowWrites: true,
      jwt: 'token123',
      bbox: '-1,-1,1,1',
      maxRows: 500,
    })
  })
})
