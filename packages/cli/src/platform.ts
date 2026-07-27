import { createRequire } from 'node:module'
import path from 'node:path'

const PLATFORM_PACKAGES: Record<string, string> = {
  'linux-x64': 'datum-server-linux-x64',
  'linux-arm64': 'datum-server-linux-arm64',
  'darwin-x64': 'datum-server-darwin-x64',
  'darwin-arm64': 'datum-server-darwin-arm64',
}

const require_ = createRequire(import.meta.url)

function defaultResolvePackageJson(pkg: string): string {
  return require_.resolve(`${pkg}/package.json`)
}

export function currentPlatformKey(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string {
  return `${platform}-${arch}`
}

export function resolveServerBinary(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  resolvePackageJson: (pkg: string) => string = defaultResolvePackageJson
): string {
  const key = currentPlatformKey(platform, arch)
  const packageName = PLATFORM_PACKAGES[key]
  if (!packageName) {
    throw new Error(
      `Unsupported platform: ${key}. datum-cli supports: ${Object.keys(PLATFORM_PACKAGES).join(', ')}`
    )
  }

  let packageJsonPath: string
  try {
    packageJsonPath = resolvePackageJson(packageName)
  } catch {
    throw new Error(`Could not find ${packageName}. Try reinstalling: npm install datum-cli`)
  }

  return path.join(path.dirname(packageJsonPath), 'bin', 'datum-server')
}
