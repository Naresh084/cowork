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

  start(port = 8765): void {
    if (this.wss) return;
    this.port = port;
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', (socket: WebSocket) => {
      this.socket = socket;
      socket.on('message', (data: WebSocket.RawData) => this.handleMessage(data.toString()));
      socket.on('close', () => {
        this.socket = null;
      });
    });
  }

  isConnected(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  getPort(): number {
    return this.port;
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
      const message = JSON.parse(raw) as { id?: string; error?: string; result?: unknown };
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
    } catch {
      // ignore malformed messages
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
