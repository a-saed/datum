// packages/client/src/version.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url))
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string }

export const PACKAGE_VERSION = pkg.version
