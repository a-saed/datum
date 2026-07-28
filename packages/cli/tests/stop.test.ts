// packages/cli/tests/stop.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { writeStateFile } from '../src/commands/dev.js'
import { runStop } from '../src/commands/stop.js'

describe('runStop', () => {
  it('reports nothing-to-stop when no state file exists', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-stop-test-'))
    const statePath = path.join(tmp, 'dev-state.json')
    const stopDockerPostgres = vi.fn()

    const result = await runStop({ statePath, log: vi.fn(), stopDockerPostgres })

    expect(result).toBe('nothing-to-stop')
    expect(stopDockerPostgres).not.toHaveBeenCalled()
  })

  it('stops the Docker container recorded in the state file', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-stop-test-'))
    const statePath = path.join(tmp, 'dev-state.json')
    await writeStateFile(statePath, { kind: 'docker', containerName: 'datum-dev-postgres-1' })
    const stopDockerPostgres = vi.fn()

    const result = await runStop({ statePath, log: vi.fn(), stopDockerPostgres })

    expect(result).toBe('stopped')
    expect(stopDockerPostgres).toHaveBeenCalledWith('datum-dev-postgres-1')
  })

  it('is a no-op for the byo tier beyond reporting stopped', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'datum-stop-test-'))
    const statePath = path.join(tmp, 'dev-state.json')
    await writeStateFile(statePath, { kind: 'byo' })
    const stopDockerPostgres = vi.fn()

    const result = await runStop({ statePath, log: vi.fn(), stopDockerPostgres })

    expect(result).toBe('stopped')
    expect(stopDockerPostgres).not.toHaveBeenCalled()
  })
})
