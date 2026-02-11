import { createInterface, type Interface } from 'node:readline';
import type { IPCRequest } from '../../types.js';
import type { RuntimeRequestHandler, RuntimeTransport } from '../transport.js';

export interface StdioRuntimeTransportOptions {
  onClose?: () => void;
}

export class StdioRuntimeTransport implements RuntimeTransport {
  readonly id = 'stdio';

  private rl: Interface | null = null;
  private handler: RuntimeRequestHandler | null = null;
  private stopped = false;

  constructor(private readonly options: StdioRuntimeTransportOptions = {}) {}

  async start(handler: RuntimeRequestHandler): Promise<void> {
    if (this.rl) return;
    this.handler = handler;
    this.stopped = false;

    this.rl = createInterface({
      input: process.stdin,
      terminal: false,
    });

    this.rl.on('line', (line) => {
      if (this.stopped) return;
      void this.processLine(line);
    });

    this.rl.on('close', () => {
      if (!this.stopped) {
        this.options.onClose?.();
      }
    });

    this.rl.on('error', () => {
      // Keep compatibility with previous sidecar behavior: ignore readline errors.
    });
  }

  sendReady(): void {
    process.stdout.write(JSON.stringify({ type: 'ready', sessionId: null, data: { timestamp: Date.now() } }) + '\n');
  }

  private async processLine(line: string): Promise<void> {
    if (!line.trim()) return;

    try {
      const request = JSON.parse(line) as IPCRequest;
      const response = await this.handler!(request);
      process.stdout.write(JSON.stringify(response) + '\n');
    } catch {
      process.stdout.write(JSON.stringify({
        id: 'unknown',
        success: false,
        error: 'Failed to parse request',
      }) + '\n');
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}
