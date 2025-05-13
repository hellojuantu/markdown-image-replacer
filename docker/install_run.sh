#!/bin/bash

COMPOSE_FILE_SOURCE="https://raw.githubusercontent.com/hellojuantu/markdown-image-replacer/refs/heads/main/docker/docker-compose.yml"
VERSION_FILE_SOURCE="https://raw.githubusercontent.com/hellojuantu/markdown-image-replacer/refs/heads/main/docker/version"
ENV_VERSION_VAR_NAME="APP_VERSION"

APP_NAME="markdown-image-replacer"
FRONTEND_CONTAINER_NAME="markdown-image-replacer-frontend"
BACKEND_CONTAINER_NAME="markdown-image-replacer-backend"
INSTALL_DIR="/tmp/${APP_NAME}-install-$$"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

cleanup() {
    rm -rf "${INSTALL_DIR}"
}
trap cleanup EXIT

docker_command() {
    if [[ "$(uname)" == "Linux" && $(id -u) -ne 0 ]]; then
        if ! command -v sudo &> /dev/null; then
             echo -e "${RED}[ERROR] Current user is not root, and 'sudo' command is not available. Please install sudo or run as root.${NC}"
             exit 101
        fi
        echo -e "${GREEN}Sudo privileges required for Docker command, password entry may be needed...${NC}"
        sudo docker "$@"
    else
        docker "$@"
    fi
}

docker_compose_command() {
    local final_compose_path="$1"
    shift
    local args=("$@")
    local compose_dir
    compose_dir=$(dirname "${final_compose_path}")
    local compose_file_arg="-f ${final_compose_path}"
    local project_dir_arg="--project-directory ${compose_dir}"

    if command -v docker-compose &> /dev/null; then
        pushd "${compose_dir}" > /dev/null
        if [[ "$(uname)" == "Linux" && $(id -u) -ne 0 ]]; then
             if ! command -v sudo &> /dev/null; then
                 echo -e "${RED}[ERROR] sudo not found.${NC}"
                 popd > /dev/null
                 exit 101
             fi
            echo -e "${GREEN}Sudo privileges required for docker-compose command...${NC}"
            sudo docker-compose ${compose_file_arg} "${args[@]}"
        else
            docker-compose ${compose_file_arg} "${args[@]}"
        fi
        local exit_code=$?
        popd > /dev/null
        return $exit_code
    elif docker compose version &>/dev/null; then
        if [[ "$(uname)" == "Linux" && $(id -u) -ne 0 ]]; then
             if ! command -v sudo &> /dev/null; then
                 echo -e "${RED}[ERROR] sudo not found.${NC}"
                 exit 101
             fi
            echo -e "${GREEN}Sudo privileges required for docker compose command...${NC}"
            sudo docker compose ${project_dir_arg} ${compose_file_arg} "${args[@]}"
        else
            docker compose ${project_dir_arg} ${compose_file_arg} "${args[@]}"
        fi
        return $?
    else
        echo -e "${RED}[ERROR] Cannot find docker-compose or docker compose command.${NC}"
        exit 3
    fi
}

echo -e "${GREEN}[INFO] Checking prerequisites...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[ERROR] Docker is not installed.${NC}"
    echo "Install: https://docs.docker.com/get-docker/"
    exit 1
fi
if ! command -v curl &> /dev/null; then
    echo -e "${RED}[ERROR] curl is not installed.${NC}"
    echo "Install e.g., 'sudo apt install curl' or 'sudo yum install curl'."
    exit 1
fi
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}[ERROR] Docker Compose (v1 or v2) is not installed.${NC}"
    echo "Install: https://docs.docker.com/compose/install/"
    exit 2
fi
echo -e "${GREEN}[INFO] Checking Docker daemon status...${NC}"
if ! docker_command info > /dev/null 2>&1; then
    echo -e "${RED}[ERROR] Docker daemon is not running. Please start Docker.${NC}"
    exit 3
