// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

interface UpdateInfo {
  version: string;
  body?: string;
}

interface UpdateProgress {
  progress: number;
  total: number | null;
  percent: number;
}

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; info: UpdateInfo }
  | { status: 'downloading'; progress: UpdateProgress }
  | { status: 'installing' }
  | { status: 'restarting' }
  | { status: 'error'; error: string };

export function AutoUpdater() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    // Listen for update events from Rust backend
    const setupListeners = async () => {
      unlisteners.push(
        await listen<UpdateInfo>('update:available', (event) => {
          setState({ status: 'available', info: event.payload });
        })
      );

      unlisteners.push(
        await listen<UpdateProgress>('update:progress', (event) => {
          setState({ status: 'downloading', progress: event.payload });
        })
      );

      unlisteners.push(
        await listen('update:installed', () => {
          setState({ status: 'restarting' });
        })
      );

      unlisteners.push(
        await listen<{ error: string }>('update:error', (event) => {
          setState({ status: 'error', error: event.payload.error });
          // Auto-dismiss error after 10 seconds
          setTimeout(() => {
            setState({ status: 'idle' });
          }, 10000);
        })
      );
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  // Don't render anything if idle
  if (state.status === 'idle') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div
        className={`rounded-lg p-4 shadow-lg backdrop-blur-sm ${
          state.status === 'error'
            ? 'bg-red-500/90 text-white'
            : 'bg-blue-600/90 text-white'
        }`}
      >
        {state.status === 'available' && (
          <div>
            <div className="font-semibold">Update Available</div>
            <div className="mt-1 text-sm opacity-90">
              Version {state.info.version} is downloading...
            </div>
          </div>
        )}

        {state.status === 'downloading' && (
          <div>
            <div className="font-semibold">Downloading Update</div>
            <div className="mt-2 h-2 rounded-full bg-blue-400/50">
              <div
                className="h-2 rounded-full bg-white transition-all duration-300"
                style={{ width: `${state.progress.percent}%` }}
              />
            </div>
            <div className="mt-1 text-sm opacity-90">
              {state.progress.percent}% complete
            </div>
          </div>
        )}

        {state.status === 'installing' && (
          <div>
            <div className="font-semibold">Installing Update</div>
            <div className="mt-1 text-sm opacity-90">Please wait...</div>
          </div>
        )}

        {state.status === 'restarting' && (
          <div>
            <div className="font-semibold flex items-center gap-2">
              <span className="animate-spin">↻</span>
              Restarting...
            </div>
            <div className="mt-1 text-sm opacity-90">
              App will restart momentarily
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div>
            <div className="font-semibold">Update Failed</div>
            <div className="mt-1 text-sm opacity-90">{state.error}</div>
          </div>
        )}
      </div>
    </div>
  );
}
