import { useEffect, useMemo, useState } from 'react';
import { Image, Video, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSettingsStore,
  useMediaRoutingSettings,
  useSpecializedModelsV2,
  DEFAULT_SPECIALIZED_MODELS_V2,
  type SpecializedModelsV2,
  type MediaRoutingSettings,
} from '@/stores/settings-store';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from '@/components/ui/Toast';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';
import { useCapabilityStore } from '@/stores/capability-store';

type MediaBackend = MediaRoutingSettings['imageBackend'];

interface ModelSettingFieldProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  settingId: string;
}

function ModelSettingField({ icon, label, description, value, defaultValue, onChange, settingId }: ModelSettingFieldProps) {
  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/60">
            {icon}
          </div>
          <div className="text-sm font-medium text-white/90">{label}</div>
        </div>
        <SettingHelpPopover settingId={settingId} />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={defaultValue}
        className={cn(
          'w-full px-3 py-2 rounded-lg text-sm',
          'bg-[#0B0C10] border border-white/[0.08]',
          'text-white/90 placeholder:text-white/30',
          'focus:outline-none focus:border-[#1D4ED8]/50',
          'font-mono',
        )}
      />
      <p className="mt-2 text-xs text-white/40">{description}</p>
      <p className="mt-1 text-[11px] text-white/35">Used by tools: generate_image, edit_image, generate_video</p>
    </div>
  );
}

