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

  it('parses mcp with no flags', () => {
    expect(parseCommand(['mcp'])).toEqual({
      command: 'mcp',
      databaseUrl: undefined,
      table: undefined,
      allowWrites: false,
      jwt: undefined,
      bbox: undefined,
      maxRows: undefined,
    })
  })

  it('parses mcp with all its flags', () => {
    expect(
      parseCommand([
        'mcp', '--table', 'parcels', '--allow-writes', '--jwt', 'tok', '--bbox', '-1,-1,1,1', '--max-rows', '500',
      ])
    ).toEqual({
      command: 'mcp',
      databaseUrl: undefined,
      table: 'parcels',
      allowWrites: true,
      jwt: 'tok',
      bbox: '-1,-1,1,1',
      maxRows: 500,
    })
  })

  it('flags mcp flags with no value, or a value that looks like another flag, as invalid', () => {
    expect(parseCommand(['mcp', '--db'])).toEqual({ command: 'mcp-invalid-flag', flag: '--db' })
    expect(parseCommand(['mcp', '--db', '--allow-writes'])).toEqual({
      command: 'mcp-invalid-flag',
      flag: '--db',
    })
    expect(parseCommand(['mcp', '--table'])).toEqual({ command: 'mcp-invalid-flag', flag: '--table' })
    expect(parseCommand(['mcp', '--table', '--allow-writes'])).toEqual({
      command: 'mcp-invalid-flag',
      flag: '--table',
    })
    expect(parseCommand(['mcp', '--jwt'])).toEqual({ command: 'mcp-invalid-flag', flag: '--jwt' })
    expect(parseCommand(['mcp', '--jwt', '--bbox'])).toEqual({
      command: 'mcp-invalid-flag',
      flag: '--jwt',
    })
    expect(parseCommand(['mcp', '--bbox'])).toEqual({ command: 'mcp-invalid-flag', flag: '--bbox' })
    expect(parseCommand(['mcp', '--bbox', '--max-rows', '10'])).toEqual({
      command: 'mcp-invalid-flag',
      flag: '--bbox',
    })
    expect(parseCommand(['mcp', '--max-rows'])).toEqual({ command: 'mcp-invalid-flag', flag: '--max-rows' })
    expect(parseCommand(['mcp', '--max-rows', '--table', 'parcels'])).toEqual({
      command: 'mcp-invalid-flag',
      flag: '--max-rows',
    })
  })

  it('flags a non-numeric --max-rows value as invalid instead of producing NaN', () => {
    expect(parseCommand(['mcp', '--max-rows', 'abc'])).toEqual({
      command: 'mcp-invalid-flag',
      flag: '--max-rows',
    })
    expect(parseCommand(['mcp', '--max-rows', '-5'])).toEqual({
      command: 'mcp-invalid-flag',
      flag: '--max-rows',
    })
  })
})
