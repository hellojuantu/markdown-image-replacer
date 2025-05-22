import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import fs from "fs-extra";
import path from "path";
import os from "os";
import winston from "winston";
import cors from "cors";
import { handleReplace } from "./ReplaceHandlers.js";

dotenv.config();

const DEFAULT_TEMP_DIR_BASE = os.tmpdir();
const localExportBaseDir = path.resolve(
  process.env.LOCAL_EXPORT_BASE_DIR ||
    path.join(DEFAULT_TEMP_DIR_BASE, "md-img-export"),
);
const multerUploadTempDir = path.resolve(
  process.env.MULTER_UPLOAD_TEMP_DIR ||
    path.join(DEFAULT_TEMP_DIR_BASE, "md-uploads"),
);
const githubCloneBaseDir = path.resolve(
  process.env.GITHUB_CLONE_BASE_DIR ||
    path.join(DEFAULT_TEMP_DIR_BASE, "github-clones"),
);
const IMAGE_DOWNLOAD_DELAY_MS = parseInt(
  process.env.IMAGE_DOWNLOAD_DELAY_MS || "500",
  10,
);
const IMAGE_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const PORT = process.env.PORT || 13000;

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
  ),
  defaultMeta: { service: "markdown-image-replacer" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          (info) =>
            `${info.timestamp} ${info.level}: ${info.message} ${info.stack ? "\n" + info.stack : ""}`,
        ),
      ),
    }),
    new winston.transports.File({
      filename: path.join(process.env.LOG_DIR || "logs", "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(process.env.LOG_DIR || "logs", "combined.log"),
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(process.env.LOG_DIR || "logs", "exceptions.log"),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(process.env.LOG_DIR || "logs", "rejections.log"),
    }),
  ],
});

const initializeDirectories = () => {
  try {
    fs.ensureDirSync(localExportBaseDir, null);
    fs.emptyDirSync(localExportBaseDir);
    fs.ensureDirSync(multerUploadTempDir, null);
    fs.emptyDirSync(multerUploadTempDir);
    fs.ensureDirSync(githubCloneBaseDir, null);
    fs.emptyDirSync(githubCloneBaseDir);
    logger.info(
      `Directories initialized: ${localExportBaseDir}, ${multerUploadTempDir}, ${githubCloneBaseDir}`,
    );
  } catch (e) {
    logger.error(`Directory initialization error: ${e.message}`, {
      stack: e.stack,
    });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, multerUploadTempDir),
  filename: (req, file, cb) => {
    const buffer = Buffer.from(file.originalname, "binary");
    const decodedName = buffer.toString("utf8");
    const ext = path.extname(decodedName);
    const base = path
      .basename(decodedName, ext)
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, "_");
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${base}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({ storage });
const app = express();
const activeOperations = new Map();

const allowedOrigins = [
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",").map((url) => url.trim())
    : []),
].filter(Boolean);

const corsOptions = {
  origin: process.env.FRONTEND_URL
    ? (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn(`CORS: 拒绝来源: ${origin}`);
          callback(new Error("Not allowed by CORS"));
        }
      }
    : "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post("/api/cancel-operation", (req, res) => {
  const { operationId } = req.query;
  if (!operationId) {
    logger.warn(`[cancel-op] Bad request: Missing operationId`);
    return res.status(400).send("Missing operationId");
  }
  const controller = activeOperations.get(operationId);
  if (controller) {
    controller.abort();
    logger.info(
      `[cancel-op] Operation ${operationId} marked as cancelled by client request.`,
    );
    activeOperations.delete(operationId);
    res.status(200).send({ message: "Cancellation request received." });
  } else {
    logger.warn(
      `[cancel-op] Operation ${operationId} not found or already completed.`,
    );
    res
      .status(404)
      .send({ message: "Operation not found or already completed." });
  }
});

app.post("/api/replace", upload.single("file"), async (req, res) => {
  await handleReplace(req, res, {
    localExportBaseDir,
    githubCloneBaseDir,
    IMAGE_DOWNLOAD_DELAY_MS,
    IMAGE_DOWNLOAD_TIMEOUT_MS,
    logger,
    activeOperations,
  });
});

