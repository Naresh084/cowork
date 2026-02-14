// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Copy, Check, Loader2, KeyRound, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import type { ConnectorManifest } from '@cowork/shared';
import { getConnectorIcon } from './connector-icons';

// ============================================================================
// Types
// ============================================================================

interface OAuthFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  connector: ConnectorManifest;
  onSuccess: () => void;
}

interface OAuthFlowResult {
  type: 'browser' | 'device_code';
  url?: string;
  userCode?: string;
  verificationUrl?: string;
  expiresIn?: number;
}

type FlowState = 'idle' | 'starting' | 'waiting' | 'polling' | 'success' | 'error';

// ============================================================================
// OAuthFlowModal Component
// ============================================================================

export function OAuthFlowModal({
  isOpen,
  onClose,
  connector,
  onSuccess,
}: OAuthFlowModalProps) {
  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [flowResult, setFlowResult] = useState<OAuthFlowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);

  const Icon = getConnectorIcon(connector.icon);

  // Get provider display name
  const providerName = connector.auth.type === 'oauth' ? connector.auth.provider : 'OAuth';
  const providerDisplayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);

  // ==========================================================================
  // Start OAuth Flow
  // ==========================================================================

  const startFlow = useCallback(async () => {
    setFlowState('starting');
    setError(null);
    setPollAttempts(0);

    try {
      const result = await invoke<OAuthFlowResult>('start_connector_oauth_flow', {
        connectorId: connector.id,
      });

      setFlowResult(result);

      if (result.type === 'browser' && result.url) {
        // Open browser for authorization code flow
        await open(result.url);
        setFlowState('waiting');
        // For browser flow, we'll poll for completion
        startPollingForCompletion();
      } else if (result.type === 'device_code') {
        // Device code flow - display code and start polling
        setFlowState('polling');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFlowState('error');
    }
  }, [connector.id]);

  // ==========================================================================
  // Poll for Completion
  // ==========================================================================

  const startPollingForCompletion = useCallback(() => {
    // For browser flow, we check OAuth status periodically
    const checkStatus = async () => {
      try {
        const status = await invoke<{ authenticated: boolean }>('get_oauth_status', {
          connectorId: connector.id,
        });

        if (status.authenticated) {
          setFlowState('success');
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 1500);
          return true;
        }
      } catch {
        // Ignore errors during polling
      }
      return false;
    };

    // Poll every 2 seconds
    const interval = setInterval(async () => {
      const complete = await checkStatus();
      if (complete) {
        clearInterval(interval);
      }
    }, 2000);

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(interval);
      if (flowState === 'waiting') {
        setError('Authorization timed out. Please try again.');
        setFlowState('error');
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [connector.id, flowState, onSuccess, onClose]);

  // Poll for device code completion
  useEffect(() => {
    if (flowState !== 'polling' || flowResult?.type !== 'device_code') return;

    const pollInterval = setInterval(async () => {
      try {
        const result = await invoke<{ complete: boolean }>('poll_oauth_device_code', {
          connectorId: connector.id,
        });

        if (result.complete) {
          setFlowState('success');
          clearInterval(pollInterval);
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 1500);
        }

        setPollAttempts((prev) => prev + 1);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Ignore "pending" errors, they're expected
        if (message.includes('pending')) {
          setPollAttempts((prev) => prev + 1);
          return;
        }
        if (message.includes('expired')) {
          setError('Authorization code expired. Please try again.');
          setFlowState('error');
          clearInterval(pollInterval);
        }
      }
    }, 5000); // Poll every 5 seconds for device code

    // Timeout after expiry
    const expiresIn = flowResult?.expiresIn || 900; // Default 15 minutes
    const timeout = setTimeout(() => {
      clearInterval(pollInterval);
      if (flowState === 'polling') {
        setError('Authorization timed out. Please try again.');
        setFlowState('error');
      }
    }, expiresIn * 1000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [flowState, flowResult, connector.id, onSuccess, onClose]);

  // Auto-start flow when modal opens
  useEffect(() => {
    if (isOpen && flowState === 'idle') {
      startFlow();
    }
  }, [isOpen, flowState, startFlow]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFlowState('idle');
      setFlowResult(null);
      setError(null);
      setCopied(false);
      setPollAttempts(0);
    }
  }, [isOpen]);

  // ==========================================================================
  // Copy Code Handler
  // ==========================================================================

  const handleCopyCode = async () => {
    if (!flowResult?.userCode) return;

    try {
      await navigator.clipboard.writeText(flowResult.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = flowResult.userCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ==========================================================================
  // Open Verification URL
  // ==========================================================================

  const handleOpenVerificationUrl = async () => {
    if (flowResult?.verificationUrl) {
      await open(flowResult.verificationUrl);
    }
  };

  // ==========================================================================
  // Render
  // ==========================================================================

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-md mx-4 bg-zinc-900 rounded-xl flex flex-col overflow-hidden border border-zinc-800 shadow-2xl shadow-black/60"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100">
                    Connect {connector.displayName}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Sign in with {providerDisplayName}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 space-y-6">
              {/* Starting State */}
              {flowState === 'starting' && (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-400 mb-4" />
                  <p className="text-zinc-300">Initializing {providerDisplayName} login...</p>
                </div>
              )}

              {/* Device Code Flow */}
              {flowState === 'polling' && flowResult?.type === 'device_code' && (
                <div className="space-y-5">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                      <KeyRound className="w-6 h-6 text-blue-400" />
                    </div>
                    <p className="text-zinc-300">
                      Enter this code at {providerDisplayName}:
                    </p>
                  </div>

                  {/* User Code Display */}
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex-1 px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-center">
                      <span className="text-2xl font-mono font-bold text-white tracking-[0.2em]">
                        {flowResult.userCode}
                      </span>
                    </div>
                    <button
                      onClick={handleCopyCode}
                      className="p-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors border border-zinc-700"
                      title="Copy code"
                    >
                      {copied ? (
                        <Check className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                  </div>

                  {/* Verification URL Button */}
                  <button
                    onClick={handleOpenVerificationUrl}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open {flowResult.verificationUrl?.replace('https://', '').split('/')[0]}
                  </button>

                  {/* Polling Indicator */}
                  <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Waiting for authorization...
                    {pollAttempts > 0 && (
                      <span className="text-zinc-600">({pollAttempts})</span>
                    )}
                  </div>
                </div>
              )}

              {/* Browser Flow - Waiting */}
              {flowState === 'waiting' && flowResult?.type === 'browser' && (
                <div className="space-y-5 text-center">
                  <div className="w-16 h-16 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center">
                    <ExternalLink className="w-8 h-8 text-blue-400" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-zinc-300">
                      A browser window has been opened.
                    </p>
                    <p className="text-zinc-400 text-sm">
                      Please complete the authorization in your browser.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Waiting for authorization...
                  </div>

                  {/* Retry Button */}
                  <button
                    onClick={startFlow}
                    className="flex items-center justify-center gap-2 mx-auto px-4 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Open browser again
                  </button>
                </div>
              )}

              {/* Success State */}
              {flowState === 'success' && (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                    <Check className="w-8 h-8 text-green-400" />
                  </div>
                  <p className="text-zinc-100 font-medium text-lg">Connected!</p>
                  <p className="text-zinc-400 text-sm mt-1">
                    {connector.displayName} is now connected.
                  </p>
                </div>
              )}

              {/* Error State */}
              {flowState === 'error' && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                      <AlertCircle className="w-7 h-7 text-red-400" />
                    </div>
                    <p className="text-zinc-100 font-medium">Authorization Failed</p>
                  </div>

                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>

                  <button
                    onClick={startFlow}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try Again
                  </button>
                </div>
              )}

              {/* Help Text */}
              {(flowState === 'polling' || flowState === 'waiting') && (
                <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                  <p className="text-xs text-zinc-400">
                    OAuth tokens are stored locally in a file with user-only permissions.
                    We only request the permissions needed for this connector.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end px-6 py-4 border-t border-zinc-800">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                {flowState === 'success' ? 'Done' : 'Cancel'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
