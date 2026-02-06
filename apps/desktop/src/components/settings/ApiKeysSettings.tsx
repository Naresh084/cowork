import { useMemo, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Key, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from '@/components/ui/Toast';

function maskKey(value: string | null): string {
  if (!value) return 'Not configured';
  if (value.length <= 10) return '•'.repeat(value.length);
  return `${value.slice(0, 6)}${'•'.repeat(Math.max(6, value.length - 10))}${value.slice(-4)}`;
}

interface KeyCardProps {
  title: string;
  description: string;
  value: string | null;
  placeholder: string;
  isSaving: boolean;
  onSave: (value: string) => Promise<void>;
  onClear: () => Promise<void>;
}

function KeyCard({
  title,
  description,
  value,
  placeholder,
  isSaving,
  onSave,
  onClear,
}: KeyCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const [draft, setDraft] = useState('');

  const displayValue = useMemo(
    () => (showValue ? value || 'Not configured' : maskKey(value)),
    [showValue, value],
  );

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    try {
      await onSave(trimmed);
      setIsEditing(false);
      setDraft('');
      toast.success(`${title} saved`);
    } catch (error) {
      toast.error(
        `Failed to save ${title}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${title} copied`);
    } catch (error) {
      toast.error(
        `Failed to copy ${title}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleClear = async () => {
    try {
      await onClear();
      setIsEditing(false);
      setDraft('');
      toast.success(`${title} removed`);
    } catch (error) {
      toast.error(
        `Failed to remove ${title}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
      <div>
        <h4 className="text-sm font-medium text-white/90">{title}</h4>
        <p className="mt-1 text-xs text-white/45">{description}</p>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <input
            type="password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-[#0B0C10] border border-white/[0.08]',
              'text-white/90 placeholder:text-white/30',
              'focus:outline-none focus:border-[#1D4ED8]/50',
              'font-mono'
            )}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !draft.trim()}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                isSaving || !draft.trim()
                  ? 'bg-white/[0.06] text-white/30 cursor-not-allowed'
                  : 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]'
              )}
            >
              <Check className="w-4 h-4" />
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setDraft('');
              }}
              className="px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="px-3 py-2 rounded-lg bg-[#0B0C10] border border-white/[0.08] text-xs text-white/65 font-mono break-all">
            {displayValue}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowValue((current) => !current)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white/[0.06] text-white/70 hover:bg-white/[0.1] transition-colors"
            >
              {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showValue ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
                setDraft('');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white/[0.06] text-white/70 hover:bg-white/[0.1] transition-colors"
            >
              <Key className="w-4 h-4" />
              {value ? 'Update' : 'Set key'}
            </button>
            {value ? (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white/[0.06] text-white/70 hover:bg-white/[0.1] transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            ) : null}
            {value ? (
              <button
                type="button"
                onClick={handleClear}
                disabled={isSaving}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  isSaving
                    ? 'bg-[#FF5449]/10 text-[#FF5449]/40 cursor-not-allowed'
                    : 'bg-[#FF5449]/10 text-[#FF5449] hover:bg-[#FF5449]/20'
                )}
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function ApiKeysSettings() {
  const {
    apiKey,
    stitchApiKey,
    isLoading,
    setApiKey,
    clearApiKey,
    setStitchApiKey,
    clearStitchApiKey,
  } = useAuthStore();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-white/90">API Credentials</h3>
        <p className="mt-1 text-xs text-white/40">
          Keys are stored locally in Cowork credentials storage with restrictive file permissions and
          are only used for runtime API calls.
        </p>
      </div>

      <KeyCard
        title="Google Gemini API Key"
        description="Primary key used by Cowork for chat generation, search, media tools, and model execution."
        value={apiKey}
        placeholder="Enter your Gemini API key (starts with AI...)"
        isSaving={isLoading}
        onSave={setApiKey}
        onClear={clearApiKey}
      />

      <KeyCard
        title="Stitch MCP API Key"
        description="Used only for Stitch MCP servers/tools. Stitch tools are loaded only when this key is configured."
        value={stitchApiKey}
        placeholder="Enter your Stitch MCP API key"
        isSaving={isLoading}
        onSave={setStitchApiKey}
        onClear={clearStitchApiKey}
      />

      <div className="p-4 rounded-xl bg-[#1D4ED8]/10 border border-[#1D4ED8]/20">
        <p className="text-xs text-[#93C5FD]">
          If Stitch MCP tools are configured via Gemini extensions, Cowork injects this key at runtime and
          only enables Stitch tools when the key is present.
        </p>
      </div>
    </div>
  );
}
