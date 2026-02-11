import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { dirname } from 'node:path';
import { handleRequest } from './ipc-handler.js';
import { bootstrapRuntime } from './runtime/bootstrap.js';
import { resolveDaemonPaths, resolveDefaultAppDataDir } from './runtime/daemon-paths.js';
import { LocalIpcServerTransport } from './runtime/transports/local-ipc-server.js';

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

function parseTcpEndpoint(endpoint: string): { host: string; port: number } | null {
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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function tryConnectEndpoint(endpoint: string, timeoutMs = 250): Promise<boolean> {
  return await new Promise((resolve) => {
    let settled = false;
    const tcp = parseTcpEndpoint(endpoint);
    const socket = tcp
      ? createConnection({ host: tcp.host, port: tcp.port })
      : createConnection(endpoint);

    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(false));
  });
}

async function isEndpointReachable(endpoint: string, timeoutMs = 2500): Promise<boolean> {
  const deadline = Date.now() + Math.max(timeoutMs, 100);
  while (Date.now() < deadline) {
    if (await tryConnectEndpoint(endpoint)) {
      return true;
    }
    await sleep(100);
  }
  return false;
}

async function ensureAuthToken(tokenFile: string): Promise<string> {
  await mkdir(dirname(tokenFile), { recursive: true });
  if (existsSync(tokenFile)) {
    const existing = (await readFile(tokenFile, 'utf8')).trim();
    if (existing) return existing;
  }

  const token = randomBytes(32).toString('hex');
  await writeFile(tokenFile, token, { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') {
    await chmod(tokenFile, 0o600).catch(() => undefined);
  }
  return token;
}

async function acquireLock(lockFile: string, endpoint: string): Promise<() => Promise<void>> {
  await mkdir(dirname(lockFile), { recursive: true });

  const createLock = async (): Promise<() => Promise<void>> => {
    const handle = await open(lockFile, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }, null, 2), 'utf8');
    } finally {
      await handle.close();
    }

    return async () => {
      await rm(lockFile, { force: true }).catch(() => undefined);
    };
  };

  try {
    return await createLock();
  } catch {
    try {
      const raw = await readFile(lockFile, 'utf8');
      const parsed = JSON.parse(raw) as { pid?: number };
      if (typeof parsed.pid === 'number' && isPidAlive(parsed.pid)) {
        // Treat the lock as authoritative only if the daemon endpoint is reachable.
        // This avoids false positives from PID reuse after crashes.
        const reachable = await isEndpointReachable(endpoint, 3000);
        if (reachable) {
          throw new Error(`Daemon already running (pid ${parsed.pid})`);
        }
      }
    } catch (error) {
      if ((error as Error).message.includes('Daemon already running')) {
        throw error;
      }
    }

    await rm(lockFile, { force: true }).catch(() => undefined);
    return createLock();
  }
}

async function main(): Promise<void> {
  const appDataDir =
    getArgValue('--app-data-dir') ||
    process.env.COWORK_APP_DATA_DIR ||
    resolveDefaultAppDataDir();

  const defaults = resolveDaemonPaths(appDataDir);
  const endpoint = getArgValue('--endpoint') || process.env.COWORK_DAEMON_ENDPOINT || defaults.endpoint;
  const tokenFile = getArgValue('--token-file') || process.env.COWORK_DAEMON_TOKEN_FILE || defaults.tokenFile;
  const lockFile = getArgValue('--lock-file') || process.env.COWORK_DAEMON_LOCK_FILE || defaults.lockFile;

  const releaseLock = await acquireLock(lockFile, endpoint);
  const token = await ensureAuthToken(tokenFile);

  const transport = new LocalIpcServerTransport({
    endpoint,
    authToken: token,
  });

  const runtime = await bootstrapRuntime({
    transport,
    disableStdoutSink: true,
    exitOnShutdown: true,
  });

  // In daemon mode, background capabilities must stay active even with no UI
  // connection. Initialize runtime services immediately on boot.
  const init = await handleRequest({
    id: `daemon-init-${Date.now()}`,
    command: 'initialize',
    params: { appDataDir },
    authToken: token,
  });
  if (!init.success) {
    throw new Error(init.error || 'Failed to initialize daemon services');
  }

  const cleanup = async (): Promise<void> => {
    await releaseLock();
  };

  process.on('exit', () => {
    void cleanup();
  });

  process.on('SIGTERM', () => {
    void cleanup();
    void runtime.shutdown();
  });

  process.on('SIGINT', () => {
    void cleanup();
    void runtime.shutdown();
  });
}

main().catch((error) => {
  process.stderr.write(`[daemon] Failed to start: ${String(error)}\n`);
  process.exit(1);
});
