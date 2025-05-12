import React from 'react';

interface OutputModalProps {
    isOpen: boolean;
    onClose: () => void;
    outputContent: string;
    onCopy: () => Promise<void>;
    copyButtonText: string;
}

const OutputModal: React.FC<OutputModalProps> = ({
    isOpen,
    onClose,
    outputContent,
    onCopy,
    copyButtonText
}) => {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content output-display-modal" onClick={e => e.stopPropagation()}>
                <header className="modal-header">
                    <h2>替换后的 Markdown 内容</h2>
                    <button 
                        className="btn-icon modal-close-btn" 
                        onClick={onClose} 
                        title="Close"
                    >
                        &times;
                    </button>
                </header>
                <div className="modal-body">
                    <textarea 
                        readOnly 
                        value={outputContent} 
                        className="output-modal-textarea"
                    />
                </div>
                <footer className="modal-footer">
                    <button className="btn btn-primary" onClick={onCopy}>
                        {copyButtonText}
                    </button>
                    <button className="btn btn-secondary" onClick={onClose}>
                        关闭
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default OutputModal; 