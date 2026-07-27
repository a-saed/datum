// packages/cli/src/docker.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

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
  const containerName = `datum-dev-postgres-${Date.now()}`

  await exec('docker', [
    'run', '-d', '--rm',
    '-p', `${port}:5432`,
    '-e', 'POSTGRES_USER=datum',
    '-e', 'POSTGRES_PASSWORD=datum',
    '-e', 'POSTGRES_DB=datum',
    '--name', containerName,
    'postgis/postgis:16-3.4',
  ])

  await waitForReady(containerName, exec, opts.pollIntervalMs ?? 500, opts.readyTimeoutMs ?? 30_000)

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
      await exec('docker', ['exec', containerName, 'pg_isready', '-U', 'datum'])
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
