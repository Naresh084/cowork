// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useMemo, useState } from 'react';
import { Image, Video, Info, Search, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  resolveActiveSoul,
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

type FalModelCapability = 'image' | 'video' | 'unknown';

interface FalModelInfo {
  id: string;
  name: string;
  description?: string;
  capability: FalModelCapability;
}

interface FalCatalogResponseModel {
  id?: string;
  model_id?: string;
  name?: string;
  title?: string;
  description?: string;
  tags?: string[];
  modalities?: string[];
  input_modalities?: string[];
  output_modalities?: string[];
}

interface ModelSettingFieldProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  settingId: string;
}

function classifyFalModel(model: FalCatalogResponseModel): FalModelCapability {
  const corpus = [
    model.id,
    model.model_id,
    model.name,
    model.title,
    model.description,
    ...(model.tags || []),
    ...(model.modalities || []),
    ...(model.input_modalities || []),
    ...(model.output_modalities || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/video|text-to-video|img-to-video|animate|kling|veo/.test(corpus)) {
    return 'video';
  }
  if (/image|text-to-image|inpaint|flux|sdxl|upscale|edit/.test(corpus)) {
    return 'image';
  }
  return 'unknown';
}

function normalizeFalCatalog(payload: unknown): FalModelInfo[] {
  const items = (() => {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      if (Array.isArray(obj.models)) return obj.models;
      if (Array.isArray(obj.data)) return obj.data;
      if (Array.isArray(obj.items)) return obj.items;
    }
    return [];
  })();

  const normalized = items
    .map((row) => {
      const model = row as FalCatalogResponseModel;
      const id = String(model.id || model.model_id || '').trim();
      if (!id) return null;
      const name = String(model.name || model.title || id).trim();
      const description = typeof model.description === 'string' ? model.description.trim() : undefined;
      return {
        id,
        name,
        description,
        capability: classifyFalModel(model),
      } as FalModelInfo;
    })
    .filter((row): row is FalModelInfo => Boolean(row));

  const seen = new Set<string>();
  return normalized.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
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
  const { setMediaRouting, updateSpecializedModelV2, updateSetting } = useSettingsStore();
  const {
    googleApiKey,
    falApiKey,
    isLoading,
    setGoogleApiKey,
    clearGoogleApiKey,
    setFalApiKey,
    clearFalApiKey,
    applyRuntimeConfig,
  } = useAuthStore();
  const refreshCapabilitySnapshot = useCapabilityStore((state) => state.refreshSnapshot);

  const [localRouting, setLocalRouting] = useState<MediaRoutingSettings>(routing);
  const [localModels, setLocalModels] = useState<SpecializedModelsV2>(specializedModelsV2);
  const [falCatalog, setFalCatalog] = useState<FalModelInfo[]>([]);
  const [falCatalogLoading, setFalCatalogLoading] = useState(false);
  const [falCatalogError, setFalCatalogError] = useState<string | null>(null);
  const [falSearch, setFalSearch] = useState('');

  useEffect(() => {
    setLocalRouting(routing);
  }, [routing]);

  useEffect(() => {
    setLocalModels(specializedModelsV2);
  }, [specializedModelsV2]);

  useEffect(() => {
    const loadFalModels = async () => {
      if (!falApiKey) {
        setFalCatalog([]);
        setFalCatalogError(null);
        return;
      }

      setFalCatalogLoading(true);
      setFalCatalogError(null);
      try {
        const response = await fetch('https://fal.run/v1/models', {
          headers: {
            Authorization: `Key ${falApiKey}`,
          },
        });
        const body = await response.text();
        if (!response.ok) {
          throw new Error(`Fal model catalog failed (${response.status})`);
        }
        const parsed = body ? JSON.parse(body) : [];
        setFalCatalog(normalizeFalCatalog(parsed));
      } catch (error) {
        setFalCatalog([]);
        setFalCatalogError(error instanceof Error ? error.message : 'Failed to load Fal model catalog');
      } finally {
        setFalCatalogLoading(false);
      }
    };

    void loadFalModels();
  }, [falApiKey]);

  const hasModelChanges = useMemo(() => {
    const routingChanged =
      localRouting.imageBackend !== routing.imageBackend ||
      localRouting.videoBackend !== routing.videoBackend;
    const modelsChanged = JSON.stringify(localModels) !== JSON.stringify(specializedModelsV2);
    return routingChanged || modelsChanged;
  }, [localModels, specializedModelsV2, localRouting, routing]);

  const filteredFalCatalog = useMemo(() => {
    const query = falSearch.trim().toLowerCase();
    if (!query) return falCatalog.slice(0, 50);
    return falCatalog
      .filter((model) =>
        `${model.id} ${model.name} ${model.description || ''}`.toLowerCase().includes(query),
      )
      .slice(0, 50);
  }, [falCatalog, falSearch]);

  const falEnabledModels = useMemo(
    () => localModels.fal.enabledModels || [localModels.fal.imageGeneration, localModels.fal.videoGeneration],
    [localModels.fal.enabledModels, localModels.fal.imageGeneration, localModels.fal.videoGeneration],
  );

  const falImageCandidates = useMemo(() => {
    const known = new Set(falEnabledModels);
    return falCatalog
      .filter((model) => known.has(model.id) && model.capability !== 'video')
      .map((model) => model.id);
  }, [falCatalog, falEnabledModels]);

  const falVideoCandidates = useMemo(() => {
    const known = new Set(falEnabledModels);
    return falCatalog
      .filter((model) => known.has(model.id) && model.capability !== 'image')
      .map((model) => model.id);
  }, [falCatalog, falEnabledModels]);

  const applyRuntime = async () => {
    const state = useSettingsStore.getState();
    const activeSoul = resolveActiveSoul(state.souls, state.activeSoulId, state.defaultSoulId);
    await applyRuntimeConfig({
      activeProvider: state.activeProvider,
      providerBaseUrls: state.providerBaseUrls,
      mediaRouting: state.mediaRouting,
      specializedModels: state.specializedModelsV2,
      sandbox: state.commandSandbox,
      activeSoul,
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
      const keysToSyncFal: Array<keyof SpecializedModelsV2['fal']> = ['imageGeneration', 'videoGeneration'];

      for (const key of keysToSyncGoogle) {
        if (localModels.google[key] !== specializedModelsV2.google[key]) {
          await updateSpecializedModelV2('google', key, localModels.google[key]);
        }
      }
      for (const key of keysToSyncFal) {
        if (localModels.fal[key] !== specializedModelsV2.fal[key]) {
          await updateSpecializedModelV2('fal', key, localModels.fal[key] as string);
        }
      }

      updateSetting('specializedModelsV2', {
        ...useSettingsStore.getState().specializedModelsV2,
        fal: {
          ...localModels.fal,
          enabledModels: Array.from(new Set(localModels.fal.enabledModels || [])).filter(Boolean),
          defaultImageModelId: localModels.fal.defaultImageModelId?.trim() || localModels.fal.imageGeneration,
          defaultVideoModelId: localModels.fal.defaultVideoModelId?.trim() || localModels.fal.videoGeneration,
        },
      });

      await applyRuntime();
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
      fal: {
        ...DEFAULT_SPECIALIZED_MODELS_V2.fal,
        enabledModels: [...(DEFAULT_SPECIALIZED_MODELS_V2.fal.enabledModels || [])],
      },
    });
  };

  const addFalEnabledModel = (modelId: string) => {
    const trimmed = modelId.trim();
    if (!trimmed) return;
    setLocalModels((prev) => ({
      ...prev,
      fal: {
        ...prev.fal,
        enabledModels: Array.from(new Set([...(prev.fal.enabledModels || []), trimmed])),
      },
    }));
  };

  const removeFalEnabledModel = (modelId: string) => {
    setLocalModels((prev) => ({
      ...prev,
      fal: {
        ...prev.fal,
        enabledModels: (prev.fal.enabledModels || []).filter((id) => id !== modelId),
      },
    }));
  };

  return (
    <div className="space-y-4" data-tour-id="settings-media-section">
      <div>
        <h3 className="text-sm font-medium text-white/90">Media Generation Settings</h3>
        <p className="mt-1 text-xs text-white/40">
          Google is the default media backend. Fal can be enabled for multi-model image and video generation.
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
        description="Used when media backend is Google."
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
        label="Fal Media API Key"
        description="Used when media backend is Fal for image and video generation."
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

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium text-white/90">Fal Model Catalog</h4>
            <p className="text-xs text-white/45">Search Fal models and add them to your enabled list.</p>
          </div>
          <SettingHelpPopover settingId="media.falModelCatalog" />
        </div>

        {falApiKey ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={falSearch}
                onChange={(event) => setFalSearch(event.target.value)}
                placeholder="Search Fal model ids"
                className="w-full rounded-lg border border-white/[0.08] bg-[#0B0C10] py-2 pl-9 pr-3 text-sm text-white/90 focus:border-[#1D4ED8]/50 focus:outline-none"
              />
            </div>

            {falCatalogLoading ? <p className="text-xs text-white/45">Loading Fal models…</p> : null}
            {falCatalogError ? (
              <p className="text-xs text-[#FCA5A5]">
                Could not fetch Fal catalog ({falCatalogError}). You can still enter model IDs manually below.
              </p>
            ) : null}

            <div className="max-h-52 overflow-y-auto space-y-1 rounded-lg border border-white/[0.06] bg-[#0B0C10]/70 p-2">
              {filteredFalCatalog.length === 0 ? (
                <p className="px-2 py-1 text-xs text-white/45">No models found.</p>
              ) : (
                filteredFalCatalog.map((model) => (
                  <div key={model.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.04]">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-mono text-white/85">{model.id}</p>
                      <p className="truncate text-[11px] text-white/45">{model.capability}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addFalEnabledModel(model.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-[#1D4ED8]/20 px-2 py-1 text-[11px] text-[#BFDBFE] hover:bg-[#1D4ED8]/30"
                    >
                      <Plus className="h-3 w-3" />
                      Enable
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-white/45">Set a Fal API key to load the model catalog.</p>
        )}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <h4 className="text-sm font-medium text-white/90">Enabled Fal Models</h4>
        <div className="flex flex-wrap gap-2">
          {falEnabledModels.map((modelId) => (
            <span key={modelId} className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#0B0C10] px-2 py-1 text-[11px] text-white/80">
              <span className="font-mono">{modelId}</span>
              <button type="button" onClick={() => removeFalEnabledModel(modelId)} className="text-white/50 hover:text-white">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          placeholder="Add model id manually (press Enter)"
          className="w-full rounded-lg border border-white/[0.08] bg-[#0B0C10] px-3 py-2 text-sm text-white/90 focus:border-[#1D4ED8]/50 focus:outline-none"
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const target = event.target as HTMLInputElement;
            addFalEnabledModel(target.value);
            target.value = '';
          }}
        />
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <h4 className="text-sm font-medium text-white/90">Fal Defaults</h4>

        <label className="block text-xs text-white/55">Default Fal image model</label>
        <select
          value={localModels.fal.defaultImageModelId || localModels.fal.imageGeneration}
          onChange={(event) =>
            setLocalModels((prev) => ({
              ...prev,
              fal: {
                ...prev.fal,
                defaultImageModelId: event.target.value,
                imageGeneration: event.target.value,
              },
            }))
          }
          className="app-select"
        >
          {Array.from(new Set([...(falImageCandidates.length ? falImageCandidates : falEnabledModels), localModels.fal.imageGeneration])).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>

        <label className="block text-xs text-white/55">Default Fal video model</label>
        <select
          value={localModels.fal.defaultVideoModelId || localModels.fal.videoGeneration}
          onChange={(event) =>
            setLocalModels((prev) => ({
              ...prev,
              fal: {
                ...prev.fal,
                defaultVideoModelId: event.target.value,
                videoGeneration: event.target.value,
              },
            }))
          }
          className="app-select"
        >
          {Array.from(new Set([...(falVideoCandidates.length ? falVideoCandidates : falEnabledModels), localModels.fal.videoGeneration])).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>

        <ModelSettingField
          icon={<Image className="w-4 h-4" />}
          label="Manual Fal image model"
          description="Fallback manual model ID if catalog is unavailable."
          value={localModels.fal.imageGeneration}
          defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.fal.imageGeneration}
          onChange={(value) =>
            setLocalModels((prev) => ({ ...prev, fal: { ...prev.fal, imageGeneration: value } }))
          }
          settingId="media.falImageModel"
        />

        <ModelSettingField
          icon={<Video className="w-4 h-4" />}
          label="Manual Fal video model"
          description="Fallback manual model ID if catalog is unavailable."
          value={localModels.fal.videoGeneration}
          defaultValue={DEFAULT_SPECIALIZED_MODELS_V2.fal.videoGeneration}
          onChange={(value) =>
            setLocalModels((prev) => ({ ...prev, fal: { ...prev.fal, videoGeneration: value } }))
          }
          settingId="media.falVideoModel"
        />
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#1D4ED8]/10 border border-[#1D4ED8]/20">
        <Info className="w-4 h-4 text-[#93C5FD] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#93C5FD]">
          Media backend and model changes apply to the next media tool call. Use Fal defaults for stable image/video routing.
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
