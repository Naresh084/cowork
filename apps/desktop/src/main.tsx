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
import './styles/globals.css';

installGlobalTerminalDiagnostics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
