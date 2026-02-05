import { WebSocketServer, WebSocket } from 'ws';
import { generateId } from '@gemini-cowork/shared';
import { createServer, type Server } from 'net';

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
  private startAttempts = 0;
  private maxStartAttempts = 3;

  /**
   * Check if a port is available
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server: Server = createServer();
      server.once('error', () => {
        resolve(false);
      });
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port);
    });
  }

  /**
   * Start the WebSocket server
   */
  async start(port = 8765): Promise<void> {
    if (this.wss) {
      // Already started, just return
      console.error('[ChromeBridge] Server already running');
      return;
    }

    this.port = port;
    this.startAttempts++;

    // Check if port is available
    const portAvailable = await this.isPortAvailable(port);
    if (!portAvailable) {
      console.error(`[ChromeBridge] Port ${port} in use, checking if it's our old instance...`);

      // Try to connect to see if it's a valid WebSocket server
      try {
        const testWs = new WebSocket(`ws://localhost:${port}`);
        await new Promise<void>((resolve, reject) => {
          testWs.on('open', () => {
            // It's a working WS server - maybe from another instance
            testWs.close();
            console.error('[ChromeBridge] Found existing WebSocket server, reusing connection');
            resolve();
          });
          testWs.on('error', () => {
            // Not a valid WS server, the port is taken by something else
            reject(new Error('Port in use by non-WS server'));
          });
          setTimeout(() => reject(new Error('Connection timeout')), 1000);
        });

        // Port has a valid WS server, we don't need to start our own
        // Just mark as started so we can try to connect to it
        return;
      } catch {
        // Port is in use but not by a valid WS server
        // Try next port
        if (this.startAttempts < this.maxStartAttempts) {
          console.error(`[ChromeBridge] Trying port ${port + 1}...`);
          return this.start(port + 1);
        }
        console.error(`[ChromeBridge] Failed to start after ${this.maxStartAttempts} attempts`);
        return;
      }
    }

    try {
      this.wss = new WebSocketServer({ port });
      console.error(`[ChromeBridge] WebSocket server started on port ${port}`);

      this.wss.on('connection', (socket: WebSocket) => {
        console.error('[ChromeBridge] Extension connected!');
        this.socket = socket;

        socket.on('message', (data: WebSocket.RawData) => {
          const message = data.toString();
          this.handleMessage(message);
        });

        socket.on('close', () => {
          console.error('[ChromeBridge] Extension disconnected');
          this.socket = null;
          this.extensionVersion = null;
        });

        socket.on('error', (err) => {
          console.error('[ChromeBridge] Socket error:', err.message);
        });
      });

      this.wss.on('error', (err) => {
        console.error('[ChromeBridge] Server error:', err.message);
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
    await this.start();

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
        console.error(`[ChromeBridge] Extension hello received, version: ${this.extensionVersion}`);

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
