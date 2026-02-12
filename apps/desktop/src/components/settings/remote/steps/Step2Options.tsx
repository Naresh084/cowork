import { Globe2, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  RemoteDraftOptions,
  RemoteTunnelMode,
  RemoteTunnelVisibility,
} from '@/stores/remote-access-store';

interface Step2OptionsProps {
  mode: RemoteTunnelMode;
  options: RemoteDraftOptions;
  customEndpointMissing: boolean;
  onChange: (input: Partial<RemoteDraftOptions>) => void;
  disabled?: boolean;
}

export function Step2Options({
  mode,
  options,
  customEndpointMissing,
  onChange,
  disabled = false,
}: Step2OptionsProps) {
  const cloudflareMode = mode === 'cloudflare';

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
          <label className="mb-1.5 block text-xs text-white/60">Tunnel name (optional)</label>
          <input
            type="text"
            value={options.tunnelName}
            disabled={disabled}
            onChange={(event) => onChange({ tunnelName: event.target.value })}
            placeholder="my-cowork-tunnel"
            className="w-full rounded-lg border border-white/[0.12] bg-[#0B0C10] px-3 py-2 text-sm text-white/90 placeholder:text-white/35 focus:border-[#3B82F6]/70 focus:outline-none disabled:opacity-50"
          />
          <p className="mt-1.5 text-xs text-white/45">Friendly name used in Cowork and provider setup context.</p>
        </div>

        <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
          <label className="mb-1.5 inline-flex items-center gap-1.5 text-xs text-white/60">
            <Globe2 className="h-3.5 w-3.5" />
            Domain (optional)
          </label>
          <input
            type="text"
            value={options.tunnelDomain}
            disabled={disabled}
            onChange={(event) => onChange({ tunnelDomain: event.target.value })}
            placeholder="chat.example.com"
            className="w-full rounded-lg border border-white/[0.12] bg-[#0B0C10] px-3 py-2 text-sm text-white/90 placeholder:text-white/35 focus:border-[#3B82F6]/70 focus:outline-none disabled:opacity-50"
          />
          <p className="mt-1.5 text-xs text-white/45">
            For Cloudflare this maps to a stable hostname. For custom mode this can complement your endpoint.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
        <label className="mb-1.5 inline-flex items-center gap-1.5 text-xs text-white/60">
          <Link2 className="h-3.5 w-3.5" />
          Endpoint URL ({mode === 'custom' ? 'required' : 'optional'})
        </label>
        <input
          type="text"
          value={options.publicBaseUrl}
          disabled={disabled}
          onChange={(event) => onChange({ publicBaseUrl: event.target.value })}
          placeholder="https://your-endpoint.example.com"
          className="w-full rounded-lg border border-white/[0.12] bg-[#0B0C10] px-3 py-2 text-sm text-white/90 placeholder:text-white/35 focus:border-[#3B82F6]/70 focus:outline-none disabled:opacity-50"
        />
        {customEndpointMissing ? (
          <p className="mt-1.5 text-xs text-[#FF9F9A]">Custom mode needs endpoint URL or domain before continuing.</p>
        ) : (
          <p className="mt-1.5 text-xs text-white/45">Leave empty for managed provider defaults.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.1] bg-black/20 p-3">
        <p className="text-xs text-white/60">Access scope</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ tunnelVisibility: 'public' })}
          className={cn(
            'rounded-lg border px-2.5 py-1 text-xs disabled:opacity-50',
            options.tunnelVisibility === 'public'
              ? 'border-[#4B83FF]/65 bg-[#1D4ED8]/25 text-[#D7E3FF]'
              : 'border-white/[0.12] text-white/65 hover:bg-white/[0.04]',
          )}
        >
          Public
        </button>
        <button
          type="button"
          onClick={() => onChange({ tunnelVisibility: 'private' as RemoteTunnelVisibility })}
          disabled={disabled || cloudflareMode}
          className={cn(
            'rounded-lg border px-2.5 py-1 text-xs disabled:opacity-50',
            options.tunnelVisibility === 'private'
              ? 'border-[#4B83FF]/65 bg-[#1D4ED8]/25 text-[#D7E3FF]'
              : 'border-white/[0.12] text-white/65 hover:bg-white/[0.04]',
            cloudflareMode && 'cursor-not-allowed opacity-45',
          )}
        >
          Private
        </button>
        <p className="text-xs text-white/50">Cloudflare mode remains internet-facing HTTPS.</p>
      </div>
    </div>
  );
}
