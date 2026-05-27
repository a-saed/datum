#!/bin/bash
set -e

BUMP=${1:-patch}

cd packages/client
npm version $BUMP
cd ../..

npm run build -w datum-sync
cd packages/client
npm publish --access public
cd ../..

git push origin main --tags
echo "✓ datum-sync@$(node -p "require('./packages/client/package.json').version") published"
