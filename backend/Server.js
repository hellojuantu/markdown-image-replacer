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
const githubCloneBaseDir = path.resolve(process.env.GITHUB_CLONE_BASE_DIR || path.join(DEFAULT_TEMP_DIR_BASE, 'github-clones'));
const IMAGE_DOWNLOAD_DELAY_MS = parseInt(process.env.IMAGE_DOWNLOAD_DELAY_MS || "500", 10);
const IMAGE_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const PORT = process.env.PORT || 13000;

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
        winston.format.errors({stack: true}),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: {service: 'markdown-image-replacer'},
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message} ${info.stack ? '\n' + info.stack : ''}`)
            )
        }),
        new winston.transports.File({filename: path.join(process.env.LOG_DIR || 'logs', 'error.log'), level: 'error'}),
        new winston.transports.File({filename: path.join(process.env.LOG_DIR || 'logs', 'combined.log')})
    ],
    exceptionHandlers: [new winston.transports.File({filename: path.join(process.env.LOG_DIR || 'logs', 'exceptions.log')})],
    rejectionHandlers: [new winston.transports.File({filename: path.join(process.env.LOG_DIR || 'logs', 'rejections.log')})]
});

const initializeDirectories = () => {
    try {
        fs.ensureDirSync(localExportBaseDir, null);
        fs.emptyDirSync(localExportBaseDir);
        fs.ensureDirSync(multerUploadTempDir, null);
        fs.ensureDirSync(githubCloneBaseDir, null);
        logger.info(`Directories initialized: ${localExportBaseDir}, ${multerUploadTempDir}, ${githubCloneBaseDir}`);
    } catch (e) {
        logger.error(`Directory initialization error: ${e.message}`, {stack: e.stack});
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

const upload = multer({storage});
const app = express();
const activeOperations = new Map();

const allowedOrigins = [
    ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(url => url.trim()) : [])
].filter(Boolean);

const corsOptions = {
    origin: process.env.FRONTEND_URL ? (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            logger.warn(`CORS: 拒绝来源: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    } : '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.urlencoded({extended: true}));
app.use(express.json());

app.post('/api/cancel-operation', (req, res) => {
    const {operationId} = req.query;
    if (!operationId) {
        logger.warn(`[cancel-op] Bad request: Missing operationId`);
        return res.status(400).send('Missing operationId');
    }
    const controller = activeOperations.get(operationId);
    if (controller) {
        controller.abort();
        logger.info(`[cancel-op] Operation ${operationId} marked as cancelled by client request.`);
        activeOperations.delete(operationId);
        res.status(200).send({message: 'Cancellation request received.'});
    } else {
        logger.warn(`[cancel-op] Operation ${operationId} not found or already completed.`);
        res.status(404).send({message: 'Operation not found or already completed.'});
    }
});

const cleanupResources = async (operationId, currentTmpDirForGithub, activeSessionIdForLocal, forceCleanup = false) => {
    try {
        const cleanupPromises = [];

        if (currentTmpDirForGithub) {
            cleanupPromises.push(
                fs.remove(currentTmpDirForGithub)
                    .then(() => logger.info(`[${operationId}] GitHub temp directory cleaned: ${path.basename(currentTmpDirForGithub)}`))
                    .catch(e => logger.error(`[${operationId}] Failed to clean GitHub temp directory: ${e.message}`))
            );
        }

        if (activeSessionIdForLocal && (forceCleanup || !activeSessionIdForLocal.startsWith('local-'))) {
            const sessionDir = path.join(localExportBaseDir, activeSessionIdForLocal);
            cleanupPromises.push(
                fs.remove(sessionDir)
                    .then(() => logger.info(`[${operationId}] Local session directory cleaned: ${activeSessionIdForLocal}`))
                    .catch(e => logger.error(`[${operationId}] Failed to clean local session directory: ${e.message}`))
            );
        }

        await Promise.all(cleanupPromises);
    } catch (error) {
        logger.error(`[${operationId}] Error during resource cleanup: ${error.message}`, {stack: error.stack});
    }
};

