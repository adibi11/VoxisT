#!/usr/bin/env bash

set -Eeuo pipefail

ECR_REGISTRY="${ECR_REGISTRY:-147997143638.dkr.ecr.eu-central-1.amazonaws.com}"
ECR_REPOSITORY="${ECR_REPOSITORY:-voxis/backend}"
AWS_REGION="${AWS_REGION:-eu-central-1}"
DOCKERFILE="${DOCKERFILE:-docker/api.Dockerfile}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"

for command_name in aws docker git; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is not installed: $command_name" >&2
    exit 1
  fi
done

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

image_sha="${1:-${IMAGE_SHA:-$(git rev-parse HEAD)}}"
image_sha="${image_sha,,}"

if [[ ! "$image_sha" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "SHA must contain 7 to 40 hexadecimal characters: $image_sha" >&2
  exit 1
fi

if [[ ! -f "$DOCKERFILE" ]]; then
  echo "Dockerfile not found: $DOCKERFILE" >&2
  exit 1
fi

image_tag="backend-${image_sha}"
image_uri="${ECR_REGISTRY}/${ECR_REPOSITORY}:${image_tag}"

echo "Building ${image_uri}"
docker build \
  --platform "$DOCKER_PLATFORM" \
  --file "$DOCKERFILE" \
  --tag "$image_uri" \
  .

echo "Authenticating Docker to ${ECR_REGISTRY}"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo "Pushing ${image_uri}"
docker push "$image_uri"

echo "Image ready for the ECS task definition:"
echo "$image_uri"
