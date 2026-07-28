// packages/cli/src/postgresChain.ts
import { isDockerAvailable as isDockerAvailableDefault, startDockerPostgres as startDockerPostgresDefault } from './docker.js'
import { startEmbeddedPostgres as startEmbeddedPostgresDefault, type EmbeddedPostgres } from './embedded.js'

export type PostgresSource =
  | { kind: 'byo'; connectionString: string }
  | { kind: 'docker'; connectionString: string; containerName: string }
  | { kind: 'embedded'; connectionString: string; instance: EmbeddedPostgres }

export interface ResolveDeps {
  databaseUrl?: string
  dataDir: string
  log: (msg: string) => void
  isDockerAvailable: typeof isDockerAvailableDefault
  startDockerPostgres: typeof startDockerPostgresDefault
  startEmbeddedPostgres: typeof startEmbeddedPostgresDefault
}

export async function resolvePostgres(deps: ResolveDeps): Promise<PostgresSource> {
  if (deps.databaseUrl) {
    deps.log(`connecting to ${redact(deps.databaseUrl)}`)
    return { kind: 'byo', connectionString: deps.databaseUrl }
  }

  if (await deps.isDockerAvailable()) {
    deps.log('starting Postgres via Docker')
    const docker = await deps.startDockerPostgres()
    return { kind: 'docker', connectionString: docker.connectionString, containerName: docker.containerName }
  }

  deps.log('Docker not available — starting embedded Postgres')
  const instance = await deps.startEmbeddedPostgres(deps.dataDir)
  return { kind: 'embedded', connectionString: instance.connectionString, instance }
}

function redact(url: string): string {
  try {
    const u = new URL(url)
    if (u.password) u.password = '***'
    return u.toString()
  } catch {
    return '(unparseable connection string)'
  }
}
