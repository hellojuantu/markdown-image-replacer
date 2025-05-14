# Markdown Image Replacer

[English](README.md) | [中文](README.zh-CN.md)

一个处理 Markdown 文件中图片链接的工具，支持两种模式：
- **GitHub 模式**：上传图片到 GitHub 并更新链接
- **本地模式**：下载图片到 ZIP 压缩包

![index.png](demo/index.png)

## 功能特点
- **双模式支持**
  - GitHub 模式：上传到仓库并更新链接
  - 本地模式：下载为 ZIP 压缩包
- **图片优化**：可选的 TinyPNG 压缩
- **实时处理**：实时日志和进度
- **用户控制**：随时可取消

## 技术栈
- 前端：React + TypeScript
- 后端：Node.js + TypeScript
- 图片处理：TinyPNG API（可选）

## 快速开始

### 一键安装
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/hellojuantu/markdown-image-replacer/refs/heads/main/docker/install_run.sh)"
```

### 一键卸载
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/hellojuantu/markdown-image-replacer/refs/heads/main/docker/uninstall.sh)"
```

## 手动安装

### Docker 安装
1. 安装 Docker 和 Docker Compose
2. 克隆并运行：
   ```bash
   git clone https://github.com/hellojuantu/markdown-image-replacer.git
   cd markdown-image-replacer/docker
   echo 'APP_VERSION=0.0.1' > .env
   docker-compose up -d
   ```
3. 访问：`http://localhost:13001`

### 开发环境
1. 安装依赖：
   ```bash
   # 前端
   cd frontend && npm install
   # 后端
   cd ../backend && npm install
   ```
2. 运行服务：
   ```bash
   # 前端
   cd frontend && npm run dev
   # 后端
   cd ../backend && npm run start
   ```

## 使用指南
1. **选择模式**
   - GitHub：上传到仓库
   - 本地：下载 ZIP

2. **处理文件**
   - 上传 Markdown 文件
   - 启用压缩（可选）
   - 开始处理

3. **获取结果**
   - GitHub：复制更新后的 Markdown
   - 本地：下载 ZIP

## 配置说明

### GitHub 设置
- 用户名
- 仓库名
- 分支名
- 访问令牌（需要 repo 权限）

### 图片设置
- 启用压缩
- TinyPNG API 密钥

## 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE)