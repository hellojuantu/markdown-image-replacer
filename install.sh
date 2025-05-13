#!/bin/bash

# Set version
VERSION=${1:-"0.0.1"}

# Set color output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    echo "Please install Docker Compose first: https://docs.docker.com/compose/install/"
    exit 1
fi

# Create temporary directory
TEMP_DIR=$(mktemp -d)
cd $TEMP_DIR

echo -e "${GREEN}Downloading configuration files...${NC}"
echo -e "${GREEN}Using version: ${VERSION}${NC}"

# Create docker-compose.yml
cat > docker-compose.yml << EOL
version: '3.8'

services:
  frontend:
    image: barrylogen/markdown-image-replacer-frontend:${VERSION}
    ports:
      - "13001:3001"
    depends_on:
      - backend
    networks:
      - app-network

  backend:
    image: barrylogen/markdown-image-replacer-backend:${VERSION}
    environment:
      - NODE_ENV=production
      - PORT=3000
      - LOG_LEVEL=info
      - LOG_DIR=/app/logs
      - LOCAL_EXPORT_BASE_DIR=/app/temp/md_img_export
      - IMAGE_DOWNLOAD_DELAY_MS=500
      - FRONTEND_URL=http://localhost
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
EOL

echo -e "${GREEN}Pulling Docker images...${NC}"

# Pull latest images
docker-compose pull

echo -e "${GREEN}Starting services...${NC}"

# Start services
docker-compose up -d

# Check service status
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Installation completed!${NC}"
    echo -e "Services are now running and accessible at:"
    echo -e "Web UI: http://localhost:13001"
else
    echo -e "${RED}Service startup failed, checking logs...${NC}"
    docker-compose logs
fi

# Clean up temporary directory
cd - > /dev/null
rm -rf $TEMP_DIR 