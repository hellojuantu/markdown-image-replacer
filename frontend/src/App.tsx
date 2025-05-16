import React, { useState, useEffect, useRef, useCallback } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { v4 as uuidv4 } from "uuid";
import "./index.css";
import { ProcessingMode, defaultConfigValues } from "./types";
import SettingsModal from "./components/SettingsModal";
import OutputModal from "./components/OutputModal";
import LogDisplay from "./components/LogDisplay";
import ControlsSection from "./components/ControlsSection";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

// --- Main App Component ---
export default function MarkdownImageReplacer() {
  const { t } = useTranslation();
  const [config, setConfig] = useState(defaultConfigValues);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configStatus, setConfigStatus] = useState<"unknown" | "ok" | "error">(
    "unknown",
  );
  const [checkingConfig, setCheckingConfig] = useState(false);
  const [configError, setConfigError] = useState<string>("");

  const [file, setFile] = useState<File | null>(null);
  const [originalFilename, setOriginalFilename] = useState<string>("document");
  const [logs, setLogs] = useState<string[]>([]);
  const [output, setOutput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [isAborting, setIsAborting] = useState(false);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentOperationIdRef = useRef<string | null>(null); // To store current operation ID

  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [processingMode, setProcessingMode] =
    useState<ProcessingMode>("github");
  const [isOutputModalOpen, setIsOutputModalOpen] = useState(false);
  const [showViewResultButton, setShowViewResultButton] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState(t("logs.copy.button"));
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    let storedUserId = localStorage.getItem("mdImageReplacerUserId");
    if (!storedUserId) {
      storedUserId = uuidv4();
      localStorage.setItem("mdImageReplacerUserId", storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  const updateConfigStatusBasedOnMode = useCallback(
    (mode: ProcessingMode, currentConfig: typeof defaultConfigValues) => {
      if (mode === "local") {
        setConfigStatus("ok");
        setConfigError("");
      } else {
        if (
          currentConfig.username &&
          currentConfig.token &&
          currentConfig.repo &&
          currentConfig.branch
        ) {
          setConfigStatus("ok");
        } else {
          setConfigStatus("unknown");
        }
      }
    },
    [],
  );

  const loadConfigFromStorage = useCallback(() => {
    const saved = localStorage.getItem("mdUploaderSettings");
    let loadedConfig = { ...defaultConfigValues };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        loadedConfig = { ...defaultConfigValues, ...parsed };
        setConfig(loadedConfig);
      } catch (e) {
        console.error("Failed to parse settings from localStorage", e);
        localStorage.removeItem("mdUploaderSettings");
      }
    }
    if (
      processingMode === "github" &&
      (!loadedConfig.username ||
        !loadedConfig.token ||
        !loadedConfig.repo ||
        !loadedConfig.branch)
    ) {
      setConfigStatus("unknown");
    } else if (processingMode === "local") {
      setConfigStatus("ok");
    } else {
      setConfigStatus("ok");
    }
  }, [processingMode]);

  useEffect(() => {
    loadConfigFromStorage();
  }, [loadConfigFromStorage]);
  useEffect(() => {
    updateConfigStatusBasedOnMode(processingMode, config);
  }, [processingMode, config, updateConfigStatusBasedOnMode]);

  useEffect(() => {
    if (!userHasScrolled && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [logs, userHasScrolled]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (loading && !isAborting) {
        handleCancelProcessing().then((r) => {
          // do nothing
        });
        const message = t("logs.warning.leavePage");
        event.preventDefault();
        event.returnValue = message;
        return message;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [loading, isAborting, t]);

  const handleLogContainerScroll = () => {
    const container = logContainerRef.current;
    if (container) {
      const threshold = 40;
      const atBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        threshold;
      setUserHasScrolled(!atBottom);
    }
  };

  const log = useCallback((msg: string) => {
    setLogs((prev: any) => [
      ...prev,
      `[${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}] ${msg}`,
    ]);
  }, []);

  const saveConfigAndValidateForGitHub = async () => {
    setConfigError("");
    if (processingMode === "local") {
      const localConfigToSave = {
        enableCompression: config.enableCompression,
        tinifyKey: config.tinifyKey,
      };
      localStorage.setItem(
        "mdUploaderSettings",
        JSON.stringify(localConfigToSave),
      );
      setIsConfigOpen(false);
      setConfigStatus("ok");
      log("🔧 Local mode settings saved (compression preference).");
      return;
    }
    if (!config.username || !config.repo || !config.branch || !config.token) {
      setConfigError(t("settings.github.error.emptyFields"));
      setConfigStatus("error");
      return;
    }
    if (config.enableCompression && !config.tinifyKey) {
      setConfigError(t("settings.compression.error.emptyKey"));
      setConfigStatus("error");
      return;
    }
    setCheckingConfig(true);
    try {
      const repoResp = await fetch(
        `https://api.github.com/repos/${config.username}/${config.repo}`,
        { headers: { Authorization: `token ${config.token}` } },
      );
      if (!repoResp.ok) {
        setConfigStatus("error");
        setConfigError(
          t("settings.github.error.noAccess", { status: repoResp.status }),
        );
        return;
      }
      const branchResp = await fetch(
        `https://api.github.com/repos/${config.username}/${config.repo}/branches/${config.branch}`,
        { headers: { Authorization: `token ${config.token}` } },
      );
      if (!branchResp.ok) {
        setConfigStatus("error");
        setConfigError(
          t("settings.github.error.branchNotFound", {
            branch: config.branch,
            status: branchResp.status,
          }),
        );
        return;
      }
      setConfigStatus("ok");
      localStorage.setItem("mdUploaderSettings", JSON.stringify(config));
      setIsConfigOpen(false);
      log("✅ GitHub configuration saved and verified.");
    } catch (e: any) {
      setConfigStatus("error");
      setConfigError(
        t("settings.github.error.apiConnection", { error: e.message }),
      );
    } finally {
      setCheckingConfig(false);
    }
  };

  const logProcessingParameters = useCallback(() => {
    log(
      `⚙️ Processing mode: ${processingMode === "github" ? "Upload to GitHub" : "Download local ZIP"}`,
    );
    if (processingMode === "github") {
      log(`🔧 GitHub username: ${config.username}`);
      log(`🔧 GitHub repository: ${config.repo}`);
      log(`🔧 GitHub branch: ${config.branch}`);
    }
    log(
      `🖼️ Image compression: ${config.enableCompression ? `Enabled (Key: ${config.tinifyKey ? "Set" : "Not set"})` : "Not enabled"}`,
    );
  }, [config, log, processingMode]);

  const handleCancelProcessing = useCallback(async () => {
    if (!currentOperationIdRef.current) {
      log("⚠️ Unable to cancel: Current operation ID not found.");
      if (abortControllerRef.current) {
        console.log("abort:", abortControllerRef.current);
        abortControllerRef.current.abort();
      }
      setIsAborting(false);
      return;
    }
    if (!isAborting) {
      setIsAborting(true);
      log("⚠️ User requested termination, notifying backend...");

      try {
        const cancelResponse = await fetch(
          `/api/cancel-operation?operationId=${currentOperationIdRef.current}`,
          {
            method: "POST",
          },
        );
        if (cancelResponse.ok) {
          log("✅ Backend received cancellation request.");
        } else {
          log(
            `⚠️ Backend cancellation request failed: ${cancelResponse.status} ${cancelResponse.statusText}`,
          );
        }
      } catch (error: any) {
        log(
          `❌ Error sending cancellation request to backend: ${error.message}`,
        );
      }

      if (abortControllerRef.current) {
        console.log("abort:", abortControllerRef.current);
        abortControllerRef.current.abort();
      }
    }
  }, [isAborting, log]);

  const generateAndDownloadZip = async (
    markdownContent: string,
    imageFiles: Array<{
      pathInZip: string;
      blob: Blob;
    }>,
    mdFilename: string,
    zipFilename: string,
  ) => {
    log("📦 Starting to create ZIP file...");
    try {
      const zip = new JSZip();
      zip.file(mdFilename, markdownContent);
      if (imageFiles.length > 0) {
        const imagesFolder = zip.folder("images");
        if (imagesFolder) {
          imageFiles.forEach((imgFile) => {
            const displayFilename = imgFile.pathInZip.startsWith("images/")
              ? imgFile.pathInZip.substring("images/".length)
              : imgFile.pathInZip;
            log(`➕ Adding image to ZIP: images/${displayFilename}`);
            imagesFolder.file(displayFilename, imgFile.blob);
          });
        } else {
          log("⚠️ Unable to create images folder in ZIP.");
          imageFiles.forEach((imgFile) => {
            log(
              `➕ Adding image to ZIP (root directory): ${imgFile.pathInZip}`,
            );
            zip.file(imgFile.pathInZip, imgFile.blob);
          });
        }
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, zipFilename);
      log(`✅ ZIP file "${zipFilename}" generated and started downloading!`);
    } catch (error: any) {
      log(`❌ Failed to create ZIP file: ${error.message}`);
      console.error("ZIP Error:", error);
    }
  };

  const handleSubmitProcessing = async () => {
    if (processingMode === "github" && configStatus !== "ok") {
      setConfigError(t("settings.github.error.invalidConfig"));
      setIsConfigOpen(true);
      return;
    }
    if (!file) {
      log("❌ Please select a Markdown file first.");
      return;
    }

    setLoading(true);
    setIsAborting(false);
    setUserHasScrolled(false);
    setLogs([]);
    setOutput("");
    setShowViewResultButton(false);
    setIsOutputModalOpen(false);
    setCopyButtonText(t("logs.copy.button"));

    currentOperationIdRef.current = uuidv4();
    const tempOperationId = currentOperationIdRef.current;

    log(
      `🚀 Processing started (Operation ID: ${currentOperationIdRef.current})`,
    );
    logProcessingParameters();

    const formData = new FormData();
    formData.append("processingMode", processingMode);
    formData.append("file", file, file.name);
    formData.append("userId", userId);
    formData.append("operationId", currentOperationIdRef.current);

    formData.append("enableCompression", String(config.enableCompression));
    formData.append("tinifyKey", config.tinifyKey || "");
    if (processingMode === "github") {
      formData.append("username", config.username);
      formData.append("repo", config.repo);
      formData.append("branch", config.branch);
      formData.append("token", config.token);
    }

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/replace", {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current.signal,
      });
      if (!response.ok) {
        const txt = await response.text().catch(() => response.statusText);
        log(`❌ Backend request failed (${response.status}): ${txt}`);
        throw new Error(`Server error: ${response.status}`);
      }
      if (!response.body) {
        log("❌ No response stream received.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let continueReading = true;

      while (continueReading) {
        const { value, done } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            log(`⚠️ Unexpected SSE stream end, remaining buffer: ${buffer}`);
          }

          log("🏁 Backend data stream closed.");
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let parts = buffer.split("\n\n");
        buffer = parts.pop()!;

        for (const part of parts) {
          const dataLines = part
            .split("\n")
            .filter((line) => line.startsWith("data:"));

          if (!dataLines.length) {
            continue;
          }

          const jsonData = dataLines
            .map((line) => line.substring("data:".length).trim())
            .join("");

          try {
            const json = JSON.parse(jsonData);

            if (json.type === "log") {
              log(json.message);
            } else if (json.type === "githubProcessingDone") {
              log("✅ GitHub processing completed successfully!");
              setOutput(json.content);
              setShowViewResultButton(true);
              setIsOutputModalOpen(true);
              continueReading = false;
            } else if (json.type === "localProcessingComplete") {
              log("✅ Local mode backend file processing completed.");
              handleLocalProcessingComplete(json, tempOperationId);
              continueReading = false;
            } else if (json.type === "error") {
              log(`❌ Backend error: ${json.message}`);
              continueReading = false;
            } else if (json.type === "aborted") {
              log(`🛑 ${json.message || "Processing aborted by backend."}`);
              continueReading = false;
            }
          } catch (parseError: any) {
            log(
              `⚠️ Error parsing SSE data: ${parseError.message}. Invalid data: "${part}"`,
            );
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        if (isAborting) {
          log("🛑 Processing canceled by user.");
        } else {
          log(
            "🛑 Fetch request aborted (possibly due to network issues or server closed connection)",
          );
        }
      } else {
        log(`❌ Frontend request/processing error: ${err.message}`);
      }
    } finally {
      setLoading(false);
      setIsAborting(false);
      abortControllerRef.current = null;
      currentOperationIdRef.current = null;
      log("🔚 Frontend processing flow ended.");
    }
  };

  const handleLocalProcessingComplete = (json: any, tempOperationId: any) => {
    const mdContentForZip = json.content;
    if (json.imageFiles && json.imageFiles.length > 0) {
      log(
        `⏳ Preparing to download ${json.imageFiles.length} images from backend... (Session: ${json.sessionId})`,
      );
      const imagePromises = json.imageFiles.map(
        (imgFile: { filename: string; pathInZip: string }) =>
          fetch(
            `/api/temp-image?sessionId=${json.sessionId}&filename=${encodeURIComponent(imgFile.filename)}`,
          )
            .then((res: any) => {
              if (!res.ok) {
                log(
                  `❌ Failed to download image ${imgFile.filename}: ${res.status} ${res.statusText}`,
                );
                return {
                  pathInZip: imgFile.pathInZip,
                  blob: null,
                  error: true,
                  filename: imgFile.filename,
                };
              }
              log(`👍 Image downloaded: ${imgFile.filename}`);
              return res.blob().then((blob: any) => ({
                pathInZip: imgFile.pathInZip,
                blob,
                error: false,
                filename: imgFile.filename,
              }));
            })
            .catch((err) => {
              console.error(`Workspace error for ${imgFile.filename}:`, err);
              log(`❌ Downloading ${imgFile.filename} failed: ${err.message}`);
              return {
                pathInZip: imgFile.pathInZip,
                blob: null,
                error: true,
                filename: imgFile.filename,
              };
            }),
      );
      Promise.all(imagePromises)
        .then((results) => {
          const successfullyFetchedImages = results.filter(
            (r) => r && !r.error && r.blob,
          ) as Array<{
            pathInZip: string;
            blob: Blob;
          }>;
          const erroredImagesCount = results.filter((r) => r.error).length;
          if (erroredImagesCount > 0) {
            log(
              `⚠️ ${erroredImagesCount} images failed to download, they will not be included in ZIP.`,
            );
          }
          const baseMdFilename = originalFilename.endsWith(".md")
            ? originalFilename.slice(0, -3)
            : originalFilename;
          generateAndDownloadZip(
            mdContentForZip,
            successfullyFetchedImages,
            `${baseMdFilename}.md`,
            `${baseMdFilename}_local_export.zip`,
          ).then(() => {
            log("✅ ZIP file export completed successfully.");
          });
        })
        .catch((err) =>
          log(
            `❌ Failed to download image group or generate ZIP: ${err.message}`,
          ),
        )
        .then(() => {
          if (json.sessionId && tempOperationId) {
            fetch(
              `/api/cleanup-temp-session?sessionId=${json.sessionId}&operationId=${tempOperationId}`,
              { method: "POST" },
            )
              .then((res) => {
                if (res.ok) {
                  log("🧹 Backend temporary file cleanup request sent.");
                } else {
                  log("⚠️ Backend temporary file cleanup request failed.");
                }
              })
              .catch((cleanupErr) =>
                log(`⚠️ Cleanup request failed: ${cleanupErr.message}`),
              );
          }
        });
    } else {
      log("ℹ️ No image files found, will only pack Markdown file.");
      const baseMdFilename = originalFilename.endsWith(".md")
        ? originalFilename.slice(0, -3)
        : originalFilename;
      generateAndDownloadZip(
        mdContentForZip,
        [],
        `${baseMdFilename}.md`,
        `${baseMdFilename}_local_export.zip`,
      ).then(() => {
        log("✅ ZIP file export completed successfully.");
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    if (selectedFile) {
      setOriginalFilename(selectedFile.name.replace(/\.[^/.]+$/, ""));
    } else {
      setOriginalFilename("document");
    }
  };

  const handleCopyOutput = async () => {
    if (!output) {
      return;
    }

    let success = false;

    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(output);
        success = true;
      } catch (e) {
        console.warn("Clipboard API failed, falling back to execCommand", e);
      }
    }

    if (!success) {
      const textarea = document.createElement("textarea");
      textarea.value = output;
      textarea.setAttribute("readonly", "");

      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        success = document.execCommand("copy");
        if (!success) {
          throw new Error("execCommand returned false");
        }
      } catch (e) {
        console.error("execCommand copy failed", e);
      } finally {
        document.body.removeChild(textarea);
      }
    }

    setCopyButtonText(success ? t("logs.copy.success") : t("logs.copy.failed"));

    setTimeout(() => setCopyButtonText(t("logs.copy.button")), 2000);
  };

  const handleProcessingModeChange = (mode: ProcessingMode) => {
    setProcessingMode(mode);
    updateConfigStatusBasedOnMode(mode, config); // Ensure config status is updated immediately
    if (mode === "local") {
      setConfigError(""); // Clear GitHub specific errors if switching to local
    } else {
      // When switching to GitHub, re-evaluate if settings are open if config is not 'ok'
      // if (!config.username || !config.repo || !config.branch || !config.token) {
      //     const saved = localStorage.getItem("mdUploaderSettings");
      //     if (!saved) setIsConfigOpen(true); // Open if no saved settings for GitHub
      // }
    }
  };

  const handleViewResult = () => {
    setIsOutputModalOpen(true);
    setCopyButtonText(t("logs.copy.button"));
  };

  return (
    <div className="page-container">
      <header className="app-header">
        <div className="mt-4 flex justify-center">
          <h1>{t("app.title")}</h1>
          <a
            className="github-link"
            href="https://github.com/hellojuantu/markdown-image-replacer/"
            target="_blank"
            rel="noopener noreferrer"
            title={t("app.viewOnGithub")}
          >
            <svg
              height="32"
              aria-hidden="true"
              viewBox="0 0 16 16"
              version="1.1"
              width="32"
              data-view-component="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
            </svg>
          </a>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-icon settings-btn-header"
            onClick={() => {
              setIsConfigOpen(true);
              setConfigError("");
            }}
            title={t("app.settings")}
          >
            ⚙️ <span className="btn-icon-text">{t("app.settings")}</span>
          </button>
          <LanguageSwitcher />
        </div>
      </header>

      <SettingsModal
        isOpen={isConfigOpen}
        onClose={() => {
          if (checkingConfig) {
            return;
          }
          loadConfigFromStorage();
          setIsConfigOpen(false);
        }}
        config={config}
        setConfig={setConfig}
        onSave={saveConfigAndValidateForGitHub}
        processingMode={processingMode}
        checkingConfig={checkingConfig}
        configError={configError}
        configStatus={configStatus}
      />
      <OutputModal
        isOpen={isOutputModalOpen && processingMode === "github"}
        onClose={() => setIsOutputModalOpen(false)}
        outputContent={output}
        onCopy={handleCopyOutput}
        copyButtonText={copyButtonText}
      />
      <main className="main-content">
        <ControlsSection
          processingMode={processingMode}
          onProcessingModeChange={handleProcessingModeChange}
          onFileChange={handleFileChange}
          fileInputRef={fileInputRef}
          onMainAction={() => {
            if (loading && !isAborting) {
              handleCancelProcessing();
            } else if (!loading) {
              handleSubmitProcessing();
            }
          }}
          loading={loading}
          isAborting={isAborting}
          file={file}
          configStatus={configStatus}
          isConfigOpen={isConfigOpen}
          showViewResultButton={showViewResultButton}
          onViewResult={handleViewResult}
          output={output}
        />
        <LogDisplay
          logs={logs}
          loading={loading}
          logContainerRef={logContainerRef}
          logEndRef={logEndRef}
          onScroll={handleLogContainerScroll}
          userHasScrolled={userHasScrolled}
        />
      </main>
    </div>
  );
}
