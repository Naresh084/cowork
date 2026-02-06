import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_WHATSAPP_DENIAL_MESSAGE,
  normalizePhoneToE164Like,
  useIntegrationStore,
} from '../../stores/integration-store';
import { PlatformStatusBadge } from './PlatformStatusBadge';

export function WhatsAppSettings() {
  const platform = useIntegrationStore((s) => s.platforms.whatsapp);
  const whatsappQR = useIntegrationStore((s) => s.whatsappQR);
  const isConnecting = useIntegrationStore((s) => s.isConnecting.whatsapp);
  const connect = useIntegrationStore((s) => s.connect);
  const disconnect = useIntegrationStore((s) => s.disconnect);
  const whatsappConfig = useIntegrationStore((s) => s.whatsappConfig);
  const isConfigLoading = useIntegrationStore((s) => s.isConfigLoading);
  const isConfigSaving = useIntegrationStore((s) => s.isConfigSaving);
  const configError = useIntegrationStore((s) => s.configError);
  const loadConfig = useIntegrationStore((s) => s.loadConfig);
  const saveConfig = useIntegrationStore((s) => s.saveConfig);

  const [showGuide, setShowGuide] = useState(false);
  const [allowFromInput, setAllowFromInput] = useState('');
  const [allowFromDraft, setAllowFromDraft] = useState<string[]>([]);
  const [denialMessageDraft, setDenialMessageDraft] = useState(
    DEFAULT_WHATSAPP_DENIAL_MESSAGE
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const connected = platform?.connected ?? false;
  const displayName = platform?.displayName;
  const identityPhone = platform?.identityPhone;
  const identityName = platform?.identityName;
  const error = platform?.error;

  useEffect(() => {
    void loadConfig('whatsapp');
  }, [loadConfig]);

  useEffect(() => {
    setAllowFromDraft(whatsappConfig.allowFrom);
    setDenialMessageDraft(whatsappConfig.denialMessage);
  }, [whatsappConfig.allowFrom, whatsappConfig.denialMessage]);

  const isDirty = useMemo(() => {
    const currentAllow = [...whatsappConfig.allowFrom].sort().join(',');
    const draftAllow = [...allowFromDraft].sort().join(',');
    return (
      currentAllow !== draftAllow ||
      whatsappConfig.denialMessage !== denialMessageDraft
    );
  }, [allowFromDraft, denialMessageDraft, whatsappConfig.allowFrom, whatsappConfig.denialMessage]);
  const hasPendingAllowFromInput = allowFromInput.trim().length > 0;

  useEffect(() => {
    if (!saveNotice) return;
    const timer = setTimeout(() => setSaveNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [saveNotice]);

  const handleConnect = async () => {
    await connect('whatsapp');
  };

  const handleDisconnect = async () => {
    await disconnect('whatsapp');
  };

  const addAllowFromNumber = () => {
    setFormError(null);
    setSaveNotice(null);
    const trimmed = allowFromInput.trim();
    if (!trimmed) return;

    const normalized = normalizePhoneToE164Like(trimmed);
    if (!normalized) {
      setFormError('Enter a valid phone number.');
      return;
    }

    setAllowFromDraft((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setAllowFromInput('');
  };

  const removeAllowFromNumber = (number: string) => {
    setSaveNotice(null);
    setAllowFromDraft((prev) => prev.filter((entry) => entry !== number));
  };

  const handleSaveConfig = async () => {
    setFormError(null);
    setSaveNotice(null);

    const pendingInput = allowFromInput.trim();
    let nextAllowFrom = [...allowFromDraft];
    if (pendingInput) {
      const normalized = normalizePhoneToE164Like(pendingInput);
      if (!normalized) {
        setFormError('Enter a valid phone number.');
        return;
      }
      if (!nextAllowFrom.includes(normalized)) {
        nextAllowFrom = [...nextAllowFrom, normalized];
      }
    }

    try {
      await saveConfig('whatsapp', {
        senderPolicy: 'allowlist',
        allowFrom: nextAllowFrom,
        denialMessage: denialMessageDraft,
      });
      setAllowFromDraft(nextAllowFrom);
      setAllowFromInput('');
      setSaveNotice('Sender rules saved.');
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : String(saveError)
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Section */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-white/90">Connection Status</h3>
            <div className="mt-2">
              <PlatformStatusBadge
                platform="whatsapp"
                connected={connected}
                displayName={displayName}
              />
            </div>
            {error && (
              <p className="mt-2 text-xs text-[#FF5449]">{error}</p>
            )}
            {(identityName || identityPhone) && (
              <div className="mt-3 space-y-1 text-xs text-white/50">
                {identityName && (
                  <p>Bot identity: <span className="text-white/75">{identityName}</span></p>
                )}
                {identityPhone && (
                  <p>Bot number: <span className="text-white/75 font-mono">{identityPhone}</span></p>
                )}
              </div>
            )}
          </div>
          {connected ? (
            <button
              onClick={handleDisconnect}
              disabled={isConnecting}
              className="px-4 py-2 rounded-lg text-sm bg-[#FF5449]/10 text-[#FF5449] hover:bg-[#FF5449]/20 transition-colors disabled:opacity-50"
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Disconnect'
              )}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="px-4 py-2 rounded-lg text-sm text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#25D366' }}
              onMouseEnter={(e) => {
                if (!isConnecting) e.currentTarget.style.backgroundColor = '#1EB954';
              }}
              onMouseLeave={(e) => {
                if (!isConnecting) e.currentTarget.style.backgroundColor = '#25D366';
              }}
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Connect'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Sender Control Section */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
        <div>
          <h3 className="text-sm font-medium text-white/90">Sender Control</h3>
          <p className="mt-1 text-xs text-white/40">
            Only numbers in this allowlist can trigger the agent.
          </p>
        </div>

        <div>
          <label className="block text-xs text-white/50 mb-2">Allowlist Numbers</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={allowFromInput}
              onChange={(e) => setAllowFromInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addAllowFromNumber();
                }
              }}
              placeholder="+15551234567"
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm',
                'bg-[#0B0C10] border border-white/[0.08]',
                'text-white/90 placeholder:text-white/30',
                'focus:outline-none focus:border-[#1D4ED8]/50',
                'font-mono'
              )}
            />
            <button
              onClick={addAllowFromNumber}
              className="px-3 py-2 rounded-lg bg-[#1D4ED8]/20 text-[#93C5FD] hover:bg-[#1D4ED8]/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {allowFromDraft.length === 0 ? (
              <p className="text-xs text-white/35">No allowlisted numbers yet.</p>
            ) : (
              allowFromDraft.map((number) => (
                <span
                  key={number}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.06] text-xs text-white/75 font-mono"
                >
                  {number}
                  <button
                    onClick={() => removeAllowFromNumber(number)}
                    className="text-white/40 hover:text-white/80 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs text-white/50 mb-2">Unauthorized Reply Message</label>
          <textarea
            value={denialMessageDraft}
            onChange={(e) => setDenialMessageDraft(e.target.value)}
            rows={3}
            maxLength={280}
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-[#0B0C10] border border-white/[0.08]',
              'text-white/90 placeholder:text-white/30',
              'focus:outline-none focus:border-[#1D4ED8]/50'
            )}
          />
          <p className="mt-1 text-xs text-white/35 text-right">
            {denialMessageDraft.length}/280
          </p>
        </div>

        {(formError || configError) && (
          <p className="text-xs text-[#FF5449]">{formError || configError}</p>
        )}
        {saveNotice && (
          <p className="text-xs text-[#5EEAD4]">{saveNotice}</p>
        )}

        <div className="flex items-center justify-end">
          <button
            onClick={handleSaveConfig}
            disabled={(!isDirty && !hasPendingAllowFromInput) || isConfigSaving || isConfigLoading}
            className={cn(
              'px-4 py-2 rounded-lg text-sm text-white transition-colors disabled:opacity-40',
              'bg-[#1D4ED8] hover:bg-[#1E40AF]'
            )}
          >
            {isConfigSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Save Sender Rules'
            )}
          </button>
        </div>
      </div>

      {/* QR Code Section */}
      {!connected && whatsappQR && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]"
        >
          <h3 className="text-sm font-medium text-white/90 mb-3">Scan QR Code</h3>
          <div className="flex justify-center">
            <div className="p-3 bg-white rounded-xl">
              <img
                src={whatsappQR}
                alt="WhatsApp QR Code"
                className="w-48 h-48"
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-white/40 text-center">
            Open WhatsApp on your phone and scan this QR code to connect.
          </p>
        </motion.div>
      )}

      {/* Setup Guide */}
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-sm font-medium text-white/90">How to connect</span>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-white/40 transition-transform',
              showGuide && 'rotate-180'
            )}
          />
        </button>
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                <Step number={1} text="Link a dedicated WhatsApp number for Cowork using the QR code." />
                <Step number={2} text="Add allowed sender numbers in E.164 format (+countrycode...)." />
                <Step number={3} text="Save sender rules. Only allowed numbers will reach the agent." />
                <Step number={4} text="Unauthorized senders will receive the denial message above." />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 rounded-full bg-[#25D366]/20 text-[#25D366] flex items-center justify-center flex-shrink-0 text-xs font-medium mt-0.5">
        {number}
      </div>
      <p className="text-xs text-white/50">{text}</p>
    </div>
  );
}
