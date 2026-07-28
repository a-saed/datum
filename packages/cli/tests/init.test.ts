// packages/cli/tests/init.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runInit } from '../src/commands/init.js'

describe('runInit', () => {
  it('writes a datum.yaml using the answers from the prompt function', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'datum-init-test-'))
    const answers = { tableName: 'parcels' }
    const prompt = async (question: string) => {
      if (question.toLowerCase().includes('table')) return answers.tableName
      throw new Error(`unexpected question: ${question}`)
    }

    await runInit({ cwd, prompt })

    const yaml = readFileSync(path.join(cwd, 'datum.yaml'), 'utf-8')
    expect(yaml).toContain('name: parcels')
    expect(yaml).toContain('port: 3000')
  })
})
