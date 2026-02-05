import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Maximize2, Minimize2, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// Types
// ============================================================================

interface MCPAppViewerProps {
  isOpen: boolean;
  onClose: () => void;
  connectorId: string;
  appUri: string;
  appName: string;
}

interface MCPToolCallMessage {
  type: 'mcp-tool-call';
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

// ============================================================================
// MCP Bridge Script (injected into iframe)
// ============================================================================

const MCP_BRIDGE_SCRIPT = `
<script>
(function() {
  // Pending tool call promises
  const pendingCalls = new Map();
  let callIdCounter = 0;

  // MCP Bridge API
  window.mcp = {
    /**
     * Call an MCP tool
     * @param {string} name - Tool name
     * @param {object} args - Tool arguments
     * @returns {Promise<unknown>} - Tool result
     */
    callTool: function(name, args) {
      return new Promise((resolve, reject) => {
        const id = 'call-' + (++callIdCounter);
        pendingCalls.set(id, { resolve, reject });

        window.parent.postMessage({
          type: 'mcp-tool-call',
          id: id,
          tool: name,
          args: args || {}
        }, '*');

        // Timeout after 30 seconds
        setTimeout(() => {
          if (pendingCalls.has(id)) {
            pendingCalls.delete(id);
            reject(new Error('Tool call timed out'));
          }
        }, 30000);
      });
    }
  };

  // Handle responses from parent
  window.addEventListener('message', function(event) {
    const data = event.data;

    if (data.type === 'mcp-tool-result' && data.id) {
      const pending = pendingCalls.get(data.id);
      if (pending) {
        pendingCalls.delete(data.id);
        pending.resolve(data.result);
      }
    }

    if (data.type === 'mcp-tool-error' && data.id) {
      const pending = pendingCalls.get(data.id);
      if (pending) {
        pendingCalls.delete(data.id);
        pending.reject(new Error(data.error));
      }
    }
  });

  console.log('[MCP Bridge] Initialized');
})();
</script>
`;

// ============================================================================
// MCPAppViewer Component
// ============================================================================

export function MCPAppViewer({
  isOpen,
  onClose,
  connectorId,
  appUri,
  appName,
}: MCPAppViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ==========================================================================
  // Load App Content
  // ==========================================================================

  const loadContent = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<{ content: string }>('get_connector_app_content', {
        connectorId,
        appUri,
      });
      setContent(result.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [connectorId, appUri]);

  // Load content when modal opens
  useEffect(() => {
    if (isOpen) {
      loadContent();
    } else {
      // Reset state when closing
      setContent(null);
      setError(null);
      setIsMaximized(false);
    }
  }, [isOpen, loadContent]);

  // ==========================================================================
  // Handle Messages from Iframe
  // ==========================================================================

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Security: only accept messages from our iframe
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const data = event.data as MCPToolCallMessage;

      if (data.type === 'mcp-tool-call') {
        try {
          const result = await invoke<{ result: unknown }>('call_connector_app_tool', {
            connectorId,
            toolName: data.tool,
            args: data.args,
          });

          // Send result back to iframe
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: 'mcp-tool-result',
              id: data.id,
              tool: data.tool,
              result: result.result,
            },
            '*'
          );
        } catch (err) {
          // Send error back to iframe
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: 'mcp-tool-error',
              id: data.id,
              tool: data.tool,
              error: err instanceof Error ? err.message : String(err),
            },
            '*'
          );
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [connectorId]);

  // ==========================================================================
  // Build Sandboxed Content
  // ==========================================================================

  const sandboxedContent = content
    ? `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #fafafa;
      color: #333;
      font-size: 14px;
      line-height: 1.5;
    }
    /* Default button styles */
    button {
      cursor: pointer;
      padding: 8px 16px;
      border: 1px solid #ddd;
      border-radius: 6px;
      background: white;
      font-size: 14px;
      font-family: inherit;
      transition: background 0.15s;
    }
    button:hover {
      background: #f5f5f5;
    }
    button:active {
      background: #eee;
    }
    /* Primary button style */
    button.primary {
      background: #2563eb;
      border-color: #2563eb;
      color: white;
    }
    button.primary:hover {
      background: #1d4ed8;
    }
    /* Default input styles */
    input, textarea, select {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
      width: 100%;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }
    /* Card style */
    .card {
      background: white;
      border-radius: 8px;
      border: 1px solid #eee;
      padding: 16px;
      margin-bottom: 16px;
    }
    /* Loading spinner */
    .loading {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid #ddd;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
  ${MCP_BRIDGE_SCRIPT}
</head>
<body>
${content}
</body>
</html>
`
    : '';

  // ==========================================================================
  // Render
  // ==========================================================================

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[60]"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'fixed bg-zinc-900 rounded-xl z-[60] flex flex-col overflow-hidden border border-zinc-800 shadow-2xl',
              isMaximized
                ? 'inset-4'
                : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-[600px]'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
              <h2 className="text-sm font-medium text-zinc-100 truncate">{appName}</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={loadContent}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                  title={isMaximized ? 'Minimize' : 'Maximize'}
                >
                  {isMaximized ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 relative min-h-0">
              {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                  <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                </div>
              ) : error ? (
                <div className="absolute inset-0 flex items-center justify-center p-4 bg-zinc-900">
                  <div className="text-center max-w-md">
                    <div className="w-14 h-14 mx-auto rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                      <AlertCircle className="w-7 h-7 text-red-400" />
                    </div>
                    <p className="text-red-400 mb-4">{error}</p>
                    <button
                      onClick={loadContent}
                      className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : (
                <iframe
                  ref={iframeRef}
                  srcDoc={sandboxedContent}
                  sandbox="allow-scripts allow-forms"
                  className="absolute inset-0 w-full h-full bg-white rounded-b-xl"
                  title={appName}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
