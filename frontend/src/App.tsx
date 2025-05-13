import React, {useState, useEffect, useRef, useCallback} from "react";
import JSZip from 'jszip';
import {saveAs} from 'file-saver';
import {v4 as uuidv4} from 'uuid';
import "./index.css";
import {Config, ProcessingMode, ConfigStatus, defaultConfigValues} from './types';
import SettingsModal from './components/SettingsModal';
import OutputModal from './components/OutputModal';
import LogDisplay from './components/LogDisplay';
import ControlsSection from './components/ControlsSection';

// --- Main App Component ---
export default function MarkdownImageReplacer() {
    const [config, setConfig] = useState(defaultConfigValues);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [configStatus, setConfigStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
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
    const [processingMode, setProcessingMode] = useState<ProcessingMode>('github');
    const [isOutputModalOpen, setIsOutputModalOpen] = useState(false);
    const [showViewResultButton, setShowViewResultButton] = useState(false);
    const [copyButtonText, setCopyButtonText] = useState("📋 复制内容");
    const [userId, setUserId] = useState<string>('');

    useEffect(() => {
        let storedUserId = localStorage.getItem('mdImageReplacerUserId');
        if (!storedUserId) {
            storedUserId = uuidv4();
            localStorage.setItem('mdImageReplacerUserId', storedUserId);
        }
        setUserId(storedUserId);
    }, []);

    const updateConfigStatusBasedOnMode = useCallback((mode: ProcessingMode, currentConfig: typeof defaultConfigValues) => {
        if (mode === 'local') {
            setConfigStatus('ok');
            setConfigError('');
        } else {
            if (currentConfig.username && currentConfig.token && currentConfig.repo && currentConfig.branch) {
                setConfigStatus('ok');
            } else {
                setConfigStatus('unknown');
            }
        }
    }, []);

    const loadConfigFromStorage = useCallback(() => {
        const saved = localStorage.getItem("mdUploaderSettings");
        let loadedConfig = {...defaultConfigValues};
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                loadedConfig = {...defaultConfigValues, ...parsed};
                setConfig(loadedConfig);
            } catch (e) {
                console.error("Failed to parse settings from localStorage", e);
                localStorage.removeItem("mdUploaderSettings");
            }
        }
        if (processingMode === 'github' && (!loadedConfig.username || !loadedConfig.token || !loadedConfig.repo || !loadedConfig.branch)) {
            setConfigStatus('unknown');
            // if (!saved) setIsConfigOpen(true);
        } else if (processingMode === 'local') {
            setConfigStatus('ok');
        } else {
            setConfigStatus('ok');
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
            logEndRef.current.scrollIntoView({behavior: "smooth", block: "end"});
        }
    }, [logs, userHasScrolled]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (loading && !isAborting) {
                handleCancelProcessing().then(r => {
                    // do nothing
                });
                const message = '处理仍在进行中，确定要离开吗？未保存的更改将会丢失。';
                event.preventDefault();
                event.returnValue = message;
                return message;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [loading, isAborting]);

    const handleLogContainerScroll = () => {
        const container = logContainerRef.current;
        if (container) {
            const threshold = 40;
            const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
            setUserHasScrolled(!atBottom);
        }
    };

    const log = useCallback((msg: string) => {
        setLogs((prev: any) => [...prev, `[${new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })}] ${msg}`]);
    }, []);

    const saveConfigAndValidateForGitHub = async () => {
        setConfigError('');
        if (processingMode === 'local') {
            const localConfigToSave = {enableCompression: config.enableCompression, tinifyKey: config.tinifyKey};
            localStorage.setItem("mdUploaderSettings", JSON.stringify(localConfigToSave));
            setIsConfigOpen(false);
            setConfigStatus('ok');
            log('🔧 本地模式设置已保存 (压缩偏好)。');
            return;
        }
        if (!config.username || !config.repo || !config.branch || !config.token) {
            setConfigError('❌ GitHub 用户名、仓库名、分支和 Access Token 不能为空');
            setConfigStatus('error');
            return;
        }
        if (config.enableCompression && !config.tinifyKey) {
            setConfigError('❌ 启用图片压缩时，TinyPNG API Key 不能为空');
            setConfigStatus('error');
            return;
        }
        setCheckingConfig(true);
        try {
            const repoResp = await fetch(`https://api.github.com/repos/${config.username}/${config.repo}`, {headers: {Authorization: `token ${config.token}`}});
            if (!repoResp.ok) {
                setConfigStatus('error');
                setConfigError(`⚠️ 仓库无法访问或权限不足 (${repoResp.status})。`);
                return;
            }
            const branchResp = await fetch(`https://api.github.com/repos/${config.username}/${config.repo}/branches/${config.branch}`, {headers: {Authorization: `token ${config.token}`}});
            if (!branchResp.ok) {
                setConfigStatus('error');
                setConfigError(`❌ 分支 '${config.branch}' 不存在 (${branchResp.status})。`);
                return;
            }
            setConfigStatus('ok');
            localStorage.setItem("mdUploaderSettings", JSON.stringify(config));
            setIsConfigOpen(false);
            log('✅ GitHub 配置已保存并通过校验。');
        } catch (e: any) {
            setConfigStatus('error');
            setConfigError('❌ 无法连接 GitHub API。请检查网络或 Token。 ' + e.message);
        } finally {
            setCheckingConfig(false);
        }
    };

    const logProcessingParameters = useCallback(() => {
        log(`⚙️ 处理模式: ${processingMode === 'github' ? '上传到 GitHub' : '下载本地 ZIP'}`);
        if (processingMode === 'github') {
            log(`🔧 GitHub 用户名: ${config.username}`);
            log(`🔧 GitHub 仓库: ${config.repo}`);
            log(`🔧 GitHub 分支: ${config.branch}`);
        }
        log(`🖼️ 图片压缩: ${config.enableCompression ? `启用 (Key: ${config.tinifyKey ? '已设置' : '未设置'})` : '未启用'}`);
    }, [config, log, processingMode]);

    const handleCancelProcessing = useCallback(async () => {
        if (!currentOperationIdRef.current) {
            log("⚠️ 无法取消：未找到当前操作ID。");
            if (abortControllerRef.current) {
                console.log("abort:", abortControllerRef.current)
                abortControllerRef.current.abort();
            }
            setIsAborting(false);
            return;
        }
        if (!isAborting) {
            setIsAborting(true);
            log("⚠️ 用户请求终止处理，正在通知后端...");

            try {
                const cancelResponse = await fetch(`/api/cancel-operation?operationId=${currentOperationIdRef.current}`, {
                    method: 'POST',
                });
                if (cancelResponse.ok) {
                    log("✅ 后端已收到取消请求。");
                } else {
                    log(`⚠️ 后端取消请求失败: ${cancelResponse.status} ${cancelResponse.statusText}`);
                }
            } catch (error: any) {
                log(`❌ 发送取消请求到后端时出错: ${error.message}`);
            }

            if (abortControllerRef.current) {
                console.log("abort:", abortControllerRef.current)
                abortControllerRef.current.abort();
            }
        }
    }, [isAborting, log]);

    const generateAndDownloadZip = async (markdownContent: string, imageFiles: Array<{
        pathInZip: string;
        blob: Blob
    }>, mdFilename: string, zipFilename: string) => {
        log('📦 开始创建 ZIP 文件...');
        try {
            const zip = new JSZip();
            zip.file(mdFilename, markdownContent);
            if (imageFiles.length > 0) {
                const imagesFolder = zip.folder("images");
                if (imagesFolder) {
                    imageFiles.forEach(imgFile => {
                        const displayFilename = imgFile.pathInZip.startsWith("images/") ? imgFile.pathInZip.substring("images/".length) : imgFile.pathInZip;
                        log(`➕ 添加图片到 ZIP: images/${displayFilename}`);
                        imagesFolder.file(displayFilename, imgFile.blob);
                    });
                } else {
                    log('⚠️ 无法在 ZIP 中创建 images 文件夹。');
                    imageFiles.forEach(imgFile => {
                        log(`➕ 添加图片到 ZIP (根目录): ${imgFile.pathInZip}`);
                        zip.file(imgFile.pathInZip, imgFile.blob);
                    });
                }
            }
            const zipBlob = await zip.generateAsync({type: "blob"});
            saveAs(zipBlob, zipFilename);
            log(`✅ ZIP 文件 "${zipFilename}" 已成功生成并开始下载！`);
        } catch (error: any) {
            log(`❌ 创建 ZIP 文件失败: ${error.message}`);
            console.error("ZIP Error:", error);
        }
    };

    const handleSubmitProcessing = async () => {
        if (processingMode === 'github' && configStatus !== 'ok') {
            setConfigError('❌ GitHub 配置无效或未校验通过。');
            setIsConfigOpen(true);
            return;
        }
        if (!file) {
            log('❌ 请先选择一个 Markdown 文件。');
            return;
        }

        setLoading(true);
        setIsAborting(false);
        setUserHasScrolled(false);
        setLogs([]);
        setOutput("");
        setShowViewResultButton(false);
        setIsOutputModalOpen(false);
        setCopyButtonText("📋 复制内容");

        currentOperationIdRef.current = uuidv4();
        log(`🚀 处理开始 (操作ID: ${currentOperationIdRef.current})`);
        logProcessingParameters();

        const formData = new FormData();
        formData.append('processingMode', processingMode);
        formData.append('file', file, file.name);
        formData.append('userId', userId);
        formData.append('operationId', currentOperationIdRef.current);

        formData.append('enableCompression', String(config.enableCompression));
        formData.append('tinifyKey', config.tinifyKey || '');
        if (processingMode === 'github') {
            formData.append('username', config.username);
            formData.append('repo', config.repo);
            formData.append('branch', config.branch);
            formData.append('token', config.token);
        }

        abortControllerRef.current = new AbortController();

        try {
            const response = await fetch('/api/replace', {
                method: 'POST',
                body: formData,
                signal: abortControllerRef.current.signal
            });
            if (!response.ok) {
                const txt = await response.text().catch(() => response.statusText);
                log(`❌ 后端请求失败 (${response.status}): ${txt}`);
                throw new Error(`Server error: ${response.status}`);
            }
            if (!response.body) {
                log('❌ 未获取到响应流。');
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let continueReading = true;

            while (continueReading) {
                const {value, done} = await reader.read();
                if (done) {
                    if (buffer.trim()) log(`⚠️ SSE 流意外结束，剩余缓存: ${buffer}`);
                    log('🏁 后端数据流已关闭。');
                    break;
                }
                buffer += decoder.decode(value, {stream: true});
                let parts = buffer.split("\n\n");
                if (parts.length > 1) buffer = parts.pop()!;

                for (const part of parts) {
                    if (part.startsWith('data:')) {
                        try {
                            const jsonData = part.substring('data:'.length).trim();
                            if (!jsonData) {
                                continue;
                            }
                            const json = JSON.parse(jsonData);

                            if (json.type === 'log') {
                                log(json.message);
                            } else if (json.type === 'githubProcessingDone') {
                                log('✅ GitHub 处理成功完成！');
                                setOutput(json.content);
                                setShowViewResultButton(true);
                                setIsOutputModalOpen(true);
                                continueReading = false;
                            } else if (json.type === 'localProcessingComplete') {
                                log('✅ 本地模式服务端文件处理完成。');
                                const mdContentForZip = json.content;
                                if (json.imageFiles && json.imageFiles.length > 0) {
                                    log(`⏳ 准备从服务端下载 ${json.imageFiles.length} 张图片... (Session: ${json.sessionId})`);
                                    const imagePromises = json.imageFiles.map((imgFile: {
                                            filename: string;
                                            pathInZip: string
                                        }) =>
                                            fetch(`/api/temp-image?sessionId=${json.sessionId}&filename=${encodeURIComponent(imgFile.filename)}`)
                                                .then((res: any) => {
                                                    if (!res.ok) {
                                                        log(`❌ 下载图片 ${imgFile.filename} 失败: ${res.status} ${res.statusText}`);
                                                        return {
                                                            pathInZip: imgFile.pathInZip,
                                                            blob: null,
                                                            error: true,
                                                            filename: imgFile.filename
                                                        };
                                                    }
                                                    log(`👍 图片已下载: ${imgFile.filename}`);
                                                    return res.blob().then((blob: any) => ({
                                                        pathInZip: imgFile.pathInZip,
                                                        blob,
                                                        error: false,
                                                        filename: imgFile.filename
                                                    }));
                                                })
                                                .catch(err => {
                                                    console.error(`Workspace error for ${imgFile.filename}:`, err);
                                                    log(`❌ 下载 ${imgFile.filename} 异常: ${err.message}`);
                                                    return {
                                                        pathInZip: imgFile.pathInZip,
                                                        blob: null,
                                                        error: true,
                                                        filename: imgFile.filename
                                                    };
                                                })
                                    );
                                    Promise.all(imagePromises)
                                        .then(results => {
                                            const successfullyFetchedImages = results.filter(r => r && !r.error && r.blob) as Array<{
                                                pathInZip: string;
                                                blob: Blob
                                            }>;
                                            const erroredImagesCount = results.filter(r => r.error).length;
                                            if (erroredImagesCount > 0) {
                                                log(`⚠️ ${erroredImagesCount} 张图片下载失败，它们将不会包含在 ZIP 中。`);
                                            }
                                            const baseMdFilename = originalFilename.endsWith('.md') ? originalFilename.slice(0, -3) : originalFilename;
                                            generateAndDownloadZip(mdContentForZip, successfullyFetchedImages, `${baseMdFilename}.md`, `${baseMdFilename}_local_export.zip`);
                                        })
                                        .catch(err => log(`❌ 下载图片组或生成 ZIP 时发生严重错误: ${err.message}`))
                                        .then(() => {
                                            if (json.sessionId && currentOperationIdRef.current) {
                                                fetch(`/api/cleanup-temp-session?sessionId=${json.sessionId}&operationId=${currentOperationIdRef.current}`, {method: 'POST'})
                                                    .then(res => {
                                                        if (res.ok) log('🧹 后端临时文件清理请求已发送。'); else log('⚠️ 后端临时文件清理请求失败。');
                                                    })
                                                    .catch(cleanupErr => log(`⚠️ 清理请求失败: ${cleanupErr.message}`));
                                            }
                                        });
                                } else {
                                    log('ℹ️ 未发现图片文件，将只打包 Markdown 文件。');
                                    const baseMdFilename = originalFilename.endsWith('.md') ? originalFilename.slice(0, -3) : originalFilename;
                                    await generateAndDownloadZip(mdContentForZip, [], `${baseMdFilename}.md`, `${baseMdFilename}_local_export.zip`);
                                }
                                continueReading = false;
                            } else if (json.type === 'error') {
                                log(`❌ 后端错误: ${json.message}`);
                                continueReading = false;
                            } else if (json.type === 'aborted') {
                                log(`🛑 ${json.message || '处理已被后端确认终止。'}`);
                                continueReading = false;
                            }
                        } catch (parseError: any) {
                            log(`⚠️ 解析SSE数据错误: ${parseError.message}. 无效数据: "${part}"`);
                        }
                    }
                }
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                if (isAborting) {
                    log('🛑 操作已被用户通过前端按钮取消。');
                } else {
                    log('🛑 Fetch 请求被中止 (可能由于网络问题或服务器关闭连接)。');
                }
            } else {
                log(`❌ 前端请求/处理错误: ${err.message}`);
            }
        } finally {
            setLoading(false);
            setIsAborting(false);
            abortControllerRef.current = null;
            currentOperationIdRef.current = null;
            log('🔚 前端处理流程结束。');
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
        if (!output) return;
        try {
            await navigator.clipboard.writeText(output);
            setCopyButtonText("✅ 已复制!");
            setTimeout(() => setCopyButtonText("📋 复制内容"), 2000);
        } catch (err) {
            console.error('Failed to copy output: ', err);
            setCopyButtonText("❌ 复制失败");
            setTimeout(() => setCopyButtonText("📋 复制内容"), 2000);
            log("❌ 复制到剪贴板失败。请检查浏览器权限或手动复制。");
        }
    };

    const handleProcessingModeChange = (mode: ProcessingMode) => {
        setProcessingMode(mode);
        updateConfigStatusBasedOnMode(mode, config); // Ensure config status is updated immediately
        if (mode === 'local') {
            setConfigError(''); // Clear GitHub specific errors if switching to local
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
        setCopyButtonText("📋 复制内容");
    };

    return (
        <div className="page-container">
            <header className="app-header">
                <div className="mt-4 flex justify-center">
                    <h1>Markdown 图片链接替换工具</h1>
                    <a
                        className="github-link"
                        href="https://github.com/hellojuantu/markdown-image-replacer/"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="在 GitHub 上查看项目"
                    >
                        <svg height="32" aria-hidden="true" viewBox="0 0 16 16" version="1.1" width="32"
                             data-view-component="true">
                            <path
                                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                        </svg>
                    </a>
                </div>
                <button className="btn-icon settings-btn-header" onClick={() => {
                    setIsConfigOpen(true);
                    setConfigError('');
                }} title="应用设置">
                    ⚙️ <span className="btn-icon-text">设置</span>
                </button>
            </header>

            <SettingsModal
                isOpen={isConfigOpen}
                onClose={() => setIsConfigOpen(false)}
                config={config}
                setConfig={setConfig}
                onSave={saveConfigAndValidateForGitHub}
                processingMode={processingMode}
                checkingConfig={checkingConfig}
                configError={configError}
                configStatus={configStatus}
            />
            <OutputModal
                isOpen={isOutputModalOpen && processingMode === 'github'}
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