// packages/cli/src/docker.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'

const execFileAsync = promisify(execFile)

export type Exec = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

const defaultExec: Exec = async (cmd, args) => execFileAsync(cmd, args)

export async function isDockerAvailable(exec: Exec = defaultExec): Promise<boolean> {
  try {
    await exec('docker', ['info'])
    return true
  } catch {
    return false
  }
}

export interface DockerPostgres {
  connectionString: string
  containerName: string
}

export async function startDockerPostgres(
  opts: { port?: number; exec?: Exec; pollIntervalMs?: number; readyTimeoutMs?: number } = {}
): Promise<DockerPostgres> {
  const exec = opts.exec ?? defaultExec
  const port = opts.port ?? 5433
  // Date.now() alone isn't collision-resistant enough: two Node processes (e.g. two Vitest test
  // files running real-Docker integration tests concurrently in the same CI job) can call this
  // within the same millisecond on a fast runner, producing an identical container name and a
  // "Conflict: container name already in use" failure from `docker run`. The random suffix makes
  // that collision astronomically unlikely regardless of timing.
  const containerName = `datum-dev-postgres-${Date.now()}-${randomBytes(4).toString('hex')}`

  await exec('docker', [
    'run', '-d', '--rm',
    '-p', `127.0.0.1:${port}:5432`,
    '-e', 'POSTGRES_USER=datum',
    '-e', 'POSTGRES_PASSWORD=datum',
    '-e', 'POSTGRES_DB=datum',
    '--name', containerName,
    'postgis/postgis:16-3.4',
  ])

  try {
    await waitForReady(containerName, exec, opts.pollIntervalMs ?? 500, opts.readyTimeoutMs ?? 30_000)
  } catch (err) {
    await exec('docker', ['stop', containerName]).catch(() => {})
    throw err
  }

  return {
    connectionString: `postgres://datum:datum@127.0.0.1:${port}/datum`,
    containerName,
  }
}

async function waitForReady(
  containerName: string,
  exec: Exec,
  pollIntervalMs: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      // -h 127.0.0.1 forces a TCP check against the real listener. The postgis/postgis
      // entrypoint runs an ephemeral init-scripts server first that only accepts local Unix
      // socket connections (listen_addresses=''), then restarts as the real server bound to
      // 0.0.0.0 — `pg_isready` with no -h defaults to the Unix socket and reports ready during
      // that ephemeral phase, right before it shuts down for the restart. A client (including
      // datum-server) that then dials the container immediately can land on that shutdown and
      // see the connection reset. Forcing TCP here means readiness isn't reported until the
      // real server — the one this connection string actually points at — is listening.
      await exec('docker', ['exec', containerName, 'pg_isready', '-U', 'datum', '-h', '127.0.0.1'])
      return
    } catch {
      if (Date.now() >= deadline) {
        throw new Error(`Postgres container ${containerName} did not become ready within ${timeoutMs}ms`)
      }
      await new Promise(r => setTimeout(r, pollIntervalMs))
    }
  }
}

export async function stopDockerPostgres(containerName: string, exec: Exec = defaultExec): Promise<void> {
  await exec('docker', ['stop', containerName])
}