app.get("/api/temp-image", async (req, res) => {
  const { sessionId, filename } = req.query;
  const opId = `img-req-${sessionId ? sessionId.substring(0, 8) : "anon"}-${Date.now()}`;
  logger.info(
    `[${opId}] GET /api/temp-image: sessionId=${sessionId}, filename=${filename}`,
  );

  if (
    !sessionId ||
    !filename ||
    typeof sessionId !== "string" ||
    typeof filename !== "string"
  ) {
    logger.error(`[${opId}] Invalid request: Missing sessionId or filename`);
    return res.status(400).send("Missing sessionId or filename.");
  }

  const safeFilename = path.basename(filename);
  if (
    safeFilename !== filename ||
    !safeFilename.match(/^[\w-]+_[\d]+_[\d]+\.(png|jpe?g|gif|webp|svg)$/i)
  ) {
    logger.error(
      `[${opId}] Invalid request: Invalid filename format: '${filename}'`,
    );
    return res.status(400).send("Invalid filename format.");
  }

  const imagePath = path.join(
    localExportBaseDir,
    sessionId,
    "images",
    safeFilename,
  );
  const resolvedImagePath = path.resolve(imagePath);
  const expectedBase = path.resolve(
    path.join(localExportBaseDir, sessionId, "images"),
  );

  if (!resolvedImagePath.startsWith(expectedBase)) {
    logger.error(
      `[${opId}] Path traversal attempt rejected: '${resolvedImagePath}'`,
    );
    return res.status(403).send("Access to path denied.");
  }

  try {
    if (await fs.pathExists(resolvedImagePath)) {
      const stats = await fs.stat(resolvedImagePath);
      if (!stats.isFile()) {
        logger.error(
          `[${opId}] Error: Path is not a file: ${resolvedImagePath}`,
        );
        return res.status(404).send("Resource is not a file.");
      }

      logger.info(
        `[${opId}] File found: ${resolvedImagePath}, size: ${stats.size} bytes`,
      );
      const ext = path.extname(safeFilename).toLowerCase();
      const contentType =
        {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".svg": "image/svg+xml",
        }[ext] || "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.sendFile(resolvedImagePath, (err) => {
        if (err) {
          logger.error(`[${opId}] Error sending file: ${err.message}`, {
            stack: err.stack,
          });
          if (!res.headersSent) {
            res.status(err.status || 500).send("Error sending file");
          }
        } else {
          logger.info(`[${opId}] File sent successfully: ${resolvedImagePath}`);
        }
      });
    } else {
      logger.error(`[${opId}] Image not found: ${resolvedImagePath}`);
      res.status(404).send("Image not found.");
    }
  } catch (error) {
    logger.error(`[${opId}] Error processing image request: ${error.message}`, {
      stack: error.stack,
    });
    if (!res.headersSent) {
      res.status(500).send("Internal server error while serving image.");
    }
  }
});

app.post("/api/cleanup-temp-session", async (req, res) => {
  const { sessionId, operationId, processingMode } = req.query;
  const opId =
    operationId ||
    `cleanup-fallback-${sessionId ? sessionId.substring(0, 8) : "anon"}-${Date.now()}`;
  logger.info(
    `[${opId}] POST /api/cleanup-temp-session: sessionId=${sessionId}`,
  );
  if (!sessionId || typeof sessionId !== "string") {
    logger.error(`[${opId}] Invalid request: Missing sessionId.`);
    return res.status(400).send("Missing sessionId.");
  }
  if (!processingMode || typeof processingMode !== "string") {
    logger.error(`[${opId}] Invalid request: Missing processingMode.`);
    return res.status(400).send("Missing processingMode.");
  }

  const isLocal = processingMode === "local";
  const baseDir = isLocal ? localExportBaseDir : githubCloneBaseDir;

  const sessionDir = path.join(baseDir, sessionId);
  const resolvedSessionDir = path.resolve(sessionDir);
  const resolvedBaseDir = path.resolve(baseDir);

  if (
    !resolvedSessionDir.startsWith(resolvedBaseDir) ||
    resolvedSessionDir === resolvedBaseDir
  ) {
    logger.error(
      `[${opId}] Invalid session path for cleanup: '${sessionDir}'. Resolved: '${resolvedSessionDir}'`,
    );
    return res.status(400).send("Invalid session path for cleanup.");
  }

  logger.info(
    `[${opId}] Attempting to clean up session directory: ${resolvedSessionDir}`,
  );
  try {
    if (await fs.pathExists(resolvedSessionDir)) {
      await fs.remove(resolvedSessionDir);
      logger.info(
        `[${opId}] Session directory cleaned successfully: ${resolvedSessionDir}`,
      );
      res.status(200).send({ message: "Session cleaned up successfully." });
    } else {
      logger.info(
        `[${opId}] Session directory not found, cannot clean up: ${resolvedSessionDir}`,
      );
      res.status(404).send({ message: "Session directory not found." });
    }
  } catch (error) {
    logger.error(
      `[${opId}] Error cleaning up session directory ${resolvedSessionDir}: ${error.message}`,
      { stack: error.stack },
    );
    res.status(500).send({ message: "Error cleaning up session directory." });
  }
});

app.get("/api/health", async (req, res) => {
  const msg = "🚀 Backend Server status is OK!!!";
  logger.info(msg);
  res.status(200).send(msg);
});

initializeDirectories();

app.listen(PORT, () => {
  logger.info(`🚀 Backend server listening on port ${PORT}`);
  logger.info(
    `📂 Configured local export base directory: ${localExportBaseDir}`,
  );
  logger.info(
    `📂 Configured Multer upload temp directory: ${multerUploadTempDir}`,
  );
  logger.info(
    `📂 Configured GitHub clone base directory: ${githubCloneBaseDir}`,
  );
  logger.info(
    `⏱️ Configured image download delay: ${IMAGE_DOWNLOAD_DELAY_MS}ms`,
  );
});
