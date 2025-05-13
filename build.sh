#!/bin/bash
VERSION=0.0.1

docker buildx build \
  --platform linux/arm64,linux/amd64 \
  -t barrylogen/markdown-image-replacer-frontend:$VERSION \
  -f frontend/Dockerfile \
  ./frontend \
  --push

docker buildx build \
  --platform linux/arm64,linux/amd64 \
  -t barrylogen/markdown-image-replacer-backend:$VERSION \
  -f backend/Dockerfile \
  ./backend \
  --push