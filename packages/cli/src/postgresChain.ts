// packages/cli/src/postgresChain.ts
import { isDockerAvailable as isDockerAvailableDefault, startDockerPostgres as startDockerPostgresDefault } from './docker.js'

export type PostgresSource =
  | { kind: 'byo'; connectionString: string }
  | { kind: 'docker'; connectionString: string; containerName: string }

export interface ResolveDeps {
  databaseUrl?: string
  log: (msg: string) => void
  isDockerAvailable: typeof isDockerAvailableDefault
  startDockerPostgres: typeof startDockerPostgresDefault
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

  throw new Error(
    'Docker is not available and no DATABASE_URL was provided.\n' +
      'Either:\n' +
      '  - start Docker (datum dev will run Postgres for you), or\n' +
      '  - pass an existing Postgres URL: datum dev --db postgres://...'
  )
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
