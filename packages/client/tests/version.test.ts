// packages/client/tests/version.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PACKAGE_VERSION } from '../src/version.js'

describe('PACKAGE_VERSION', () => {
  it('matches the version in package.json', () => {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url))
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    expect(PACKAGE_VERSION).toBe(pkg.version)
  })
})
