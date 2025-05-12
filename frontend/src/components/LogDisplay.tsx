import React, { useEffect } from 'react';

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
    useEffect(() => {
        if (!userHasScrolled && logEndRef.current) {
            logEndRef.current.scrollIntoView({behavior: "smooth", block: "end"});
        }
    }, [logs, userHasScrolled]);

    if (logs.length === 0 && !loading) return null;
    
    return (
        <section className="card logs-card">
            <h3>处理日志:</h3>
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