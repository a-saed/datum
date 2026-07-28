// packages/cli/tests/dev.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
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

    await runDev({
      databaseUrl: 'postgres://x',
      dataDir: tmp,
      statePath,
      log: vi.fn(),
      resolvePostgres,
      resolveServerBinary,
      spawnServerBinary,
      stopDockerPostgres: vi.fn(),
      stopEmbeddedPostgres: vi.fn(),
    })

    expect(spawnServerBinary).toHaveBeenCalledWith('/fake/datum-server', { DATABASE_URL: 'postgres://x' })
    expect(existsSync(statePath)).toBe(true)
    expect(JSON.parse(readFileSync(statePath, 'utf-8'))).toEqual({ kind: 'byo' })
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
      dataDir: tmp,
      statePath,
      log: vi.fn(),
      resolvePostgres,
      resolveServerBinary: vi.fn().mockReturnValue('/fake/datum-server'),
      spawnServerBinary,
      stopDockerPostgres: vi.fn(),
      stopEmbeddedPostgres: vi.fn(),
    })

    expect(JSON.parse(readFileSync(statePath, 'utf-8'))).toEqual({
      kind: 'docker',
      containerName: 'datum-dev-postgres-1',
    })
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
