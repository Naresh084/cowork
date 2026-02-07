import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { useSettingsStore, type SoulProfile } from '@/stores/settings-store';

function SoulCard({
  soul,
  isActive,
  isDefault,
  onSelect,
  onEdit,
  onDelete,
}: {
  soul: SoulProfile;
  isActive: boolean;
  isDefault: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3 space-y-2',
        isActive ? 'border-[#1D4ED8]/60 bg-[#1D4ED8]/10' : 'border-white/[0.08] bg-white/[0.02]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white/90 truncate">{soul.title}</p>
          <p className="text-[11px] text-white/45 uppercase tracking-wide">{soul.source}</p>
        </div>
        <div className="flex items-center gap-1">
          {isDefault ? (
            <span className="text-[10px] px-2 py-1 rounded-full bg-white/[0.08] text-white/70">Default</span>
          ) : null}
          {isActive ? (
            <span className="text-[10px] px-2 py-1 rounded-full bg-[#22C55E]/20 text-[#86EFAC]">Active</span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors',
            isActive
              ? 'bg-[#22C55E]/20 text-[#86EFAC]'
              : 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]',
          )}
        >
          <Check className="w-3.5 h-3.5" />
          {isActive ? 'Selected' : 'Select'}
        </button>

        {soul.source === 'custom' && onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-white/[0.06] text-white/70 hover:bg-white/[0.1]"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        ) : null}

        {soul.source === 'custom' && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-[#FF5449]/10 text-[#FF8E88] hover:bg-[#FF5449]/20"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SoulSettings() {
  const {
    souls,
    activeSoulId,
    defaultSoulId,
    soulsLoading,
    projectSoulsDirectory,
    userSoulsDirectory,
    loadSoulProfiles,
    setActiveSoul,
    saveCustomSoul,
    deleteCustomSoul,
  } = useSettingsStore();

  const [isSaving, setIsSaving] = useState(false);
  const [editingSoulId, setEditingSoulId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    void loadSoulProfiles();
  }, [loadSoulProfiles]);

  const presets = useMemo(() => souls.filter((soul) => soul.source === 'preset'), [souls]);
  const customSouls = useMemo(() => souls.filter((soul) => soul.source === 'custom'), [souls]);

  const resetEditor = () => {
    setEditingSoulId(null);
    setTitle('');
    setContent('');
  };

  const handleSelect = async (soulId: string) => {
    try {
      await setActiveSoul(soulId);
      toast.success('Soul selected');
    } catch (error) {
      toast.error('Failed to select soul', error instanceof Error ? error.message : String(error));
    }
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent) {
      toast.error('Title and markdown content are required');
      return;
    }

    setIsSaving(true);
    try {
      await saveCustomSoul(trimmedTitle, trimmedContent, editingSoulId || undefined);
      toast.success(editingSoulId ? 'Soul updated' : 'Soul created');
      resetEditor();
    } catch (error) {
      toast.error('Failed to save soul', error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (soul: SoulProfile) => {
    const confirmed = window.confirm(`Delete custom soul "${soul.title}"?`);
    if (!confirmed) return;
    try {
      await deleteCustomSoul(soul.id);
      toast.success('Soul deleted');
      if (editingSoulId === soul.id) {
        resetEditor();
      }
    } catch (error) {
      toast.error('Failed to delete soul', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-white/90">Soul Profiles</h3>
        <p className="mt-1 text-xs text-white/40">
          Soul defines the assistant&apos;s personality and communication style. Presets are loaded from project
          <code className="mx-1">/souls</code>. Custom souls are saved as markdown files in your home directory.
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-[11px] text-white/45 space-y-1">
        <p>Preset folder: <code>{projectSoulsDirectory || 'loading...'}</code></p>
        <p>Custom folder: <code>{userSoulsDirectory || 'loading...'}</code></p>
      </div>

      {soulsLoading ? (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-white/60 inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading souls...
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/45">
          <Sparkles className="w-3.5 h-3.5" />
          Preset Souls
        </div>
        <div className="grid gap-2">
          {presets.map((soul) => (
            <SoulCard
              key={soul.id}
              soul={soul}
              isActive={activeSoulId === soul.id}
              isDefault={defaultSoulId === soul.id}
              onSelect={() => void handleSelect(soul.id)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/45">
            <Plus className="w-3.5 h-3.5" />
            Custom Souls
          </div>
          <button
            type="button"
            onClick={resetEditor}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-white/[0.06] text-white/70 hover:bg-white/[0.1]"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>
        <div className="grid gap-2">
          {customSouls.length === 0 ? (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-white/50">
              No custom souls yet.
            </div>
          ) : (
            customSouls.map((soul) => (
              <SoulCard
                key={soul.id}
                soul={soul}
                isActive={activeSoulId === soul.id}
                isDefault={defaultSoulId === soul.id}
                onSelect={() => void handleSelect(soul.id)}
                onEdit={() => {
                  setEditingSoulId(soul.id);
                  setTitle(soul.title);
                  setContent(soul.content);
                }}
                onDelete={() => void handleDelete(soul)}
              />
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-white/90">
            {editingSoulId ? 'Edit Custom Soul' : 'Create Custom Soul'}
          </h4>
          {editingSoulId ? (
            <button
              type="button"
              onClick={resetEditor}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-white/[0.06] text-white/70 hover:bg-white/[0.1]"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wide text-white/55">Title</label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Example: Bold, Friendly, Professional"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wide text-white/55">Markdown Soul File</label>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={'# Soul Name\n\n## Voice\n- ...\n\n## Behavior\n- ...'}
            rows={12}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50 font-mono"
          />
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving || !title.trim() || !content.trim()}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
            isSaving || !title.trim() || !content.trim()
              ? 'bg-white/[0.06] text-white/35 cursor-not-allowed'
              : 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]',
          )}
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {editingSoulId ? 'Update Soul' : 'Create Soul'}
        </button>
      </div>
    </div>
  );
}
