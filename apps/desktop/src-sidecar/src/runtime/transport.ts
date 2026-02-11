import type { EventSink } from '../event-emitter.js';
import type { IPCRequest, IPCResponse } from '../types.js';

export type RuntimeRequestHandler = (request: IPCRequest) => Promise<IPCResponse>;

export interface RuntimeTransport {
  readonly id: string;
  start(handler: RuntimeRequestHandler): Promise<void>;
  stop(): Promise<void>;
  sendReady?(): void;
  getEventSink?(): EventSink | null;
}
