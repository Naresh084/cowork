import { useConnectorStore } from '../../stores/connector-store';
import { ConnectorGrid } from './ConnectorGrid';
import { ConnectorCard } from './ConnectorCard';
import { Loader2 } from 'lucide-react';

export function AvailableTab() {
  const {
    getFilteredConnectors,
    isDiscovering,
    selectConnector,
    isConnectorInstalled,
  } = useConnectorStore();

  const connectors = getFilteredConnectors();
  const bundledConnectors = connectors.filter(c => c.source.type === 'bundled');

  if (isDiscovering) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (bundledConnectors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
        <p>No connectors found</p>
        <p className="text-sm text-zinc-500 mt-1">
          Try adjusting your search or category filter
        </p>
      </div>
    );
  }

  return (
    <ConnectorGrid>
      {bundledConnectors.map((connector) => (
        <ConnectorCard
          key={connector.id}
          connector={connector}
          isInstalled={isConnectorInstalled(connector.id)}
          onClick={() => selectConnector(connector.id)}
        />
      ))}
    </ConnectorGrid>
  );
}
