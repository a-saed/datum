// packages/cli/tests/server.test.ts
import { describe, it, expect } from 'vitest'
import { spawn as realSpawn } from 'node:child_process'
import { spawnServerBinary } from '../src/server.js'

describe('spawnServerBinary', () => {
  it('spawns the binary with the given env and streams stdout', async () => {
    // Inject a fake `spawn` that swaps in `node -e '...'` as a stand-in binary, so the test
    // needs no compiled Go binary. It still calls the real Node spawn — only the command/args
    // are substituted — so this exercises spawnServerBinary's real env-merging and stdio wiring
    // through the same `opts.spawn` seam real callers use for testability, with no test-only
    // parameter added to the production signature.
    const fakeSpawn: typeof realSpawn = ((_cmd: string, _args: string[], spawnOpts: unknown) =>
      realSpawn(process.execPath, ['-e', 'console.log("PORT=" + process.env.FOO)'], spawnOpts as never)) as typeof realSpawn

    const child = spawnServerBinary(process.execPath, { FOO: 'bar' }, { spawn: fakeSpawn })

    const output = await new Promise<string>((resolve, reject) => {
      let data = ''
      child.stdout?.on('data', chunk => { data += chunk })
      child.on('error', reject)
      child.on('close', () => resolve(data))
    })

    expect(output.trim()).toBe('PORT=bar')
  })
})
