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

// Log startup
console.error('[sidecar] Starting Gemini Cowork sidecar...');

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

    // Log request (to stderr so it doesn't interfere with IPC)
    console.error(`[sidecar] Request: ${request.command} (${request.id})`);

    // Handle the request
    const response = await handleRequest(request);

    // Log the response (to stderr)
    console.error(`[sidecar] Response: ${request.command} (${request.id}) success=${response.success}`);

    // Send response directly to stdout (Rust expects flat response, not wrapped)
    const responseLine = JSON.stringify(response) + '\n';
    const written = process.stdout.write(responseLine);
    console.error(`[sidecar] Wrote ${responseLine.length} bytes to stdout, buffered=${!written}`);

    // Flush any pending events
    eventEmitter.flushSync();

  } catch (error) {
    // Parse error - send error response
    console.error('[sidecar] Parse error:', error);

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
  console.error('[sidecar] stdin closed, shutting down...');
  shutdown();
});

// Handle errors
rl.on('error', (error) => {
  console.error('[sidecar] readline error:', error);
});

/**
 * Graceful shutdown.
 */
function shutdown(): void {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.error('[sidecar] Shutting down...');

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
  console.error('[sidecar] Received SIGTERM');
  shutdown();
});

process.on('SIGINT', () => {
  console.error('[sidecar] Received SIGINT');
  shutdown();
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[sidecar] Uncaught exception:', error);
  eventEmitter.error(undefined, `Uncaught exception: ${error.message}`, 'UNCAUGHT_EXCEPTION');
  eventEmitter.flushSync();
});

process.on('unhandledRejection', (reason) => {
  console.error('[sidecar] Unhandled rejection:', reason);
  const message = reason instanceof Error ? reason.message : String(reason);
  eventEmitter.error(undefined, `Unhandled rejection: ${message}`, 'UNHANDLED_REJECTION');
  eventEmitter.flushSync();
});

// Signal that we're ready (using SidecarEvent format with camelCase)
console.error('[sidecar] Ready and listening for requests');
process.stdout.write(JSON.stringify({ type: 'ready', sessionId: null, data: { timestamp: Date.now() } }) + '\n');