app.post('/api/replace', upload.single('file'), async (req, res) => {
    const {processingMode, userId, operationId: clientOperationId} = req.body;
    const operationId = clientOperationId || `op-fallback-${Date.now()}`;

    const controller = new AbortController();
    activeOperations.set(operationId, controller);
    logger.info(`[${operationId}] New request. Mode: ${processingMode}, UserID: ${userId}`);

    let clientDisconnected = false;
    let currentTmpDirForGithub = null;
    let activeSessionIdForLocal = null;

    const sendSse = (type, data) => {
        if (clientDisconnected || res.writableEnded || controller.signal.aborted) return;
        const message = typeof data === 'string' ? {message: data} : data;
        try {
            res.write(`data: ${JSON.stringify({type, ...message})}\n\n`);
        } catch (error) {
            logger.error(`[${operationId}] SSE send error: ${error.message}`);
            clientDisconnected = true;
            if (!controller.signal.aborted) {
                controller.abort();
            }
        }
    };

    const logSse = (msg) => {
        logger.info(`[${operationId}] ${msg}`);
        sendSse('log', msg);
    };

    const errorSse = (msg, shouldEnd = false) => {
        logger.error(`[${operationId}] ${msg}`);
        sendSse('error', {message: msg});
        if (shouldEnd && !res.writableEnded && !clientDisconnected) res.end();
    };

    const abortSseAndEnd = (msg) => {
        logger.warn(`[${operationId}] Aborted and ended: ${msg}`);
        sendSse('aborted', {message: msg});
        if (!res.writableEnded && !clientDisconnected) res.end();
        activeOperations.delete(operationId);
    };

    req.on('close', async () => {
        if (clientDisconnected) return;

        clientDisconnected = true;
        if (!controller.signal.aborted) controller.abort();

        logger.warn(`[${operationId}] Client disconnected`);
        logSse('⚠️ Client connection closed');

        await cleanupResources(operationId, currentTmpDirForGithub, null);

        if (!res.writableEnded) abortSseAndEnd('🛑 Backend aborted due to client disconnect');
        activeOperations.delete(operationId);
    });

    res.set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    res.flushHeaders();

    await Promise.race([
        (async () => {
            const {username, repo, branch, token, enableCompression, tinifyKey} = req.body;
            const file = req.file;
            const fileName = file?.filename || 'document.md';
            logSse(`📥 Received file: '${fileName}'`);

            if (!file || !file.path || !fs.existsSync(file.path)) {
                errorSse('❌ Invalid uploaded file.', true);
                return;
            }
            let content = await fs.readFile(file.path, 'utf-8');
            await fs.remove(file.path);

            const imageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
            const matches = Array.from(content.matchAll(imageRegex));
            logSse(`🔍 Found ${matches.length} images`);

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
                    logSse(`⚠️ Failed to parse URL extension: '${originalUrl}'`);
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
                logSse(`🏠 Local mode: Session ${activeSessionIdForLocal} initialized`);

                const processedImageFiles = [];
                for (const img of imagesToProcess) {
                    const localImagePath = path.join(sessionImagesDir, img.filenameWithExt);
                    logSse(`⏳ [Local] Processing: ${img.filenameWithExt}`);
                    try {
                        const response = await fetch(img.originalUrl, {signal: controller.signal, timeout: IMAGE_DOWNLOAD_TIMEOUT_MS});
                        if (!response.ok) {
                            logSse(`❌ Failed to download ${img.filenameWithExt} (${response.status})`);
                            continue;
                        }

                        let imageBuffer = Buffer.from(await response.arrayBuffer());
                        logSse(`📥 Image downloaded successfully: ${img.filenameWithExt}`);

                        imageBuffer = await processImageWithBorder(imageBuffer, enableCompression === 'true', tinifyKey, logSse);
                        await fs.writeFile(localImagePath, imageBuffer);
                        logSse(`💾 Image saved: ${img.filenameWithExt}`);

                        content = content.replace(img.originalUrl, img.newRelativePath);
                        processedImageFiles.push({filename: img.filenameWithExt, pathInZip: img.newRelativePath});

                        if (IMAGE_DOWNLOAD_DELAY_MS > 0) {
                            logSse(`⏱️ Waiting ${IMAGE_DOWNLOAD_DELAY_MS}ms...`);
                            await new Promise(resolve => setTimeout(resolve, IMAGE_DOWNLOAD_DELAY_MS));
                        }
                    } catch (e) {
                        if (e.message === 'CLIENT_ABORTED') throw e;
                        logSse(`❌ Error processing ${img.filenameWithExt}: ${e.message}`);
                        logger.error(`[${operationId}] Error processing local image ${img.filenameWithExt}: ${e.message}`, {stack: e.stack});
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
                    errorSse('❌ GitHub mode missing parameters', true);
                    return;
                }

                currentTmpDirForGithub = await fs.mkdtemp(path.join(githubCloneBaseDir, `md-gh-clone-${operationId}-`));
                logSse(`📁 GitHub mode: Clone directory: ${currentTmpDirForGithub}`);

                const git = simpleGit({baseDir: currentTmpDirForGithub, trimmed: false});
                try {
                    // check email and user.name
                    const emailResult = await git.raw(['config', '--global', '--get', 'user.email']).catch(() => null);
                    if (!emailResult) {
                        logger.info(`[${operationId}] Setting default Git email`);
                        await git.raw(['config', '--global', 'user.email', 'markdown-image-replacer@github.com']);
                    }
                    
                    const nameResult = await git.raw(['config', '--global', '--get', 'user.name']).catch(() => null);
                    if (!nameResult) {
                        logger.info(`[${operationId}] Setting default Git username`);
                        await git.raw(['config', '--global', 'user.name', 'Markdown Image Replacer']);
                    }

                    await git.clone(`https://${token}@github.com/${username}/${repo}.git`, currentTmpDirForGithub, [
                        '--branch', branch,
                        '--single-branch',
                        '--depth', '1'
                    ]);
                    logSse(`✅ Successfully cloned branch '${branch}'`);

                    // Set postBuffer in the cloned repository
                    const repoGit = simpleGit(currentTmpDirForGithub);
                    await repoGit.raw(['config', 'http.postBuffer', '524288000']);
                    logSse(`⚙️ Git buffer size configured`);
                } catch (cloneError) {
                    logger.warn(`[${operationId}] Shallow clone failed, trying full clone: ${cloneError.message}`);
                    logSse(`⚠️ Failed to clone branch '${branch}', trying full clone...`);
                    try {
                        await fs.emptyDir(currentTmpDirForGithub);
                        await simpleGit().clone(`https://${token}@github.com/${username}/${repo}.git`, currentTmpDirForGithub);
                        await simpleGit(currentTmpDirForGithub).checkout(branch);
                        logSse(`✅ Full clone and checkout to branch '${branch}' successful`);
                    } catch (fullCloneError) {
                        logger.error(`[${operationId}] Full clone also failed: ${fullCloneError.message}`);
                        errorSse('❌ GitHub repository clone failed, please check repository address and permissions', true);
                        return;
                    }
                }

                const repoImageDir = path.join(currentTmpDirForGithub, 'images');
                try {
                    await fs.ensureDir(repoImageDir);
                    await fs.emptyDir(repoImageDir);
                    logSse('🧹 Target image directory cleared');

                    const repoGit = simpleGit(currentTmpDirForGithub);
                    await repoGit.add('images/.');
                    await repoGit.commit('Clear image directory');
                    await repoGit.push('origin', branch);
                    logSse('📤 Clear operation committed');
                } catch (gitError) {
                    logger.error(`[${operationId}] Git operation failed: ${gitError.message}`);
                    errorSse('❌ Git operation failed, please check permissions and network', true);
                    return;
                }

                const githubRawPrefix = `https://raw.githubusercontent.com/${username}/${repo}/${branch}/images/`;
                let imagesUploadedCount = 0;

                for (const img of imagesToProcess) {
                    logSse(`⏳ [GitHub] Processing: ${img.filenameWithExt}`);
                    try {
                        const response = await fetch(img.originalUrl, {signal: controller.signal, timeout: IMAGE_DOWNLOAD_TIMEOUT_MS});
                        if (!response.ok) {
                            logSse(`❌ Failed to download ${img.filenameWithExt} (${response.status})`);
                            continue;
                        }

                        let imageBuffer = Buffer.from(await response.arrayBuffer());
                        logSse(`📥 Image downloaded successfully: ${img.filenameWithExt}`);

                        imageBuffer = await processImageWithBorder(imageBuffer, enableCompression === 'true', tinifyKey, logSse);
                        await fs.writeFile(path.join(repoImageDir, img.filenameWithExt), imageBuffer);
                        logSse(`💾 Image saved to cloned repository: images/${img.filenameWithExt}`);

                        content = content.replace(img.originalUrl, githubRawPrefix + img.filenameWithExt);
                        imagesUploadedCount++;

                        if (IMAGE_DOWNLOAD_DELAY_MS > 0) {
                            logSse(`⏱️ Waiting ${IMAGE_DOWNLOAD_DELAY_MS}ms...`);
                            await new Promise(resolve => setTimeout(resolve, IMAGE_DOWNLOAD_DELAY_MS));
                        }
                    } catch (e) {
                        if (e.message === 'CLIENT_ABORTED') throw e;
                        logSse(`❌ Error processing ${img.filenameWithExt}: ${e.message}`);
                        logger.error(`[${operationId}] Error processing GitHub image ${img.filenameWithExt}: ${e.message}`, {stack: e.stack});
                    }
                }

                if (imagesUploadedCount > 0) {
                    try {
                        logSse(`📤 Preparing to commit ${imagesUploadedCount} images to Git...`);
                        const repoGit = simpleGit(currentTmpDirForGithub);
                        await repoGit.add('images/.');
                        const gitStatus = await repoGit.status();

                        if (gitStatus.files.length > 0) {
                            await repoGit.commit(`Upload/update ${imagesUploadedCount} images via tool`);
                            logSse(`📦 Git commit completed`);
                            logSse('🚀 Git push in progress...');
                            await repoGit.push('origin', branch);
                            logSse('✅ Git push successful!');
                        } else {
                            logSse('ℹ️ Git: No file changes to commit');
                        }
                    } catch (gitError) {
                        logger.error(`[${operationId}] Failed to commit images: ${gitError.message}`);
                        errorSse('❌ Failed to commit images to Git, please check permissions and network', true);
                        return;
                    }
                } else if (imagesToProcess.length > 0) {
                    logSse('⚠️ No images were successfully processed, skipping Git operations');
                }

                sendSse('githubProcessingDone', {content});
            }
        })(),
        new Promise((_, reject) => {
            controller.signal.addEventListener('abort', async () => {
                await cleanupResources(operationId, currentTmpDirForGithub, null);
                reject(new Error('CLIENT_ABORTED'));
            });
        })
    ])
        .then(() => {
            logSse(`[${operationId}] ✅ Server processing completed successfully.`);
        })
        .catch(err => {
            logger.error(`[${operationId}] 💥 Main processing error: ${err.message}`, {stack: err.stack});
            if (err.message === 'CLIENT_ABORTED') {
                logger.info(`[${operationId}] Main processing loop caught CLIENT_ABORTED`);
                return;
            }
            if (!res.writableEnded) {
                errorSse(`❌ Server unexpected error: ${err.message || 'Unknown error'}`, true);
            }
            throw err;
        })
        .finally(async () => {
            try {
                await cleanupResources(operationId, currentTmpDirForGithub, null);

                if (!res.writableEnded && !clientDisconnected && !controller.signal.aborted) {
                    logger.info(`[${operationId}] Response not ended and not aborted, ending response`);
                    res.end();
                } else if (clientDisconnected && !res.writableEnded) {
                    logger.info(`[${operationId}] Client disconnected but response not ended, waiting for close event handling`);
                } else if (controller.signal.aborted && !res.writableEnded) {
                    logger.info(`[${operationId}] Operation cancelled but response not ended, waiting for close or cancel handling`);
                }

                activeOperations.delete(operationId);
                logger.info(`[${operationId}] Backend request processing completed`);
            } catch (cleanupError) {
                logger.error(`[${operationId}] Error during cleanup: ${cleanupError.message}`, {stack: cleanupError.stack});
            }
        });
});

