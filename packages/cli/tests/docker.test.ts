// packages/cli/tests/docker.test.ts
import { describe, it, expect, vi } from 'vitest'
import { isDockerAvailable, startDockerPostgres, stopDockerPostgres, type Exec } from '../src/docker.js'

describe('isDockerAvailable', () => {
  it('returns true when `docker info` succeeds', async () => {
    const exec: Exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
    expect(await isDockerAvailable(exec)).toBe(true)
    expect(exec).toHaveBeenCalledWith('docker', ['info'])
  })

  it('returns false when `docker info` fails', async () => {
    const exec: Exec = vi.fn().mockRejectedValue(new Error('docker: command not found'))
    expect(await isDockerAvailable(exec)).toBe(false)
  })
})

describe('startDockerPostgres', () => {
  it('runs the postgis image, polls readiness, and returns a connection string', async () => {
    const calls: string[][] = []
    const exec: Exec = vi.fn(async (cmd, args) => {
      calls.push([cmd, ...args])
      if (args[0] === 'exec') return { stdout: 'accepting connections', stderr: '' }
      return { stdout: '', stderr: '' }
    })

    const result = await startDockerPostgres({ port: 5433, exec })

    expect(result.connectionString).toBe('postgres://datum:datum@127.0.0.1:5433/datum')
    expect(result.containerName).toMatch(/^datum-dev-postgres-/)

    const runCall = calls.find(c => c[1] === 'run')
    expect(runCall).toEqual([
      'docker', 'run', '-d', '--rm',
      '-p', '127.0.0.1:5433:5432',
      '-e', 'POSTGRES_USER=datum',
      '-e', 'POSTGRES_PASSWORD=datum',
      '-e', 'POSTGRES_DB=datum',
      '--name', result.containerName,
      'postgis/postgis:16-3.4',
    ])
  })

  it('retries pg_isready until it succeeds', async () => {
    let attempts = 0
    const exec: Exec = vi.fn(async (_cmd, args) => {
      if (args[0] === 'exec') {
        attempts++
        if (attempts < 3) throw new Error('not ready yet')
        return { stdout: 'accepting connections', stderr: '' }
      }
      return { stdout: '', stderr: '' }
    })

    await startDockerPostgres({ port: 5433, exec, pollIntervalMs: 1 })
    expect(attempts).toBe(3)
  })

  it('throws if Postgres never becomes ready within the timeout', async () => {
    const exec: Exec = vi.fn(async (_cmd, args) => {
      if (args[0] === 'exec') throw new Error('not ready')
      return { stdout: '', stderr: '' }
    })

    await expect(
      startDockerPostgres({ port: 5433, exec, pollIntervalMs: 1, readyTimeoutMs: 5 })
    ).rejects.toThrow(/did not become ready/)
  })

  it('stops the orphaned container if it never becomes ready', async () => {
    let containerName = ''
    const exec: Exec = vi.fn(async (_cmd, args) => {
      if (args[0] === 'run') containerName = args[args.indexOf('--name') + 1]
      if (args[0] === 'exec') throw new Error('not ready')
      return { stdout: '', stderr: '' }
    })

    await expect(
      startDockerPostgres({ port: 5433, exec, pollIntervalMs: 1, readyTimeoutMs: 5 })
    ).rejects.toThrow(/did not become ready/)

    expect(exec).toHaveBeenCalledWith('docker', ['stop', containerName])
  })
})

describe('stopDockerPostgres', () => {
  it('stops the named container', async () => {
    const exec: Exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
    await stopDockerPostgres('datum-dev-postgres-123', exec)
    expect(exec).toHaveBeenCalledWith('docker', ['stop', 'datum-dev-postgres-123'])
  })
})
