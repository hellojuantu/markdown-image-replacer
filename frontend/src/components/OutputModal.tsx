import React from 'react';
import {useTranslation} from 'react-i18next';

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
    const {t} = useTranslation();

    if (!isOpen) {
        return null;
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content output-display-modal" onClick={e => e.stopPropagation()}>
                <header className="modal-header">
                    <h2>{t('output.title')}</h2>
                    <button
                        className="btn-icon modal-close-btn"
                        onClick={onClose}
                        title={t('app.close')}
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
                        {t('app.close')}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default OutputModal;
