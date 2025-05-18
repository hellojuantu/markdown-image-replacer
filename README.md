# Markdown Image Replacer

⚡ A tool for replacing image links in Markdown files.

[![Build Status](https://github.com/hellojuantu/markdown-image-replacer/actions/workflows/ci-build-before-merge.yml/badge.svg)](https://github.com/hellojuantu/markdown-image-replacer/actions)
[![Docker Pulls (Backend)](https://img.shields.io/docker/pulls/barrylogen/markdown-image-replacer-backend)](https://hub.docker.com/r/barrylogen/markdown-image-replacer-backend)
[![Docker Pulls (Frontend)](https://img.shields.io/docker/pulls/barrylogen/markdown-image-replacer-frontend)](https://hub.docker.com/r/barrylogen/markdown-image-replacer-frontend)
[![License](https://img.shields.io/github/license/hellojuantu/markdown-image-replacer)](LICENSE)
[![Tech Stack: Node.js, TypeScript, React](https://img.shields.io/badge/Tech%20Stack-Node.js%2C%20TypeScript%2C%20React-blue)](#tech-stack)

English | [中文](README.zh-CN.md)

![screenshot](demo/index.png)

## Index

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Usage Guide](#usage-guide)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Dual Modes**
  - GitHub Mode: Upload to repo & update links
  - Local Mode: Download as ZIP
- **Image Optimization**: Optional TinyPNG compression

## Tech Stack

- Frontend: React + TypeScript
- Backend: Node.js + TypeScript
- Image: TinyPNG API (optional)

## Quick Start

### One-Click Installation

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/hellojuantu/markdown-image-replacer/refs/heads/main/docker/install_run.sh)"
```

Access：http://localhost:13001


### One-Click Upgrade

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/hellojuantu/markdown-image-replacer/refs/heads/main/docker/upgrade.sh)"
```

### One-Click Uninstallation

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/hellojuantu/markdown-image-replacer/refs/heads/main/docker/uninstall.sh)"
```

## Manual Setup

### Docker Installation

1. Install Docker and Docker Compose
2. Clone and run:
   ```bash
   git clone https://github.com/hellojuantu/markdown-image-replacer.git
   cd markdown-image-replacer/docker
   echo 'APP_VERSION=0.0.2' > .env
   docker compose up --build -d
   ```
3. Access: `http://localhost:13001`

### Development Setup

1. Install dependencies:
   ```bash
   # Front-end
   cd frontend && npm install
   # Back-end
   cd ../backend && npm install
   ```
2. Run servers:
   ```bash
   # Front-end
   cd frontend && npm run dev
   # Back-end
   cd ../backend && npm run start
   ```

## Usage Guide

1. **Choose Mode**
   - GitHub: Upload to repo
   - Local: Download ZIP

2. **Process File**
   - Upload Markdown file
   - Enable compression (optional)
   - Start processing

3. **Get Results**
   - GitHub: Copy updated Markdown
   - Local: Download ZIP

## Configuration

### GitHub Settings

To upload images and replace links using GitHub mode, you’ll need a GitHub repository (public or private) and an access token with the proper permissions. Below are the required fields and setup instructions.

#### Required Fields

| Field      | Description                                                   |
|------------|---------------------------------------------------------------|
| Username   | Your GitHub username (e.g., `hellojuantu`)                    |
| Repository | Name of the repo used to store images (e.g., `image-host`)    |
| Branch     | Target branch (default: `main`)                               |
| Token      | GitHub access token with `repo` permissions                   |

#### Steps to Create a Repository and Token

1. **Create a GitHub Repository**
   - Go to [https://github.com/new](https://github.com/new)
   - Enter a repository name, such as `image-host`
   - Set visibility to **Public**
   - Click **Create repository**

2. **Generate a GitHub Token**
   - Visit [https://github.com/settings/tokens](https://github.com/settings/tokens)
   - Click **"Generate new token (classic)"**
   - Select the `repo` scope (including `repo:status`, `repo_deployment`, `public_repo`, `repo:invite`)
   - Copy the generated token (**Note:** it will be shown only once, save it securely)

3. **Enter the Configuration in the Tool**
   - Fill in the following fields:
      - **Username**: your GitHub account name
      - **Repository**: the name of the repo you just created (e.g., `image-host`)
      - **Branch**: usually `main`
      - **Token**: paste the GitHub token

### Image Settings

| Field             | Description                                                                 |
|-------------------|-----------------------------------------------------------------------------|
| Enable Compression | Whether to compress images using TinyPNG                                   |
| TinyPNG API Key    | Available from the [TinyPNG Developer Page](https://tinypng.com/developers) |

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

MIT License - see [LICENSE](LICENSE)
