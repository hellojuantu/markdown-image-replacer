import fs from "fs-extra";
import path from "path";
import simpleGit from "simple-git";
import { processImageWithBorder } from "./ProcessImageWithBorder.js";

export async function handleReplace(
  req,
  res,
  {
    localExportBaseDir,
    githubCloneBaseDir,
    IMAGE_DOWNLOAD_DELAY_MS,
    IMAGE_DOWNLOAD_TIMEOUT_MS,
    logger,
    activeOperations,
  },
) {
  const { processingMode, userId, operationId: clientOperationId } = req.body;
  const operationId = clientOperationId || `op-fallback-${Date.now()}`;

  const controller = new AbortController();
  activeOperations.set(operationId, controller);
  logger.info(
    `[${operationId}] New request. Mode: ${processingMode}, UserID: ${userId}`,
  );

  let clientDisconnected = false;
  let currentTmpDirForGithub = null;
  let currentTmpDirForLocal = null;

  const sendSse = (type, data) => {
    if (clientDisconnected || res.writableEnded || controller.signal.aborted)
      return;
    const message = typeof data === "string" ? { message: data } : data;
    try {
      res.write(`data: ${JSON.stringify({ type, ...message })}\n\n`);
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
    sendSse("log", msg);
  };

  const errorSse = (msg, shouldEnd = false) => {
    logger.error(`[${operationId}] ${msg}`);
    sendSse("error", { message: msg });
    if (shouldEnd && !res.writableEnded && !clientDisconnected) res.end();
  };

  const abortSseAndEnd = (msg) => {
    logger.warn(`[${operationId}] Aborted and ended: ${msg}`);
    sendSse("aborted", { message: msg });
    if (!res.writableEnded && !clientDisconnected) res.end();
    activeOperations.delete(operationId);
  };

  async function handleLocalMode(
    imagesToProcess,
    content,
    fileName,
    enableCompression,
    tinifyKey,
    logSse,
    controller,
    sessionId,
  ) {
    controller.signal;
    const sessionImagesDir = path.join(localExportBaseDir, sessionId, "images");
    currentTmpDirForLocal = await fs.ensureDir(sessionImagesDir);
    logSse(`🏠 Local mode: Session ${sessionId} initialized`);

    const processedImageFiles = [];
    for (const img of imagesToProcess) {
      const localImagePath = path.join(sessionImagesDir, img.filenameWithExt);
      logSse(`⏳ [Local] Processing: ${img.filenameWithExt}`);
      try {
        const response = await fetch(img.originalUrl, {
          signal: controller.signal,
          timeout: IMAGE_DOWNLOAD_TIMEOUT_MS,
        });
        if (!response.ok) {
          logSse(
            `❌ Failed to download ${img.filenameWithExt} (${response.status})`,
          );
          continue;
        }

        let imageBuffer = Buffer.from(await response.arrayBuffer());
        logSse(`📥 Image downloaded successfully: ${img.filenameWithExt}`);

        imageBuffer = await processImageWithBorder(
          imageBuffer,
          enableCompression === "true",
          tinifyKey,
          logSse,
        );
        await fs.writeFile(localImagePath, imageBuffer);
        logSse(`💾 Image saved: ${img.filenameWithExt}`);

        content = content.replace(img.originalUrl, img.newRelativePath);
        processedImageFiles.push({
          filename: img.filenameWithExt,
          pathInZip: img.newRelativePath,
        });

        if (IMAGE_DOWNLOAD_DELAY_MS > 0) {
          logSse(`⏱️ Waiting ${IMAGE_DOWNLOAD_DELAY_MS}ms...`);
          await sleep(IMAGE_DOWNLOAD_DELAY_MS, controller.signal);
        }
      } catch (e) {
        if (e.message === "CLIENT_ABORTED" || e.name === "AbortError") {
          throw e;
        }
        logSse(`❌ Error processing ${img.filenameWithExt}: ${e.message}`);
        logger.error(
          `[${operationId}] Error processing local image ${img.filenameWithExt}: ${e.message}`,
          { stack: e.stack },
        );
      }
    }

    sendSse("localProcessingComplete", {
      content,
      sessionId,
      imageFiles: processedImageFiles,
      zipFilename: `${fileName.replace(/\.[^/.]+$/, "")}_local.zip`,
      markdownFilename: fileName,
    });
  }

  async function handleGitHubMode(
    imagesToProcess,
    content,
    username,
    repo,
    branch,
    token,
    enableCompression,
    tinifyKey,
    logSse,
    controller,
    sessionId,
  ) {
    if (!username || !repo || !token) {
      errorSse("❌ GitHub mode missing parameters", true);
      return;
    }

    currentTmpDirForGithub = await fs.ensureDir(
      path.join(githubCloneBaseDir, sessionId),
    );
    logSse(`📁 GitHub mode: Clone directory: ${currentTmpDirForGithub}`);

    const git = simpleGit({ baseDir: currentTmpDirForGithub, trimmed: false });
    try {
      // check email and user.name
      const emailResult = await git
        .raw(["config", "--global", "--get", "user.email"])
        .catch(() => null);

      if (!emailResult) {
        logger.info(`[${operationId}] Setting default Git email`);
        await git.raw([
          "config",
          "--global",
          "user.email",
          "markdown-image-replacer@github.com",
        ]);
      }

      const nameResult = await git
        .raw(["config", "--global", "--get", "user.name"])
        .catch(() => null);

      if (!nameResult) {
        logger.info(`[${operationId}] Setting default Git username`);
        await git.raw([
          "config",
          "--global",
          "user.name",
          "Markdown Image Replacer",
        ]);
      }

      await git.clone(
        `https://${token}@github.com/${username}/${repo}.git`,
        currentTmpDirForGithub,
        ["--branch", branch, "--single-branch", "--depth", "1"],
      );
      logSse(`✅ Successfully cloned branch '${branch}'`);

      // Set postBuffer in the cloned repository
      const repoGit = simpleGit(currentTmpDirForGithub);
      await repoGit.raw(["config", "http.postBuffer", "524288000"]);
      logSse(`⚙️ Git buffer size configured`);
    } catch (cloneError) {
      logSse(
        `⚠️ Failed to clone branch '${branch}', please check repository address and permissions`,
      );
      logger.error(
        `[${operationId}] Clone branch '${branch}' failed: ${cloneError.message}`,
      );
      errorSse(
        "❌ GitHub repository clone failed, please check repository address and permissions",
        true,
      );
      return;
    }

    const repoImageDir = path.join(currentTmpDirForGithub, "images");
    try {
      await fs.ensureDir(repoImageDir);
      await fs.emptyDir(repoImageDir);
      logSse("🧹 Target image directory cleared");

      const repoGit = simpleGit(currentTmpDirForGithub);
      await repoGit.add("images/.");
      await repoGit.commit("Clear image directory");
      await repoGit.push("origin", branch);
      logSse("📤 Clear operation committed");
    } catch (gitError) {
      logger.error(
        `[${operationId}] Git operation failed: ${gitError.message}`,
      );
      errorSse(
        "❌ Git operation failed, please check permissions and network",
        true,
      );
      return;
    }

    const githubRawPrefix = `https://raw.githubusercontent.com/${username}/${repo}/${branch}/images/`;
    let imagesUploadedCount = 0;

    for (const img of imagesToProcess) {
      logSse(`⏳ [GitHub] Processing: ${img.filenameWithExt}`);
      try {
        const response = await fetch(img.originalUrl, {
          signal: controller.signal,
          timeout: IMAGE_DOWNLOAD_TIMEOUT_MS,
        });
        if (!response.ok) {
          logSse(
            `❌ Failed to download ${img.filenameWithExt} (${response.status})`,
          );
          continue;
        }

        let imageBuffer = Buffer.from(await response.arrayBuffer());
        logSse(`📥 Image downloaded successfully: ${img.filenameWithExt}`);

        imageBuffer = await processImageWithBorder(
          imageBuffer,
          enableCompression === "true",
          tinifyKey,
          logSse,
        );
        await fs.writeFile(
          path.join(repoImageDir, img.filenameWithExt),
          imageBuffer,
        );
        logSse(
          `💾 Image saved to cloned repository: images/${img.filenameWithExt}`,
        );

        content = content.replace(
          img.originalUrl,
          githubRawPrefix + img.filenameWithExt,
        );
        imagesUploadedCount++;

        if (IMAGE_DOWNLOAD_DELAY_MS > 0) {
          logSse(`⏱️ Waiting ${IMAGE_DOWNLOAD_DELAY_MS}ms...`);
          await sleep(IMAGE_DOWNLOAD_DELAY_MS, controller.signal);
        }
      } catch (e) {
        if (e.message === "CLIENT_ABORTED" || e.name === "AbortError") {
          imagesUploadedCount = 0;
          throw e;
        }
        logSse(`❌ Error processing ${img.filenameWithExt}: ${e.message}`);
        logger.error(
          `[${operationId}] Error processing GitHub image ${img.filenameWithExt}: ${e.message}`,
          { stack: e.stack },
        );
      }
    }

    if (imagesUploadedCount > 0) {
      try {
        logSse(
          `📤 Preparing to commit ${imagesUploadedCount} images to Git...`,
        );
        const repoGit = simpleGit(currentTmpDirForGithub);
        await repoGit.add("images/.");
        const gitStatus = await repoGit.status();

        if (gitStatus.files.length > 0) {
          await repoGit.commit(
            `Upload/update ${imagesUploadedCount} images via tool`,
          );
          logSse(`📦 Git commit completed`);
          logSse("🚀 Git push in progress...");
          await repoGit.push("origin", branch);
          logSse("✅ Git push successful!");
        } else {
          logSse("ℹ️ Git: No file changes to commit");
        }
      } catch (gitError) {
        logger.error(
          `[${operationId}] Failed to commit images: ${gitError.message}`,
        );
        errorSse(
          "❌ Failed to commit images to Git, please check permissions and network",
          true,
        );
        return;
      }
    } else if (imagesToProcess.length > 0) {
      logSse(
        "⚠️ No images were successfully processed, skipping Git operations",
      );
    }

    sendSse("githubProcessingDone", {
      content,
      sessionId,
    });
  }

  async function processImageUrls(content, logSse) {
    const imageRegex = /!\[([^\]]*)\]\((https?:\/\/.+?)\)/g;
    const matches = Array.from(content.matchAll(imageRegex));
    logSse(`🔍 Found ${matches.length} images`);

    const imagesToProcess = [];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const altTextFromMarkdown = match[1];
      const originalUrl = match[2];

      const ext = ".png";
      const baseFilename = `image_${Date.now()}_${i + 1}`;

      imagesToProcess.push({
        originalUrl,
        altText: altTextFromMarkdown,
        filenameWithExt: `${baseFilename}${ext}`,
        newRelativePath: `images/${baseFilename}${ext}`,
      });
    }
    return imagesToProcess;
  }

  function cleanMarkdownContent(content) {
    content = content.replace(/<\/?font[^>]*>/g, "");
    content = content.replace(/(<br>[\s\n]){2}/g, "<br>");
    content = content.replace(/(<br \/>[\n]?){2}/g, "<br />\n");
    content = content.replace(/<br \/>/g, "\n");
    content = content.replace(/<a name=".*?"><\/a>/g, "");
    content = content.replace(/<div style="display:none">[\s\S]*?<\/div>/g, "");
    return content;
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("CLIENT_ABORTED"));
          },
          { once: true },
        );
      }
    });
  }

  const cleanupResources = async () => {
    try {
      const cleanupPromises = [];

      if (currentTmpDirForGithub) {
        cleanupPromises.push(
          fs
            .remove(currentTmpDirForGithub)
            .then(() =>
              logger.info(
                `[${operationId}] GitHub temp directory cleaned: ${currentTmpDirForGithub}`,
              ),
            )
            .catch((e) =>
              logger.error(
                `[${operationId}] Failed to clean GitHub temp directory: ${e.message}`,
              ),
            ),
        );
      }

      if (currentTmpDirForLocal) {
        cleanupPromises.push(
          fs
            .remove(currentTmpDirForLocal)
            .then(() =>
              logger.info(
                `[${operationId}] Local session directory cleaned: ${currentTmpDirForLocal}`,
              ),
            )
            .catch((e) =>
              logger.error(
                `[${operationId}] Failed to clean local session directory: ${e.message}`,
              ),
            ),
        );
      }

      await Promise.all(cleanupPromises);
    } catch (error) {
      logger.error(
        `[${operationId}] Error during resource cleanup: ${error.message}`,
        { stack: error.stack },
      );
    }
  };

  req.on("close", async () => {
    if (clientDisconnected) {
      return;
    }

    clientDisconnected = true;
    if (!controller.signal.aborted) {
      controller.abort();
    }

    logger.warn(`[${operationId}] Client disconnected`);
    logSse("⚠️ Client connection closed");

    await cleanupResources();

    if (!res.writableEnded) {
      abortSseAndEnd("🛑 Backend aborted due to client disconnect");
    }

    activeOperations.delete(operationId);
  });

  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  await Promise.race([
    (async () => {
      const { username, repo, branch, token, enableCompression, tinifyKey } =
        req.body;
      const file = req.file;
      const fileName = file?.filename || "document.md";
      logSse(`📥 Received file: '${fileName}'`);

      if (!file || !file.path || !fs.existsSync(file.path)) {
        errorSse("❌ Invalid uploaded file.", true);
        return;
      }
      let content = await fs.readFile(file.path, "utf-8");
      await fs.remove(file.path);

      const imagesToProcess = await processImageUrls(content, logSse);

      // custom replace
      content = cleanMarkdownContent(content);

      const sessionId = crypto.randomUUID();
      if (processingMode === "local") {
        await handleLocalMode(
          imagesToProcess,
          content,
          fileName,
          enableCompression,
          tinifyKey,
          logSse,
          controller,
          sessionId,
        );
      } else {
        await handleGitHubMode(
          imagesToProcess,
          content,
          username,
          repo,
          branch,
          token,
          enableCompression,
          tinifyKey,
          logSse,
          controller,
          sessionId,
        );
      }
    })(),
    new Promise((_, reject) => {
      controller.signal.addEventListener("abort", async () => {
        logger.warn(
          `[${operationId}] Client aborted request during response streaming`,
        );
        await cleanupResources();
        reject(new Error("CLIENT_ABORTED"));
      });
    }),
  ])
    .then(() => {
      logSse(
        `✅ Server processing completed successfully！ (Operation ID: ${operationId})`,
      );
    })
    .catch((err, reject) => {
      logger.error(
        `[${operationId}] 💥 Main processing error: ${err.message}`,
        { stack: err.stack },
      );
      if (err.message === "CLIENT_ABORTED") {
        logger.info(
          `[${operationId}] Main processing loop caught CLIENT_ABORTED`,
        );
        return;
      }
      if (!res.writableEnded) {
        errorSse(
          `❌ Server unexpected error: ${err.message || "Unknown error"}`,
          true,
        );
      }
    })
    .finally(async () => {
      try {
        if (
          !res.writableEnded &&
          !clientDisconnected &&
          !controller.signal.aborted
        ) {
          logger.info(
            `[${operationId}] Response not ended and not aborted, ending response`,
          );
          res.end();
        } else if (clientDisconnected && !res.writableEnded) {
          logger.info(
            `[${operationId}] Client disconnected but response not ended, waiting for close event handling`,
          );
        } else if (controller.signal.aborted && !res.writableEnded) {
          logger.info(
            `[${operationId}] Operation cancelled but response not ended, waiting for close or cancel handling`,
          );
        }

        activeOperations.delete(operationId);
        logger.info(`[${operationId}] Backend request processing completed`);
      } catch (cleanupError) {
        logger.error(
          `[${operationId}] Error during cleanup: ${cleanupError.message}`,
          { stack: cleanupError.stack },
        );
      }
    });
}
