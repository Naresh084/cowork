import { forwardRef, useEffect, useMemo, useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileJson,
  FileType,
  Image,
  File,
  ExternalLink,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentStore, type Artifact } from '../../stores/agent-store';
import { useSessionStore } from '../../stores/session-store';
import { useSettingsStore } from '../../stores/settings-store';
import { CollapsibleSection } from './CollapsibleSection';
import { motion, AnimatePresence } from 'framer-motion';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { toast } from '../ui/Toast';

/**
 * Extract folder name from a path.
 */
function getFolderName(path: string | undefined): string {
  if (!path) return 'Working folder';
  const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments[segments.length - 1] || 'Working folder';
}

/**
 * WorkingFolderSection - Displays file artifacts from agent-store
 *
 * This component uses the deepagents artifact system:
 * - Data source: useAgentStore((state) => state.artifacts)
 * - Artifacts are created when agent reads/writes/modifies files
 * - Shows real-time file changes during agent work
 * - Click to preview file content
 */
export function WorkingFolderSection() {
  const { activeSessionId, sessions } = useSessionStore();
  const artifacts = useAgentStore((state) => state.getSessionState(activeSessionId).artifacts);
  const setPreviewArtifact = useAgentStore((state) => state.setPreviewArtifact);
  const { defaultWorkingDirectory } = useSettingsStore();

  // Get current working directory from active session or default
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workingDirectory = activeSession?.workingDirectory || defaultWorkingDirectory;

  const handleOpenFolder = async () => {
    if (!workingDirectory) {
      toast.info('No folder selected', 'Select a working directory first');
      return;
    }

    try {
      // Reveal the folder in the system file manager
      await revealItemInDir(workingDirectory);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to open folder', errorMessage);
    }
  };

  const actions = (
    <button
      type="button"
      onClick={handleOpenFolder}
      className="p-1 rounded hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
      title="Open in file manager"
    >
      <ExternalLink className="w-3.5 h-3.5" />
    </button>
  );

  return (
    <CollapsibleSection
      id="workingFolder"
      title={getFolderName(workingDirectory)}
      icon={Folder}
      badge={artifacts.length > 0 ? artifacts.length : undefined}
      actions={actions}
    >
      {artifacts.length === 0 ? (
        <EmptyState />
      ) : (
        <ArtifactList
          artifacts={artifacts}
          onSelect={setPreviewArtifact}
        />
      )}
    </CollapsibleSection>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center mb-2">
        <FolderOpen className="w-5 h-5 text-white/30" />
      </div>
      <p className="text-xs text-white/40">No files modified</p>
      <p className="text-xs text-white/25 mt-0.5">
        Files will appear as the agent works
      </p>
    </div>
  );
}

interface ArtifactListProps {
  artifacts: Artifact[];
  onSelect: (artifact: Artifact) => void;
}

