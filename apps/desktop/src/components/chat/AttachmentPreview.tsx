import { X, Image as ImageIcon, Play, FileText, Eye } from 'lucide-react';
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
        className={cn(
          'relative group rounded-xl overflow-hidden cursor-pointer',
          'border border-white/[0.08] hover:border-white/[0.20]',
          'transition-all duration-200 hover:shadow-lg hover:shadow-black/30'
        )}
        onClick={() => openWithOS(attachment)}
        title={`${attachment.name} — click to open`}
      >
        <img
          src={previewSrc}
          alt={attachment.name}
          className="w-[72px] h-[72px] object-cover"
        />
        {/* Hover overlay */}
        <div className={cn(
          'absolute inset-0 bg-black/50 flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-200'
        )}>
          <Eye className="w-5 h-5 text-white" />
        </div>
        {/* Name strip */}
        <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm">
          <span className="text-[9px] text-white/80 truncate block">
            {attachment.name}
          </span>
        </div>
        {/* Remove button */}
        <RemoveButton onRemove={onRemove} />
      </div>
    );
  }

  // Video thumbnail
  if (isVideo && previewSrc) {
    return (
      <div
        className={cn(
          'relative group rounded-xl overflow-hidden cursor-pointer',
          'border border-white/[0.08] hover:border-white/[0.20]',
          'transition-all duration-200 hover:shadow-lg hover:shadow-black/30'
        )}
        onClick={() => openWithOS(attachment)}
        title={`${attachment.name} — click to open`}
      >
        <video
          src={previewSrc}
          className="w-[72px] h-[72px] object-cover"
          muted
          preload="metadata"
        />
        {/* Play icon overlay */}
        <div className={cn(
          'absolute inset-0 flex items-center justify-center',
          'bg-black/30 group-hover:bg-black/50 transition-colors duration-200'
        )}>
          <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-3.5 h-3.5 text-white ml-0.5" fill="white" />
          </div>
        </div>
        {/* Name strip */}
        <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm">
          <span className="text-[9px] text-white/80 truncate block">
            {attachment.name}
          </span>
        </div>
        <RemoveButton onRemove={onRemove} />
      </div>
    );
  }

  // Audio with inline player
  if (isAudio && previewSrc) {
    return (
      <div
        className={cn(
          'relative group flex items-center gap-2 px-3 py-2 rounded-xl',
          'bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.12]',
          'transition-all duration-200'
        )}
      >
        <audio controls src={previewSrc} className="h-8 max-w-[200px]" />
        <span className="text-[10px] text-white/50 max-w-[80px] truncate">{attachment.name}</span>
        <RemoveButton onRemove={onRemove} />
      </div>
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
          <FileText className="w-4.5 h-4.5 text-[#FF5449]" />
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
