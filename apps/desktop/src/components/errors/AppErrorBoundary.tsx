import React from 'react';

interface AppErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  componentStack?: string;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    error: undefined,
    componentStack: undefined,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Uncaught error:', error, info);
    this.setState({ componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="h-screen w-screen bg-[#0B0C10] text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-white/70 mb-4">
            The app hit a rendering error. Check the console for details.
          </p>
          <div className="text-xs text-white/60 font-mono whitespace-pre-wrap break-all rounded-lg bg-black/40 p-3 border border-white/10 max-h-[300px] overflow-auto">
            {this.state.error?.message || 'Unknown error'}
            {this.state.error?.stack ? `\n\n${this.state.error.stack}` : ''}
            {this.state.componentStack ? `\n\nComponent stack:\n${this.state.componentStack}` : ''}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="px-3 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-sm"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <button
              className="px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-sm"
              onClick={() => this.setState({ hasError: false, error: undefined })}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }
}
