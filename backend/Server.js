import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import simpleGit from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import crypto from 'crypto';
import winston from 'winston';
import cors from 'cors';
import {processImageWithBorder} from "./ProcessImageWithBorder.js";

dotenv.config();

const DEFAULT_TEMP_DIR_BASE = os.tmpdir();
const localExportBaseDir = path.resolve(process.env.LOCAL_EXPORT_BASE_DIR || path.join(DEFAULT_TEMP_DIR_BASE, 'md-img-export'));
const multerUploadTempDir = path.resolve(process.env.MULTER_UPLOAD_TEMP_DIR || path.join(DEFAULT_TEMP_DIR_BASE, 'md-uploads'));
const IMAGE_DOWNLOAD_DELAY_MS = parseInt(process.env.IMAGE_DOWNLOAD_DELAY_MS || "200", 10);
const PORT = process.env.PORT || 3002;

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json()
  ),
  defaultMeta: { service: 'markdown-image-replacer' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message} ${info.stack ? '\n' + info.stack : ''}`)
      )
    }),
    new winston.transports.File({ filename: path.join(process.env.LOG_DIR || 'logs', 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(process.env.LOG_DIR || 'logs', 'combined.log') })
  ],
  exceptionHandlers: [new winston.transports.File({ filename: path.join(process.env.LOG_DIR || 'logs', 'exceptions.log') })],
  rejectionHandlers: [new winston.transports.File({ filename: path.join(process.env.LOG_DIR || 'logs', 'rejections.log') })]
});

const initializeDirectories = () => {
  try {
    fs.ensureDirSync(localExportBaseDir);
    fs.emptyDirSync(localExportBaseDir);
    fs.ensureDirSync(multerUploadTempDir);
    logger.info(`目录初始化完成: ${localExportBaseDir}, ${multerUploadTempDir}`);
  } catch (e) {
    logger.error(`目录初始化错误: ${e.message}`, { stack: e.stack });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, multerUploadTempDir),
  filename: (req, file, cb) => {
    const buffer = Buffer.from(file.originalname, 'binary');
    const decodedName = buffer.toString('utf8');
    const ext = path.extname(decodedName);
    const base = path.basename(decodedName, ext).replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${base}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage });
const app = express();
const activeOperations = new Map();

const allowedOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173', process.env.FRONTEND_URL].filter(Boolean);
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS: 拒绝来源: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post('/api/cancel-operation', (req, res) => {
  const { operationId } = req.query;
  if (!operationId) {
    logger.warn(`[cancel-op] Bad request: Missing operationId`);
    return res.status(400).send('Missing operationId');
  }
  const controller = activeOperations.get(operationId);
  if (controller) {
    controller.abort();
    logger.info(`[cancel-op] Operation ${operationId} marked as cancelled by client request.`);
    activeOperations.delete(operationId);
    res.status(200).send({ message: 'Cancellation request received.' });
  } else {
    logger.warn(`[cancel-op] Operation ${operationId} not found or already completed.`);
    res.status(404).send({ message: 'Operation not found or already completed.' });
  }
});

const cleanupResources = async (operationId, currentTmpDirForGithub, activeSessionIdForLocal, forceCleanup = false) => {
  try {
    const cleanupPromises = [];

    if (currentTmpDirForGithub) {
      cleanupPromises.push(
        fs.remove(currentTmpDirForGithub)
          .then(() => logger.info(`[${operationId}] GitHub 临时目录已清理: ${path.basename(currentTmpDirForGithub)}`))
          .catch(e => logger.error(`[${operationId}] 清理 GitHub 临时目录失败: ${e.message}`))
      );
    }

    if (activeSessionIdForLocal && (forceCleanup || !activeSessionIdForLocal.startsWith('local-'))) {
      const sessionDir = path.join(localExportBaseDir, activeSessionIdForLocal);
      cleanupPromises.push(
        fs.remove(sessionDir)
          .then(() => logger.info(`[${operationId}] 本地会话目录已清理: ${activeSessionIdForLocal}`))
          .catch(e => logger.error(`[${operationId}] 清理本地会话目录失败: ${e.message}`))
      );
    }

    await Promise.all(cleanupPromises);
  } catch (error) {
    logger.error(`[${operationId}] 清理资源时发生错误: ${error.message}`, { stack: error.stack });
  }
};

app.post('/api/replace', upload.single('file'), async (req, res) => {
  const { processingMode, userId, operationId: clientOperationId } = req.body;
  const operationId = clientOperationId || `op-fallback-${Date.now()}`;

  const controller = new AbortController();
  activeOperations.set(operationId, controller);
  logger.info(`[${operationId}] 新请求. 模式: ${processingMode}, 用户ID: ${userId}`);

  let clientDisconnected = false;
  let currentTmpDirForGithub = null;
  let activeSessionIdForLocal = null;

  const sendSse = (type, data) => {
    if (clientDisconnected || res.writableEnded || controller.signal.aborted) return;
    const message = typeof data === 'string' ? { message: data } : data;
    try {
      res.write(`data: ${JSON.stringify({ type, ...message })}\n\n`);
    } catch (error) {
      logger.error(`[${operationId}] SSE 发送错误: ${error.message}`);
      clientDisconnected = true;
      if (!controller.signal.aborted) controller.abort();
    }
  };

  const logSse = (msg) => {
    logger.info(`[${operationId}] ${msg}`);
    sendSse('log', msg);
  };

  const errorSse = (msg, shouldEnd = false) => {
    logger.error(`[${operationId}] ${msg}`);
    sendSse('error', { message: msg });
    if (shouldEnd && !res.writableEnded && !clientDisconnected) res.end();
  };

  const abortSseAndEnd = (msg) => {
    logger.warn(`[${operationId}] 中止并结束: ${msg}`);
    sendSse('aborted', { message: msg });
    if (!res.writableEnded && !clientDisconnected) res.end();
    activeOperations.delete(operationId);
  };

  req.on('close', async () => {
    if (clientDisconnected) return;

    clientDisconnected = true;
    if (!controller.signal.aborted) controller.abort();

    logger.warn(`[${operationId}] 客户端断开连接`);
    logSse('⚠️ 客户端连接已断开');

    await cleanupResources(operationId, currentTmpDirForGithub, null);

    if (!res.writableEnded) abortSseAndEnd('🛑 后端因客户端断开而中止');
    activeOperations.delete(operationId);
  });

  res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();

  await Promise.race([
    (async () => {
      const { username, repo, branch, token, enableCompression, tinifyKey } = req.body;
      const file = req.file;
      const fileName = file?.filename || 'document.md';
      logSse(`📥 收到文件: '${fileName}'`);

      if (!file || !file.path || !fs.existsSync(file.path)) {
        errorSse('❌ 上传的文件无效。', true); return;
      }
      let content = await fs.readFile(file.path, 'utf-8');
      await fs.remove(file.path);

      const imageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
      const matches = Array.from(content.matchAll(imageRegex));
      logSse(`🔍 发现 ${matches.length} 张图片`);

      const imagesToProcess = [];
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const altText = match[1];
        const originalUrl = match[2];
        let ext = '.png';
        try {
          const parsedUrl = new URL(originalUrl);
          const pathnameExt = path.extname(parsedUrl.pathname);
          if (pathnameExt && pathnameExt.length > 1) {
            ext = pathnameExt.split('?')[0].split('#')[0];
          }
        } catch (e) {
          logSse(`⚠️ 解析URL扩展名失败: '${originalUrl}'`);
        }
        const safeAltText = altText.substring(0, 30).replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_') || 'image';
        const baseFilename = `img_${safeAltText}_${Date.now()}_${i + 1}`;
        imagesToProcess.push({
          originalUrl,
          altText,
          filenameWithExt: `${baseFilename}${ext}`,
          newRelativePath: `images/${baseFilename}${ext}`
        });
      }

      if (processingMode === 'local') {
        activeSessionIdForLocal = crypto.randomUUID();
        const sessionImagesDir = path.join(localExportBaseDir, activeSessionIdForLocal, 'images');
        await fs.ensureDir(sessionImagesDir);
        logSse(`🏠 本地模式: 会话 ${activeSessionIdForLocal} 初始化`);

        const processedImageFiles = [];
        for (const img of imagesToProcess) {
          const localImagePath = path.join(sessionImagesDir, img.filenameWithExt);
          logSse(`⏳ [本地] 处理: ${img.filenameWithExt}`);
          try {
            const response = await fetch(img.originalUrl, { signal: controller.signal, timeout: 45000 });
            if (!response.ok) {
              logSse(`❌ 下载 ${img.filenameWithExt} 失败 (${response.status})`);
              continue;
            }

            let imageBuffer = Buffer.from(await response.arrayBuffer());
            logSse(`📥 图片下载成功: ${img.filenameWithExt}`);

            imageBuffer = await processImageWithBorder(imageBuffer, enableCompression === 'true', tinifyKey, logSse);
            await fs.writeFile(localImagePath, imageBuffer);
            logSse(`💾 图片已保存: ${img.filenameWithExt}`);

            content = content.replace(img.originalUrl, img.newRelativePath);
            processedImageFiles.push({ filename: img.filenameWithExt, pathInZip: img.newRelativePath });

            if (IMAGE_DOWNLOAD_DELAY_MS > 0) {
              logSse(`⏱️ 等待 ${IMAGE_DOWNLOAD_DELAY_MS}ms...`);
              await new Promise(resolve => setTimeout(resolve, IMAGE_DOWNLOAD_DELAY_MS));
            }
          } catch (e) {
            if (e.message === 'CLIENT_ABORTED') throw e;
            logSse(`❌ 处理 ${img.filenameWithExt} 错误: ${e.message}`);
            logger.error(`[${operationId}] Error processing local image ${img.filenameWithExt}: ${e.message}`, { stack: e.stack });
          }
        }

        sendSse('localProcessingComplete', {
          content,
          imageFiles: processedImageFiles,
          sessionId: activeSessionIdForLocal,
          zipFilename: `${fileName.replace(/\.[^/.]+$/, "")}_local.zip`,
          markdownFilename: fileName
        });
      } else {
        if (!username || !repo || !token) {
          errorSse('❌ GitHub模式缺少参数', true);
          return;
        }

        currentTmpDirForGithub = await fs.mkdtemp(path.join(DEFAULT_TEMP_DIR_BASE, `md-gh-clone-${operationId}-`));
        logSse(`📁 GitHub模式: 克隆目录: ${path.basename(currentTmpDirForGithub)}`);

        const git = simpleGit({ baseDir: currentTmpDirForGithub, trimmed: false });
        try {
          await git.clone(`https://${token}@github.com/${username}/${repo}.git`, currentTmpDirForGithub, [
            '--branch', branch,
            '--single-branch',
            '--depth', '1'
          ]);
          logSse(`✅ 成功克隆分支 '${branch}'`);
        } catch (cloneError) {
          logger.warn(`[${operationId}] 浅克隆失败，尝试完整克隆: ${cloneError.message}`);
          logSse(`⚠️ 克隆分支 '${branch}' 失败，尝试完整克隆...`);
          try {
            await fs.emptyDir(currentTmpDirForGithub);
            await simpleGit().clone(`https://${token}@github.com/${username}/${repo}.git`, currentTmpDirForGithub);
            await simpleGit(currentTmpDirForGithub).checkout(branch);
            logSse(`✅ 完整克隆并切换到分支 '${branch}'`);
          } catch (fullCloneError) {
            logger.error(`[${operationId}] 完整克隆也失败: ${fullCloneError.message}`);
            errorSse('❌ GitHub 仓库克隆失败，请检查仓库地址和权限', true);
            return;
          }
        }

        const repoImageDir = path.join(currentTmpDirForGithub, 'images');
        try {
          await fs.ensureDir(repoImageDir);
          await fs.emptyDir(repoImageDir);
          logSse('🧹 已清空目标图片目录');

          const repoGit = simpleGit(currentTmpDirForGithub);
          await repoGit.add('images/.');
          await repoGit.commit('清空图片目录');
          await repoGit.push('origin', branch);
          logSse('📤 已提交清空操作');
        } catch (gitError) {
          logger.error(`[${operationId}] Git 操作失败: ${gitError.message}`);
          errorSse('❌ Git 操作失败，请检查权限和网络', true);
          return;
        }

        const githubRawPrefix = `https://raw.githubusercontent.com/${username}/${repo}/${branch}/images/`;
        let imagesUploadedCount = 0;

        for (const img of imagesToProcess) {
          logSse(`⏳ [GitHub] 处理: ${img.filenameWithExt}`);
          try {
            const response = await fetch(img.originalUrl, { signal: controller.signal, timeout: 45000 });
            if (!response.ok) {
              logSse(`❌ 下载 ${img.filenameWithExt} 失败 (${response.status})`);
              continue;
            }

            let imageBuffer = Buffer.from(await response.arrayBuffer());
            logSse(`📥 图片下载成功: ${img.filenameWithExt}`);

            imageBuffer = await processImageWithBorder(imageBuffer, enableCompression === 'true', tinifyKey, logSse);
            await fs.writeFile(path.join(repoImageDir, img.filenameWithExt), imageBuffer);
            logSse(`💾 图片已保存到克隆仓库: images/${img.filenameWithExt}`);

            content = content.replace(img.originalUrl, githubRawPrefix + img.filenameWithExt);
            imagesUploadedCount++;

            if (IMAGE_DOWNLOAD_DELAY_MS > 0) {
              logSse(`⏱️ 等待 ${IMAGE_DOWNLOAD_DELAY_MS}ms...`);
              await new Promise(resolve => setTimeout(resolve, IMAGE_DOWNLOAD_DELAY_MS));
            }
          } catch (e) {
            if (e.message === 'CLIENT_ABORTED') throw e;
            logSse(`❌ 处理 ${img.filenameWithExt} 错误: ${e.message}`);
            logger.error(`[${operationId}] Error processing GitHub image ${img.filenameWithExt}: ${e.message}`, { stack: e.stack });
          }
        }

        if (imagesUploadedCount > 0) {
          try {
            logSse(`📤 准备提交 ${imagesUploadedCount} 张图片到 Git...`);
            const repoGit = simpleGit(currentTmpDirForGithub);
            await repoGit.add('images/.');
            const gitStatus = await repoGit.status();

            if (gitStatus.files.length > 0) {
              await repoGit.commit(`Upload/update ${imagesUploadedCount} images via tool`);
              logSse(`📦 Git Commit 完成`);
              logSse('🚀 Git Push 中...');
              await repoGit.push('origin', branch);
              logSse('✅ Git Push 成功!');
            } else {
              logSse('ℹ️ Git: 无文件更改需提交');
            }
          } catch (gitError) {
            logger.error(`[${operationId}] 提交图片失败: ${gitError.message}`);
            errorSse('❌ 提交图片到 Git 失败，请检查权限和网络', true);
            return;
          }
        } else if (imagesToProcess.length > 0) {
          logSse('⚠️ 未成功处理任何图片，不执行 Git 操作');
        }

        sendSse('githubProcessingDone', { content });
      }
      logSse(`[${operationId}] ✅ 服务端处理流程成功结束。`);
    })(),
    new Promise((_, reject) => {
      controller.signal.addEventListener('abort', async () => {
        await cleanupResources(operationId, currentTmpDirForGithub, null);
        reject(new Error('CLIENT_ABORTED'));
      });
    })
  ])
    .then(() => {
      // no-op: completed successfully
      logSse(`[${operationId}] ✅ 服务端处理流程成功结束。`);
    })
    .catch(err => {
      logger.error(`[${operationId}] 💥 主处理错误: ${err.message}`, { stack: err.stack });
      if (err.message === 'CLIENT_ABORTED') {
        logger.info(`[${operationId}] 主处理循环捕获到 CLIENT_ABORTED`);
        return;
      }
      if (!res.writableEnded) {
        errorSse(`❌ 服务端意外错误: ${err.message || '未知错误'}`, true);
      }
      throw err;
    })
    .finally(async () => {
      try {
        await cleanupResources(operationId, currentTmpDirForGithub, null);

        if (!res.writableEnded && !clientDisconnected && !controller.signal.aborted) {
          logger.info(`[${operationId}] 响应未结束且未中止，正在结束响应`);
          res.end();
        } else if (clientDisconnected && !res.writableEnded) {
          logger.info(`[${operationId}] 客户端已断开但响应未结束，等待 close 事件处理`);
        } else if (controller.signal.aborted && !res.writableEnded) {
          logger.info(`[${operationId}] 操作已取消但响应未结束，等待 close 或取消处理`);
        }

        activeOperations.delete(operationId);
        logger.info(`[${operationId}] 后端请求处理完成`);
      } catch (cleanupError) {
        logger.error(`[${operationId}] 清理过程出错: ${cleanupError.message}`, { stack: cleanupError.stack });
      }
    });
});

