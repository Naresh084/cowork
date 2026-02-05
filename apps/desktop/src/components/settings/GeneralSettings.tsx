import { useState, useEffect } from 'react';
import { Image, Video, Monitor, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSettingsStore,
  useSpecializedModels,
  DEFAULT_SPECIALIZED_MODELS,
  type SpecializedModels,
} from '@/stores/settings-store';

interface ModelSettingFieldProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}

function ModelSettingField({
  icon,
  label,
  description,
  value,
  defaultValue,
  onChange,
}: ModelSettingFieldProps) {
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
          'focus:outline-none focus:border-[#4C71FF]/50',
          'font-mono'
        )}
      />
      <p className="mt-2 text-xs text-white/40">{description}</p>
    </div>
  );
}

export function GeneralSettings() {
  const specializedModels = useSpecializedModels();
  const { updateSpecializedModel } = useSettingsStore();

  const [localModels, setLocalModels] = useState<SpecializedModels>(specializedModels);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalModels(specializedModels);
  }, [specializedModels]);

  useEffect(() => {
    const changed = Object.keys(localModels).some(
      (key) =>
        localModels[key as keyof SpecializedModels] !==
        specializedModels[key as keyof SpecializedModels]
    );
    setHasChanges(changed);
  }, [localModels, specializedModels]);

  const handleSave = async () => {
    for (const key of Object.keys(localModels) as Array<keyof SpecializedModels>) {
      if (localModels[key] !== specializedModels[key]) {
        await updateSpecializedModel(key, localModels[key]);
      }
    }
    setHasChanges(false);
  };

  const handleReset = () => {
    setLocalModels({ ...DEFAULT_SPECIALIZED_MODELS });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-white/90">Specialized Models</h3>
        <p className="mt-1 text-xs text-white/40">
          Configure AI models used for specialized tasks.
        </p>
      </div>

      <ModelSettingField
        icon={<Image className="w-4 h-4" />}
        label="Image Generation"
        description="Used for generate_image and edit_image tools. Requires an Imagen model."
        value={localModels.imageGeneration}
        defaultValue={DEFAULT_SPECIALIZED_MODELS.imageGeneration}
        onChange={(value) => setLocalModels((m) => ({ ...m, imageGeneration: value }))}
      />

      <ModelSettingField
        icon={<Video className="w-4 h-4" />}
        label="Video Generation"
        description="Used for generate_video tool. Requires a Veo model."
        value={localModels.videoGeneration}
        defaultValue={DEFAULT_SPECIALIZED_MODELS.videoGeneration}
        onChange={(value) => setLocalModels((m) => ({ ...m, videoGeneration: value }))}
      />

      <ModelSettingField
        icon={<Monitor className="w-4 h-4" />}
        label="Computer Use"
        description="Used for browser automation. Requires the computer-use preview model."
        value={localModels.computerUse}
        defaultValue={DEFAULT_SPECIALIZED_MODELS.computerUse}
        onChange={(value) => setLocalModels((m) => ({ ...m, computerUse: value }))}
      />

      {/* Info note */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#4C71FF]/10 border border-[#4C71FF]/20">
        <Info className="w-4 h-4 text-[#8CA2FF] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#8CA2FF]">
          Search, research, and video analysis tools automatically use your selected chat model.
          Only the specialized capabilities above need separate model configuration.
        </p>
      </div>

      {/* Actions */}
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
              ? 'bg-[#4C71FF] text-white hover:bg-[#5B7FFF]'
              : 'bg-white/[0.06] text-white/30 cursor-not-allowed'
          )}
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
