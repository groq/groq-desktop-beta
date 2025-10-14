import React, { useState, useEffect, useRef } from 'react';
import AnsiToHtml from 'ansi-to-html';

const converter = new AnsiToHtml({ newline: true, colors: {
    0: '#000', // black
    1: '#B00', // red
    2: '#0B0', // green
    3: '#FFB86C', // yellow (using a slightly more readable orange/yellow)
    4: '#61AFEF', // blue
    5: '#D556B1', // magenta
    6: '#56B6C2', // cyan
    7: '#ABB2BF', // white (light gray)
    8: '#5C6370', // bright black (dark gray)
    9: '#E06C75', // bright red
    10: '#98C379', // bright green
    11: '#E5C07B', // bright yellow
    12: '#61AFEF', // bright blue (same as blue for better contrast)
    13: '#C678DD', // bright magenta
    14: '#56B6C2', // bright cyan (same as cyan)
    15: '#FFFFFF'  // bright white
}}); // Create a converter instance

// Custom hook for LogViewerModal to separate logic
function useLogViewer(serverId, transportType) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const logsEndRef = useRef(null);

  // Function to scroll to the bottom of the logs
  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fetch initial logs or set SSE message
  useEffect(() => {
    if (transportType === 'sse') {
      // For SSE, just display the info message and don't fetch
      setLogs(["[Info: Logs for SSE servers must be checked directly on the server. Stdout/stderr is not captured.]"]);
      setIsLoading(false);
      setError(null);
      return; // Skip fetching and live updates for SSE
    }

    // Proceed with fetching for stdio
    const fetchLogs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await window.electron.getMcpServerLogs(serverId);
        setLogs(result?.logs || ['No logs available yet.']);
      } catch (err) {
        console.error(`Error fetching logs for ${serverId}:`, err);
        setError(`Failed to load logs: ${err.message}`);
        setLogs([`[Error loading logs: ${err.message}]`]);
      } finally {
        setIsLoading(false);
      }
    };

    if (serverId) {
      fetchLogs();
    } else {
       setLogs(['[No server ID specified]']);
       setIsLoading(false);
    }
  }, [serverId, transportType]);

  // Subscribe to live log updates
  useEffect(() => {
    // Only subscribe for stdio transports
    if (!serverId || transportType === 'sse') {
        return;
    }

    const handleLogUpdate = (updatedServerId, logChunk) => {
      if (updatedServerId === serverId) {
        setLogs(prevLogs => {
           // Append new lines, splitting the chunk if it contains multiple lines
           const newLines = logChunk.split('\n');
           const updated = [...prevLogs, ...newLines];
           // Maintain max lines (optional, main process already limits buffer)
           // const MAX_VIEW_LINES = 1000; // Example limit for frontend display
           // return updated.slice(-MAX_VIEW_LINES);
           return updated;
        });
      }
    };

    // Register listener and get cleanup function
    const removeListener = window.electron.onMcpLogUpdate(handleLogUpdate);

    // Cleanup listener on component unmount or serverId change
    return () => {
      removeListener();
    };
  }, [serverId, transportType]);

  // Scroll to bottom when logs update
  useEffect(() => {
    scrollToBottom();
  }, [logs]); // Trigger scroll whenever logs state changes

  return { logs, isLoading, error };
}

function LogViewerModal({ serverId, transportType, onClose }) {
  const logsEndRef = useRef(null);
  // Pass transportType to the custom hook
  const { logs, isLoading, error } = useLogViewer(serverId, transportType);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]"> {/* Higher z-index than ToolsPanel */}
      <div className="bg-card w-full max-w-4xl max-h-[90vh] rounded-lg shadow-xl overflow-hidden flex flex-col border border-border">
        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted">
          <h2 className="text-lg font-semibold text-foreground">
            Logs for Server: <span className="font-mono text-primary">{serverId}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200"
            aria-label="Close log viewer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Log Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-black text-sm font-mono">
          {isLoading ? (
            <p className="text-gray-400">Loading logs...</p>
          ) : error ? (
             <p className="text-red-400">{error}</p>
          ) : (
            <pre className="text-gray-300 whitespace-pre-wrap break-words">
              {/* Render each log line processed by ansi-to-html */}
              {logs.map((line, index) => (
                  <div key={index} dangerouslySetInnerHTML={{ __html: converter.toHtml(line) }} />
              ))}
              {/* Invisible element to scroll to */}
              <div ref={logsEndRef} />
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700 bg-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-4 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogViewerModal; 
