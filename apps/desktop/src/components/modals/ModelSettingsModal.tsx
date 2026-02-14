// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings2, Image, Video, Monitor, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSettingsStore,
  useSpecializedModels,
  DEFAULT_SPECIALIZED_MODELS,
  type SpecializedModels,
} from '@/stores/settings-store';

interface ModelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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
          'focus:outline-none focus:border-[#1D4ED8]/50',
          'font-mono'
        )}
      />
      <p className="mt-2 text-xs text-white/40">{description}</p>
    </div>
  );
}

export function ModelSettingsModal({ isOpen, onClose }: ModelSettingsModalProps) {
  const specializedModels = useSpecializedModels();
  const { updateSpecializedModel } = useSettingsStore();
  const modalRef = useRef<HTMLDivElement>(null);

  // Local state for editing
  const [localModels, setLocalModels] = useState<SpecializedModels>(specializedModels);

  // Sync local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalModels(specializedModels);
    }
  }, [isOpen, specializedModels]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Close on click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSave = async () => {
    // Update each model that changed
    for (const key of Object.keys(localModels) as Array<keyof SpecializedModels>) {
      if (localModels[key] !== specializedModels[key]) {
        await updateSpecializedModel(key, localModels[key]);
      }
    }
    onClose();
  };

  const handleReset = () => {
    setLocalModels({ ...DEFAULT_SPECIALIZED_MODELS });
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        <motion.div
          ref={modalRef}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={cn(
            'w-[480px] max-h-[85vh] overflow-hidden rounded-2xl',
            'bg-[#111218] border border-white/[0.08]',
            'shadow-2xl shadow-black/60'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                <Settings2 className="w-5 h-5 text-[#93C5FD]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white/90">Model Settings</h2>
                <p className="text-xs text-white/40">Configure specialized AI models</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(85vh-140px)]">
            <p className="text-sm text-white/50 mb-4">
              These models are used for specialized tasks that require specific AI capabilities.
            </p>

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
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#1D4ED8]/10 border border-[#1D4ED8]/20">
              <Info className="w-4 h-4 text-[#93C5FD] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[#93C5FD]">
                Search, research, and video analysis tools automatically use your selected chat model.
                Only the specialized capabilities above need separate model configuration.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.08]">
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
            >
              Reset to defaults
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm bg-white/[0.06] text-white/70 hover:bg-white/[0.10] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg text-sm bg-[#1D4ED8] text-white hover:bg-[#3B82F6] transition-colors"
              >
                Save changes
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