fi
echo -e "${GREEN}[INFO] Prerequisites met.${NC}"

echo -e "\n${GREEN}[INFO] Setting up temporary directory: ${INSTALL_DIR}${NC}"
rm -rf "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}" || {
    echo -e "${RED}[ERROR] Failed to create temporary directory ${INSTALL_DIR}.${NC}"
    exit 6
}

VERSION=""
echo -e "\n${GREEN}[INFO] Processing version source: ${VERSION_FILE_SOURCE}${NC}"
if [[ "${VERSION_FILE_SOURCE}" == http://* ]] || [[ "${VERSION_FILE_SOURCE}" == https://* ]]; then
    echo -e "${GREEN}[INFO] Version source is a URL. Fetching...${NC}"
    temp_version_file="${INSTALL_DIR}/version.tmp"
    curl -fsSL "${VERSION_FILE_SOURCE}" -o "${temp_version_file}" &
    curl_pid=$!
    spin='-\|/'
    i=0
    echo -n -e "${GREEN}[INFO] Fetching... ${NC}"
    while kill -0 $curl_pid 2>/dev/null; do
        i=$(((i + 1) % 4))
        printf "\b${spin:$i:1}"
        sleep 0.1
    done
    printf "\b \b"
    echo
    wait $curl_pid
    curl_exit_status=$?
    if [ $curl_exit_status -ne 0 ]; then
        echo -e "${RED}[ERROR] Failed to fetch version from URL ${VERSION_FILE_SOURCE} (Exit status: $curl_exit_status).${NC}"
        exit 4
    fi
    if [ ! -s "${temp_version_file}" ]; then
        echo -e "${RED}[ERROR] Fetched version file from ${VERSION_FILE_SOURCE} is empty or download failed.${NC}"
        exit 4
    fi
    VERSION=$(cat "${temp_version_file}")
    echo -e "${GREEN}[INFO] Fetched version: ${VERSION}${NC}"
else
    echo -e "${GREEN}[INFO] Version source is a local path.${NC}"
    if [ ! -f "${VERSION_FILE_SOURCE}" ]; then
        echo -e "${RED}[ERROR] Version file not found at local path: ${VERSION_FILE_SOURCE}${NC}"
        exit 4
    fi
    if [ ! -s "${VERSION_FILE_SOURCE}" ]; then
        echo -e "${RED}[ERROR] Local version file ${VERSION_FILE_SOURCE} is empty.${NC}"
        exit 4
    fi
    VERSION=$(cat "${VERSION_FILE_SOURCE}")
    echo -e "${GREEN}[INFO] Read version from local file: ${VERSION}${NC}"
fi
if [ -z "$VERSION" ]; then
    echo -e "${RED}[ERROR] Failed to determine version or version is empty.${NC}"
    exit 4
fi

FINAL_COMPOSE_PATH=""
echo -e "\n${GREEN}[INFO] Processing compose file source: ${COMPOSE_FILE_SOURCE}${NC}"
if [[ "${COMPOSE_FILE_SOURCE}" == http://* ]] || [[ "${COMPOSE_FILE_SOURCE}" == https://* ]]; then
    echo -e "${GREEN}[INFO] Compose file source is a URL. Downloading to temporary directory...${NC}"
    FINAL_COMPOSE_PATH="${INSTALL_DIR}/docker-compose.yml"
    curl -fsSL -o "${FINAL_COMPOSE_PATH}" "${COMPOSE_FILE_SOURCE}"
    curl_dl_exit_status=$?
    if [ $curl_dl_exit_status -ne 0 ] || [ ! -f "${FINAL_COMPOSE_PATH}" ]; then
        echo -e "${RED}[ERROR] Failed to download docker-compose.yml from ${COMPOSE_FILE_SOURCE} (Exit status: $curl_dl_exit_status).${NC}"
        exit 8
    fi
    if [ ! -s "${FINAL_COMPOSE_PATH}" ]; then
        echo -e "${RED}[ERROR] Downloaded compose file ${FINAL_COMPOSE_PATH} is empty.${NC}"
        exit 8
    fi
    echo -e "${GREEN}[INFO] Compose file downloaded successfully to ${FINAL_COMPOSE_PATH}.${NC}"
else
    echo -e "${GREEN}[INFO] Compose file source is a local path.${NC}"
    if [ ! -f "${COMPOSE_FILE_SOURCE}" ]; then
        echo -e "${RED}[ERROR] Docker Compose file not found at local path: ${COMPOSE_FILE_SOURCE}${NC}"
        exit 8
    fi
    if [ ! -s "${COMPOSE_FILE_SOURCE}" ]; then
        echo -e "${RED}[ERROR] Local compose file ${COMPOSE_FILE_SOURCE} is empty.${NC}"
        exit 8
    fi
    FINAL_COMPOSE_PATH="${COMPOSE_FILE_SOURCE}"
    echo -e "${GREEN}[INFO] Using local compose file: ${FINAL_COMPOSE_PATH}.${NC}"
fi

COMPOSE_DIR=$(dirname "${FINAL_COMPOSE_PATH}")
ENV_FILE_PATH="${COMPOSE_DIR}/.env"
echo -e "\n${GREEN}[INFO] Creating/updating .env file at: ${ENV_FILE_PATH}${NC}"
echo "${ENV_VERSION_VAR_NAME}=${VERSION}" > "${ENV_FILE_PATH}" || {
    echo -e "${RED}[ERROR] Failed to write to .env file: ${ENV_FILE_PATH}${NC}"
    exit 11
}
echo -e "${GREEN}[INFO] Successfully wrote version to .env file.${NC}"

echo -e "${GREEN}[INFO] Checking for existing installation...${NC}"
container_exists=false
if docker_command ps -a --filter "name=${APP_NAME}" --format "{{.Names}}" | grep -q "${FRONTEND_CONTAINER_NAME}"; then
  echo -e "${RED}[WARN] Container '${FRONTEND_CONTAINER_NAME}' already exists.${NC}"; container_exists=true;
fi

if docker_command ps -a --filter "name=${APP_NAME}" --format "{{.Names}}" | grep -q "${BACKEND_CONTAINER_NAME}"; then
  echo -e "${RED}[WARN] Container '${BACKEND_CONTAINER_NAME}' already exists.${NC}"; container_exists=true;
fi

if [ "$container_exists" = true ]; then
  echo -e "${RED}[ERROR] Existing containers detected. Please remove them manually first.${NC}";
  exit 5;
fi

echo -e "\n${GREEN}[INFO] Pulling Docker images (Version: ${VERSION}) using compose file ${FINAL_COMPOSE_PATH}...${NC}"
docker_compose_command "${FINAL_COMPOSE_PATH}" pull || {
    echo -e "${RED}[ERROR] Failed to pull Docker images. Check ${FINAL_COMPOSE_PATH}, .env file, and network.${NC}"
    exit 9
}

echo -e "\n${GREEN}[INFO] Starting services using ${FINAL_COMPOSE_PATH}...${NC}"
docker_compose_command "${FINAL_COMPOSE_PATH}" up -d
compose_up_status=$?

echo ""
if [ $compose_up_status -eq 0 ]; then
    echo -e "${GREEN}[SUCCESS] Installation completed successfully!${NC}"
    echo -e "${GREEN}[SUCCESS] Services should now be running with version ${VERSION}.${NC}"
    echo -e "${GREEN}[SUCCESS] Access the Web UI at: ${GREEN}http://localhost:13001${NC}"
else
    echo -e "${RED}[ERROR] Service startup failed (Exit status: $compose_up_status).${NC}"
    echo -e "${RED}[INFO] Attempting to show logs...${NC}"
    docker_compose_command "${FINAL_COMPOSE_PATH}" logs
    echo -e "${RED}Please check the logs above for error details.${NC}"
    exit 10
fi

exit 0
