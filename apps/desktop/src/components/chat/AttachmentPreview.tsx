import { X, Image as ImageIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Attachment } from '../../stores/chat-store';
import { FileTypeIcon } from '../icons/FileTypeIcon';

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
      {attachments.map((attachment, index) => (
        <AttachmentItem
          key={`${attachment.name}-${index}`}
          attachment={attachment}
          onRemove={() => onRemove(index)}
        />
      ))}
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
        'px-3 py-2 rounded-lg',
        'bg-gray-100 dark:bg-gray-800/50',
        'border border-gray-200 dark:border-gray-700'
      )}
    >
      {/* Preview or icon */}
      {isImage && attachment.data ? (
        <img
          src={`data:${attachment.mimeType};base64,${attachment.data}`}
          alt={attachment.name}
          className="w-8 h-8 object-cover rounded"
        />
      ) : (
        <FileTypeIcon filename={attachment.name} size={20} />
      )}

      {/* Name */}
      <span className="text-sm text-gray-700 dark:text-gray-300 max-w-[150px] truncate">
        {attachment.name}
      </span>

      {/* Size */}
      {attachment.size && (
        <span className="text-xs text-gray-500">
          {formatFileSize(attachment.size)}
        </span>
      )}

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          'absolute -top-1.5 -right-1.5',
          'w-5 h-5 rounded-full',
          'bg-gray-600 hover:bg-gray-700',
          'flex items-center justify-center',
          'opacity-0 group-hover:opacity-100',
          'transition-opacity duration-200'
        )}
      >
        <X className="w-3 h-3 text-white" />
      </button>
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
    <div
      className={cn(
        'absolute inset-0 z-50',
        'flex flex-col items-center justify-center',
        'bg-blue-500/10 backdrop-blur-sm',
        'border-2 border-dashed border-blue-500',
        'rounded-2xl',
        className
      )}
    >
      <div className="p-4 rounded-full bg-blue-500/20 mb-4">
        <ImageIcon className="w-8 h-8 text-blue-500" />
      </div>
      <p className="text-lg font-medium text-blue-500">Drop files here</p>
      <p className="text-sm text-blue-400 mt-1">Images, documents, and more</p>
    </div>
  );
}
