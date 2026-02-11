import { eventEmitter, STDOUT_EVENT_SINK_ID } from '../event-emitter.js';
import { handleRequest } from '../ipc-handler.js';
import { remoteAccessService } from '../remote-access/service.js';
import type { IPCRequest, IPCResponse } from '../types.js';
import type { RuntimeTransport } from './transport.js';

function isAbortLike(reason: unknown): boolean {
  if (reason instanceof Error) {
    const msg = reason.message.toLowerCase();
    return reason.name === 'AbortError' || msg.includes('abort') || msg.includes('cancel');
  }
  const text = String(reason || '').toLowerCase();
  return text.includes('abort') || text.includes('cancel');
}

export interface RuntimeBootstrapOptions {
  transport: RuntimeTransport;
  requestHandler?: (request: IPCRequest) => Promise<IPCResponse>;
  disableStdoutSink?: boolean;
  exitOnShutdown?: boolean;
}

export interface RuntimeBootstrapHandle {
  shutdown: () => Promise<void>;
}

export async function bootstrapRuntime(options: RuntimeBootstrapOptions): Promise<RuntimeBootstrapHandle> {
  const requestHandler = options.requestHandler || handleRequest;
  const transport = options.transport;

  if (options.disableStdoutSink) {
    eventEmitter.removeSink(STDOUT_EVENT_SINK_ID);
  }

  const transportSink = transport.getEventSink?.();
  if (transportSink && !eventEmitter.hasSink(transportSink.id)) {
    eventEmitter.addSink(transportSink);
  }

  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    eventEmitter.flushSync();

    try {
      await transport.stop();
    } catch {
      // Ignore transport shutdown issues.
    }

    try {
      await remoteAccessService.shutdown();
    } catch (error) {
      process.stderr.write(`[shutdown] Remote access shutdown warning: ${String(error)}\n`);
    }

    if (options.exitOnShutdown) {
      setTimeout(() => {
        process.exit(0);
      }, 100);
    }
  };

  await transport.start(async (request) => {
    return requestHandler(request);
  });
  transport.sendReady?.();

  process.on('SIGTERM', () => {
    void shutdown();
  });

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('uncaughtException', (error) => {
    eventEmitter.error(undefined, `Uncaught exception: ${error.message}`, 'UNCAUGHT_EXCEPTION');
    eventEmitter.flushSync();
  });

  process.on('unhandledRejection', (reason) => {
    if (isAbortLike(reason)) {
      return;
    }

    const message = reason instanceof Error ? reason.message : String(reason);
    eventEmitter.error(undefined, `Unhandled rejection: ${message}`, 'UNHANDLED_REJECTION');
    eventEmitter.flushSync();
  });

  return { shutdown };
}
