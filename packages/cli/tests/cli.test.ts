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

  it('recognizes --help and --version', () => {
    expect(parseCommand(['--help'])).toEqual({ command: 'help' })
    expect(parseCommand(['-h'])).toEqual({ command: 'help' })
    expect(parseCommand(['help'])).toEqual({ command: 'help' })
    expect(parseCommand(['--version'])).toEqual({ command: 'version' })
    expect(parseCommand(['-v'])).toEqual({ command: 'version' })
  })

  it('flags --db with no value as invalid instead of silently unsetting it', () => {
    expect(parseCommand(['dev', '--db'])).toEqual({ command: 'dev-invalid-db' })
    expect(parseCommand(['dev', '--db', '--other-flag'])).toEqual({ command: 'dev-invalid-db' })
  })
})
