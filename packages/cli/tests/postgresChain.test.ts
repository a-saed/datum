// packages/cli/tests/postgresChain.test.ts
import { describe, it, expect, vi } from 'vitest'
import { resolvePostgres, type ResolveDeps } from '../src/postgresChain.js'

function baseDeps(overrides: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    databaseUrl: undefined,
    log: vi.fn(),
    isDockerAvailable: vi.fn().mockResolvedValue(false),
    startDockerPostgres: vi.fn(),
    ...overrides,
  }
}

describe('resolvePostgres', () => {
  it('uses BYO when databaseUrl is set, without touching Docker', async () => {
    const deps = baseDeps({ databaseUrl: 'postgres://user:pass@host:5432/db' })
    const result = await resolvePostgres(deps)

    expect(result).toEqual({ kind: 'byo', connectionString: 'postgres://user:pass@host:5432/db' })
    expect(deps.isDockerAvailable).not.toHaveBeenCalled()
    expect(deps.startDockerPostgres).not.toHaveBeenCalled()
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
  })

  it('throws a helpful error when Docker unavailable and no databaseUrl', async () => {
    const deps = baseDeps({
      isDockerAvailable: vi.fn().mockResolvedValue(false),
    })

    await expect(resolvePostgres(deps)).rejects.toThrow(
      /Docker is not available and no DATABASE_URL was provided/
    )
    expect(deps.startDockerPostgres).not.toHaveBeenCalled()
  })
})
