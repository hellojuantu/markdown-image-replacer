#!/bin/bash

# Set color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting uninstallation of Markdown Image Replacer...${NC}"

# Stop and remove containers
echo -e "${YELLOW}Stopping and removing containers...${NC}"
docker stop $(docker ps -a | grep markdown-image-replacer | awk '{print $1}')
docker rm $(docker ps -a | grep markdown-image-replacer | awk '{print $1}')
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Containers stopped and removed${NC}"
else
    echo -e "${RED}Error stopping containers${NC}"
fi

# Remove related images
echo -e "${YELLOW}Removing images...${NC}"
docker rmi $(docker images | grep markdown-image-replacer | awk '{print $3}')
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Images removed${NC}"
else
    echo -e "${RED}Error removing images${NC}"
fi

echo -e "${GREEN}Uninstallation completed!${NC}"