app.get('/api/temp-image', async (req, res) => {
  const { sessionId, filename } = req.query;
  const opId = `img-req-${sessionId ? sessionId.substring(0,8) : 'anon'}-${Date.now()}`;
  logger.info(`[${opId}] GET /api/temp-image: sessionId=${sessionId}, filename=${filename}`);

  if (!sessionId || !filename || typeof sessionId !== 'string' || typeof filename !== 'string') {
    logger.error(`[${opId}] 无效请求: 缺少 sessionId 或 filename`);
    return res.status(400).send('Missing sessionId or filename.');
  }

  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || !safeFilename.match(/^img_[\w-]+_[\d]+_[\d]+\.(png|jpe?g|gif|webp|svg)$/i)) {
    logger.error(`[${opId}] 无效请求: 文件名格式无效: '${filename}'`);
    return res.status(400).send('Invalid filename format.');
  }

  const imagePath = path.join(localExportBaseDir, sessionId, 'images', safeFilename);
  const resolvedImagePath = path.resolve(imagePath);
  const expectedBase = path.resolve(path.join(localExportBaseDir, sessionId, 'images'));

  if (!resolvedImagePath.startsWith(expectedBase)) {
    logger.error(`[${opId}] 路径遍历尝试被拒绝: '${resolvedImagePath}'`);
    return res.status(403).send('Access to path denied.');
  }

  try {
    if (await fs.pathExists(resolvedImagePath)) {
      const stats = await fs.stat(resolvedImagePath);
      if (!stats.isFile()) {
        logger.error(`[${opId}] 错误: 路径不是文件: ${resolvedImagePath}`);
        return res.status(404).send('Resource is not a file.');
      }

      logger.info(`[${opId}] 文件找到: ${resolvedImagePath}, 大小: ${stats.size} bytes`);
      const ext = path.extname(safeFilename).toLowerCase();
      const contentType = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml'
      }[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.sendFile(resolvedImagePath, (err) => {
        if (err) {
          logger.error(`[${opId}] 发送文件错误: ${err.message}`, { stack: err.stack });
          if (!res.headersSent) {
            res.status(err.status || 500).send('Error sending file');
          }
        } else {
          logger.info(`[${opId}] 成功发送文件: ${resolvedImagePath}`);
        }
      });
    } else {
      logger.error(`[${opId}] 图片未找到: ${resolvedImagePath}`);
      res.status(404).send('Image not found.');
    }
  } catch (error) {
    logger.error(`[${opId}] 处理图片请求错误: ${error.message}`, { stack: error.stack });
    if (!res.headersSent) {
      res.status(500).send('Internal server error while serving image.');
    }
  }
});

