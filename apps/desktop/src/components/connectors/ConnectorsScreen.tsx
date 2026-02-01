import { useState } from 'react';
import {
  ArrowLeft,
  Search,
  Plus,
  Plug,
  Check,
  X,
  Trash2,
  Settings2,
  ExternalLink,
  Star,
  Download,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore, type MCPServerConfig } from '../../stores/settings-store';
import { motion, AnimatePresence } from 'framer-motion';

interface ConnectorsScreenProps {
  onBack: () => void;
}

// Marketplace connectors (mock data - would come from an API in production)
const marketplaceConnectors = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read, write, and manage files on your local filesystem',
    command: 'npx -y @modelcontextprotocol/server-filesystem',
    category: 'Files',
    stars: 1250,
    downloads: 45000,
    author: 'MCP Team',
    verified: true,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Interact with GitHub repositories, issues, and pull requests',
    command: 'npx -y @modelcontextprotocol/server-github',
    category: 'Developer',
    stars: 890,
    downloads: 32000,
    author: 'MCP Team',
    verified: true,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send messages and interact with Slack workspaces',
    command: 'npx -y @modelcontextprotocol/server-slack',
    category: 'Communication',
    stars: 650,
    downloads: 18000,
    author: 'MCP Team',
    verified: true,
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    command: 'npx -y @modelcontextprotocol/server-postgres',
    category: 'Database',
    stars: 720,
    downloads: 25000,
    author: 'MCP Team',
    verified: true,
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Search the web using Brave Search API',
    command: 'npx -y @modelcontextprotocol/server-brave-search',
    category: 'Search',
    stars: 420,
    downloads: 12000,
    author: 'MCP Team',
    verified: true,
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Automate browser interactions and web scraping',
    command: 'npx -y @modelcontextprotocol/server-puppeteer',
    category: 'Browser',
    stars: 580,
    downloads: 15000,
    author: 'MCP Team',
    verified: true,
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query and manage SQLite databases',
    command: 'npx -y @modelcontextprotocol/server-sqlite',
    category: 'Database',
    stars: 380,
    downloads: 9000,
    author: 'MCP Team',
    verified: true,
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent memory storage for context across sessions',
    command: 'npx -y @modelcontextprotocol/server-memory',
    category: 'Utility',
    stars: 290,
    downloads: 8000,
    author: 'MCP Team',
    verified: true,
  },
];

const categories = ['All', 'Files', 'Developer', 'Database', 'Communication', 'Search', 'Browser', 'Utility'];

