#!/usr/bin/env bash

/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/hellojuantu/markdown-image-replacer/refs/heads/main/docker/uninstall.sh)"

echo ""

/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/hellojuantu/markdown-image-replacer/refs/heads/main/docker/install_run.sh)"
