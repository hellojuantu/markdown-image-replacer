#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[WARN] Starting uninstallation of Markdown Image Replacer...${NC}"

containers=$(docker ps -a -q --filter "name=markdown-image-replacer")
if [[ -n "$containers" ]]; then
  echo -e "${YELLOW}[WARN] Stopping containers...${NC}"
  docker stop $containers
  echo -e "${YELLOW}[WARN] Removing containers...${NC}"
  docker rm $containers
  echo -e "${GREEN}[INFO] Containers stopped and removed.${NC}"
else
  echo -e "${YELLOW}[WARN] No Markdown Image Replacer containers found.${NC}"
fi

images=$(docker images -a -q --filter "reference=barrylogen/markdown-image-replacer*")
if [[ -n "$images" ]]; then
  echo -e "${YELLOW}[WARN] Removing images...${NC}"
  docker rmi $images
  echo -e "${GREEN}[INFO] Images removed.${NC}"
else
  echo -e "${YELLOW}[WARN] No Markdown Image Replacer images found.${NC}"
fi

echo -e "${GREEN}[INFO] Uninstallation completed!${NC}"
