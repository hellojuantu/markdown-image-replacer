import React from 'react';
import { Config, ProcessingMode, ConfigStatus } from '../types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    config: Config;
    setConfig: (config: Config) => void;
    onSave: () => Promise<void>;
    processingMode: ProcessingMode;
    checkingConfig: boolean;
    configError: string;
    configStatus: ConfigStatus;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    config,
    setConfig,
    onSave,
    processingMode,
    checkingConfig,
    configError,
    configStatus
}) => {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay" onClick={() => {
            if (!checkingConfig) onClose();
        }}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <header className="modal-header">
                    <h2>应用设置</h2>
                    <button 
                        className="btn-icon modal-close-btn" 
                        onClick={onClose} 
                        disabled={checkingConfig}
                        title="Close"
                    >
                        &times;
                    </button>
                </header>
                <div className="modal-body">
                    <p className="modal-description">
                        {processingMode === 'github' 
                            ? "请配置您的 GitHub 信息以上传图片和更新 Markdown。Access Token 需要 repo 权限。" 
                            : "本地模式设置。图片压缩为可选项。"}
                    </p>
                    {processingMode === 'github' && (
                        <>
                            <div className="form-group">
                                <label htmlFor="username">GitHub 用户名</label>
                                <input
                                    id="username"
                                    type="text"
                                    value={config.username}
                                    onChange={e => setConfig({...config, username: e.target.value})}
                                    disabled={checkingConfig}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="repo">仓库名称</label>
                                <input
                                    id="repo"
                                    type="text"
                                    value={config.repo}
                                    onChange={e => setConfig({...config, repo: e.target.value})}
                                    disabled={checkingConfig}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="branch">分支名称</label>
                                <input
                                    id="branch"
                                    type="text"
                                    value={config.branch}
                                    onChange={e => setConfig({...config, branch: e.target.value})}
                                    disabled={checkingConfig}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="token">GitHub Personal Access Token</label>
                                <input
                                    id="token"
                                    type="password"
                                    value={config.token}
                                    onChange={e => setConfig({...config, token: e.target.value})}
                                    disabled={checkingConfig}
                                />
                            </div>
                        </>
                    )}
                    <div className="form-group checkbox-group">
                        <input
                            id="enableCompression"
                            type="checkbox"
                            checked={config.enableCompression}
                            onChange={e => setConfig({...config, enableCompression: e.target.checked})}
                            disabled={checkingConfig}
                        />
                        <label htmlFor="enableCompression">
                            启用图片压缩 (TinyPNG)
                            - {config.enableCompression && !config.tinifyKey 
                                ? '需要 API Key' 
                                : (config.enableCompression ? '已启用' : '未启用')}
                        </label>
                    </div>
                    {config.enableCompression && (
                        <div className="form-group">
                            <label htmlFor="tinifyKey">TinyPNG API Key</label>
                            <input
                                id="tinifyKey"
                                type="text"
                                value={config.tinifyKey}
                                onChange={e => setConfig({...config, tinifyKey: e.target.value})}
                                disabled={checkingConfig}
                            />
                        </div>
                    )}
                </div>
                <footer className="modal-footer">
                    <button
                        className="btn btn-primary"
                        onClick={onSave}
                        disabled={checkingConfig || 
                            (processingMode === 'github' && (!config.username || !config.repo || !config.token)) || 
                            (config.enableCompression && !config.tinifyKey)}
                    >
                        {checkingConfig 
                            ? '校验并保存中...' 
                            : (processingMode === 'github' ? '校验并保存 GitHub 配置' : '保存压缩设置')}
                    </button>
                    {configError && <div className="alert alert-error">{configError}</div>}
                    {configStatus === 'ok' && !configError && !checkingConfig && processingMode === 'github' &&
                        <div className="alert alert-success">✅ GitHub 配置有效</div>}
                    {configStatus === 'ok' && !configError && !checkingConfig && processingMode === 'local' &&
                        <div className="alert alert-success">✅ 压缩设置已应用</div>}
                </footer>
            </div>
        </div>
    );
};

export default SettingsModal; 