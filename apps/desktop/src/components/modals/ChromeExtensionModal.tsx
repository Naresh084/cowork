import { useState } from 'react';
import { X, Chrome, FolderOpen, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';

interface ChromeExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChromeExtensionModal({ isOpen, onClose }: ChromeExtensionModalProps) {
  const [extensionPath, setExtensionPath] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const result = await invoke<{ result: { connected: boolean } }>('agent_command', {
        command: 'chrome_extension_status',
        params: {},
      });
      setIsConnected(result.result?.connected ?? false);
    } catch (error) {
      console.error('Failed to check extension status:', error);
    }
    setChecking(false);
  };

  const openExtensionsPage = async () => {
    try {
      await invoke('agent_command', {
        command: 'chrome_open_extensions_page',
        params: {},
      });
    } catch (error) {
      console.error('Failed to open extensions page:', error);
    }
  };

  const openExtensionFolder = async () => {
    try {
      const result = await invoke<{ result: { success: boolean; path?: string } }>('agent_command', {
        command: 'chrome_open_extension_folder',
        params: {},
      });
      if (result.result?.path) {
        setExtensionPath(result.result.path);
      }
    } catch (error) {
      console.error('Failed to open extension folder:', error);
    }
  };

  const openBothForInstall = async () => {
    try {
      const result = await invoke<{ result: { success: boolean; extensionPath?: string } }>('agent_command', {
        command: 'chrome_install_extension_helper',
        params: {},
      });
      if (result.result?.extensionPath) {
        setExtensionPath(result.result.extensionPath);
      }
    } catch (error) {
      console.error('Failed to open install helper:', error);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className={cn(
              'relative w-full max-w-md mx-4',
              'bg-[#0D0E12] border border-white/10 rounded-xl',
              'shadow-2xl shadow-black/50'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#4C71FF]/20 flex items-center justify-center">
                  <Chrome className="w-5 h-5 text-[#4C71FF]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Chrome Extension</h2>
                  <p className="text-xs text-white/50">For seamless browser control</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-4 space-y-4">
              {/* Status */}
              <div className={cn(
                'flex items-center gap-3 p-3 rounded-lg',
                isConnected ? 'bg-green-500/10' : 'bg-yellow-500/10'
              )}>
                {isConnected ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-sm text-green-400">Extension is connected</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                    <span className="text-sm text-yellow-400">Extension not connected</span>
                  </>
                )}
                <button
                  onClick={checkStatus}
                  disabled={checking}
                  className="ml-auto text-xs text-white/50 hover:text-white/80"
                >
                  {checking ? 'Checking...' : 'Refresh'}
                </button>
              </div>

              {/* Instructions */}
              <div className="space-y-3">
                <p className="text-sm text-white/70">
                  Install the Chrome extension for the best browser automation experience:
                </p>

                <ol className="space-y-2 text-sm text-white/60">
                  <li className="flex gap-2">
                    <span className="text-[#4C71FF] font-medium">1.</span>
                    <span>Open Chrome Extensions page</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#4C71FF] font-medium">2.</span>
                    <span>Enable "Developer mode" (top right)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#4C71FF] font-medium">3.</span>
                    <span>Click "Load unpacked" and select the extension folder</span>
                  </li>
                </ol>

                {extensionPath && (
                  <div className="p-2 rounded bg-white/5 text-xs text-white/50 font-mono break-all">
                    {extensionPath}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-white/10 space-y-2">
              <button
                onClick={openBothForInstall}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2.5',
                  'bg-[#4C71FF] hover:bg-[#5C81FF] text-white',
                  'rounded-lg font-medium text-sm',
                  'transition-colors'
                )}
              >
                <ExternalLink className="w-4 h-4" />
                Open Chrome & Extension Folder
              </button>

              <div className="flex gap-2">
                <button
                  onClick={openExtensionsPage}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-2',
                    'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white',
                    'rounded-lg text-sm',
                    'transition-colors'
                  )}
                >
                  <Chrome className="w-4 h-4" />
                  Extensions Page
                </button>
                <button
                  onClick={openExtensionFolder}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-2',
                    'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white',
                    'rounded-lg text-sm',
                    'transition-colors'
                  )}
                >
                  <FolderOpen className="w-4 h-4" />
                  Extension Folder
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
