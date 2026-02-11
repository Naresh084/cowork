import { describe, expect, it, vi } from 'vitest';
import { RemoteAccessService } from './service.js';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('remote-access initialize', () => {
  it('does not block on tunnel health refresh scheduling', async () => {
    const service = new RemoteAccessService() as unknown as {
      initialize: (appDataDir: string) => Promise<void>;
      loadConfig: () => Promise<void>;
      tunnelHealthRefreshPromise: Promise<void> | null;
    };

    const deferred = createDeferred<void>();
    service.tunnelHealthRefreshPromise = deferred.promise;
    const loadConfigSpy = vi
      .spyOn(service, 'loadConfig')
      .mockImplementation(async () => undefined);

    const initializePromise = service.initialize('/tmp/geminicowork-sidecar-test');
    const resolution = await Promise.race([
      initializePromise.then(() => 'initialized'),
      new Promise<'timed_out'>((resolve) => {
        setTimeout(() => resolve('timed_out'), 25);
      }),
    ]);

    expect(loadConfigSpy).toHaveBeenCalledTimes(1);
    expect(resolution).toBe('initialized');

    deferred.resolve();
    await initializePromise;
  });
});
