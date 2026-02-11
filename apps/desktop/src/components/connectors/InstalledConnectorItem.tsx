import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Circle,
  Loader2,
  RefreshCw,
  Settings,
  Power,
  PowerOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConnectorState, ConnectorStatus } from '@gemini-cowork/shared';
import { useConnectorStore } from '../../stores/connector-store';
import { getConnectorIcon } from './connector-icons';

interface InstalledConnectorItemProps {
  connectorState: ConnectorState;
  onClick: () => void;
  onConfigure?: () => void;
}

const statusConfig: Record<
  ConnectorStatus,
  { color: string; bgColor: string; label: string; icon: React.ElementType }
> = {
  available: {
    color: 'text-zinc-500',
    bgColor: 'bg-zinc-500/10',
    label: 'Not installed',
    icon: Circle,
  },
  installed: {
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    label: 'Needs configuration',
    icon: AlertCircle,
  },
  configured: {
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    label: 'Ready to connect',
    icon: Circle,
  },
  connecting: {
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    label: 'Connecting...',
    icon: Loader2,
  },
  connected: {
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    label: 'Connected',
    icon: CheckCircle,
  },
  reconnecting: {
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    label: 'Reconnecting...',
    icon: RefreshCw,
  },
  error: {
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    label: 'Connection failed',
    icon: XCircle,
  },
  disabled: {
    color: 'text-zinc-500',
    bgColor: 'bg-zinc-500/10',
    label: 'Disabled',
    icon: PowerOff,
  },
};

export function InstalledConnectorItem({
  connectorState,
  onClick,
  onConfigure,
}: InstalledConnectorItemProps) {
  const { connectConnector, disconnectConnector, reconnectConnector, isConnecting } =
    useConnectorStore();

  const connector = connectorState.manifest;
  const status = connectorState.status;
  const config = statusConfig[status];
  const StatusIcon = config.icon;
  const Icon = getConnectorIcon(connector.icon);
  const usesRemoteBrowserOAuth =
    connector.auth.type === 'none' &&
    connector.transport.type === 'stdio' &&
    connector.transport.command.trim().split(/[\\/]/).pop() === 'npx' &&
    connector.transport.args.some((arg) => arg.startsWith('mcp-remote'));

  const isLoading = isConnecting.has(connectorState.id);
  const showConnectButton = status === 'configured' || status === 'error';
  const showDisconnectButton = status === 'connected';
  const showConfigureButton = status === 'installed';

  const handleConnect = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await connectConnector(connectorState.id);
  };

  const handleDisconnect = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await disconnectConnector(connectorState.id);
  };

  const handleReconnect = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await reconnectConnector(connectorState.id);
  };

  const handleConfigure = (e: React.MouseEvent) => {
    e.stopPropagation();
    onConfigure?.();
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all',
        'hover:border-zinc-600 hover:bg-zinc-800/50',
        status === 'connected'
          ? 'border-green-600/30 bg-green-500/5'
          : status === 'error'
          ? 'border-red-600/30 bg-red-500/5'
          : 'border-zinc-700 bg-zinc-800/30'
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0',
          'bg-gradient-to-br from-zinc-700 to-zinc-800'
        )}
      >
        <Icon className="w-6 h-6 text-zinc-300" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-zinc-100 truncate">
            {connector.displayName}
          </h3>

          {/* Status Badge */}
          <span
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
              config.bgColor,
              config.color
            )}
          >
            <StatusIcon
              className={cn(
                'w-3 h-3',
                (status === 'connecting' || status === 'reconnecting') && 'animate-spin'
              )}
            />
            {config.label}
          </span>
        </div>

        <p className="text-sm text-zinc-400 truncate mt-0.5">
          {connector.description}
        </p>
        {usesRemoteBrowserOAuth && status === 'configured' && (
          <p className="text-xs text-zinc-500 mt-1">
            Connect will open browser OAuth.
          </p>
        )}
        {usesRemoteBrowserOAuth && status === 'connecting' && (
          <p className="text-xs text-blue-400 mt-1">
            Complete authorization in your browser.
          </p>
        )}

        {/* Error message */}
        {status === 'error' && connectorState.error && (
          <p className="text-xs text-red-400 mt-1 truncate">
            {connectorState.error}
          </p>
        )}

        {/* Tools count when connected */}
        {status === 'connected' && connectorState.tools.length > 0 && (
          <p className="text-xs text-green-400 mt-1">
            {connectorState.tools.length} tool{connectorState.tools.length !== 1 ? 's' : ''} available
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {showConfigureButton && (
          <button
            onClick={handleConfigure}
            className="p-2 rounded-lg bg-yellow-600/10 hover:bg-yellow-600/20 text-yellow-500 transition-colors"
            title="Configure secrets"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        {showConnectButton && (
          <button
            onClick={status === 'error' ? handleReconnect : handleConnect}
            disabled={isLoading}
            className={cn(
              'p-2 rounded-lg transition-colors',
              status === 'error'
                ? 'bg-red-600/10 hover:bg-red-600/20 text-red-500'
                : 'bg-green-600/10 hover:bg-green-600/20 text-green-500',
              isLoading && 'opacity-50 cursor-not-allowed'
            )}
            title={status === 'error' ? 'Reconnect' : 'Connect'}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : status === 'error' ? (
              <RefreshCw className="w-4 h-4" />
            ) : (
              <Power className="w-4 h-4" />
            )}
          </button>
        )}

        {showDisconnectButton && (
          <button
            onClick={handleDisconnect}
            className="p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
            title="Disconnect"
          >
            <PowerOff className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
