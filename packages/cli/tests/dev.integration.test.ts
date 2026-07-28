// packages/cli/tests/dev.integration.test.ts
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { isDockerAvailable, startDockerPostgres, stopDockerPostgres } from '../src/docker.js'
import { resolvePostgres } from '../src/postgresChain.js'
import { startEmbeddedPostgres } from '../src/embedded.js'

// `describe.runIf` evaluates its condition synchronously at collection time — before any
// `beforeAll` hook runs — so the availability check must be synchronous too. (The async
// `isDockerAvailable()` from ../src/docker.js is still used for the actual resolvePostgres
// call below, exercising the real code path.)
function dockerAvailableSync(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const dockerAvailable = dockerAvailableSync()

describe.runIf(dockerAvailable)('Docker Postgres tier (requires Docker)', () => {
  it('produces a connection string a real client can use', async () => {
    const source = await resolvePostgres({
      dataDir: '/tmp/datum-dev-integration',
      log: () => {},
      isDockerAvailable,
      startDockerPostgres,
      startEmbeddedPostgres,
    })

    expect(source.kind).toBe('docker')
    if (source.kind === 'docker') {
      await stopDockerPostgres(source.containerName)
    }
  })
})