export function ConnectorsScreen({ onBack }: ConnectorsScreenProps) {
  const { mcpServers, addMCPServer, removeMCPServer, toggleMCPServer, updateMCPServer } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'installed' | 'marketplace'>('installed');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCommand, setCustomCommand] = useState('');
  const [customArgs, setCustomArgs] = useState('');
  const [editingServer, setEditingServer] = useState<string | null>(null);

  // Filter marketplace connectors
  const filteredMarketplace = marketplaceConnectors.filter((connector) => {
    const matchesSearch =
      connector.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      connector.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || connector.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Check if a marketplace connector is already installed
  const isInstalled = (connectorId: string) => {
    const connector = marketplaceConnectors.find((c) => c.id === connectorId);
    return mcpServers.some((s) => s.command === connector?.command);
  };

  const handleInstallFromMarketplace = (connector: (typeof marketplaceConnectors)[0]) => {
    if (isInstalled(connector.id)) return;
    addMCPServer({
      name: connector.name,
      command: connector.command,
      enabled: true,
    });
  };

  const handleAddCustom = () => {
    if (!customName.trim() || !customCommand.trim()) return;
    addMCPServer({
      name: customName,
      command: customCommand,
      args: customArgs ? customArgs.split(' ').filter((a) => a.trim()) : undefined,
      enabled: true,
    });
    setCustomName('');
    setCustomCommand('');
    setCustomArgs('');
    setIsAddingCustom(false);
  };

  return (
    <div className="h-full flex flex-col bg-[#1a1a1e]">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-800">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </motion.button>
        <div>
          <h1 className="text-xl font-semibold text-white">Connectors</h1>
          <p className="text-sm text-gray-500">Extend Gemini Cowork with MCP servers</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-gray-800">
        <button
          onClick={() => setActiveTab('installed')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'installed'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          )}
        >
          Installed ({mcpServers.length})
        </button>
        <button
          onClick={() => setActiveTab('marketplace')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'marketplace'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          )}
        >
          Marketplace
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'installed' ? (
            <motion.div
              key="installed"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-6 space-y-4"
            >
              {/* Add Custom Button */}
              {!isAddingCustom && (
                <button
                  onClick={() => setIsAddingCustom(true)}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl',
                    'bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white',
                    'border border-gray-700 border-dashed hover:border-gray-600',
                    'transition-colors'
                  )}
                >
                  <Plus className="w-5 h-5" />
                  Add Custom Connector
                </button>
              )}

              {/* Add Custom Form */}
              <AnimatePresence>
                {isAddingCustom && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 space-y-3 overflow-hidden"
                  >
                    <div>
                      <label className="text-xs text-gray-400 mb-1.5 block">Name</label>
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="My Custom Server"
                        className={cn(
                          'w-full px-3 py-2 rounded-lg text-sm',
                          'bg-gray-900 border border-gray-700',
                          'text-white placeholder:text-gray-500',
                          'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
                        )}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1.5 block">Command</label>
                      <input
                        type="text"
                        value={customCommand}
                        onChange={(e) => setCustomCommand(e.target.value)}
                        placeholder="npx -y @my/mcp-server"
                        className={cn(
                          'w-full px-3 py-2 rounded-lg text-sm',
                          'bg-gray-900 border border-gray-700',
                          'text-white placeholder:text-gray-500',
                          'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
                        )}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1.5 block">Arguments (optional)</label>
                      <input
                        type="text"
                        value={customArgs}
                        onChange={(e) => setCustomArgs(e.target.value)}
                        placeholder="--port 3000 --verbose"
                        className={cn(
                          'w-full px-3 py-2 rounded-lg text-sm',
                          'bg-gray-900 border border-gray-700',
                          'text-white placeholder:text-gray-500',
                          'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
                        )}
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleAddCustom}
                        disabled={!customName.trim() || !customCommand.trim()}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
                          'bg-blue-600 hover:bg-blue-700 text-white',
                          'disabled:opacity-50 disabled:cursor-not-allowed',
                          'transition-colors'
                        )}
                      >
                        <Check className="w-4 h-4" />
                        Add Connector
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingCustom(false);
                          setCustomName('');
                          setCustomCommand('');
                          setCustomArgs('');
                        }}
                        className="px-4 py-2 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Installed Connectors List */}
              {mcpServers.length === 0 ? (
                <div className="text-center py-12">
                  <Plug className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-300 mb-2">No connectors installed</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Browse the marketplace or add a custom connector to get started
                  </p>
                  <button
                    onClick={() => setActiveTab('marketplace')}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                  >
                    Browse Marketplace
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {mcpServers.map((server) => (
                    <InstalledConnectorCard
                      key={server.id}
                      server={server}
                      isEditing={editingServer === server.id}
                      onEdit={() => setEditingServer(server.id)}
                      onCancelEdit={() => setEditingServer(null)}
                      onSaveEdit={(updates) => {
                        updateMCPServer(server.id, updates);
                        setEditingServer(null);
                      }}
                      onToggle={() => toggleMCPServer(server.id)}
                      onRemove={() => removeMCPServer(server.id)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="marketplace"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-6 space-y-4"
            >
              {/* Search and Filter */}
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search connectors..."
                    className={cn(
                      'w-full pl-10 pr-4 py-2.5 rounded-xl text-sm',
                      'bg-gray-800 border border-gray-700',
                      'text-white placeholder:text-gray-500',
                      'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
                    )}
                  />
                </div>
              </div>

              {/* Categories */}
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-6 px-6">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                      selectedCategory === category
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>

              {/* Marketplace Grid */}
              {filteredMarketplace.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-300 mb-2">No connectors found</h3>
                  <p className="text-sm text-gray-500">Try a different search or category</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredMarketplace.map((connector) => (
                    <MarketplaceCard
                      key={connector.id}
                      connector={connector}
                      isInstalled={isInstalled(connector.id)}
                      onInstall={() => handleInstallFromMarketplace(connector)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface InstalledConnectorCardProps {
  server: MCPServerConfig;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (updates: Partial<MCPServerConfig>) => void;
  onToggle: () => void;
  onRemove: () => void;
}

function InstalledConnectorCard({
  server,
  isEditing,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onToggle,
  onRemove,
}: InstalledConnectorCardProps) {
  const [editName, setEditName] = useState(server.name);
  const [editCommand, setEditCommand] = useState(server.command);

  const handleSave = () => {
    onSaveEdit({
      name: editName,
      command: editCommand,
    });
  };

  if (isEditing) {
    return (
      <motion.div
        initial={{ scale: 0.98 }}
        animate={{ scale: 1 }}
        className="bg-gray-800/70 rounded-xl border border-blue-500/50 p-4 space-y-3"
      >
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">Name</label>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-gray-900 border border-gray-700',
              'text-white placeholder:text-gray-500',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
            )}
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">Command</label>
          <input
            type="text"
            value={editCommand}
            onChange={(e) => setEditCommand(e.target.value)}
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-gray-900 border border-gray-700',
              'text-white placeholder:text-gray-500',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
            )}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <Check className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={onCancelEdit}
            className="px-3 py-2 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group bg-gray-800/50 rounded-xl border p-4',
        server.enabled ? 'border-gray-700' : 'border-gray-700/50 opacity-60'
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            server.enabled ? 'bg-green-500/20' : 'bg-gray-700'
          )}
        >
          <Plug className={cn('w-5 h-5', server.enabled ? 'text-green-400' : 'text-gray-500')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-white truncate">{server.name}</h3>
            {server.status === 'connected' && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
                Connected
              </span>
            )}
            {server.status === 'error' && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">Error</span>
            )}
          </div>
          <p className="text-sm text-gray-500 truncate font-mono">{server.command}</p>
          {server.error && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5" />
              {server.error}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            title="Edit"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <button
            onClick={onToggle}
            className={cn(
              'p-2 rounded-lg transition-colors',
              server.enabled
                ? 'hover:bg-gray-700 text-green-400 hover:text-green-300'
                : 'hover:bg-gray-700 text-gray-500 hover:text-white'
            )}
            title={server.enabled ? 'Disable' : 'Enable'}
          >
            {server.enabled ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
          <button
            onClick={onRemove}
            className="p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

interface MarketplaceCardProps {
  connector: (typeof marketplaceConnectors)[0];
  isInstalled: boolean;
  onInstall: () => void;
}

function MarketplaceCard({ connector, isInstalled, onInstall }: MarketplaceCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 hover:border-gray-600 transition-colors"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
          <Plug className="w-6 h-6 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-white">{connector.name}</h3>
            {connector.verified && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400 font-medium">
                Verified
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mb-3 line-clamp-2">{connector.description}</p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5" />
              {connector.stars.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Download className="w-3.5 h-3.5" />
              {(connector.downloads / 1000).toFixed(0)}k
            </span>
            <span className="text-gray-600">{connector.author}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onInstall}
          disabled={isInstalled}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            isInstalled
              ? 'bg-green-500/20 text-green-400 cursor-default'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          )}
        >
          {isInstalled ? (
            <>
              <Check className="w-4 h-4" />
              Installed
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Install
            </>
          )}
        </button>
        <a
          href={`https://github.com/modelcontextprotocol/servers/tree/main/src/${connector.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors"
          title="View on GitHub"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </motion.div>
  );
}