app.get('/api/temp-image', async (req, res) => {
    const {sessionId, filename} = req.query;
    const opId = `img-req-${sessionId ? sessionId.substring(0, 8) : 'anon'}-${Date.now()}`;
    logger.info(`[${opId}] GET /api/temp-image: sessionId=${sessionId}, filename=${filename}`);

    if (!sessionId || !filename || typeof sessionId !== 'string' || typeof filename !== 'string') {
        logger.error(`[${opId}] Invalid request: Missing sessionId or filename`);
        return res.status(400).send('Missing sessionId or filename.');
    }

    const safeFilename = path.basename(filename);
    if (safeFilename !== filename || !safeFilename.match(/^img_[\w-]+_[\d]+_[\d]+\.(png|jpe?g|gif|webp|svg)$/i)) {
        logger.error(`[${opId}] Invalid request: Invalid filename format: '${filename}'`);
        return res.status(400).send('Invalid filename format.');
    }

    const imagePath = path.join(localExportBaseDir, sessionId, 'images', safeFilename);
    const resolvedImagePath = path.resolve(imagePath);
    const expectedBase = path.resolve(path.join(localExportBaseDir, sessionId, 'images'));

    if (!resolvedImagePath.startsWith(expectedBase)) {
        logger.error(`[${opId}] Path traversal attempt rejected: '${resolvedImagePath}'`);
        return res.status(403).send('Access to path denied.');
    }

    try {
        if (await fs.pathExists(resolvedImagePath)) {
            const stats = await fs.stat(resolvedImagePath);
            if (!stats.isFile()) {
                logger.error(`[${opId}] Error: Path is not a file: ${resolvedImagePath}`);
                return res.status(404).send('Resource is not a file.');
            }

            logger.info(`[${opId}] File found: ${resolvedImagePath}, size: ${stats.size} bytes`);
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
                    logger.error(`[${opId}] Error sending file: ${err.message}`, {stack: err.stack});
                    if (!res.headersSent) {
                        res.status(err.status || 500).send('Error sending file');
                    }
                } else {
                    logger.info(`[${opId}] File sent successfully: ${resolvedImagePath}`);
                }
            });
        } else {
            logger.error(`[${opId}] Image not found: ${resolvedImagePath}`);
            res.status(404).send('Image not found.');
        }
    } catch (error) {
        logger.error(`[${opId}] Error processing image request: ${error.message}`, {stack: error.stack});
        if (!res.headersSent) {
            res.status(500).send('Internal server error while serving image.');
        }
    }
});