app.post('/api/cleanup-temp-session', async (req, res) => {
  const { sessionId, operationId: clientOpId } = req.query;
  const opId = clientOpId || `cleanup-fallback-${sessionId ? sessionId.substring(0,8) : 'anon'}-${Date.now()}`;
  logger.info(`[${opId}] POST /api/cleanup-temp-session: sessionId=${sessionId}`);
  if (!sessionId || typeof sessionId !== 'string') {
    logger.error(`[${opId}] 无效请求: 缺少 sessionId。`);
    return res.status(400).send('Missing sessionId.');
  }
  const sessionDir = path.join(localExportBaseDir, sessionId);
  const resolvedSessionDir = path.resolve(sessionDir);
  const resolvedBaseDir = path.resolve(localExportBaseDir);
  if (!resolvedSessionDir.startsWith(resolvedBaseDir) || resolvedSessionDir === resolvedBaseDir) {
    logger.error(`[${opId}] 无效的会话路径用于清理: '${sessionDir}'. 解析后: '${resolvedSessionDir}'`);
    return res.status(400).send('Invalid session path for cleanup.');
  }
  logger.info(`[${opId}] 尝试清理会话目录: ${resolvedSessionDir}`);
  try {
    if (await fs.pathExists(resolvedSessionDir)) {
      await fs.remove(resolvedSessionDir);
      logger.info(`[${opId}] 成功清理会话目录: ${resolvedSessionDir}`);
      res.status(200).send({ message: 'Session cleaned up successfully.' });
    } else {
      logger.info(`[${opId}] 会话目录未找到，无法清理: ${resolvedSessionDir}`);
      res.status(404).send({ message: 'Session directory not found.' });
    }
  } catch (error) {
    logger.error(`[${opId}] 清理会话目录 ${resolvedSessionDir} 时出错: ${error.message}`, { stack: error.stack });
    res.status(500).send({ message: 'Error cleaning up session directory.' });
  }
});

