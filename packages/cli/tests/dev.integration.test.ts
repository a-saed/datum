// packages/cli/tests/dev.integration.test.ts
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { runDev } from '../src/commands/dev.js'
import { stopDockerPostgres } from '../src/docker.js'

// `describe.runIf` evaluates its condition synchronously at collection time — before any
// `beforeAll` hook runs — so both availability checks must be synchronous.
function dockerAvailableSync(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function goAvailableSync(): boolean {
  try {
    execFileSync('go', ['version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const dockerAvailable = dockerAvailableSync()
const goAvailable = goAvailableSync()

// Finds a free TCP port by asking the OS to assign one, then releasing it immediately. There's
// an inherent (tiny) race between releasing the port here and datum-server binding it, but that's
// the standard approach absent a way to hand the OS-assigned socket directly to a child process.
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address()
      if (address && typeof address === 'object') {
        const port = address.port
        srv.close(() => resolve(port))
      } else {
        srv.close(() => reject(new Error('failed to acquire a free port')))
      }
    })
  })
}

const here = path.dirname(fileURLToPath(import.meta.url))
const serverDir = path.resolve(here, '..', '..', 'server')

describe.runIf(dockerAvailable && goAvailable)(
  'datum dev (requires Docker and a Go toolchain)',
  () => {
    it(
      'starts Postgres + datum-server via the Docker tier, serves /healthz, and tears down cleanly on Ctrl-C',
      async () => {
        // Build the real datum-server binary once for this test.
        const buildDir = mkdtempSync(path.join(tmpdir(), 'datum-server-build-'))
        const binaryPath = path.join(buildDir, 'datum-server')
        execFileSync('go', ['build', '-o', binaryPath, '.'], {
          cwd: serverDir,
          stdio: 'inherit',
          timeout: 120_000,
        })

        // datum-server auto-creates the table (CREATE TABLE IF NOT EXISTS, see
        // packages/server/migrate.go + sql/001_datum_schema.sql) on startup, so a minimal
        // datum.yaml naming the table is all the temp cwd needs.
        const cwd = mkdtempSync(path.join(tmpdir(), 'datum-dev-integration-'))
        writeFileSync(path.join(cwd, 'datum.yaml'), 'table:\n  name: features\n', 'utf-8')

        const statePath = path.join(cwd, 'dev-state.json')
        const port = await getFreePort()
        const originalPort = process.env.PORT
        process.env.PORT = String(port)

        const log = (msg: string) => process.stderr.write(`[integration] ${msg}\n`)

        const runPromise = runDev({
          statePath,
          cwd,
          log,
          resolveServerBinary: () => binaryPath,
          stopDockerPostgres,
        })

        try {
          // Poll /healthz until it responds or we give up — the postgis/postgis image pull can
          // be slow on a cold Docker cache.
          const deadline = Date.now() + 60_000
          let healthy = false
          while (Date.now() < deadline) {
            try {
              const res = await fetch(`http://127.0.0.1:${port}/healthz`)
              if (res.status === 200) {
                healthy = true
                break
              }
            } catch {
              // Not up yet — server or container may still be starting.
            }
            await new Promise(resolve => setTimeout(resolve, 500))
          }
          expect(healthy).toBe(true)

          const state = JSON.parse(readFileSync(statePath, 'utf-8')) as {
            kind: string
            containerName?: string
          }
          expect(state.kind).toBe('docker')
          const containerName = state.containerName
          expect(containerName).toBeTruthy()

          // Same in-process SIGINT pattern dev.test.ts already uses to exercise the real
          // signal-handling path without sending an actual OS signal to the test runner.
          process.emit('SIGINT')
          await runPromise

          expect(existsSync(statePath)).toBe(false)

          let containerStillExists = true
          try {
            execFileSync('docker', ['inspect', containerName as string], { stdio: 'ignore' })
          } catch {
            containerStillExists = false
          }
          expect(containerStillExists).toBe(false)
        } finally {
          if (originalPort !== undefined) {
            process.env.PORT = originalPort
          } else {
            delete process.env.PORT
          }
        }
      },
      150_000
    )
  }
)