app.post('/api/cleanup-temp-session', async (req, res) => {
    const {sessionId, operationId: clientOpId} = req.query;
    const opId = clientOpId || `cleanup-fallback-${sessionId ? sessionId.substring(0, 8) : 'anon'}-${Date.now()}`;
    logger.info(`[${opId}] POST /api/cleanup-temp-session: sessionId=${sessionId}`);
    if (!sessionId || typeof sessionId !== 'string') {
        logger.error(`[${opId}] Invalid request: Missing sessionId.`);
        return res.status(400).send('Missing sessionId.');
    }
    const sessionDir = path.join(localExportBaseDir, sessionId);
    const resolvedSessionDir = path.resolve(sessionDir);
    const resolvedBaseDir = path.resolve(localExportBaseDir);
    if (!resolvedSessionDir.startsWith(resolvedBaseDir) || resolvedSessionDir === resolvedBaseDir) {
        logger.error(`[${opId}] Invalid session path for cleanup: '${sessionDir}'. Resolved: '${resolvedSessionDir}'`);
        return res.status(400).send('Invalid session path for cleanup.');
    }
    logger.info(`[${opId}] Attempting to clean up session directory: ${resolvedSessionDir}`);
    try {
        if (await fs.pathExists(resolvedSessionDir)) {
            await fs.remove(resolvedSessionDir);
            logger.info(`[${opId}] Session directory cleaned successfully: ${resolvedSessionDir}`);
            res.status(200).send({message: 'Session cleaned up successfully.'});
        } else {
            logger.info(`[${opId}] Session directory not found, cannot clean up: ${resolvedSessionDir}`);
            res.status(404).send({message: 'Session directory not found.'});
        }
    } catch (error) {
        logger.error(`[${opId}] Error cleaning up session directory ${resolvedSessionDir}: ${error.message}`, {stack: error.stack});
        res.status(500).send({message: 'Error cleaning up session directory.'});
    }
});

initializeDirectories();

app.listen(PORT, () => {
    logger.info(`🚀 Backend server listening on port ${PORT}`);
    logger.info(`📂 Configured local export base directory: ${localExportBaseDir}`);
    logger.info(`📂 Configured Multer upload temp directory: ${multerUploadTempDir}`);
    logger.info(`📂 Configured GitHub clone base directory: ${githubCloneBaseDir}`);
    logger.info(`⏱️ Configured image download delay: ${IMAGE_DOWNLOAD_DELAY_MS}ms`);
});
