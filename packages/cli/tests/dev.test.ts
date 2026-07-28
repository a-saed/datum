// packages/cli/tests/dev.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { runDev, writeStateFile, readStateFile } from '../src/commands/dev.js'

function fakeChild() {
  const child: any = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child
}

describe('runDev', () => {
  it('resolves Postgres, spawns the server, and writes a state file for BYO', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-dev-test-'))
    const statePath = path.join(tmp, 'dev-state.json')
    const child = fakeChild()

    const resolvePostgres = vi.fn().mockResolvedValue({ kind: 'byo', connectionString: 'postgres://x' })
    const resolveServerBinary = vi.fn().mockReturnValue('/fake/datum-server')
    // Emit 'close' via setImmediate, scheduled from inside the mock itself — this guarantees
    // it fires only after runDev has synchronously registered its 'close' listener (several
    // awaits stand between calling runDev and that registration, so emitting synchronously
    // right after the call, before those awaits resolve, would fire with no listener attached
    // and hang the test until timeout).
    const spawnServerBinary = vi.fn().mockImplementation(() => {
      setImmediate(() => child.emit('close', 0))
      return child
    })

    const exitCode = await runDev({
      databaseUrl: 'postgres://x',
      statePath,
      log: vi.fn(),
      resolvePostgres,
      resolveServerBinary,
      spawnServerBinary,
      stopDockerPostgres: vi.fn(),
    })

    expect(spawnServerBinary).toHaveBeenCalledWith('/fake/datum-server', { DATABASE_URL: 'postgres://x' })
    expect(existsSync(statePath)).toBe(true)
    expect(JSON.parse(readFileSync(statePath, 'utf-8'))).toEqual({ kind: 'byo' })
    expect(exitCode).toBe(0)
  })

  it('resolves with the child process exit code when it closes non-zero', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-dev-test-'))
    const statePath = path.join(tmp, 'dev-state.json')
    const child = fakeChild()

    const resolvePostgres = vi.fn().mockResolvedValue({ kind: 'byo', connectionString: 'postgres://x' })
    const spawnServerBinary = vi.fn().mockImplementation(() => {
      setImmediate(() => child.emit('close', 1))
      return child
    })

    const exitCode = await runDev({
      databaseUrl: 'postgres://x',
      statePath,
      log: vi.fn(),
      resolvePostgres,
      resolveServerBinary: vi.fn().mockReturnValue('/fake/datum-server'),
      spawnServerBinary,
      stopDockerPostgres: vi.fn(),
    })

    expect(exitCode).toBe(1)
  })

  it('passes CONFIG to the server when a datum.yaml exists in cwd', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-dev-test-'))
    const statePath = path.join(tmp, 'dev-state.json')
    const configPath = path.join(tmp, 'datum.yaml')
    writeFileSync(configPath, 'table:\n  name: features\n', 'utf-8')
    const child = fakeChild()

    const resolvePostgres = vi.fn().mockResolvedValue({ kind: 'byo', connectionString: 'postgres://x' })
    const spawnServerBinary = vi.fn().mockImplementation(() => {
      setImmediate(() => child.emit('close', 0))
      return child
    })
    const log = vi.fn()

    await runDev({
      databaseUrl: 'postgres://x',
      statePath,
      cwd: tmp,
      log,
      resolvePostgres,
      resolveServerBinary: vi.fn().mockReturnValue('/fake/datum-server'),
      spawnServerBinary,
      stopDockerPostgres: vi.fn(),
    })

    expect(spawnServerBinary).toHaveBeenCalledWith('/fake/datum-server', {
      DATABASE_URL: 'postgres://x',
      CONFIG: configPath,
    })
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('no datum.yaml found'))
  })

  it('logs a hint and omits CONFIG when no datum.yaml exists and TABLE is unset', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-dev-test-'))
    const statePath = path.join(tmp, 'dev-state.json')
    const child = fakeChild()

    const resolvePostgres = vi.fn().mockResolvedValue({ kind: 'byo', connectionString: 'postgres://x' })
    const spawnServerBinary = vi.fn().mockImplementation(() => {
      setImmediate(() => child.emit('close', 0))
      return child
    })
    const log = vi.fn()

    const originalTable = process.env.TABLE
    delete process.env.TABLE
    try {
      await runDev({
        databaseUrl: 'postgres://x',
        statePath,
        cwd: tmp,
        log,
        resolvePostgres,
        resolveServerBinary: vi.fn().mockReturnValue('/fake/datum-server'),
        spawnServerBinary,
        stopDockerPostgres: vi.fn(),
      })
    } finally {
      if (originalTable !== undefined) process.env.TABLE = originalTable
    }

    expect(spawnServerBinary).toHaveBeenCalledWith('/fake/datum-server', { DATABASE_URL: 'postgres://x' })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no datum.yaml found'))
  })

  it('records the container name in the state file for the Docker tier', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-dev-test-'))
    const statePath = path.join(tmp, 'dev-state.json')
    const child = fakeChild()

    const resolvePostgres = vi.fn().mockResolvedValue({
      kind: 'docker',
      connectionString: 'postgres://datum:datum@127.0.0.1:5433/datum',
      containerName: 'datum-dev-postgres-1',
    })

    const spawnServerBinary = vi.fn().mockImplementation(() => {
      setImmediate(() => child.emit('close', 0))
      return child
    })

    await runDev({
      statePath,
      log: vi.fn(),
      resolvePostgres,
      resolveServerBinary: vi.fn().mockReturnValue('/fake/datum-server'),
      spawnServerBinary,
      stopDockerPostgres: vi.fn(),
    })

    expect(JSON.parse(readFileSync(statePath, 'utf-8'))).toEqual({
      kind: 'docker',
      containerName: 'datum-dev-postgres-1',
    })
  })

  it('cleans up the Postgres tier if spawning the server binary throws after Postgres resolved', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-dev-test-'))
    const statePath = path.join(tmp, 'dev-state.json')

    const resolvePostgres = vi.fn().mockResolvedValue({
      kind: 'docker',
      connectionString: 'postgres://datum:datum@127.0.0.1:5433/datum',
      containerName: 'datum-dev-postgres-1',
    })
    const spawnServerBinary = vi.fn().mockImplementation(() => {
      throw new Error('boom: binary not found')
    })
    const stopDockerPostgres = vi.fn().mockResolvedValue(undefined)

    await expect(
      runDev({
        statePath,
        log: vi.fn(),
        resolvePostgres,
        resolveServerBinary: vi.fn().mockReturnValue('/fake/datum-server'),
        spawnServerBinary,
        stopDockerPostgres,
      })
    ).rejects.toThrow('boom: binary not found')

    expect(stopDockerPostgres).toHaveBeenCalledWith('datum-dev-postgres-1')
    expect(stopDockerPostgres).toHaveBeenCalledTimes(1)
  })

  it('stops the Postgres tier exactly once when SIGINT arrives before the child closes', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-dev-test-'))
    const statePath = path.join(tmp, 'dev-state.json')
    const child = fakeChild()
    // Simulate a real child process: it only closes once killed.
    child.kill = vi.fn(() => {
      setImmediate(() => child.emit('close', 0))
    })

    const resolvePostgres = vi.fn().mockResolvedValue({
      kind: 'docker',
      connectionString: 'postgres://datum:datum@127.0.0.1:5433/datum',
      containerName: 'datum-dev-postgres-1',
    })
    const spawnServerBinary = vi.fn().mockReturnValue(child)
    const stopDockerPostgres = vi.fn().mockResolvedValue(undefined)

    // Baseline captured before runDev registers its own listener: the shared `process` object
    // may already carry other SIGINT listeners (e.g. from the test runner itself), so listener
    // counts below are asserted relative to this baseline rather than as absolute values.
    const baselineListeners = process.listenerCount('SIGINT')

    const runPromise = runDev({
      statePath,
      log: vi.fn(),
      resolvePostgres,
      resolveServerBinary: vi.fn().mockReturnValue('/fake/datum-server'),
      spawnServerBinary,
      stopDockerPostgres,
    })

    // Let runDev's awaits (Postgres resolution, state file write — real fs I/O) run to
    // completion so its SIGINT listener is registered before we emit the signal — same
    // reasoning as the setImmediate-inside-the-mock pattern above, just driven from the test
    // body instead. Poll against a wall-clock deadline rather than a fixed tick count: a fixed
    // count of setImmediate iterations races against real fs I/O (mkdir/writeFile) and was
    // observed to time out under system load well before the listener was registered, causing
    // exactly the flakiness this test is meant to catch. A generous deadline keeps the test fast
    // in the common case while tolerating slow I/O, and still fails within a bounded time if
    // runDev genuinely stops registering the handler.
    const pollDeadline = Date.now() + 2000
    while (
      Date.now() < pollDeadline &&
      process.listenerCount('SIGINT') === baselineListeners
    ) {
      await new Promise(resolve => setImmediate(resolve))
    }
    expect(process.listenerCount('SIGINT')).toBe(baselineListeners + 1)
    process.emit('SIGINT')

    const exitCode = await runPromise

    expect(exitCode).toBe(0)
    expect(child.kill).toHaveBeenCalledWith('SIGINT')
    expect(stopDockerPostgres).toHaveBeenCalledTimes(1)
    // The SIGINT listener must be removed once runDev settles, or repeated runs would leak
    // listeners onto the shared `process` object.
    expect(process.listenerCount('SIGINT')).toBe(baselineListeners)
  })
})

describe('writeStateFile / readStateFile', () => {
  it('round-trips state through disk', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-dev-test-'))
    const statePath = path.join(tmp, 'dev-state.json')

    await writeStateFile(statePath, { kind: 'docker', containerName: 'c1' })
    expect(await readStateFile(statePath)).toEqual({ kind: 'docker', containerName: 'c1' })
  })

  it('returns undefined when no state file exists', async () => {
    expect(await readStateFile('/nonexistent/dev-state.json')).toBeUndefined()
  })
})
