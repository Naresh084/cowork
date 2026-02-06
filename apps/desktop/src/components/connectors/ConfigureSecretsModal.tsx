import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, EyeOff, ExternalLink, Loader2, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import type { ConnectorManifest } from '@gemini-cowork/shared';
import { useConnectorStore } from '../../stores/connector-store';
import { getConnectorIcon } from './connector-icons';

interface ConfigureSecretsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connector: ConnectorManifest;
  onConfigured?: () => void;
}

export function ConfigureSecretsModal({
  isOpen,
  onClose,
  connector,
  onConfigured,
}: ConfigureSecretsModalProps) {
  const { configureSecrets, connectConnector, error, clearError } = useConnectorStore();

  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const Icon = getConnectorIcon(connector.icon);

  // Get secrets from auth config
  const secretDefinitions =
    connector.auth.type === 'env' ? connector.auth.secrets || [] : [];

  const requiredSecrets = secretDefinitions.filter((s) => s.required);
  const optionalSecrets = secretDefinitions.filter((s) => !s.required);

  // Check if all required secrets are filled
  const allRequiredFilled = requiredSecrets.every(
    (s) => secrets[s.key]?.trim()
  );

  const handleSecretChange = (key: string, value: string) => {
    setSecrets((prev) => ({ ...prev, [key]: value }));
    setLocalError(null);
    clearError();
  };

  const toggleShowSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async () => {
    if (!allRequiredFilled) {
      setLocalError('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);

    try {
      // Configure secrets
      await configureSecrets(connector.id, secrets);

      // Auto-connect after configuration
      await connectConnector(connector.id);

      onConfigured?.();
      onClose();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

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
            className="w-full max-w-lg mx-4 bg-zinc-900 rounded-xl flex flex-col overflow-hidden border border-zinc-800 shadow-2xl shadow-black/60"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-zinc-300" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100">
                    Configure {connector.displayName}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Enter your credentials to connect
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
            <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[60vh]">
              {/* Required Secrets */}
              {requiredSecrets.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Required Credentials
                  </h3>
                  {requiredSecrets.map((secret) => (
                    <SecretInput
                      key={secret.key}
                      secret={secret}
                      value={secrets[secret.key] || ''}
                      showValue={showSecrets[secret.key] || false}
                      onChange={(value) => handleSecretChange(secret.key, value)}
                      onToggleShow={() => toggleShowSecret(secret.key)}
                    />
                  ))}
                </div>
              )}

              {/* Optional Secrets */}
              {optionalSecrets.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-zinc-400">
                    Optional Credentials
                  </h3>
                  {optionalSecrets.map((secret) => (
                    <SecretInput
                      key={secret.key}
                      secret={secret}
                      value={secrets[secret.key] || ''}
                      showValue={showSecrets[secret.key] || false}
                      onChange={(value) => handleSecretChange(secret.key, value)}
                      onToggleShow={() => toggleShowSecret(secret.key)}
                    />
                  ))}
                </div>
              )}

              {/* Help text */}
              <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <p className="text-xs text-zinc-400">
                  Your credentials are securely stored in local encrypted storage and are
                  never transmitted except to authenticate with the service.
                </p>
              </div>

              {/* Error */}
              {(localError || error) && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-400">{localError || error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!allRequiredFilled || isSubmitting}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                  allRequiredFilled
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Save & Connect'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// Secret Input Component
interface SecretInputProps {
  secret: {
    key: string;
    description: string;
    required: boolean;
    placeholder?: string;
    link?: string;
  };
  value: string;
  showValue: boolean;
  onChange: (value: string) => void;
  onToggleShow: () => void;
}

function SecretInput({
  secret,
  value,
  showValue,
  onChange,
  onToggleShow,
}: SecretInputProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-300">
          {secret.key}
          {secret.required && <span className="text-red-400 ml-1">*</span>}
        </label>
        {secret.link && (
          <a
            href={secret.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            Get credentials
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <p className="text-xs text-zinc-500">{secret.description}</p>
      <div className="relative">
        <input
          type={showValue ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={secret.placeholder}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm pr-10"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-300"
        >
          {showValue ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
