# Markdown Image Replacer

[English](README.md) | [中文](README.zh-CN.md)

A tool that processes image links in Markdown files with two modes:
- **GitHub Mode**: Upload images to GitHub and update links
- **Local Mode**: Download images in a ZIP archive

![index.png](demo/index.png)

## Features
- **Dual Modes**
  - GitHub Mode: Upload to repo & update links
  - Local Mode: Download as ZIP
- **Image Optimization**: Optional TinyPNG compression
- **Real-time Processing**: Live logs & progress
- **User Control**: Cancel anytime

## Tech Stack
- Frontend: React + TypeScript
- Backend: Node.js + TypeScript
- Image: TinyPNG API (optional)

## Quick Start

### One-Click Installation
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/hellojuantu/markdown-image-replacer/refs/heads/main/docker/install_run.sh)"
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
   echo 'APP_VERSION=0.0.1' > .env
   docker-compose up -d
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
- Username
- Repository
- Branch
- Access Token (repo scope)

### Image Settings
- Enable compression
- TinyPNG API key

## License

MIT License - see [LICENSE](LICENSE)