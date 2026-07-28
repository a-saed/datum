#!/bin/bash
set -e

BUMP=${1:-patch}

cd packages/cli
npm version $BUMP --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")
cd ../..

# Pin the four platform packages' optionalDependencies to the same version — CI's
# cross-compile-server job publishes them at exactly this version.
node -e "
  const fs = require('fs')
  const path = 'packages/cli/package.json'
  const pkg = JSON.parse(fs.readFileSync(path, 'utf-8'))
  for (const name of Object.keys(pkg.optionalDependencies || {})) {
    pkg.optionalDependencies[name] = '$VERSION'
  }
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n')
"

npm install

git add packages/cli/package.json package-lock.json
git commit -m "release: datum-cli $VERSION"
git push origin main

echo "✓ datum-cli@$VERSION committed and pushed — CI will publish it"
