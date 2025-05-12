import React from 'react';
import { ProcessingMode, ConfigStatus } from '../types';

interface ControlsSectionProps {
    processingMode: ProcessingMode;
    onProcessingModeChange: (mode: ProcessingMode) => void;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onMainAction: () => void;
    loading: boolean;
    isAborting: boolean;
    file: File | null;
    configStatus: ConfigStatus;
    isConfigOpen: boolean;
    showViewResultButton: boolean;
    onViewResult: () => void;
    output: string;
}

const ControlsSection: React.FC<ControlsSectionProps> = ({
    processingMode,
    onProcessingModeChange,
    onFileChange,
    fileInputRef,
    onMainAction,
    loading,
    isAborting,
    file,
    configStatus,
    isConfigOpen,
    showViewResultButton,
    onViewResult,
    output
}) => {
    return (
        <section className="card controls-card">
            <div className="form-group mode-selector-group">
                <label className="mode-label">处理模式:</label>
                <div className="radio-group">
                    <label htmlFor="modeGithub">
                        <input 
                            type="radio" 
                            id="modeGithub" 
                            name="processingMode" 
                            value="github"
                            checked={processingMode === 'github'}
                            onChange={() => onProcessingModeChange('github')}
                            disabled={loading || isAborting}
                        />
                        上传到 GitHub (云端)
                    </label>
                    <label htmlFor="modeLocal">
                        <input 
                            type="radio" 
                            id="modeLocal" 
                            name="processingMode" 
                            value="local"
                            checked={processingMode === 'local'}
                            onChange={() => onProcessingModeChange('local')}
                            disabled={loading || isAborting}
                        />
                        下载本地 ZIP (离线)
                    </label>
                </div>
            </div>
            <div className="form-group file-upload-group">
                <label htmlFor="mdFile">上传 Markdown 文件 (.md)</label>
                <input 
                    id="mdFile" 
                    type="file" 
                    accept=".md" 
                    ref={fileInputRef} 
                    onChange={onFileChange}
                    disabled={loading || isAborting} 
                    className="file-input"
                />
            </div>
            <div className="action-buttons">
                <button
                    className={`btn ${loading && !isAborting ? 'btn-danger' : 'btn-primary'} action-toggle-btn`}
                    onClick={onMainAction}
                    disabled={isAborting || (!loading && (!file || (processingMode === 'github' && configStatus !== 'ok')))}
                >
                    {isAborting 
                        ? '终止中...' 
                        : (loading 
                            ? '🛑 终止处理' 
                            : (processingMode === 'github' ? '🚀 上传替换' : '📦 生成 ZIP'))}
                </button>
            </div>
            {processingMode === 'github' && configStatus !== 'ok' && !isConfigOpen && (
                <div className="alert alert-warning">
                    GitHub 模式: 请先点击右上角的"设置"按钮完成 GitHub 配置。
                </div>
            )}
            {showViewResultButton && processingMode === 'github' && !loading && output && (
                <div className="view-result-button-container">
                    <button 
                        className="btn btn-outline-primary" 
                        onClick={onViewResult}
                    >
                        📄 查看/复制上次结果
                    </button>
                </div>
            )}
        </section>
    );
};

export default ControlsSection; 