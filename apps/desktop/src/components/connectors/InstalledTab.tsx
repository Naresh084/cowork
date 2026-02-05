import { useConnectorStore } from '../../stores/connector-store';
import { InstalledConnectorItem } from './InstalledConnectorItem';
import { Loader2 } from 'lucide-react';

interface InstalledTabProps {
  onConfigure?: (connectorId: string) => void;
}

export function InstalledTab({ onConfigure }: InstalledTabProps) {
  const {
    getInstalledConnectors,
    isDiscovering,
    selectConnector,
    searchQuery,
    selectedCategory,
  } = useConnectorStore();

  const installedConnectors = getInstalledConnectors();

  // Filter installed connectors by search and category
  const filteredConnectors = installedConnectors.filter((state) => {
    const connector = state.manifest;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matches =
        connector.displayName.toLowerCase().includes(query) ||
        connector.description.toLowerCase().includes(query) ||
        connector.tags.some((t) => t.toLowerCase().includes(query));
      if (!matches) return false;
    }

    // Category filter
    if (selectedCategory !== 'all' && connector.category !== selectedCategory) {
      return false;
    }

    return true;
  });

  if (isDiscovering) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (installedConnectors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
        <p>No connectors installed</p>
        <p className="text-sm text-zinc-500 mt-1">
          Browse the Marketplace tab to install connectors
        </p>
      </div>
    );
  }

  if (filteredConnectors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
        <p>No matching connectors</p>
        <p className="text-sm text-zinc-500 mt-1">
          Try adjusting your search or category filter
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-3">
      {filteredConnectors.map((state) => (
        <InstalledConnectorItem
          key={state.id}
          connectorState={state}
          onClick={() => selectConnector(state.id)}
          onConfigure={() => onConfigure?.(state.id)}
        />
      ))}
    </div>
  );
}