function BackendToggle({
  label,
  description,
  value,
  onChange,
  settingId,
}: {
  label: string;
  description: string;
  value: MediaBackend;
  onChange: (value: MediaBackend) => void;
  settingId: string;
}) {
  const options: Array<{ id: MediaBackend; label: string }> = [
    { id: 'google', label: 'Google' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'fal', label: 'Fal' },
  ];

  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-white/90">{label}</h4>
            <SettingHelpPopover settingId={settingId} />
          </div>
          <p className="mt-1 text-xs text-white/45">{description}</p>
          <p className="mt-1 text-[11px] text-white/35">Used by tools: generate_image, edit_image, generate_video</p>
        </div>
        <div className="inline-flex rounded-lg border border-white/[0.1] p-1 bg-[#0B0C10]">
          {options.map((backend) => (
            <button
              key={backend.id}
              type="button"
              onClick={() => onChange(backend.id)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs transition-colors',
                value === backend.id
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-white/60 hover:text-white/85',
              )}
            >
              {backend.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function KeyField({
  label,
  description,
  placeholder,
  value,
  onSave,
  onClear,
  isLoading,
  settingId,
}: {
  label: string;
  description: string;
  placeholder: string;
  value: string | null;
  onSave: (value: string) => Promise<void>;
  onClear: () => Promise<void>;
  isLoading: boolean;
  settingId: string;
}) {
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-white/90">{label}</h4>
          <SettingHelpPopover settingId={settingId} />
        </div>
        <p className="mt-1 text-xs text-white/45">{description}</p>
        <p className="mt-1 text-[11px] text-white/35">Used by tools: generate_image, edit_image, generate_video</p>
      </div>
      <input
        type="password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full px-3 py-2 rounded-lg text-sm',
          'bg-[#0B0C10] border border-white/[0.08]',
          'text-white/90 placeholder:text-white/30',
          'focus:outline-none focus:border-[#1D4ED8]/50',
          'font-mono',
        )}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isLoading || !draft.trim()}
          onClick={() => void onSave(draft.trim())}
          className={cn(
            'px-3 py-2 rounded-lg text-sm transition-colors',
            isLoading || !draft.trim()
              ? 'bg-white/[0.06] text-white/30 cursor-not-allowed'
              : 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]',
          )}
        >
          Save Key
        </button>
        <button
          type="button"
          disabled={isLoading || !value}
          onClick={() => void onClear()}
          className={cn(
            'px-3 py-2 rounded-lg text-sm transition-colors',
            isLoading || !value
              ? 'bg-white/[0.06] text-white/30 cursor-not-allowed'
              : 'bg-[#FF5449]/10 text-[#FF5449] hover:bg-[#FF5449]/20',
          )}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export function GeneralSettings() {
  const routing = useMediaRoutingSettings();
  const specializedModelsV2 = useSpecializedModelsV2();
  const { setMediaRouting, updateSpecializedModelV2 } = useSettingsStore();
  const {
    googleApiKey,
    openaiApiKey,
    falApiKey,
    isLoading,
    setGoogleApiKey,
    clearGoogleApiKey,
    setOpenAIApiKey,
    clearOpenAIApiKey,
    setFalApiKey,
    clearFalApiKey,
    applyRuntimeConfig,
  } = useAuthStore();
  const refreshCapabilitySnapshot = useCapabilityStore((state) => state.refreshSnapshot);

  const [localRouting, setLocalRouting] = useState<MediaRoutingSettings>(routing);
  const [localModels, setLocalModels] = useState<SpecializedModelsV2>(specializedModelsV2);

  useEffect(() => {
    setLocalRouting(routing);
  }, [routing]);

  useEffect(() => {
    setLocalModels(specializedModelsV2);
  }, [specializedModelsV2]);

  const hasModelChanges = useMemo(() => {
    const routingChanged =
      localRouting.imageBackend !== routing.imageBackend ||
      localRouting.videoBackend !== routing.videoBackend;
    const modelsChanged = JSON.stringify(localModels) !== JSON.stringify(specializedModelsV2);
    return routingChanged || modelsChanged;
  }, [localModels, specializedModelsV2, localRouting, routing]);

  const applyRuntime = async () => {
    const state = useSettingsStore.getState();
    await applyRuntimeConfig({
      activeProvider: state.activeProvider,
      providerBaseUrls: state.providerBaseUrls,
      externalSearchProvider: state.externalSearchProvider,
      mediaRouting: state.mediaRouting,
      specializedModels: state.specializedModelsV2,
    });
  };

  const handleSaveMediaConfig = async () => {
    try {
      if (
        localRouting.imageBackend !== routing.imageBackend ||
        localRouting.videoBackend !== routing.videoBackend
      ) {
        await setMediaRouting(localRouting);
      }

      const keysToSyncGoogle: Array<keyof SpecializedModelsV2['google']> = ['imageGeneration', 'videoGeneration'];
      const keysToSyncOpenAI: Array<keyof SpecializedModelsV2['openai']> = ['imageGeneration', 'videoGeneration'];
      const keysToSyncFal: Array<keyof SpecializedModelsV2['fal']> = ['imageGeneration', 'videoGeneration'];

      for (const key of keysToSyncGoogle) {
        if (localModels.google[key] !== specializedModelsV2.google[key]) {
          await updateSpecializedModelV2('google', key, localModels.google[key]);
        }
      }
      for (const key of keysToSyncOpenAI) {
        if (localModels.openai[key] !== specializedModelsV2.openai[key]) {
          await updateSpecializedModelV2('openai', key, localModels.openai[key]);
        }
      }
      for (const key of keysToSyncFal) {
        if (localModels.fal[key] !== specializedModelsV2.fal[key]) {
          await updateSpecializedModelV2('fal', key, localModels.fal[key]);
        }
      }

      toast.success('Media settings updated');
      await refreshCapabilitySnapshot();
    } catch (error) {
      toast.error('Failed to update media settings', error instanceof Error ? error.message : String(error));
    }
  };

  const handleReset = () => {
    setLocalRouting({ imageBackend: 'google', videoBackend: 'google' });
    setLocalModels({
      google: { ...DEFAULT_SPECIALIZED_MODELS_V2.google },
      openai: { ...DEFAULT_SPECIALIZED_MODELS_V2.openai },
      fal: { ...DEFAULT_SPECIALIZED_MODELS_V2.fal },
    });
  };

  return (
    <div className="space-y-4" data-tour-id="settings-media-section">
      <div>
        <h3 className="text-sm font-medium text-white/90">Media Generation Settings</h3>
        <p className="mt-1 text-xs text-white/40">
          Select backend routing, media API keys, and model IDs for unified `generate_image` and `generate_video`
          tools.
        </p>
      </div>

      <BackendToggle
        label="Image generation backend"
        description="Controls which backend powers `generate_image` and `edit_image`."
        value={localRouting.imageBackend}
        onChange={(value) => setLocalRouting((prev) => ({ ...prev, imageBackend: value }))}
        settingId="media.imageBackend"
      />

      <BackendToggle
        label="Video generation backend"
        description="Controls which backend powers `generate_video`."
        value={localRouting.videoBackend}
        onChange={(value) => setLocalRouting((prev) => ({ ...prev, videoBackend: value }))}
        settingId="media.videoBackend"
      />

      <KeyField
        label="Google Media API Key"
        description="Used when media backend is Google. Also enables Google fallback media paths."
        placeholder="Enter Google API key"
        value={googleApiKey}
        onSave={async (value) => {
          await setGoogleApiKey(value);
          await applyRuntime();
          toast.success('Google media key saved');
          await refreshCapabilitySnapshot();
        }}
        onClear={async () => {
          await clearGoogleApiKey();
          await applyRuntime();
          toast.success('Google media key removed');
          await refreshCapabilitySnapshot();
        }}
        isLoading={isLoading}
        settingId="media.googleApiKey"
      />

      <KeyField
        label="OpenAI Media API Key"
        description="Used when media backend is OpenAI. Falls back to provider key when provider is OpenAI."
        placeholder="Enter OpenAI API key"
        value={openaiApiKey}
        onSave={async (value) => {
          await setOpenAIApiKey(value);
          await applyRuntime();
          toast.success('OpenAI media key saved');
          await refreshCapabilitySnapshot();
        }}
        onClear={async () => {
          await clearOpenAIApiKey();
          await applyRuntime();
          toast.success('OpenAI media key removed');
          await refreshCapabilitySnapshot();
        }}
        isLoading={isLoading}
        settingId="media.openaiApiKey"
      />

      <KeyField
        label="Fal Media API Key"
        description="Used when media backend is Fal for image/video generation."
        placeholder="Enter Fal API key"
        value={falApiKey}
        onSave={async (value) => {
          await setFalApiKey(value);
          await applyRuntime();
          toast.success('Fal media key saved');
          await refreshCapabilitySnapshot();
        }}
        onClear={async () => {
          await clearFalApiKey();
          await applyRuntime();
          toast.success('Fal media key removed');
          await refreshCapabilitySnapshot();
        }}
        isLoading={isLoading}
        settingId="media.falApiKey"
      />

      <ModelSettingField
        icon={<Image className="w-4 h-4" />}
        label="Google image model"
        description="Applied when image backend is Google."
        value={localModels.google.imageGeneration}
        defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.google.imageGeneration}
        onChange={(value) =>
          setLocalModels((prev) => ({ ...prev, google: { ...prev.google, imageGeneration: value } }))
        }
        settingId="media.googleImageModel"
      />

      <ModelSettingField
        icon={<Video className="w-4 h-4" />}
        label="Google video model"
        description="Applied when video backend is Google."
        value={localModels.google.videoGeneration}
        defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.google.videoGeneration}
        onChange={(value) =>
          setLocalModels((prev) => ({ ...prev, google: { ...prev.google, videoGeneration: value } }))
        }
        settingId="media.googleVideoModel"
      />

      <ModelSettingField
        icon={<Image className="w-4 h-4" />}
        label="OpenAI image model"
        description="Applied when image backend is OpenAI."
        value={localModels.openai.imageGeneration}
        defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.openai.imageGeneration}
        onChange={(value) =>
          setLocalModels((prev) => ({ ...prev, openai: { ...prev.openai, imageGeneration: value } }))
        }
        settingId="media.openaiImageModel"
      />

      <ModelSettingField
        icon={<Video className="w-4 h-4" />}
        label="OpenAI video model"
        description="Applied when video backend is OpenAI."
        value={localModels.openai.videoGeneration}
        defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.openai.videoGeneration}
        onChange={(value) =>
          setLocalModels((prev) => ({ ...prev, openai: { ...prev.openai, videoGeneration: value } }))
        }
        settingId="media.openaiVideoModel"
      />

      <ModelSettingField
        icon={<Image className="w-4 h-4" />}
        label="Fal image model"
        description="Applied when image backend is Fal."
        value={localModels.fal.imageGeneration}
        defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.fal.imageGeneration}
        onChange={(value) =>
          setLocalModels((prev) => ({ ...prev, fal: { ...prev.fal, imageGeneration: value } }))
        }
        settingId="media.falImageModel"
      />

      <ModelSettingField
        icon={<Video className="w-4 h-4" />}
        label="Fal video model"
        description="Applied when video backend is Fal."
        value={localModels.fal.videoGeneration}
        defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.fal.videoGeneration}
        onChange={(value) =>
          setLocalModels((prev) => ({ ...prev, fal: { ...prev.fal, videoGeneration: value } }))
        }
        settingId="media.falVideoModel"
      />

      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#1D4ED8]/10 border border-[#1D4ED8]/20">
        <Info className="w-4 h-4 text-[#93C5FD] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#93C5FD]">
          Media backend/key/model changes apply to the next media tool call. Existing chat sessions can keep running,
          but start a new session if you also changed provider/base URL/chat model.
        </p>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handleReset}
          className="px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
        >
          Reset to defaults
        </button>
        <button
          onClick={() => void handleSaveMediaConfig()}
          disabled={!hasModelChanges}
          className={cn(
            'px-4 py-2 rounded-lg text-sm transition-colors',
            hasModelChanges
              ? 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]'
              : 'bg-white/[0.06] text-white/30 cursor-not-allowed',
          )}
        >
          Save media config
        </button>
      </div>
    </div>
  );
}
