import { X, Download, Trash2, Power, PowerOff, Settings, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConnectorStore } from '../../stores/connector-store';
import { getConnectorIcon } from './connector-icons';

interface ConnectorDetailsPanelProps {
  connectorId: string;
  onClose: () => void;
  onConfigure?: (connectorId: string) => void;
  onInstalled?: (connectorId: string) => void;
}

export function ConnectorDetailsPanel({
  connectorId,
  onClose,
  onConfigure,
  onInstalled,
}: ConnectorDetailsPanelProps) {
  const {
    getConnectorState,
    installConnector,
    uninstallConnector,
    connectConnector,
    disconnectConnector,
    isInstalling,
    isConnecting,
    isConnectorInstalled,
    availableConnectors,
  } = useConnectorStore();

  const state = getConnectorState(connectorId);
  const connector = state?.manifest || availableConnectors.find((c) => c.id === connectorId);

  if (!connector) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
        Connector not found
      </div>
    );
  }

  const Icon = getConnectorIcon(connector.icon);
  const isInstalled = isConnectorInstalled(connectorId);
  const isInstallingThis = isInstalling.has(connectorId);
  const isConnectingThis = isConnecting.has(connectorId);
  const status = state?.status || 'available';
  const isConnected = status === 'connected';
  const needsConfig = status === 'installed';
  const usesRemoteBrowserOAuth =
    connector.auth.type === 'none' &&
    connector.transport.type === 'stdio' &&
    connector.transport.command.trim().split(/[\\/]/).pop() === 'npx' &&
    connector.transport.args.some((arg) => arg.startsWith('mcp-remote'));

  const handleInstall = async () => {
    const result = await installConnector(connectorId, { autoSetup: true });
    const installedConnectorId = result.installedConnectorId;

    if (!installedConnectorId) {
      return;
    }

    onInstalled?.(installedConnectorId);

    if (result.nextStep === 'configure' || result.nextStep === 'oauth') {
      onConfigure?.(installedConnectorId);
    }
  };

  const handleUninstall = async () => {
    await uninstallConnector(connectorId);
    onClose();
  };

  const handleConnect = async () => {
    await connectConnector(connectorId);
  };

  const handleDisconnect = async () => {
    await disconnectConnector(connectorId);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h3 className="font-medium text-zinc-100">Details</h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Icon and Name */}
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'w-16 h-16 rounded-xl flex items-center justify-center',
              'bg-gradient-to-br from-zinc-700 to-zinc-800'
            )}
          >
            <Icon className="w-8 h-8 text-zinc-300" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              {connector.displayName}
            </h2>
            <p className="text-sm text-zinc-400">{connector.category}</p>
          </div>
        </div>

        {/* Description */}
        <div>
          <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">
            Description
          </h4>
          <p className="text-sm text-zinc-300">{connector.description}</p>
        </div>

        {/* Tags */}
        <div>
          <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">
            Tags
          </h4>
          <div className="flex flex-wrap gap-2">
            {connector.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 text-xs bg-zinc-800 text-zinc-400 rounded-lg"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Auth Type */}
        <div>
          <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">
            Authentication
          </h4>
          <div className="text-sm text-zinc-300">
            {connector.auth.type === 'none' &&
              (usesRemoteBrowserOAuth
                ? 'Browser-based OAuth during Connect'
                : 'No authentication required')}
            {connector.auth.type === 'env' && 'Environment variables / API keys'}
            {connector.auth.type === 'oauth' && `OAuth (${connector.auth.provider})`}
          </div>
          {usesRemoteBrowserOAuth && (
            <p className="mt-2 text-xs text-zinc-400">
              Click Connect to open your default browser and authorize this connector.
            </p>
          )}
          {connector.auth.type === 'env' && connector.auth.secrets && (
            <div className="mt-2 space-y-1">
              {connector.auth.secrets.map((secret) => (
                <div
                  key={secret.key}
                  className="flex items-center gap-2 text-xs text-zinc-400"
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      secret.required ? 'bg-red-500' : 'bg-zinc-500'
                    )}
                  />
                  <span className="font-mono">{secret.key}</span>
                  {!secret.required && <span className="text-zinc-500">(optional)</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transport */}
        <div>
          <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">
            Transport
          </h4>
          <div className="text-sm text-zinc-300 font-mono">
            {connector.transport.type === 'stdio' ? (
              <code className="text-xs bg-zinc-800 px-2 py-1 rounded">
                {connector.transport.command} {connector.transport.args.join(' ')}
              </code>
            ) : (
              <code className="text-xs bg-zinc-800 px-2 py-1 rounded">
                {connector.transport.url}
              </code>
            )}
          </div>
        </div>

        {/* Connected Tools */}
        {isConnected && state && state.tools.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">
              Available Tools ({state.tools.length})
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {state.tools.map((tool) => (
                <div
                  key={tool.name}
                  className="p-2 bg-zinc-800/50 rounded-lg border border-zinc-700"
                >
                  <p className="text-sm font-medium text-zinc-200">{tool.name}</p>
                  {tool.description && (
                    <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">
                      {tool.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documentation */}
        {connector.documentation && (
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">
              Documentation
            </h4>
            <div className="space-y-2">
              {connector.documentation.setup && (
                <a
                  href={connector.documentation.setup}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="w-3 h-3" />
                  Setup Guide
                </a>
              )}
              {connector.documentation.homepage && (
                <a
                  href={connector.documentation.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="w-3 h-3" />
                  Homepage
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-zinc-800 space-y-2">
        {!isInstalled ? (
          <button
            onClick={handleInstall}
            disabled={isInstallingThis}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
              'bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors',
              isInstallingThis && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isInstallingThis ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isInstallingThis ? 'Installing...' : 'Install Connector'}
          </button>
        ) : (
          <>
            {needsConfig && (
              <button
                onClick={() => onConfigure?.(connectorId)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white font-medium transition-colors"
              >
                <Settings className="w-4 h-4" />
                Configure Secrets
              </button>
            )}

            {!isConnected && !needsConfig && (
              <>
                <button
                  onClick={handleConnect}
                  disabled={isConnectingThis}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
                    'bg-green-600 hover:bg-green-500 text-white font-medium transition-colors',
                    isConnectingThis && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isConnectingThis ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Power className="w-4 h-4" />
                  )}
                  {isConnectingThis ? 'Connecting...' : 'Connect'}
                </button>
                {isConnectingThis && usesRemoteBrowserOAuth && (
                  <p className="text-xs text-zinc-400">
                    Finish authorization in your browser, then return here.
                  </p>
                )}
              </>
            )}

            {isConnected && (
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium transition-colors"
              >
                <PowerOff className="w-4 h-4" />
                Disconnect
              </button>
            )}

            <button
              onClick={handleUninstall}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-red-600/30 text-red-400 hover:bg-red-600/10 font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Uninstall
            </button>
          </>
        )}
      </div>
    </div>
  );
}
