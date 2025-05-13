import React, {useEffect, useCallback, useState} from 'react';
import {useTranslation} from 'react-i18next';

interface LogDisplayProps {
    logs: string[];
    loading: boolean;
    logContainerRef: React.RefObject<HTMLDivElement | null>;
    logEndRef: React.RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    userHasScrolled: boolean;
}

const LogDisplay: React.FC<LogDisplayProps> = ({
                                                   logs,
                                                   loading,
                                                   logContainerRef,
                                                   logEndRef,
                                                   onScroll,
                                                   userHasScrolled
                                               }) => {
    const {t} = useTranslation();
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [isAutoScrolling, setIsAutoScrolling] = useState(false);

    const handleScroll = useCallback(() => {
        if (!logContainerRef.current) return;

        const {scrollHeight, scrollTop, clientHeight} = logContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 100; // 增加阈值到 100

        if (!isAutoScrolling) {
            setIsAtBottom(isAtBottom);
        }
    }, [isAutoScrolling]);

    useEffect(() => {
        if (isAtBottom && logContainerRef.current) {
            setIsAutoScrolling(true);
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
            setTimeout(() => {
                setIsAutoScrolling(false);
            }, 100);
        }
    }, [logs, isAtBottom]);

    useEffect(() => {
        const container = logContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);

    useEffect(() => {
        if (!userHasScrolled && logEndRef.current) {
            logEndRef.current.scrollIntoView({behavior: "smooth", block: "end"});
        }
    }, [logs, userHasScrolled]);

    if (logs.length === 0 && !loading) {
        return null;
    }

    return (
        <section className="card logs-card">
            <h3>{t('logs.title')}</h3>
            <div
                className="log-container"
                ref={logContainerRef}
                onScroll={onScroll}
            >
                {logs.map((logMsg, i) => (
                    <div
                        key={i}
                        className="log-entry"
                        dangerouslySetInnerHTML={{
                            __html: logMsg.replace(/</g, "&lt;").replace(/>/g, "&gt;")
                        }}
                    />
                ))}
                <div ref={logEndRef}/>
            </div>
        </section>
    );
};

export default LogDisplay;
