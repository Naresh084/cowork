// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { runClaudePermissionMcpServer } from './external-cli/providers/claude-permission-mcp-server.js';
import { bootstrapRuntime } from './runtime/bootstrap.js';
import { StdioRuntimeTransport } from './runtime/transports/stdio.js';

if (process.argv.includes('--claude-permission-mcp-server')) {
  runClaudePermissionMcpServer(process.argv.slice(2));
} else if (process.argv.includes('--daemon')) {
  // Daemon mode: runs as a background service with local IPC transport
  import('./daemon.js').catch((error) => {
    process.stderr.write(`[daemon] Failed to start: ${String(error)}\n`);
    process.exit(1);
  });
} else {
  let runtimeHandle: { shutdown: () => Promise<void> } | null = null;

  const transport = new StdioRuntimeTransport({
    onClose: () => {
      if (runtimeHandle) {
        void runtimeHandle.shutdown();
      }
    },
  });

  bootstrapRuntime({
    transport,
    exitOnShutdown: true,
  })
    .then((handle) => {
      runtimeHandle = handle;
    })
    .catch((error) => {
      process.stderr.write(`[runtime] Failed to start stdio runtime: ${String(error)}\n`);
      process.exit(1);
    });
}
