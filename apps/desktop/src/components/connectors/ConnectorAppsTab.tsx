// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useState, useEffect, useCallback } from 'react';
import { AppWindow, Loader2, RefreshCw, Plug } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { MCPAppViewer } from './MCPAppViewer';
import type { MCPApp } from '@cowork/shared';

// ============================================================================
// ConnectorAppsTab Component
// ============================================================================

export function ConnectorAppsTab() {
  const [apps, setApps] = useState<MCPApp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<MCPApp | null>(null);

  // ==========================================================================
  // Load Apps
  // ==========================================================================

  const loadApps = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await invoke<{ apps: MCPApp[] }>('get_connector_apps');
      setApps(result.apps);
    } catch (err) {
      console.error('Failed to load MCP apps:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  // ==========================================================================
  // Render
  // ==========================================================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 flex items-center justify-center mb-4">
          <AppWindow className="w-8 h-8 text-purple-400" />
        </div>
        <p className="text-zinc-300 font-medium">No MCP Apps available</p>
        <p className="text-zinc-500 text-sm mt-2 max-w-md">
          Connect to MCP servers that provide interactive apps (ui:// resources) to see them here.
        </p>
        <button
          onClick={loadApps}
          className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-zinc-400">
            {apps.length} app{apps.length !== 1 ? 's' : ''} available
          </p>
          <button
            onClick={loadApps}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 text-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {/* Apps Grid */}
        <div className="grid grid-cols-2 gap-4">
          {apps.map((app) => (
            <button
              key={`${app.connectorId}-${app.uri}`}
              onClick={() => setSelectedApp(app)}
              className="flex items-start gap-4 p-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600 text-left transition-all group"
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 flex items-center justify-center flex-shrink-0 group-hover:from-purple-600/30 group-hover:to-blue-600/30 transition-colors">
                <AppWindow className="w-6 h-6 text-purple-400" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="text-zinc-100 font-medium truncate group-hover:text-purple-400 transition-colors">
                  {app.name}
                </h3>
                {app.description && (
                  <p className="text-zinc-400 text-sm mt-1 line-clamp-2">
                    {app.description}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-2 text-zinc-500 text-xs">
                  <Plug className="w-3 h-3" />
                  <span className="font-mono truncate">{app.uri}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* App Viewer Modal */}
      {selectedApp && (
        <MCPAppViewer
          isOpen={!!selectedApp}
          onClose={() => setSelectedApp(null)}
          connectorId={selectedApp.connectorId}
          appUri={selectedApp.uri}
          appName={selectedApp.name}
        />
      )}
    </>
  );
}
