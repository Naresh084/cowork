// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/sora/400.css';
import '@fontsource/sora/500.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import { App } from './App';
import { AppErrorBoundary } from './components/errors/AppErrorBoundary';
import { installGlobalTerminalDiagnostics } from './lib/terminal-diagnostics';
import { installTauriCallbackGuard } from './lib/tauri-callback-guard';
import './styles/design-tokens.css';
import './styles/globals.css';

try {
  installTauriCallbackGuard();
} catch {
  // Ignore guard bootstrap failures; diagnostics must not block render.
}
installGlobalTerminalDiagnostics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
