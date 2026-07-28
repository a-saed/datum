// packages/cli/tests/postgresChain.test.ts
import { describe, it, expect, vi } from 'vitest'
import { resolvePostgres, type ResolveDeps } from '../src/postgresChain.js'

function baseDeps(overrides: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    databaseUrl: undefined,
    dataDir: '/tmp/datum-test',
    log: vi.fn(),
    isDockerAvailable: vi.fn().mockResolvedValue(false),
    startDockerPostgres: vi.fn(),
    startEmbeddedPostgres: vi.fn(),
    ...overrides,
  }
}

describe('resolvePostgres', () => {
  it('uses BYO when databaseUrl is set, without touching Docker or embedded', async () => {
    const deps = baseDeps({ databaseUrl: 'postgres://user:pass@host:5432/db' })
    const result = await resolvePostgres(deps)

    expect(result).toEqual({ kind: 'byo', connectionString: 'postgres://user:pass@host:5432/db' })
    expect(deps.isDockerAvailable).not.toHaveBeenCalled()
    expect(deps.startDockerPostgres).not.toHaveBeenCalled()
    expect(deps.startEmbeddedPostgres).not.toHaveBeenCalled()
  })

  it('redacts the password when logging the BYO connection', async () => {
    const deps = baseDeps({ databaseUrl: 'postgres://user:pass@host:5432/db' })
    await resolvePostgres(deps)
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('***'))
    expect(deps.log).not.toHaveBeenCalledWith(expect.stringContaining('pass'))
  })

  it('uses Docker when available and no databaseUrl is set', async () => {
    const deps = baseDeps({
      isDockerAvailable: vi.fn().mockResolvedValue(true),
      startDockerPostgres: vi.fn().mockResolvedValue({
        connectionString: 'postgres://datum:datum@127.0.0.1:5433/datum',
        containerName: 'datum-dev-postgres-1',
      }),
    })
    const result = await resolvePostgres(deps)

    expect(result).toEqual({
      kind: 'docker',
      connectionString: 'postgres://datum:datum@127.0.0.1:5433/datum',
      containerName: 'datum-dev-postgres-1',
    })
    expect(deps.startEmbeddedPostgres).not.toHaveBeenCalled()
  })

  it('falls back to embedded when Docker is unavailable', async () => {
    const fakeInstance = { connectionString: 'postgres://postgres@127.0.0.1:5433/postgres?pool_max_conns=1' } as any
    const deps = baseDeps({
      isDockerAvailable: vi.fn().mockResolvedValue(false),
      startEmbeddedPostgres: vi.fn().mockResolvedValue(fakeInstance),
    })
    const result = await resolvePostgres(deps)

    expect(result).toEqual({
      kind: 'embedded',
      connectionString: fakeInstance.connectionString,
      instance: fakeInstance,
    })
    expect(deps.startDockerPostgres).not.toHaveBeenCalled()
  })
})
