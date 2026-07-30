// packages/cli/tests/mcp.integration.test.ts
import { describe, it, expect } from 'vitest'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { createServer } from 'node:net'
import { runMcp } from '../src/commands/mcp.js'
import { startDockerPostgres, stopDockerPostgres } from '../src/docker.js'

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

const here = path.dirname(fileURLToPath(import.meta.url))
const serverDir = path.resolve(here, '..', '..', 'server')

// startDockerPostgres defaults to a fixed host port (5433) when not told otherwise, which
// dev.integration.test.ts also relies on for its own real Docker Postgres container. Vitest runs
// test files concurrently in separate workers by default, so without picking a distinct port here,
// this test's `docker run -p 127.0.0.1:5433:5432` collides with dev.integration.test.ts's own
// container when both run in the same `vitest run` invocation, and one of the two `docker run`
// calls fails with "port is already allocated". Acquiring a free port up front — same technique
// dev.integration.test.ts already uses for its HTTP server port — keeps this test's real Docker
// container fully independent of any other real-Docker test running alongside it.
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

// Sends one newline-delimited JSON-RPC 2.0 request over the MCP bridge child's stdio and
// resolves with the first response line whose id matches. Hand-rolled rather than depending on
// @modelcontextprotocol/sdk's Client class: datum-mcp's stdio transport IS newline-delimited
// JSON-RPC, and this is exactly what a real MCP client (Claude Desktop, etc.) sends — this test
// only needs to prove that transport carries real tool listings end-to-end, not exercise every
// corner of the SDK's own client implementation (which has its own test suite upstream).
function sendRequest(child: ChildProcess, method: string, params: unknown, id: number): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!child.stdout || !child.stdin) {
      reject(new Error('MCP bridge child has no stdio pipes'))
      return
    }
    const rl = createInterface({ input: child.stdout })
    const timeout = setTimeout(() => {
      rl.close()
      reject(new Error(`timed out waiting for response to ${method}`))
    }, 15_000)
    rl.on('line', line => {
      let msg: any
      try {
        msg = JSON.parse(line)
      } catch {
        return // non-protocol log output on stdout — ignore
      }
      if (msg.id === id) {
        clearTimeout(timeout)
        rl.close()
        resolve(msg)
      }
    })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

describe.runIf(dockerAvailable && goAvailable)(
  'datum-cli mcp (requires Docker and a Go toolchain)',
  () => {
    it(
      'serves query/get_schema/get_status over a real MCP handshake, and tears down cleanly on SIGINT',
      async () => {
        const buildDir = mkdtempSync(path.join(tmpdir(), 'datum-server-build-'))
        const binaryPath = path.join(buildDir, 'datum-server')
        execFileSync('go', ['build', '-o', binaryPath, '.'], {
          cwd: serverDir,
          stdio: 'inherit',
          timeout: 120_000,
        })

        const cwd = mkdtempSync(path.join(tmpdir(), 'datum-mcp-integration-'))
        writeFileSync(path.join(cwd, 'datum.yaml'), 'table:\n  name: features\n', 'utf-8')

        const statePath = path.join(cwd, 'dev-state.json')
        const logFilePath = path.join(cwd, 'mcp-server.log')
        const log = (msg: string) => process.stderr.write(`[integration] ${msg}\n`)
        const postgresPort = await getFreePort()

        let mcpChild: ChildProcess | undefined

        const runPromise = runMcp({
          statePath,
          logFilePath,
          cwd,
          log,
          resolveServerBinary: () => binaryPath,
          // Real startDockerPostgres, just pinned to a free port instead of its hardcoded default
          // — see the getFreePort() comment above for why.
          startDockerPostgres: (opts = {}) => startDockerPostgres({ ...opts, port: postgresPort }),
          spawnMcpBridge: (wsUrl, opts) => {
            const args = [wsUrl, '--table', opts.table]
            if (opts.maxRows !== undefined) args.push('--max-rows', String(opts.maxRows))
            // Real npx datum-sync datum-mcp — but piped, not inherited, so this test can read
            // its stdout as an MCP client would (an inherited child here would write to the
            // test runner's own stdout, which nothing in-process can read back).
            //
            // --package= is required here, not cosmetic: `npx datum-sync datum-mcp <url> ...`
            // (without --package=) makes npx treat the literal string "datum-mcp" as the first
            // argv entry of the resolved bin, shifting the real ws:// URL out of position and
            // breaking the handshake. This mirrors the fix applied to the production
            // spawnMcpBridge in src/commands/mcp.ts — see the comment there for the full
            // explanation of npx's argv semantics.
            mcpChild = spawn('npx', ['--package=datum-sync', 'datum-mcp', ...args], { stdio: 'pipe' })
            return mcpChild
          },
          stopDockerPostgres,
        })

        try {
          const deadline = Date.now() + 60_000
          while (!mcpChild && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 200))
          }
          if (!mcpChild) throw new Error('MCP bridge child was never spawned')

          const init = await sendRequest(
            mcpChild,
            'initialize',
            { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test-client', version: '1.0.0' } },
            1
          )
          expect(init.result?.serverInfo?.name).toBe('datum')

          mcpChild.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

          const list = await sendRequest(mcpChild, 'tools/list', {}, 2)
          const toolNames = (list.result?.tools ?? []).map((t: { name: string }) => t.name)
          expect(toolNames).toEqual(expect.arrayContaining(['query', 'get_schema', 'get_status']))

          // Captured before SIGINT because runMcp's cleanup deletes statePath as part of teardown
          // — same read-before-signal ordering dev.integration.test.ts uses.
          const state = JSON.parse(readFileSync(statePath, 'utf-8')) as {
            kind: string
            containerName?: string
          }
          expect(state.kind).toBe('docker')
          const containerName = state.containerName
          expect(containerName).toBeTruthy()

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
          mcpChild?.kill()
        }
      },
      150_000
    )
  }
)
