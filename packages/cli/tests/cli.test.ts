// packages/cli/tests/cli.test.ts
import { describe, it, expect } from 'vitest'
import { parseCommand } from '../src/cli.js'

describe('parseCommand', () => {
  it('recognizes dev, stop, and init', () => {
    expect(parseCommand(['dev'])).toEqual({ command: 'dev', databaseUrl: undefined })
    expect(parseCommand(['stop'])).toEqual({ command: 'stop' })
    expect(parseCommand(['init'])).toEqual({ command: 'init' })
  })

  it('captures --db for dev', () => {
    expect(parseCommand(['dev', '--db', 'postgres://x'])).toEqual({
      command: 'dev',
      databaseUrl: 'postgres://x',
    })
  })

  it('returns unknown for anything else', () => {
    expect(parseCommand([])).toEqual({ command: 'unknown' })
    expect(parseCommand(['bogus'])).toEqual({ command: 'unknown' })
  })
})
