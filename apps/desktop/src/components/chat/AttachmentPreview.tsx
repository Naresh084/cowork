import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, Play, Pause, FileText, Eye, Mic } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Attachment } from '../../stores/chat-store';
import { FileTypeIcon } from '../icons/FileTypeIcon';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (index: number) => void;
  className?: string;
}

export function AttachmentPreview({
  attachments,
  onRemove,
  className,
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <AnimatePresence>
        {attachments.map((attachment, index) => (
          <motion.div
            key={`${attachment.name}-${index}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
          >
            <AttachmentItem
              attachment={attachment}
              onRemove={() => onRemove(index)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface AttachmentItemProps {
  attachment: Attachment;
  onRemove: () => void;
}

async function openWithOS(attachment: Attachment) {
  if (!attachment.data) return;
  try {
    await invoke('open_file_preview', {
      name: attachment.name,
      data: attachment.data,
    });
  } catch (e) {
    console.error('Failed to open file preview:', e);
  }
}

function AttachmentItem({ attachment, onRemove }: AttachmentItemProps) {
  const [playingAudio, setPlayingAudio] = useState<{
    src: string;
    name: string;
    duration?: number;
  } | null>(null);

  const isImage = attachment.type === 'image' || attachment.mimeType?.startsWith('image/');
  const isVideo = attachment.type === 'video' || attachment.mimeType?.startsWith('video/');
  const isAudio = attachment.type === 'audio' || attachment.mimeType?.startsWith('audio/');
  const isPdf = attachment.type === 'pdf' || attachment.mimeType === 'application/pdf';
  const previewSrc = attachment.objectUrl
    || (attachment.data && attachment.mimeType ? `data:${attachment.mimeType};base64,${attachment.data}` : null);
  const canOpen = !!attachment.data;

  // Image thumbnail
  if (isImage && previewSrc) {
    return (
      <div
        className="relative group cursor-pointer"
        onClick={() => openWithOS(attachment)}
        title={`${attachment.name} — click to open`}
      >
        <div className={cn(
          'rounded-xl overflow-hidden',
          'border border-white/[0.08] hover:border-white/[0.20]',
          'transition-all duration-200 hover:shadow-lg hover:shadow-black/30'
        )}>
          <img
            src={previewSrc}
            alt={attachment.name}
            className="w-[96px] h-[96px] object-cover block"
          />
          {/* Hover overlay */}
          <div className={cn(
            'absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-200'
          )}>
            <Eye className="w-5 h-5 text-white" />
          </div>
          {/* Name strip */}
          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded-b-xl">
            <span className="text-[9px] text-white/80 truncate block">
              {attachment.name}
            </span>
          </div>
        </div>
        <RemoveButton onRemove={onRemove} />
      </div>
    );
  }

  // Video thumbnail
  if (isVideo && previewSrc) {
    return (
      <div
        className="relative group cursor-pointer"
        onClick={() => openWithOS(attachment)}
        title={`${attachment.name} — click to open`}
      >
        <div className={cn(
          'rounded-xl overflow-hidden',
          'border border-white/[0.08] hover:border-white/[0.20]',
          'transition-all duration-200 hover:shadow-lg hover:shadow-black/30'
        )}>
          <video
            src={previewSrc}
            className="w-[96px] h-[96px] object-cover block"
            muted
            preload="metadata"
          />
          {/* Play icon overlay */}
          <div className={cn(
            'absolute inset-0 rounded-xl flex items-center justify-center',
            'bg-black/30 group-hover:bg-black/50 transition-colors duration-200'
          )}>
            <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Play className="w-3.5 h-3.5 text-white ml-0.5" fill="white" />
            </div>
          </div>
          {/* Name strip */}
          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded-b-xl">
            <span className="text-[9px] text-white/80 truncate block">
              {attachment.name}
            </span>
          </div>
        </div>
        <RemoveButton onRemove={onRemove} />
      </div>
    );
  }

  // Audio card (styled, with playback dialog)
  if (isAudio && previewSrc) {
    return (
      <>
        <div
          className={cn(
            'relative group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer',
            'bg-[#8B5CF6]/[0.06] border border-[#8B5CF6]/[0.12]',
            'hover:border-[#8B5CF6]/[0.25] hover:bg-[#8B5CF6]/[0.10]',
            'transition-all duration-200'
          )}
          onClick={() => setPlayingAudio({ src: previewSrc, name: attachment.name, duration: attachment.duration })}
          title={`${attachment.name} — click to play`}
        >
          <div className="w-9 h-9 rounded-lg bg-[#8B5CF6]/15 flex items-center justify-center flex-shrink-0">
            <Mic className="w-[18px] h-[18px] text-[#8B5CF6]" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-white/80 truncate block max-w-[120px]">
              {attachment.name}
            </span>
            <div className="flex items-center gap-1.5">
              {attachment.duration != null && (
                <span className="text-[10px] text-white/35">
                  {formatDuration(attachment.duration)}
                </span>
              )}
              {attachment.duration != null && attachment.size && (
                <span className="text-[10px] text-white/20">&middot;</span>
              )}
              {attachment.size && (
                <span className="text-[10px] text-white/35">{formatFileSize(attachment.size)}</span>
              )}
            </div>
          </div>
          <RemoveButton onRemove={onRemove} />
        </div>
        {playingAudio && (
          <AudioPlaybackDialog
            audio={playingAudio}
            onClose={() => setPlayingAudio(null)}
          />
        )}
      </>
    );
  }

  // PDF card
  if (isPdf) {
    return (
      <div
        className={cn(
          'relative group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer',
          'bg-[#FF5449]/[0.06] border border-[#FF5449]/[0.12]',
          'hover:border-[#FF5449]/[0.25] hover:bg-[#FF5449]/[0.10]',
          'transition-all duration-200'
        )}
        onClick={() => canOpen && openWithOS(attachment)}
        title={canOpen ? `${attachment.name} — click to open` : attachment.name}
      >
        <div className="w-9 h-9 rounded-lg bg-[#FF5449]/15 flex items-center justify-center flex-shrink-0">
          <FileText className="w-[18px] h-[18px] text-[#FF5449]" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs text-white/80 truncate block max-w-[120px]">
            {attachment.name}
          </span>
          {attachment.size && (
            <span className="text-[10px] text-white/35">{formatFileSize(attachment.size)}</span>
          )}
        </div>
        <RemoveButton onRemove={onRemove} />
      </div>
    );
  }

  // Generic file card (code, text, other)
  return (
    <div
      className={cn(
        'relative group flex items-center gap-2.5 px-3 py-2.5 rounded-xl',
        'bg-white/[0.04] border border-white/[0.08]',
        'hover:border-white/[0.15] hover:bg-white/[0.06]',
        'transition-all duration-200',
        canOpen && 'cursor-pointer'
      )}
      onClick={() => canOpen && openWithOS(attachment)}
      title={canOpen ? `${attachment.name} — click to open` : attachment.name}
    >
      <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
        <FileTypeIcon filename={attachment.name} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-xs text-white/80 truncate block max-w-[120px]">
          {attachment.name}
        </span>
        {attachment.size && (
          <span className="text-[10px] text-white/35">{formatFileSize(attachment.size)}</span>
        )}
      </div>
      <RemoveButton onRemove={onRemove} />
    </div>
  );
}

// ============================================================================
// Audio Playback Dialog
// ============================================================================

interface AudioPlaybackDialogProps {
  audio: { src: string; name: string; duration?: number };
  onClose: () => void;
}

function AudioPlaybackDialog({ audio, onClose }: AudioPlaybackDialogProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audio.duration || 0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onLoaded = () => {
      if (el.duration && isFinite(el.duration)) setDuration(el.duration);
    };
    const onEnded = () => setIsPlaying(false);

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('ended', onEnded);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seekTo = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
    setCurrentTime(el.currentTime);
  }, [duration]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Dialog */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 10 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative w-[340px] rounded-2xl overflow-hidden',
          'bg-[#1C1C20] border border-white/[0.08]',
          'shadow-2xl shadow-black/50'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/15 flex items-center justify-center flex-shrink-0">
            <Mic className="w-5 h-5 text-[#8B5CF6]" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-white/90 truncate">{audio.name}</h3>
            <p className="text-[11px] text-white/40">Voice Note</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {/* Waveform visualization */}
        <div className="px-5 py-3">
          <div className="flex items-end justify-center gap-[3px] h-12">
            {Array.from({ length: 32 }).map((_, i) => {
              const barProgress = (i / 32) * 100;
              const isPast = barProgress <= progress;
              // Pseudo-random heights for visual interest
              const height = 20 + Math.sin(i * 0.8) * 15 + Math.cos(i * 1.3) * 10;
              return (
                <div
                  key={i}
                  className={cn(
                    'w-[5px] rounded-full transition-colors duration-150',
                    isPast ? 'bg-[#8B5CF6]' : 'bg-white/[0.08]',
                    isPlaying && isPast && 'bg-[#A78BFA]'
                  )}
                  style={{ height: `${Math.max(4, height)}%` }}
                />
              );
            })}
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-5">
          <div
            className="h-1.5 rounded-full bg-white/[0.06] cursor-pointer group"
            onClick={seekTo}
          >
            <div
              className="h-full rounded-full bg-[#8B5CF6] transition-all duration-100 relative"
              style={{ width: `${progress}%` }}
            >
              <div className={cn(
                'absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full',
                'bg-[#8B5CF6] border-2 border-[#1C1C20]',
                'opacity-0 group-hover:opacity-100 transition-opacity'
              )} />
            </div>
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-white/30">{formatDuration(Math.floor(currentTime))}</span>
            <span className="text-[10px] text-white/30">{formatDuration(Math.floor(duration))}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center py-4">
          <button
            onClick={togglePlay}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center',
              'bg-[#8B5CF6] hover:bg-[#7C3AED]',
              'transition-colors duration-150',
              'shadow-lg shadow-[#8B5CF6]/25'
            )}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white" fill="white" />
            ) : (
              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            )}
          </button>
        </div>

        {/* Hidden audio element */}
        <audio ref={audioRef} src={audio.src} preload="metadata" />
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ============================================================================
// Shared Components & Utilities
// ============================================================================

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      className={cn(
        'absolute -top-1.5 -right-1.5 z-10',
        'w-5 h-5 rounded-full',
        'bg-[#1C1C20] border border-white/[0.15]',
        'hover:bg-[#FF5449] hover:border-[#FF5449]',
        'flex items-center justify-center',
        'opacity-0 group-hover:opacity-100',
        'transition-all duration-200',
        'shadow-md shadow-black/40'
      )}
    >
      <X className="w-3 h-3 text-white" />
    </motion.button>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface DropZoneProps {
  isDragging: boolean;
  className?: string;
}

export function DropZone({ isDragging, className }: DropZoneProps) {
  if (!isDragging) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        'absolute inset-0 z-50',
        'flex flex-col items-center justify-center',
        'bg-[#1D4ED8]/10 backdrop-blur-sm',
        'border-2 border-dashed border-[#1D4ED8]',
        'rounded-2xl',
        className
      )}
    >
      <div className="p-4 rounded-full bg-[#1D4ED8]/20 mb-4">
        <ImageIcon className="w-8 h-8 text-[#93C5FD]" />
      </div>
      <p className="text-lg font-medium text-[#93C5FD]">Drop files here</p>
      <p className="text-sm text-white/50 mt-1">Images, documents, and more</p>
    </motion.div>
  );
}
