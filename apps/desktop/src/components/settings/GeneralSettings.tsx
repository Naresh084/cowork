import { useState, useEffect } from 'react';
import { Image, Video, Monitor, Search, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSettingsStore,
  useMediaRoutingSettings,
  useSpecializedModelsV2,
  DEFAULT_SPECIALIZED_MODELS_V2,
  type SpecializedModelsV2,
  type MediaRoutingSettings,
} from '@/stores/settings-store';

interface ModelSettingFieldProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}

function ModelSettingField({ icon, label, description, value, defaultValue, onChange }: ModelSettingFieldProps) {
  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/60">
          {icon}
        </div>
        <div>
          <div className="text-sm font-medium text-white/90">{label}</div>
        </div>
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
    </div>
  );
}

interface ToggleProps {
  label: string;
  description: string;
  value: 'google' | 'openai';
  onChange: (value: 'google' | 'openai') => void;
}

function BackendToggle({ label, description, value, onChange }: ToggleProps) {
  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-medium text-white/90">{label}</h4>
          <p className="mt-1 text-xs text-white/45">{description}</p>
        </div>
        <div className="inline-flex rounded-lg border border-white/[0.1] p-1 bg-[#0B0C10]">
          {(['google', 'openai'] as const).map((backend) => (
            <button
              key={backend}
              type="button"
              onClick={() => onChange(backend)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs transition-colors',
                value === backend
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-white/60 hover:text-white/85',
              )}
            >
              {backend === 'google' ? 'Google' : 'OpenAI'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GeneralSettings() {
  const routing = useMediaRoutingSettings();
  const specializedModelsV2 = useSpecializedModelsV2();
  const { setMediaRouting, updateSpecializedModelV2 } = useSettingsStore();

  const [localRouting, setLocalRouting] = useState<MediaRoutingSettings>(routing);
  const [localModels, setLocalModels] = useState<SpecializedModelsV2>(specializedModelsV2);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalRouting(routing);
  }, [routing]);

  useEffect(() => {
    setLocalModels(specializedModelsV2);
  }, [specializedModelsV2]);

  useEffect(() => {
    const routingChanged =
      localRouting.imageBackend !== routing.imageBackend ||
      localRouting.videoBackend !== routing.videoBackend;
    const modelsChanged = JSON.stringify(localModels) !== JSON.stringify(specializedModelsV2);
    setHasChanges(routingChanged || modelsChanged);
  }, [localModels, specializedModelsV2, localRouting, routing]);

  const handleSave = async () => {
    if (
      localRouting.imageBackend !== routing.imageBackend ||
      localRouting.videoBackend !== routing.videoBackend
    ) {
      await setMediaRouting(localRouting);
    }

    const keysToSyncGoogle: Array<keyof SpecializedModelsV2['google']> = [
      'imageGeneration',
      'videoGeneration',
      'computerUse',
      'deepResearchAgent',
    ];
    const keysToSyncOpenAI: Array<keyof SpecializedModelsV2['openai']> = [
      'imageGeneration',
      'videoGeneration',
    ];

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

    setHasChanges(false);
  };

  const handleReset = () => {
    setLocalRouting({ imageBackend: 'google', videoBackend: 'google' });
    setLocalModels({
      google: { ...DEFAULT_SPECIALIZED_MODELS_V2.google },
      openai: { ...DEFAULT_SPECIALIZED_MODELS_V2.openai },
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-white/90">Media & Specialized Models</h3>
        <p className="mt-1 text-xs text-white/40">
          Configure image/video backend routing and provider-specific model IDs.
        </p>
      </div>

      <BackendToggle
        label="Image generation backend"
        description="Controls which provider powers generate_image and edit_image."
        value={localRouting.imageBackend}
        onChange={(value) => setLocalRouting((prev) => ({ ...prev, imageBackend: value }))}
      />

      <BackendToggle
        label="Video generation backend"
        description="Controls which provider powers generate_video."
        value={localRouting.videoBackend}
        onChange={(value) => setLocalRouting((prev) => ({ ...prev, videoBackend: value }))}
      />

      <ModelSettingField
        icon={<Image className="w-4 h-4" />}
        label="Google image model"
        description="Used when image backend is Google."
        value={localModels.google.imageGeneration}
        defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.google.imageGeneration}
        onChange={(value) =>
          setLocalModels((prev) => ({ ...prev, google: { ...prev.google, imageGeneration: value } }))
        }
      />

      <ModelSettingField
        icon={<Video className="w-4 h-4" />}
        label="Google video model"
        description="Used when video backend is Google."
        value={localModels.google.videoGeneration}
        defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.google.videoGeneration}
        onChange={(value) =>
          setLocalModels((prev) => ({ ...prev, google: { ...prev.google, videoGeneration: value } }))
        }
      />

      <ModelSettingField
        icon={<Image className="w-4 h-4" />}
        label="OpenAI image model"
        description="Used when image backend is OpenAI."
        value={localModels.openai.imageGeneration}
        defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.openai.imageGeneration}
        onChange={(value) =>
          setLocalModels((prev) => ({ ...prev, openai: { ...prev.openai, imageGeneration: value } }))
        }
      />

      <ModelSettingField
        icon={<Video className="w-4 h-4" />}
        label="OpenAI video model"
        description="Used when video backend is OpenAI."
        value={localModels.openai.videoGeneration}
        defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.openai.videoGeneration}
        onChange={(value) =>
          setLocalModels((prev) => ({ ...prev, openai: { ...prev.openai, videoGeneration: value } }))
        }
      />

      <ModelSettingField
        icon={<Monitor className="w-4 h-4" />}
        label="Google computer use model"
        description="Used by computer_use tool (Google backend)."
        value={localModels.google.computerUse}
        defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.google.computerUse}
        onChange={(value) =>
          setLocalModels((prev) => ({ ...prev, google: { ...prev.google, computerUse: value } }))
        }
      />

      <ModelSettingField
        icon={<Search className="w-4 h-4" />}
        label="Google deep research model"
        description="Used by deep_research tool (Google backend)."
        value={localModels.google.deepResearchAgent}
        defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.google.deepResearchAgent}
        onChange={(value) =>
          setLocalModels((prev) => ({ ...prev, google: { ...prev.google, deepResearchAgent: value } }))
        }
      />

      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#1D4ED8]/10 border border-[#1D4ED8]/20">
        <Info className="w-4 h-4 text-[#93C5FD] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#93C5FD]">
          Backend/key/model changes for media apply to the next media tool call. Provider/base URL/model changes for
          active chat sessions may require a new session.
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
          onClick={handleSave}
          disabled={!hasChanges}
          className={cn(
            'px-4 py-2 rounded-lg text-sm transition-colors',
            hasChanges
              ? 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]'
              : 'bg-white/[0.06] text-white/30 cursor-not-allowed',
          )}
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
