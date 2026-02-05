/**
 * CommandManager - Manage installed and available commands
 *
 * Displays built-in, marketplace, and custom commands
 * Allows installing/uninstalling marketplace commands
 */

import { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Command,
  Search,
  Trash2,
  RefreshCw,
  X,
  FolderCog,
  Brain,
  Settings,
  Zap,
  FileText,
  Star,
  Package,
  Download,
  Check,
  ArrowLeft,
  Shield,
  Clock,
  Loader2,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';
import {
  useCommandStore,
  useCommands,
  useIsLoadingCommands,
  type Command as CommandType,
  type CommandCategory,
  type CommandSource,
} from '../../stores/command-store';
import { useSessionStore } from '../../stores/session-store';

// Marketplace command from the API
interface MarketplaceCommand {
  id: string;
  manifest: {
    name: string;
    displayName: string;
    description: string;
    version: string;
    author?: string;
    category: CommandCategory;
    icon?: string;
    aliases?: string[];
    keywords?: string[];
  };
  downloadUrl: string;
  checksum: string;
  downloads: number;
  rating: number;
  verified: boolean;
  author: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// Category icons mapping
const CATEGORY_ICONS: Record<CommandCategory, React.ComponentType<{ className?: string }>> = {
  setup: FolderCog,
  memory: Brain,
  utility: Settings,
  workflow: Zap,
  custom: FileText,
};

// Category colors
const CATEGORY_COLORS: Record<CommandCategory, string> = {
  setup: 'text-[#4C71FF]',
  memory: 'text-[#9B59B6]',
  utility: 'text-[#F5C400]',
  workflow: 'text-[#27AE60]',
  custom: 'text-white/60',
};

// Source badges
const SOURCE_BADGES: Record<CommandSource, { label: string; color: string }> = {
  'built-in': { label: 'Built-in', color: 'bg-[#4C71FF]/20 text-[#8CA2FF]' },
  'marketplace': { label: 'Marketplace', color: 'bg-[#27AE60]/20 text-[#27AE60]' },
  'custom': { label: 'Custom', color: 'bg-[#F5C400]/20 text-[#F5C400]' },
};

interface CommandManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandManager({ isOpen, onClose }: CommandManagerProps) {
  const commands = useCommands();
  const isLoading = useIsLoadingCommands();
  const { loadCommands } = useCommandStore();

  const { sessions, activeSessionId } = useSessionStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workingDirectory = activeSession?.workingDirectory;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CommandCategory | 'all'>('all');
  const [selectedSource, setSelectedSource] = useState<CommandSource | 'all'>('all');

  // Marketplace state
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [marketplaceCommands, setMarketplaceCommands] = useState<MarketplaceCommand[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const [uninstallingIds, setUninstallingIds] = useState<Set<string>>(new Set());

  // Load commands when component mounts or working directory changes
  useEffect(() => {
    if (isOpen) {
      loadCommands(workingDirectory || undefined);
    }
  }, [isOpen, workingDirectory, loadCommands]);

  // Load marketplace commands when marketplace view is opened
  useEffect(() => {
    if (showMarketplace) {
      loadMarketplaceCommands();
      loadInstalledIds();
    }
  }, [showMarketplace]);

  // Load marketplace commands from API
  const loadMarketplaceCommands = useCallback(async () => {
    setMarketplaceLoading(true);
    setMarketplaceError(null);
    try {
      const result = await invoke<MarketplaceCommand[]>('marketplace_search', {
        query: searchQuery || null,
        category: selectedCategory !== 'all' ? selectedCategory : null,
        tags: null,
        verified: null,
        limit: 50,
        offset: 0,
      });
      setMarketplaceCommands(result);
    } catch (err) {
      console.error('Failed to load marketplace commands:', err);
      setMarketplaceError(err instanceof Error ? err.message : String(err));
    } finally {
      setMarketplaceLoading(false);
    }
  }, [searchQuery, selectedCategory]);

  // Load installed command IDs
  const loadInstalledIds = useCallback(async () => {
    try {
      const installed = await invoke<Array<{ commandId: string }>>('marketplace_list_installed');
      setInstalledIds(new Set(installed.map((i) => i.commandId)));
    } catch (err) {
      console.error('Failed to load installed commands:', err);
    }
  }, []);

  // Install a marketplace command
  const handleInstall = useCallback(async (commandId: string) => {
    setInstallingIds((prev) => new Set(prev).add(commandId));
    try {
      await invoke('marketplace_install', { commandId });
      setInstalledIds((prev) => new Set(prev).add(commandId));
      // Reload local commands to show the newly installed command
      loadCommands(workingDirectory || undefined);
    } catch (err) {
      console.error('Failed to install command:', err);
      // Could show a toast here
    } finally {
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(commandId);
        return next;
      });
    }
  }, [loadCommands, workingDirectory]);

  // Uninstall a marketplace command
  const handleUninstall = useCallback(async (commandId: string) => {
    setUninstallingIds((prev) => new Set(prev).add(commandId));
    try {
      await invoke('marketplace_uninstall', { commandId });
      setInstalledIds((prev) => {
        const next = new Set(prev);
        next.delete(commandId);
        return next;
      });
      // Reload local commands to remove the uninstalled command
      loadCommands(workingDirectory || undefined);
    } catch (err) {
      console.error('Failed to uninstall command:', err);
    } finally {
      setUninstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(commandId);
        return next;
      });
    }
  }, [loadCommands, workingDirectory]);

  // Filter commands
  const filteredCommands = commands.filter((cmd) => {
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matches =
        cmd.name.toLowerCase().includes(query) ||
        cmd.displayName.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query) ||
        cmd.aliases.some((a) => a.toLowerCase().includes(query));
      if (!matches) return false;
    }

    // Filter by category
    if (selectedCategory !== 'all' && cmd.category !== selectedCategory) {
      return false;
    }

    // Filter by source
    if (selectedSource !== 'all' && cmd.source !== selectedSource) {
      return false;
    }

    return true;
  });

  // Group commands by source
  const commandsBySource = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.source]) {
      acc[cmd.source] = [];
    }
    acc[cmd.source].push(cmd);
    return acc;
  }, {} as Record<CommandSource, CommandType[]>);

  const handleRefresh = useCallback(() => {
    if (showMarketplace) {
      loadMarketplaceCommands();
      loadInstalledIds();
    } else {
      loadCommands(workingDirectory || undefined);
    }
  }, [loadCommands, workingDirectory, showMarketplace, loadMarketplaceCommands, loadInstalledIds]);

  // Reset marketplace state when closing
  const handleClose = useCallback(() => {
    setShowMarketplace(false);
    setSearchQuery('');
    setSelectedCategory('all');
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
            className={cn(
              'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
              'w-[640px] max-h-[80vh] rounded-2xl overflow-hidden',
              'bg-[#1C1C20] border border-white/[0.10]',
              'shadow-2xl shadow-black/60',
              'flex flex-col'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                {showMarketplace && (
                  <button
                    onClick={() => setShowMarketplace(false)}
                    className="p-2 -ml-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
                    title="Back to commands"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center',
                  showMarketplace ? 'bg-[#27AE60]/20' : 'bg-[#4C71FF]/20'
                )}>
                  {showMarketplace ? (
                    <Star className="w-5 h-5 text-[#27AE60]" />
                  ) : (
                    <Command className="w-5 h-5 text-[#4C71FF]" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {showMarketplace ? 'Command Marketplace' : 'Commands'}
                  </h3>
                  <p className="text-xs text-white/40">
                    {showMarketplace
                      ? `${marketplaceCommands.length} commands available`
                      : `${commands.length} commands available`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefresh}
                  disabled={isLoading || marketplaceLoading}
                  className={cn(
                    'p-2 rounded-lg',
                    'text-white/40 hover:text-white hover:bg-white/[0.06]',
                    'transition-colors',
                    (isLoading || marketplaceLoading) && 'animate-spin'
                  )}
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="px-5 py-3 border-b border-white/[0.06] space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search commands..."
                  className={cn(
                    'w-full pl-9 pr-3 py-2.5 rounded-xl',
                    'bg-[#0D0D0F] border border-white/[0.06]',
                    'text-sm text-white/90 placeholder:text-white/30',
                    'focus:outline-none focus:border-[#4C71FF]/40'
                  )}
                />
              </div>

              {/* Filters Row */}
              <div className="flex items-center gap-4">
                {/* Category Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">Category:</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className={cn(
                        'px-2 py-1 rounded text-xs',
                        selectedCategory === 'all'
                          ? 'bg-white/[0.12] text-white'
                          : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
                      )}
                    >
                      All
                    </button>
                    {Object.keys(CATEGORY_ICONS).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat as CommandCategory)}
                        className={cn(
                          'px-2 py-1 rounded text-xs capitalize',
                          selectedCategory === cat
                            ? 'bg-white/[0.12] text-white'
                            : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Source Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">Source:</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedSource('all')}
                      className={cn(
                        'px-2 py-1 rounded text-xs',
                        selectedSource === 'all'
                          ? 'bg-white/[0.12] text-white'
                          : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
                      )}
                    >
                      All
                    </button>
                    {Object.keys(SOURCE_BADGES).map((src) => (
                      <button
                        key={src}
                        onClick={() => setSelectedSource(src as CommandSource)}
                        className={cn(
                          'px-2 py-1 rounded text-xs capitalize',
                          selectedSource === src
                            ? 'bg-white/[0.12] text-white'
                            : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
                        )}
                      >
                        {src}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Command List */}
            <div className="flex-1 overflow-y-auto">
              {showMarketplace ? (
                /* Marketplace View */
                marketplaceLoading ? (
                  <div className="p-8 text-center">
                    <RefreshCw className="w-6 h-6 mx-auto mb-2 text-white/30 animate-spin" />
                    <p className="text-sm text-white/40">Loading marketplace...</p>
                  </div>
                ) : marketplaceError ? (
                  <div className="p-8 text-center">
                    <Package className="w-8 h-8 mx-auto mb-3 text-[#FF5449]/50" />
                    <p className="text-sm text-[#FF5449]">Failed to load marketplace</p>
                    <p className="text-xs text-white/40 mt-1">{marketplaceError}</p>
                    <button
                      onClick={loadMarketplaceCommands}
                      className="mt-3 px-3 py-1.5 rounded-lg text-xs bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                ) : marketplaceCommands.length === 0 ? (
                  <div className="p-8 text-center">
                    <Package className="w-8 h-8 mx-auto mb-3 text-white/20" />
                    <p className="text-sm text-white/40">
                      {searchQuery ? 'No commands match your search' : 'No marketplace commands available'}
                    </p>
                  </div>
                ) : (
                  <div className="p-4 space-y-2">
                    {marketplaceCommands.map((cmd) => (
                      <MarketplaceCommandItem
                        key={cmd.id}
                        command={cmd}
                        isInstalled={installedIds.has(cmd.id)}
                        isInstalling={installingIds.has(cmd.id)}
                        isUninstalling={uninstallingIds.has(cmd.id)}
                        onInstall={() => handleInstall(cmd.id)}
                        onUninstall={() => handleUninstall(cmd.id)}
                      />
                    ))}
                  </div>
                )
              ) : (
                /* Local Commands View */
                isLoading ? (
                  <div className="p-8 text-center">
                    <RefreshCw className="w-6 h-6 mx-auto mb-2 text-white/30 animate-spin" />
                    <p className="text-sm text-white/40">Loading commands...</p>
                  </div>
                ) : filteredCommands.length === 0 ? (
                  <div className="p-8 text-center">
                    <Package className="w-8 h-8 mx-auto mb-3 text-white/20" />
                    <p className="text-sm text-white/40">
                      {searchQuery ? 'No commands match your search' : 'No commands available'}
                    </p>
                  </div>
                ) : (
                  <div className="p-4 space-y-4">
                    {/* Built-in Commands */}
                    {commandsBySource['built-in']?.length > 0 && (
                      <CommandSection
                        title="Built-in Commands"
                        description="Core commands bundled with the app"
                        commands={commandsBySource['built-in']}
                      />
                    )}

                    {/* Marketplace Commands */}
                    {commandsBySource['marketplace']?.length > 0 && (
                      <CommandSection
                        title="Marketplace Commands"
                        description="Installed from the command marketplace"
                        commands={commandsBySource['marketplace']}
                        showUninstall
                        onUninstall={handleUninstall}
                      />
                    )}

                    {/* Custom Commands */}
                    {commandsBySource['custom']?.length > 0 && (
                      <CommandSection
                        title="Custom Commands"
                        description={`Project commands from ${workingDirectory || 'working directory'}/.cowork/commands/`}
                        commands={commandsBySource['custom']}
                      />
                    )}
                  </div>
                )
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-white/[0.08]">
              <div className="flex items-center justify-between">
                <p className="text-xs text-white/30">
                  {showMarketplace
                    ? 'Install commands to use them in your projects'
                    : 'Type "/" in the chat input to use commands'}
                </p>
                {!showMarketplace && (
                  <button
                    onClick={() => setShowMarketplace(true)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs',
                      'bg-[#27AE60]/20 text-[#27AE60] hover:bg-[#27AE60]/30 transition-colors'
                    )}
                    title="Browse marketplace"
                  >
                    <Star className="w-3.5 h-3.5" />
                    <span>Browse Marketplace</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Command Section Component
interface CommandSectionProps {
  title: string;
  description: string;
  commands: CommandType[];
  showUninstall?: boolean;
  onUninstall?: (commandId: string) => void;
}

function CommandSection({ title, description, commands, showUninstall, onUninstall }: CommandSectionProps) {
  return (
    <div className="rounded-xl border border-white/[0.06] overflow-hidden">
      {/* Section Header */}
      <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white/80">{title}</span>
            <span className="text-xs text-white/30 ml-2">({commands.length})</span>
          </div>
          <span className="text-[10px] text-white/30">{description}</span>
        </div>
      </div>

      {/* Commands List */}
      <div className="divide-y divide-white/[0.04]">
        {commands.map((command) => (
          <CommandItem
            key={command.name}
            command={command}
            showUninstall={showUninstall}
            onUninstall={onUninstall}
          />
        ))}
      </div>
    </div>
  );
}

// Command Item Component
interface CommandItemProps {
  command: CommandType;
  showUninstall?: boolean;
  onUninstall?: (commandId: string) => void;
}

function CommandItem({ command, showUninstall, onUninstall }: CommandItemProps) {
  const CategoryIcon = CATEGORY_ICONS[command.category] || FileText;
  const categoryColor = CATEGORY_COLORS[command.category] || 'text-white/60';
  const sourceBadge = SOURCE_BADGES[command.source];

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3',
        'hover:bg-white/[0.02] transition-colors'
      )}
    >
      {/* Icon */}
      <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
        <CategoryIcon className={cn('w-4 h-4', categoryColor)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white/90">/{command.name}</span>
          {command.aliases.length > 0 && (
            <span className="text-[10px] text-white/30">
              ({command.aliases.map((a) => `/${a}`).join(', ')})
            </span>
          )}
          <span className={cn('px-1.5 py-0.5 rounded text-[9px]', sourceBadge.color)}>
            {sourceBadge.label}
          </span>
        </div>
        <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{command.description}</p>

        {/* Meta info */}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] text-white/30 capitalize">{command.category}</span>
          {command.author && (
            <span className="text-[10px] text-white/30">by {command.author}</span>
          )}
          <span className="text-[10px] text-white/30">v{command.version}</span>
        </div>
      </div>

      {/* Actions */}
      {showUninstall && onUninstall && (
        <button
          onClick={() => onUninstall(command.name)}
          className="p-1.5 rounded-lg text-white/30 hover:text-[#FF5449] hover:bg-[#FF5449]/10 transition-colors"
          title="Uninstall command"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// Marketplace Command Item Component
interface MarketplaceCommandItemProps {
  command: MarketplaceCommand;
  isInstalled: boolean;
  isInstalling: boolean;
  isUninstalling: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}

function MarketplaceCommandItem({
  command,
  isInstalled,
  isInstalling,
  isUninstalling,
  onInstall,
  onUninstall,
}: MarketplaceCommandItemProps) {
  const CategoryIcon = CATEGORY_ICONS[command.manifest.category] || FileText;
  const categoryColor = CATEGORY_COLORS[command.manifest.category] || 'text-white/60';

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-xl',
        'border border-white/[0.06]',
        'hover:border-white/[0.10] hover:bg-white/[0.02] transition-colors'
      )}
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
        <CategoryIcon className={cn('w-5 h-5', categoryColor)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white/90">
            /{command.manifest.name}
          </span>
          {command.verified && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] bg-[#4C71FF]/20 text-[#8CA2FF]">
              <Shield className="w-2.5 h-2.5" />
              Verified
            </span>
          )}
          <span className="text-[10px] text-white/30">v{command.manifest.version}</span>
        </div>
        <p className="text-xs text-white/50 mt-1 line-clamp-2">
          {command.manifest.description || command.description}
        </p>

        {/* Meta info */}
        <div className="flex items-center gap-3 mt-2">
          {command.author && (
            <span className="text-[10px] text-white/40">by {command.author}</span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-white/30">
            <Download className="w-3 h-3" />
            {command.downloads.toLocaleString()}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-white/30">
            <Star className="w-3 h-3" />
            {command.rating.toFixed(1)}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-white/30">
            <Clock className="w-3 h-3" />
            {new Date(command.updatedAt).toLocaleDateString()}
          </span>
        </div>

        {/* Tags */}
        {command.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {command.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[9px] bg-white/[0.04] text-white/40"
              >
                {tag}
              </span>
            ))}
            {command.tags.length > 4 && (
              <span className="text-[9px] text-white/30">+{command.tags.length - 4}</span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0">
        {isInstalled ? (
          <button
            onClick={onUninstall}
            disabled={isUninstalling}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs',
              'border border-white/[0.08]',
              'text-white/60 hover:text-[#FF5449] hover:border-[#FF5449]/30 hover:bg-[#FF5449]/10',
              'transition-colors',
              isUninstalling && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isUninstalling ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Removing...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 text-[#27AE60]" />
                <span>Installed</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={onInstall}
            disabled={isInstalling}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs',
              'bg-[#4C71FF] text-white',
              'hover:bg-[#5C81FF] transition-colors',
              isInstalling && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isInstalling ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Installing...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
