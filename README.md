# Markdown 图片链接替换工具

![index.png](./images/index.png)

这是一个用于处理 Markdown 文件中图片链接的工具，支持两种模式：
- GitHub 模式：将图片上传到 GitHub 仓库并更新 Markdown 中的链接
- 本地模式：下载包含图片的 ZIP 文件

## 功能特点

- 支持 GitHub 和本地两种处理模式
- 自动处理 Markdown 中的图片链接
- 支持图片压缩（使用 TinyPNG API）
- 实时显示处理日志
- 支持查看和复制处理结果
- 支持取消正在进行的处理

## 技术栈

- 前端：React + TypeScript
- 后端：Node.js + TypeScript
- 图片处理：TinyPNG API（可选）

## 使用 Docker 运行

1. 确保已安装 Docker 和 Docker Compose

2. 克隆仓库：
```bash
git clone <repository-url>
cd markdown-image-replacer
```

3. 使用 Docker Compose 启动服务：
```bash
docker-compose up -d
```

4. 访问应用：
- 前端界面：http://localhost
- 后端 API：http://localhost:3000

5. 查看日志：
```bash
# 查看所有服务的日志
docker-compose logs -f

# 查看特定服务的日志
docker-compose logs -f frontend
docker-compose logs -f backend
```

6. 停止服务：
```bash
docker-compose down
```

## 开发环境设置

1. 安装依赖：
```bash
# 前端依赖
cd frontend
npm install

# 后端依赖
cd ../backend
npm install
```

2. 启动开发服务器：
```bash
# 前端开发服务器
cd frontend
npm run dev

# 后端开发服务器
cd ../backend
npm run dev
```

## 使用说明

1. 选择处理模式：
   - GitHub 模式：需要配置 GitHub 仓库信息
   - 本地模式：直接下载 ZIP 文件

2. 上传 Markdown 文件：
   - 支持 .md 格式
   - 文件中的图片链接会被自动处理

3. 处理选项：
   - 可选择是否启用图片压缩
   - 压缩需要配置 TinyPNG API Key

4. 查看结果：
   - GitHub 模式：可以直接查看和复制处理后的内容
   - 本地模式：自动下载包含所有文件的 ZIP 包

## 配置说明

### GitHub 配置
- 用户名：GitHub 账号名
- 仓库名：目标仓库名称
- 分支名：目标分支名称
- Access Token：需要 repo 权限的 Personal Access Token

### 图片压缩配置
- 启用压缩：需要 TinyPNG API Key
- API Key：从 TinyPNG 官网获取

## 注意事项

1. GitHub 模式需要有效的仓库访问权限
2. 图片压缩功能需要有效的 TinyPNG API Key
3. 大文件处理可能需要较长时间
4. 建议定期备份原始文件

## 许可证

MIT License 