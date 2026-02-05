import { WebSocketServer, WebSocket } from 'ws';
import { generateId } from '@gemini-cowork/shared';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface ChromeScreenshot {
  data: string;
  mimeType: string;
  url?: string;
  width?: number;
  height?: number;
}

export class ChromeBridge {
  private wss: WebSocketServer | null = null;
  private socket: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private port = 8765;
  private extensionVersion: string | null = null;
  private connectionPromise: Promise<void> | null = null;
  private connectionResolve: (() => void) | null = null;

  start(port = 8765): void {
    if (this.wss) {
      // Already started, just return
      return;
    }

    this.port = port;

    try {
      this.wss = new WebSocketServer({ port });
      console.log(`[ChromeBridge] WebSocket server started on port ${port}`);

      this.wss.on('connection', (socket: WebSocket) => {
        console.log('[ChromeBridge] Extension connected!');
        this.socket = socket;

        socket.on('message', (data: WebSocket.RawData) => {
          const message = data.toString();
          this.handleMessage(message);
        });

        socket.on('close', () => {
          console.log('[ChromeBridge] Extension disconnected');
          this.socket = null;
          this.extensionVersion = null;
        });

        socket.on('error', (err) => {
          console.error('[ChromeBridge] Socket error:', err.message);
        });
      });

      this.wss.on('error', (err) => {
        console.error('[ChromeBridge] Server error:', err.message);
        // Port might be in use, try to recover
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          console.log('[ChromeBridge] Port in use, attempting to reuse...');
        }
      });
    } catch (err) {
      console.error('[ChromeBridge] Failed to start server:', err);
    }
  }

  /**
   * Wait for extension to connect with timeout
   */
  async waitForConnection(timeoutMs = 3000): Promise<boolean> {
    if (this.isConnected()) {
      return true;
    }

    // Start the server if not already started
    this.start();

    // Create a promise that resolves when connected
    this.connectionPromise = new Promise<void>((resolve) => {
      this.connectionResolve = resolve;
    });

    // Race between connection and timeout
    const timeout = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
    });

    try {
      await Promise.race([this.connectionPromise, timeout]);
      return this.isConnected();
    } catch {
      return false;
    }
  }

  isConnected(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  getPort(): number {
    return this.port;
  }

  getExtensionVersion(): string | null {
    return this.extensionVersion;
  }

  async requestScreenshot(): Promise<ChromeScreenshot> {
    const result = await this.sendRequest('capture', {});
    return result as ChromeScreenshot;
  }

  async performAction(action: Record<string, unknown>): Promise<unknown> {
    return this.sendRequest('action', { action });
  }

  private handleMessage(raw: string): void {
    try {
      const message = JSON.parse(raw) as { id?: string; type?: string; error?: string; result?: unknown; version?: string };

      // Handle hello message from extension
      if (message.type === 'hello') {
        this.extensionVersion = message.version || 'unknown';
        console.log(`[ChromeBridge] Extension hello received, version: ${this.extensionVersion}`);

        // Resolve any pending connection promise
        if (this.connectionResolve) {
          this.connectionResolve();
          this.connectionResolve = null;
        }
        return;
      }

      // Handle response messages (must have id)
      if (!message.id) return;

      const pending = this.pending.get(message.id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message.result);
      }
    } catch (err) {
      console.error('[ChromeBridge] Failed to parse message:', err);
    }
  }

  private sendRequest(type: string, payload: Record<string, unknown>): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Chrome extension not connected'));
    }

    const id = generateId('chrome');
    const message = JSON.stringify({ id, type, ...payload });
    this.socket.send(message);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Chrome extension request timed out'));
      }, 15000);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }
}

export const chromeBridge = new ChromeBridge();
