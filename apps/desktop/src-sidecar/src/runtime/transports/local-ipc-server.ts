// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { dirname } from 'node:path';
import type { EventSink, SequencedSidecarEvent } from '../../event-emitter.js';
import type { IPCRequest } from '../../types.js';
import type { RuntimeRequestHandler, RuntimeTransport } from '../transport.js';

interface LocalIpcClient {
  socket: Socket;
  buffer: string;
}

export interface LocalIpcServerTransportOptions {
  endpoint: string;
  authToken?: string;
}

interface TcpEndpoint {
  host: string;
  port: number;
}

function parseTcpEndpoint(endpoint: string): TcpEndpoint | null {
  if (!endpoint.startsWith('tcp://')) return null;
  try {
    const parsed = new URL(endpoint);
    const port = Number(parsed.port || '0');
    if (!Number.isFinite(port) || port <= 0 || port > 65535) return null;
    return {
      host: parsed.hostname || '127.0.0.1',
      port,
    };
  } catch {
    return null;
  }
}

class LocalIpcEventSink implements EventSink {
  readonly id = 'local-ipc';

  constructor(private readonly broadcast: (event: SequencedSidecarEvent) => void) {}

  emit(event: SequencedSidecarEvent): void {
    this.broadcast(event);
  }
}

export class LocalIpcServerTransport implements RuntimeTransport {
  readonly id = 'local-ipc-server';

  private server: Server | null = null;
  private clients = new Map<Socket, LocalIpcClient>();
  private handler: RuntimeRequestHandler | null = null;
  private readonly sink: LocalIpcEventSink;

  constructor(private readonly options: LocalIpcServerTransportOptions) {
    this.sink = new LocalIpcEventSink((event) => this.broadcastEvent(event));
  }

  getEventSink(): EventSink {
    return this.sink;
  }

  async start(handler: RuntimeRequestHandler): Promise<void> {
    if (this.server) return;
    this.handler = handler;

    if (process.platform !== 'win32') {
      const tcp = parseTcpEndpoint(this.options.endpoint);
      if (!tcp) {
        const endpointDir = dirname(this.options.endpoint);
        await mkdir(endpointDir, { recursive: true });
        if (existsSync(this.options.endpoint)) {
          await rm(this.options.endpoint, { force: true });
        }
      }
    }

    this.server = createServer((socket) => {
      const client: LocalIpcClient = { socket, buffer: '' };
      this.clients.set(socket, client);
      socket.setEncoding('utf8');

      socket.on('data', (chunk: string | Buffer) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        void this.handleData(client, text);
      });

      socket.on('close', () => {
        this.clients.delete(socket);
      });

      socket.on('error', () => {
        this.clients.delete(socket);
      });
    });

    await new Promise<void>((resolve, reject) => {
      const server = this.server!;
      server.once('error', reject);
      const tcp = parseTcpEndpoint(this.options.endpoint);
      if (tcp) {
        server.listen(tcp.port, tcp.host, () => resolve());
      } else {
        server.listen(this.options.endpoint, () => resolve());
      }
    });
  }

  async stop(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        client.socket.destroy();
      } catch {
        // Ignore socket shutdown failures.
      }
    }
    this.clients.clear();

    const current = this.server;
    this.server = null;

    if (current) {
      await new Promise<void>((resolve) => {
        current.close(() => resolve());
      });
    }

    const tcp = parseTcpEndpoint(this.options.endpoint);
    if (process.platform !== 'win32' && !tcp && existsSync(this.options.endpoint)) {
      await rm(this.options.endpoint, { force: true }).catch(() => undefined);
    }
  }

  private async handleData(client: LocalIpcClient, chunk: string): Promise<void> {
    client.buffer += chunk;

    while (true) {
      const newlineIndex = client.buffer.indexOf('\n');
      if (newlineIndex < 0) break;

      const rawLine = client.buffer.slice(0, newlineIndex).trim();
      client.buffer = client.buffer.slice(newlineIndex + 1);

      if (!rawLine) continue;

      let request: IPCRequest;
      try {
        request = JSON.parse(rawLine) as IPCRequest;
      } catch {
        this.send(client.socket, {
          id: 'unknown',
          success: false,
          error: 'Failed to parse request',
        });
        continue;
      }

      if (this.options.authToken && request.authToken !== this.options.authToken) {
        this.send(client.socket, {
          id: request.id || 'unknown',
          success: false,
          error: 'Unauthorized',
        });
        continue;
      }

      try {
        const response = await this.handler!(request);
        this.send(client.socket, response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.send(client.socket, {
          id: request.id || 'unknown',
          success: false,
          error: message,
        });
      }
    }
  }

  private broadcastEvent(event: SequencedSidecarEvent): void {
    if (this.clients.size === 0) return;
    for (const client of this.clients.values()) {
      this.send(client.socket, event);
    }
  }

  private send(socket: Socket, payload: unknown): void {
    if (socket.destroyed) return;
    try {
      socket.write(JSON.stringify(payload) + '\n');
    } catch {
      try {
        socket.destroy();
      } catch {
        // Ignore socket destruction failures.
      }
    }
  }
}
