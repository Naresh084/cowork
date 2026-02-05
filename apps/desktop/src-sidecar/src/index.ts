import { createInterface } from 'readline';
import { handleRequest } from './ipc-handler.js';
import { eventEmitter } from './event-emitter.js';
import type { IPCRequest } from './types.js';

// ============================================================================
// Sidecar Entry Point
// ============================================================================

/**
 * Main entry point for the Node.js sidecar.
 *
 * Communication happens via stdio:
 * - stdin: Receives JSON-RPC style requests from Rust
 * - stdout: Sends responses and events to Rust
 * - stderr: Used for logging (doesn't interfere with IPC)
 */

// Create readline interface for stdin
// IMPORTANT: Do NOT set output to stdout as it will interfere with our IPC protocol
const rl = createInterface({
  input: process.stdin,
  terminal: false,
});

// Track whether we're shutting down
let isShuttingDown = false;

/**
 * Process a line of input from stdin.
 */
async function processLine(line: string): Promise<void> {
  if (!line.trim()) return;

  try {
    const request = JSON.parse(line) as IPCRequest;

    // Handle the request
    const response = await handleRequest(request);

    // Send response directly to stdout (Rust expects flat response, not wrapped)
    const responseLine = JSON.stringify(response) + '\n';
    process.stdout.write(responseLine);

    // Flush any pending events
    eventEmitter.flushSync();

  } catch (error) {
    // Parse error - send error response
    const errorResponse = {
      id: 'unknown',
      success: false,
      error: 'Failed to parse request',
    };

    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  }
}

// Handle incoming lines
rl.on('line', (line) => {
  if (isShuttingDown) return;
  processLine(line).catch(console.error);
});

// Handle stdin close (Rust process closed the pipe)
rl.on('close', () => {
  shutdown();
});

// Handle errors
rl.on('error', () => {
  // Silently handle readline errors
});

/**
 * Graceful shutdown.
 */
function shutdown(): void {
  if (isShuttingDown) return;
  isShuttingDown = true;

  // Flush any pending events
  eventEmitter.flushSync();

  // Close readline
  rl.close();

  // Exit after a short delay to allow cleanup
  setTimeout(() => {
    process.exit(0);
  }, 100);
}

// Handle signals
process.on('SIGTERM', () => {
  shutdown();
});

process.on('SIGINT', () => {
  shutdown();
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  eventEmitter.error(undefined, `Uncaught exception: ${error.message}`, 'UNCAUGHT_EXCEPTION');
  eventEmitter.flushSync();
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);

  // Check if this is an AbortError (expected during stop/cancel operations)
  const isAbort =
    (reason instanceof Error && reason.name === 'AbortError') ||
    message.toLowerCase().includes('abort') ||
    message.toLowerCase().includes('cancel');

  if (isAbort) {
    return; // Don't emit error for expected aborts
  }

  eventEmitter.error(undefined, `Unhandled rejection: ${message}`, 'UNHANDLED_REJECTION');
  eventEmitter.flushSync();
});

// Signal that we're ready (using SidecarEvent format with camelCase)
process.stdout.write(JSON.stringify({ type: 'ready', sessionId: null, data: { timestamp: Date.now() } }) + '\n');
