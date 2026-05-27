#!/bin/bash
set -e

VERSION=${1:-latest}
IMAGE="ghcr.io/a-saed/datum-server"

docker build -f packages/server/Dockerfile -t $IMAGE:$VERSION -t $IMAGE:latest .
docker push $IMAGE:$VERSION
docker push $IMAGE:latest
echo "✓ $IMAGE:$VERSION pushed"
