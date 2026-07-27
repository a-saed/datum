import { describe, it, expect } from 'vitest'
import { currentPlatformKey, resolveServerBinary } from '../src/platform.js'

describe('currentPlatformKey', () => {
  it('joins platform and arch', () => {
    expect(currentPlatformKey('linux', 'x64')).toBe('linux-x64')
    expect(currentPlatformKey('darwin', 'arm64')).toBe('darwin-arm64')
  })
})

describe('resolveServerBinary', () => {
  it('resolves the binary path for a supported platform', () => {
    const fakeResolve = (pkg: string) => `/fake/node_modules/${pkg}/package.json`
    const binPath = resolveServerBinary('linux', 'x64', fakeResolve)
    expect(binPath).toBe('/fake/node_modules/datum-server-linux-x64/bin/datum-server')
  })

  it('throws a clear error for an unsupported platform', () => {
    expect(() => resolveServerBinary('win32', 'x64')).toThrow(/Unsupported platform: win32-x64/)
  })

  it('throws a clear error when the platform package cannot be resolved', () => {
    const throwingResolve = () => { throw new Error('Cannot find module') }
    expect(() => resolveServerBinary('linux', 'x64', throwingResolve)).toThrow(/Could not find datum-server-linux-x64/)
  })
})
