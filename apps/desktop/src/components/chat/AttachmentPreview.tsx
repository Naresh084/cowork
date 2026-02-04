import { X, Image as ImageIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Attachment } from '../../stores/chat-store';
import { FileTypeIcon } from '../icons/FileTypeIcon';
import { motion, AnimatePresence } from 'framer-motion';

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

function AttachmentItem({ attachment, onRemove }: AttachmentItemProps) {
  const isImage = attachment.type === 'image' || attachment.mimeType?.startsWith('image/');

  return (
    <div
      className={cn(
        'relative group flex items-center gap-2',
        'px-3 py-2 rounded-xl',
        'bg-white/[0.04]',
        'border border-white/[0.08]',
        'hover:border-white/[0.12]'
      )}
    >
      {/* Preview or icon */}
      {isImage && attachment.data ? (
        <img
          src={`data:${attachment.mimeType};base64,${attachment.data}`}
          alt={attachment.name}
          className="w-8 h-8 object-cover rounded-lg"
        />
      ) : (
        <FileTypeIcon filename={attachment.name} size={20} />
      )}

      {/* Name */}
      <span className="text-sm text-white/70 max-w-[150px] truncate">
        {attachment.name}
      </span>

      {/* Size */}
      {attachment.size && (
        <span className="text-xs text-white/40">
          {formatFileSize(attachment.size)}
        </span>
      )}

      {/* Remove button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        type="button"
        onClick={onRemove}
        className={cn(
          'absolute -top-1.5 -right-1.5',
          'w-5 h-5 rounded-full',
          'bg-white/[0.1] hover:bg-[#FF5449]',
          'flex items-center justify-center',
          'opacity-0 group-hover:opacity-100',
          'transition-all duration-200'
        )}
      >
        <X className="w-3 h-3 text-white" />
      </motion.button>
    </div>
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
        'bg-[#4C71FF]/10 backdrop-blur-sm',
        'border-2 border-dashed border-[#4C71FF]',
        'rounded-2xl',
        className
      )}
    >
      <div className="p-4 rounded-full bg-[#4C71FF]/20 mb-4">
        <ImageIcon className="w-8 h-8 text-[#8CA2FF]" />
      </div>
      <p className="text-lg font-medium text-[#8CA2FF]">Drop files here</p>
      <p className="text-sm text-white/50 mt-1">Images, documents, and more</p>
    </motion.div>
  );
}