app.post('/api/cleanup-session', async (req, res) => {
  const { sessionId } = req.query;
  const opId = `cleanup-${sessionId ? sessionId.substring(0,8) : 'anon'}-${Date.now()}`;

  if (!sessionId) {
    logger.error(`[${opId}] 无效请求: 缺少 sessionId`);
    return res.status(400).send('Missing sessionId');
  }

  try {
    const sessionDir = path.join(localExportBaseDir, sessionId);
    if (await fs.pathExists(sessionDir)) {
      await fs.remove(sessionDir);
      logger.info(`[${opId}] 成功清理会话目录: ${sessionId}`);
      res.status(200).send({ message: 'Session cleaned up successfully' });
    } else {
      logger.info(`[${opId}] 会话目录不存在: ${sessionId}`);
      res.status(404).send({ message: 'Session directory not found' });
    }
  } catch (error) {
    logger.error(`[${opId}] 清理会话目录失败: ${error.message}`, { stack: error.stack });
    res.status(500).send({ message: 'Failed to clean up session directory' });
  }
});

initializeDirectories();

app.listen(PORT, () => {
  logger.info(`🚀 后端服务器正在监听端口 ${PORT}`);
  logger.info(`📂 配置的本地导出基础目录: ${localExportBaseDir}`);
  logger.info(`📂 配置的 Multer 上传临时目录: ${multerUploadTempDir}`);
  logger.info(`⏱️ 配置的图片下载延迟: ${IMAGE_DOWNLOAD_DELAY_MS}ms`);
});