function ArtifactList({ artifacts, onSelect }: ArtifactListProps) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 60;

  // Sort by timestamp (most recent first)
  const sortedArtifacts = useMemo(
    () => [...artifacts].sort((a, b) => b.timestamp - a.timestamp),
    [artifacts],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredArtifacts = useMemo(() => {
    if (!normalizedQuery) return sortedArtifacts;
    return sortedArtifacts.filter((artifact) => {
      const path = artifact.path.toLowerCase();
      const filename = getFilename(artifact.path).toLowerCase();
      const kind = artifact.type.toLowerCase();
      return (
        path.includes(normalizedQuery) ||
        filename.includes(normalizedQuery) ||
        kind.includes(normalizedQuery)
      );
    });
  }, [normalizedQuery, sortedArtifacts]);
  const pageCount = Math.max(1, Math.ceil(filteredArtifacts.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * pageSize;
  const pageEnd = pageStart + pageSize;
  const visibleArtifacts = filteredArtifacts.slice(pageStart, pageEnd);

  useEffect(() => {
    setPage(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (page > pageCount - 1) {
      setPage(Math.max(0, pageCount - 1));
    }
  }, [page, pageCount]);

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search artifacts by file, path, or type…"
            className="h-8 w-full rounded-md border border-white/[0.1] bg-[#111218] pl-8 pr-2 text-xs text-white/85 placeholder:text-white/35 focus:outline-none focus:border-[#1D4ED8]/70"
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-white/45">
          <span>
            {filteredArtifacts.length} result{filteredArtifacts.length === 1 ? '' : 's'}
          </span>
          <span>
            Showing {filteredArtifacts.length === 0 ? 0 : pageStart + 1}
            -
            {Math.min(filteredArtifacts.length, pageEnd)} of {filteredArtifacts.length}
          </span>
        </div>
        {pageCount > 1 ? (
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={safePage <= 0}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-white/[0.12] px-2 text-[11px] text-white/75 hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <span className="text-[11px] text-white/50">
              Page {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              disabled={safePage >= pageCount - 1}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-white/[0.12] px-2 text-[11px] text-white/75 hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="space-y-0.5">
        {visibleArtifacts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.12] px-3 py-4 text-center text-xs text-white/45">
            No artifacts match this search.
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {visibleArtifacts.map((artifact) => (
              <ArtifactItem
                key={artifact.id}
                artifact={artifact}
                onSelect={() => onSelect(artifact)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

interface ArtifactItemProps {
  artifact: Artifact;
  onSelect: () => void;
}

const ArtifactItem = forwardRef<HTMLButtonElement, ArtifactItemProps>(function ArtifactItem(
  { artifact, onSelect },
  ref
) {
  const filename = getFilename(artifact.path);
  const extension = getExtension(artifact.path);
  const Icon = getFileIcon(extension);
  const typeIndicator = getTypeIndicator(artifact.type);

  return (
    <motion.button
      ref={ref}
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg',
        'hover:bg-white/[0.04] transition-colors',
        'text-left group',
        artifact.type === 'deleted' && 'opacity-50'
      )}
    >
      {/* File Icon */}
      <Icon
        className={cn(
          'w-4 h-4 flex-shrink-0',
          getIconColor(extension)
        )}
      />

      {/* Filename */}
      <span
        className={cn(
          'text-sm text-white/80 truncate flex-1',
        artifact.type === 'deleted' && 'line-through text-white/40'
      )}
        title={artifact.path}
      >
        {filename}
      </span>

      {/* Type Indicator Dot */}
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          typeIndicator.color
        )}
        title={typeIndicator.label}
      />
    </motion.button>
  );
});

function getFilename(path: string): string {
  return path.split('/').pop() || path;
}

function getExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
}

function getFileIcon(extension: string) {
  switch (extension) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
    case 'go':
    case 'rs':
    case 'java':
    case 'c':
    case 'cpp':
    case 'h':
    case 'rb':
    case 'php':
      return FileCode;
    case 'json':
      return FileJson;
    case 'md':
    case 'txt':
    case 'doc':
    case 'docx':
      return FileText;
    case 'css':
    case 'scss':
    case 'less':
    case 'html':
      return FileType;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return Image;
    default:
      return File;
  }
}

function getIconColor(extension: string): string {
  switch (extension) {
    case 'ts':
    case 'tsx':
      return 'text-[#3B82F6]';
    case 'js':
    case 'jsx':
      return 'text-[#F5C400]';
    case 'py':
      return 'text-[#50956A]';
    case 'go':
      return 'text-[#00A1A3]';
    case 'rs':
      return 'text-[#FF5449]';
    case 'json':
      return 'text-[#F5C400]';
    case 'md':
      return 'text-white/50';
    case 'css':
    case 'scss':
      return 'text-[#EC4899]';
    case 'html':
      return 'text-[#FF5449]';
    default:
      return 'text-white/50';
  }
}

function getTypeIndicator(type: Artifact['type']): { color: string; label: string } {
  switch (type) {
    case 'created':
      return { color: 'bg-[#50956A]', label: 'Created' };
    case 'modified':
      return { color: 'bg-[#1D4ED8]', label: 'Modified' };
    case 'touched':
      return { color: 'bg-[#F5C400]', label: 'Touched' };
    case 'deleted':
      return { color: 'bg-[#FF5449]', label: 'Deleted' };
    default:
      return { color: 'bg-white/30', label: 'Unknown' };
  }
}
