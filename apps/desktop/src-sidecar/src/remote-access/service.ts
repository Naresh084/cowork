import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { URL } from 'node:url';
import type { Duplex } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import QRCode from 'qrcode';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { agentRunner } from '../agent-runner.js';
import { cronService } from '../cron/index.js';
import { eventEmitter, type SidecarEvent } from '../event-emitter.js';
import type { Attachment } from '../types.js';
import { workflowService } from '../workflow/index.js';
import type {
  PairingPayload,
  PairingQrResult,
  RemoteAccessConfig,
  RemoteAccessDevice,
  RemoteAccessDeviceSummary,
  RemoteAccessStatus,
  RemoteConfigHealth,
  RemoteDiagnosticEntry,
  RemoteDiagnosticLevel,
  RemoteEnableInput,
  RemoteTunnelAuthStatus,
  RemoteTunnelMode,
  RemoteTunnelState,
  RemoteTunnelOptionsInput,
  RemoteTunnelVisibility,
} from './types.js';

const PAIRING_TTL_MS = 2 * 60 * 1000;
const DEVICE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_JSON_BODY_BYTES = 25 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 15_000;
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const CLOUDFLARE_START_TIMEOUT_MS = 20_000;
const TUNNEL_HEALTH_REFRESH_COOLDOWN_MS = 60_000;
const DIAGNOSTIC_LOG_LIMIT = 50;
const execFileAsync = promisify(execFile);

interface PairingRecord {
  code: string;
  expiresAt: number;
}

interface WsClientState {
  deviceId: string;
  sessionId?: string;
}

interface RemoteEnableSettings {
  publicBaseUrl: string | null;
  tunnelMode: RemoteTunnelMode;
  tunnelName: string | null;
  tunnelDomain: string | null;
  tunnelVisibility: RemoteTunnelVisibility;
  bindPort: number;
}

interface RemoteTunnelOptionsSettings {
  publicBaseUrl: string | null;
  tunnelName: string | null;
  tunnelDomain: string | null;
  tunnelVisibility: RemoteTunnelVisibility;
}

interface InstallCommand {
  command: string;
  args: string[];
}

interface CommandOutput {
  stdout: string;
  stderr: string;
}

function now(): number {
  return Date.now();
}

function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseTunnelMode(value: unknown): RemoteTunnelMode | null {
  if (value === 'tailscale' || value === 'cloudflare' || value === 'custom') {
    return value;
  }
  return null;
}

function normalizeTunnelVisibility(value: unknown): RemoteTunnelVisibility {
  return value === 'private' ? 'private' : 'public';
}

function normalizePort(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const integer = Math.trunc(value);
  if (integer < 0 || integer > 65535) return 0;
  return integer;
}

function normalizeBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!parsed.protocol.startsWith('http')) return null;
    parsed.hash = '';
    parsed.search = '';
    const normalized = parsed.toString().replace(/\/+$/, '');
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

function normalizeTunnelName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 64);
}

function normalizeTunnelDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    const hostname = trimTrailingDot(parsed.hostname.toLowerCase());
    return hostname || null;
  } catch {
    return null;
  }
}

function deriveUrlFromDomain(domain: string | null): string | null {
  if (!domain) return null;
  return `https://${trimTrailingDot(domain.toLowerCase())}`;
}

function defaultConfig(): RemoteAccessConfig {
  const ts = now();
  return {
    enabled: false,
    bindHost: '127.0.0.1',
    bindPort: 0,
    publicBaseUrl: null,
    tunnelMode: 'tailscale',
    tunnelName: null,
    tunnelDomain: null,
    tunnelVisibility: 'public',
    devices: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

function toDeviceSummary(device: RemoteAccessDevice): RemoteAccessDeviceSummary {
  return {
    id: device.id,
    name: device.name,
    platform: device.platform,
    createdAt: device.createdAt,
    lastUsedAt: device.lastUsedAt,
    expiresAt: device.expiresAt,
    revokedAt: device.revokedAt,
  };
}

function deriveWsEndpoint(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  parsed.pathname = '/v1/ws';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function trimTrailingDot(value: string): string {
  return value.endsWith('.') ? value.slice(0, -1) : value;
}

function formatCommandError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function parseCloudflareUrl(output: string): string | null {
  const match = output.match(/https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/);
  return match ? match[0] : null;
}

export class RemoteAccessService {
  private configPath: string | null = null;
  private configBackupPath: string | null = null;
  private config: RemoteAccessConfig = defaultConfig();
  private localBaseUrl: string | null = null;
  private server: Server | null = null;
  private wsServer: WebSocketServer | null = null;
  private wsClients = new Map<WebSocket, WsClientState>();
  private pairingCodes = new Map<string, PairingRecord>();
  private unsubscribeEvents: (() => void) | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private initialized = false;
  private tunnelState: RemoteTunnelState = 'stopped';
  private tunnelPublicUrl: string | null = null;
  private tunnelLastError: string | null = null;
  private tunnelBinaryInstalled = false;
  private tunnelBinaryPath: string | null = null;
  private tunnelAuthStatus: RemoteTunnelAuthStatus = 'unknown';
  private tunnelStartedAt: number | null = null;
  private tunnelPid: number | null = null;
  private tunnelProcess: ChildProcessWithoutNullStreams | null = null;
  private lastTunnelHealthRefreshAt = 0;
  private tunnelHealthRefreshPromise: Promise<void> | null = null;
  private configHealth: RemoteConfigHealth = 'valid';
  private configRepairReason: string | null = null;
  private lastOperation: string | null = null;
  private lastOperationAt: number | null = null;
  private diagnostics: RemoteDiagnosticEntry[] = [];

  async initialize(appDataDir: string): Promise<void> {
    if (!appDataDir.trim()) {
      throw new Error('appDataDir is required for remote access initialization.');
    }

    const nextConfigPath = join(appDataDir, 'remote-access', 'config.json');
    const changedPath = this.configPath !== nextConfigPath;

    this.configPath = nextConfigPath;
    this.configBackupPath = `${nextConfigPath}.bak`;

    if (!this.initialized || changedPath) {
      await this.loadConfig();
      this.initialized = true;
      if (this.config.enabled && !this.server) {
        await this.start();
      }
    }

    this.scheduleTunnelHealthRefresh();
  }

  private scheduleTunnelHealthRefresh(): void {
    void this.refreshTunnelHealthWithCooldown(false).catch(() => {
      // Best effort on initialization; explicit refresh actions still surface errors.
    });
  }

  private markOperation(step: string): void {
    this.lastOperation = step;
    this.lastOperationAt = now();
  }

  private pushDiagnostic(
    level: RemoteDiagnosticLevel,
    step: string,
    message: string,
    commandHint?: string,
  ): void {
    this.diagnostics = [
      {
        id: randomId('diag'),
        level,
        step,
        message: message.trim(),
        at: now(),
        commandHint,
      },
      ...this.diagnostics,
    ].slice(0, DIAGNOSTIC_LOG_LIMIT);
  }

  private setConfigRepair(reason: string): void {
    this.configHealth = 'repair_required';
    this.configRepairReason = reason;
    this.pushDiagnostic('warn', 'config', reason);
  }

  private clearConfigRepair(): void {
    this.configHealth = 'valid';
    this.configRepairReason = null;
  }

  private async refreshTunnelHealthWithCooldown(force: boolean): Promise<void> {
    const elapsed = now() - this.lastTunnelHealthRefreshAt;
    if (!force && elapsed < TUNNEL_HEALTH_REFRESH_COOLDOWN_MS) {
      return;
    }

    if (this.tunnelHealthRefreshPromise) {
      await this.tunnelHealthRefreshPromise;
      return;
    }

    this.tunnelHealthRefreshPromise = (async () => {
      try {
        await this.refreshTunnelHealth();
        this.lastTunnelHealthRefreshAt = now();
      } catch (error) {
        this.tunnelLastError = `Tunnel check failed: ${formatCommandError(error)}`;
        this.markOperation('refresh');
        this.pushDiagnostic('error', 'refresh', this.tunnelLastError);
        throw error;
      } finally {
        this.tunnelHealthRefreshPromise = null;
      }
    })();

    await this.tunnelHealthRefreshPromise;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.configPath) {
      throw new Error('Remote access service is not initialized.');
    }
  }

  private async loadConfig(): Promise<void> {
    this.ensureInitializedPath();
    const fallback = defaultConfig();

    const primaryFailureReason = await this.tryLoadConfigFromPath(this.configPath!, fallback);
    if (!primaryFailureReason) {
      this.clearConfigRepair();
      return;
    }

    if (primaryFailureReason === '__missing__') {
      this.config = fallback;
      this.clearConfigRepair();
      await this.persistConfig();
      return;
    }

    if (this.configBackupPath) {
      const backupFailureReason = await this.tryLoadConfigFromPath(this.configBackupPath, fallback);
      if (!backupFailureReason) {
        this.setConfigRepair(`Recovered remote setup from backup because primary config was invalid: ${primaryFailureReason}`);
        await this.persistConfig();
        this.markOperation('config_repair');
        return;
      }
    }

    this.config = fallback;
    this.setConfigRepair(`Remote setup config was reset. Reason: ${primaryFailureReason}`);
    await this.persistConfig();
    this.markOperation('config_repair');
  }

  private async tryLoadConfigFromPath(path: string, fallback: RemoteAccessConfig): Promise<string | null> {
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as Partial<RemoteAccessConfig>;
      this.config = this.parseConfigValue(parsed, fallback);
      return null;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
        return '__missing__';
      }
      return formatCommandError(error);
    }
  }

  private parseConfigValue(parsed: Partial<RemoteAccessConfig>, fallback: RemoteAccessConfig): RemoteAccessConfig {
    const parsedMode = parseTunnelMode(parsed.tunnelMode);
    if (!parsedMode) {
      throw new Error('Invalid tunnel mode in config. Expected tailscale, cloudflare, or custom.');
    }

    return {
      enabled: Boolean(parsed.enabled),
      bindHost: '127.0.0.1',
      bindPort: normalizePort(parsed.bindPort),
      publicBaseUrl: normalizeBaseUrl(parsed.publicBaseUrl),
      tunnelMode: parsedMode,
      tunnelName: normalizeTunnelName(parsed.tunnelName),
      tunnelDomain: normalizeTunnelDomain(parsed.tunnelDomain),
      tunnelVisibility: normalizeTunnelVisibility(parsed.tunnelVisibility),
      devices: Array.isArray(parsed.devices)
        ? parsed.devices
          .filter((device): device is RemoteAccessDevice => {
            if (!device || typeof device !== 'object') return false;
            const candidate = device as Partial<RemoteAccessDevice>;
            return (
              typeof candidate.id === 'string' &&
              typeof candidate.name === 'string' &&
              typeof candidate.platform === 'string' &&
              typeof candidate.tokenHash === 'string' &&
              typeof candidate.createdAt === 'number' &&
              typeof candidate.lastUsedAt === 'number' &&
              typeof candidate.expiresAt === 'number'
            );
          })
          .map((device) => ({
            ...device,
            revokedAt: typeof device.revokedAt === 'number' ? device.revokedAt : undefined,
          }))
        : [],
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : fallback.createdAt,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : fallback.updatedAt,
    };
  }

  private ensureInitializedPath(): void {
    if (!this.configPath) {
      throw new Error('Remote access config path not ready.');
    }
  }

  private async persistConfig(): Promise<void> {
    this.ensureInitializedPath();
    const parent = dirname(this.configPath!);
    const payload = JSON.stringify(this.config, null, 2);
    await mkdir(parent, { recursive: true });
    await writeFile(this.configPath!, payload, 'utf8');
    if (this.configBackupPath) {
      await writeFile(this.configBackupPath, payload, 'utf8');
    }
  }

  private scheduleConfigSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persistConfig().catch((error) => {
        process.stderr.write(`[remote-access] Failed to persist config: ${String(error)}\n`);
      });
    }, 250);
  }

  async enable(input: RemoteEnableInput = {}): Promise<RemoteAccessStatus> {
    this.ensureInitialized();
    this.markOperation('enable');

    const settings = this.normalizeEnableInput(input);
    this.config.enabled = true;
    this.config.bindPort = settings.bindPort;
    this.config.publicBaseUrl = settings.publicBaseUrl;
    this.config.tunnelMode = settings.tunnelMode;
    this.config.tunnelName = settings.tunnelName;
    this.config.tunnelDomain = settings.tunnelDomain;
    this.config.tunnelVisibility = settings.tunnelVisibility;
    this.config.updatedAt = now();
    this.clearConfigRepair();
    this.pushDiagnostic('info', 'enable', `Remote access enabled with ${settings.tunnelMode}.`);

    await this.persistConfig();
    await this.start();
    return this.getStatus();
  }

  async disable(): Promise<RemoteAccessStatus> {
    this.ensureInitialized();
    this.markOperation('disable');
    await this.stopTunnel();
    this.config.enabled = false;
    this.config.updatedAt = now();
    this.pushDiagnostic('info', 'disable', 'Remote access disabled.');
    await this.persistConfig();
    await this.stop();
    return this.getStatus();
  }

  async updatePublicBaseUrl(publicBaseUrl: string | null): Promise<RemoteAccessStatus> {
    this.ensureInitialized();
    this.markOperation('set_endpoint');
    this.config.publicBaseUrl = this.resolvePublicBaseUrlForMode(
      this.config.tunnelMode,
      normalizeBaseUrl(publicBaseUrl),
      this.config.tunnelDomain,
    );
    this.config.updatedAt = now();
    this.clearConfigRepair();
    this.pushDiagnostic(
      'info',
      'set_endpoint',
      `Endpoint updated to ${this.config.publicBaseUrl || 'auto'}.`,
    );
    await this.persistConfig();
    return this.getStatus();
  }

  async updateTunnelMode(mode: RemoteTunnelMode): Promise<RemoteAccessStatus> {
    this.ensureInitialized();
    const nextMode = parseTunnelMode(mode);
    if (!nextMode) {
      throw new Error(`Unsupported tunnel mode "${String(mode)}".`);
    }
    if (this.config.tunnelMode !== nextMode) {
      await this.stopTunnel();
    }
    this.config.tunnelMode = nextMode;
    this.config.publicBaseUrl = this.resolvePublicBaseUrlForMode(
      this.config.tunnelMode,
      this.config.publicBaseUrl,
      this.config.tunnelDomain,
    );
    this.config.updatedAt = now();
    this.clearConfigRepair();
    this.markOperation('set_provider');
    this.pushDiagnostic('info', 'set_provider', `Tunnel provider set to ${nextMode}.`);
    await this.persistConfig();
    await this.refreshTunnelHealthWithCooldown(true);
    return this.getStatus();
  }

  async updateTunnelOptions(input: RemoteTunnelOptionsInput): Promise<RemoteAccessStatus> {
    this.ensureInitialized();
    this.markOperation('set_options');
    const next = this.normalizeTunnelOptionsInput(input, this.config.tunnelMode, this.config.publicBaseUrl);
    const shouldRestartManagedTunnel =
      this.config.tunnelName !== next.tunnelName ||
      this.config.tunnelDomain !== next.tunnelDomain ||
      this.config.tunnelVisibility !== next.tunnelVisibility;

    if (shouldRestartManagedTunnel && this.tunnelState === 'running') {
      await this.stopTunnel();
    }

    this.config.tunnelName = next.tunnelName;
    this.config.tunnelDomain = next.tunnelDomain;
    this.config.tunnelVisibility = next.tunnelVisibility;
    this.config.publicBaseUrl = next.publicBaseUrl;
    this.config.updatedAt = now();
    this.clearConfigRepair();
    this.pushDiagnostic('info', 'set_options', 'Tunnel options saved.');
    await this.persistConfig();
    await this.refreshTunnelHealthWithCooldown(true);
    return this.getStatus();
  }

  async refreshTunnelStatus(): Promise<RemoteAccessStatus> {
    this.ensureInitialized();
    this.markOperation('refresh');
    await this.refreshTunnelHealthWithCooldown(true);
    return this.getStatus();
  }

  async installTunnelBinary(): Promise<RemoteAccessStatus> {
    this.ensureInitialized();
    this.markOperation('install');

    const binary = this.getTunnelBinaryName(this.config.tunnelMode);
    if (!binary) {
      throw new Error('Automatic install is unavailable for custom tunnel mode.');
    }

    const installCommand = await this.resolveInstallCommand(binary);
    if (!installCommand) {
      throw new Error(
        `Automatic install is not supported on ${process.platform}. Install "${binary}" manually and retry.`,
      );
    }

    this.tunnelState = 'starting';
    this.tunnelLastError = null;
    this.pushDiagnostic('info', 'install', `Installing ${binary} dependency.`);

    try {
      await this.runCommand(installCommand.command, installCommand.args, INSTALL_TIMEOUT_MS);
    } catch (error) {
      this.tunnelState = 'error';
      this.tunnelLastError = `Install failed: ${formatCommandError(error)}`;
      this.pushDiagnostic('error', 'install', this.tunnelLastError, `${installCommand.command} ${installCommand.args.join(' ')}`);
      throw new Error(this.tunnelLastError);
    }

    await this.refreshTunnelHealthWithCooldown(true);
    if (!this.tunnelBinaryInstalled) {
      this.tunnelState = 'error';
      this.tunnelLastError = `Install command completed but "${binary}" is still unavailable in PATH.`;
      this.pushDiagnostic('error', 'install', this.tunnelLastError);
      throw new Error(this.tunnelLastError);
    }
    if (this.tunnelState === 'starting') {
      this.tunnelState = 'stopped';
    }
    this.pushDiagnostic('info', 'install', `${binary} dependency installed.`);
    return this.getStatus();
  }

  async authenticateTunnel(): Promise<RemoteAccessStatus> {
    this.ensureInitialized();
    this.markOperation('authenticate');
    await this.refreshTunnelHealthWithCooldown(true);

    if (this.config.tunnelMode === 'custom') {
      throw new Error('Custom tunnel mode does not require authentication in Cowork.');
    }
    if (!this.tunnelBinaryInstalled || !this.tunnelBinaryPath) {
      throw new Error('Tunnel dependency is not installed yet. Install it first.');
    }

    this.tunnelState = 'starting';
    this.tunnelLastError = null;
    this.pushDiagnostic('info', 'authenticate', `Authenticating ${this.config.tunnelMode} tunnel.`);

    if (this.config.tunnelMode === 'cloudflare') {
      if (!this.config.tunnelDomain) {
        this.tunnelAuthStatus = 'authenticated';
        this.tunnelState = 'stopped';
        return this.getStatus();
      }

      try {
        await this.runCommand(this.tunnelBinaryPath, ['tunnel', 'login'], 2 * 60 * 1000);
      } catch (error) {
        this.tunnelState = 'error';
        this.tunnelLastError = `Authentication failed: ${formatCommandError(error)}`;
        this.pushDiagnostic('error', 'authenticate', this.tunnelLastError);
        throw new Error(this.tunnelLastError);
      }

      await this.refreshTunnelHealthWithCooldown(true);
      if (this.tunnelAuthStatus !== 'authenticated') {
        throw new Error(
          'Cloudflare authentication did not complete. Retry and approve the browser login flow.',
        );
      }
      if (this.tunnelState === 'starting') {
        this.tunnelState = 'stopped';
      }
      return this.getStatus();
    }

    try {
      await this.runCommand(this.tunnelBinaryPath, ['up'], 2 * 60 * 1000);
    } catch (error) {
      this.tunnelState = 'error';
      this.tunnelLastError = `Authentication failed: ${formatCommandError(error)}`;
      this.pushDiagnostic('error', 'authenticate', this.tunnelLastError);
      throw new Error(this.tunnelLastError);
    }

    await this.refreshTunnelHealthWithCooldown(true);
    if (this.tunnelAuthStatus !== 'authenticated') {
      throw new Error('Authentication did not complete. Please retry and approve system prompts.');
    }
    if (this.tunnelState === 'starting') {
      this.tunnelState = 'stopped';
    }
    this.pushDiagnostic('info', 'authenticate', `${this.config.tunnelMode} authentication completed.`);
    return this.getStatus();
  }

  async startTunnel(): Promise<RemoteAccessStatus> {
    this.ensureInitialized();
    this.markOperation('start');

    if (!this.config.enabled) {
      this.config.enabled = true;
      this.config.updatedAt = now();
      await this.persistConfig();
    }
    if (!this.server) {
      await this.start();
    }

    await this.refreshTunnelHealthWithCooldown(true);
    this.tunnelLastError = null;
    this.pushDiagnostic('info', 'start', `Starting ${this.config.tunnelMode} tunnel.`);

    if (this.config.tunnelMode === 'custom') {
      const customEndpoint = this.resolvePublicBaseUrlForMode(
        this.config.tunnelMode,
        this.config.publicBaseUrl,
        this.config.tunnelDomain,
      );
      if (!customEndpoint) {
        this.tunnelState = 'error';
        this.tunnelLastError = 'Set a public endpoint URL for custom mode before starting the tunnel.';
        this.pushDiagnostic('error', 'start', this.tunnelLastError);
        throw new Error(this.tunnelLastError);
      }
      this.tunnelState = 'running';
      this.tunnelPublicUrl = customEndpoint;
      this.tunnelStartedAt = now();
      this.tunnelPid = null;
      return this.getStatus();
    }

    if (!this.tunnelBinaryInstalled || !this.tunnelBinaryPath) {
      this.tunnelState = 'error';
      this.tunnelLastError = 'Tunnel dependency is not installed yet. Install it from this screen first.';
      this.pushDiagnostic('error', 'start', this.tunnelLastError);
      throw new Error(this.tunnelLastError);
    }

    if (this.config.tunnelMode === 'tailscale') {
      if (this.tunnelAuthStatus !== 'authenticated') {
        this.tunnelState = 'error';
        this.tunnelLastError = 'Tailscale is not authenticated. Run authentication first.';
        this.pushDiagnostic('error', 'start', this.tunnelLastError);
        throw new Error(this.tunnelLastError);
      }
      await this.startTailscaleTunnel();
      this.pushDiagnostic('info', 'start', 'Tailscale tunnel is running.');
      return this.getStatus();
    }

    if (this.config.tunnelMode === 'cloudflare' && this.config.tunnelDomain && this.tunnelAuthStatus !== 'authenticated') {
      this.tunnelState = 'error';
      this.tunnelLastError = 'Cloudflare domain routing requires authentication. Run authentication first.';
      this.pushDiagnostic('error', 'start', this.tunnelLastError);
      throw new Error(this.tunnelLastError);
    }

    await this.startCloudflareTunnel();
    this.pushDiagnostic('info', 'start', 'Cloudflare tunnel is running.');
    return this.getStatus();
  }

  async stopTunnel(): Promise<RemoteAccessStatus> {
    this.ensureInitialized();
    this.markOperation('stop');
    this.pushDiagnostic('info', 'stop', `Stopping ${this.config.tunnelMode} tunnel.`);

    if (this.config.tunnelMode === 'cloudflare') {
      await this.stopCloudflareProcess();
    } else if (this.config.tunnelMode === 'tailscale' && this.tunnelBinaryPath) {
      const stopErrors: string[] = [];
      try {
        await this.runCommand(this.tunnelBinaryPath, ['funnel', 'off'], COMMAND_TIMEOUT_MS);
      } catch (error) {
        stopErrors.push(`funnel off failed: ${formatCommandError(error)}`);
      }
      try {
        await this.runCommand(this.tunnelBinaryPath, ['serve', 'reset'], COMMAND_TIMEOUT_MS);
      } catch (error) {
        stopErrors.push(`serve reset failed: ${formatCommandError(error)}`);
      }

      if (stopErrors.length > 0) {
        this.tunnelState = 'error';
        this.tunnelLastError = `Failed to stop tailscale tunnel cleanly: ${stopErrors.join(' | ')}`;
        this.pushDiagnostic('error', 'stop', this.tunnelLastError, `${this.tunnelBinaryPath} funnel off && serve reset`);
        throw new Error(this.tunnelLastError);
      }
    }

    this.tunnelState = 'stopped';
    this.tunnelPublicUrl = null;
    this.tunnelLastError = null;
    this.tunnelStartedAt = null;
    this.tunnelPid = null;
    this.pushDiagnostic('info', 'stop', 'Tunnel stopped.');
    await this.refreshTunnelHealthWithCooldown(true);
    return this.getStatus();
  }

  private normalizeEnableInput(input: RemoteEnableInput): RemoteEnableSettings {
    const mode = input.tunnelMode == null ? this.config.tunnelMode : parseTunnelMode(input.tunnelMode);
    if (!mode) {
      throw new Error(`Unsupported tunnel mode "${String(input.tunnelMode)}".`);
    }
    const tunnelDomain = normalizeTunnelDomain(input.tunnelDomain);
    const explicitPublicBaseUrl = normalizeBaseUrl(input.publicBaseUrl);
    return {
      publicBaseUrl: this.resolvePublicBaseUrlForMode(mode, explicitPublicBaseUrl, tunnelDomain),
      tunnelMode: mode,
      tunnelName: normalizeTunnelName(input.tunnelName),
      tunnelDomain,
      tunnelVisibility: normalizeTunnelVisibility(input.tunnelVisibility),
      bindPort: normalizePort(input.bindPort),
    };
  }

  private normalizeTunnelOptionsInput(
    input: RemoteTunnelOptionsInput,
    mode: RemoteTunnelMode,
    currentPublicBaseUrl: string | null,
  ): RemoteTunnelOptionsSettings {
    const tunnelDomain = normalizeTunnelDomain(input.tunnelDomain);
    const explicitPublicBaseUrl = normalizeBaseUrl(input.publicBaseUrl);
    const publicBaseUrl = this.resolvePublicBaseUrlForMode(
      mode,
      explicitPublicBaseUrl ?? currentPublicBaseUrl,
      tunnelDomain,
    );

    return {
      publicBaseUrl,
      tunnelName: normalizeTunnelName(input.tunnelName),
      tunnelDomain,
      tunnelVisibility: normalizeTunnelVisibility(input.tunnelVisibility),
    };
  }

  private resolvePublicBaseUrlForMode(
    mode: RemoteTunnelMode,
    preferredBaseUrl: string | null,
    tunnelDomain: string | null,
  ): string | null {
    if (mode === 'cloudflare' && tunnelDomain) {
      return deriveUrlFromDomain(tunnelDomain);
    }
    if (mode === 'custom' && !preferredBaseUrl && tunnelDomain) {
      return deriveUrlFromDomain(tunnelDomain);
    }
    return preferredBaseUrl;
  }

  private getTunnelBinaryName(mode: RemoteTunnelMode): string | null {
    if (mode === 'tailscale') return 'tailscale';
    if (mode === 'cloudflare') return 'cloudflared';
    return null;
  }

  private async resolveBinaryPath(binary: string): Promise<string | null> {
    const resolver = process.platform === 'win32' ? 'where' : 'which';
    try {
      const { stdout } = await this.runCommand(resolver, [binary], COMMAND_TIMEOUT_MS);
      const first = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      return first ?? null;
    } catch {
      return null;
    }
  }

  private async resolveInstallCommand(binary: string): Promise<InstallCommand | null> {
    if (process.platform === 'darwin') {
      const brew = await this.resolveBinaryPath('brew');
      if (brew) {
        return { command: brew, args: ['install', binary] };
      }
      return null;
    }

    if (process.platform === 'linux') {
      const apt = (await this.resolveBinaryPath('apt-get')) ?? (await this.resolveBinaryPath('apt'));
      if (apt) {
        return { command: apt, args: ['install', '-y', binary] };
      }
      return null;
    }

    if (process.platform === 'win32') {
      const winget = await this.resolveBinaryPath('winget');
      if (!winget) return null;
      const id = binary === 'tailscale' ? 'tailscale.tailscale' : 'Cloudflare.cloudflared';
      return {
        command: winget,
        args: [
          'install',
          '--id',
          id,
          '-e',
          '--accept-source-agreements',
          '--accept-package-agreements',
        ],
      };
    }

    return null;
  }

  private async runCommand(command: string, args: string[], timeoutMs: number): Promise<CommandOutput> {
    const result = await execFileAsync(command, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });

    return {
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
    };
  }

  private async runFirstSuccessful(command: string, attempts: string[][]): Promise<void> {
    let lastError: unknown;
    for (const args of attempts) {
      try {
        await this.runCommand(command, args, COMMAND_TIMEOUT_MS);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async detectTailscaleAuthStatus(binaryPath: string): Promise<RemoteTunnelAuthStatus> {
    try {
      const { stdout } = await this.runCommand(binaryPath, ['status', '--json'], COMMAND_TIMEOUT_MS);
      const parsed = JSON.parse(stdout) as {
        BackendState?: string;
      };
      const backendState = (parsed.BackendState || '').toLowerCase();
      if (backendState === 'running') {
        return 'authenticated';
      }
      if (backendState.includes('login') || backendState.includes('needs') || backendState.includes('stopped')) {
        return 'unauthenticated';
      }
      return 'unknown';
    } catch {
      return 'unauthenticated';
    }
  }

  private async detectCloudflareAuthStatus(): Promise<RemoteTunnelAuthStatus> {
    try {
      const certPath = this.resolveCloudflareCertPath();
      if (!certPath) return 'unauthenticated';
      await access(certPath);
      return 'authenticated';
    } catch {
      return 'unauthenticated';
    }
  }

  private resolveCloudflareCertPath(): string | null {
    const home = homedir();
    if (!home) return null;
    return join(home, '.cloudflared', 'cert.pem');
  }

  private async deriveTailscalePublicUrl(binaryPath: string): Promise<string | null> {
    try {
      const { stdout } = await this.runCommand(binaryPath, ['status', '--json'], COMMAND_TIMEOUT_MS);
      const parsed = JSON.parse(stdout) as {
        Self?: {
          DNSName?: string;
        };
      };
      const dnsName = parsed.Self?.DNSName ? trimTrailingDot(parsed.Self.DNSName) : '';
      if (!dnsName) return null;
      return `https://${dnsName}`;
    } catch {
      return null;
    }
  }

  private async refreshTunnelHealth(): Promise<void> {
    const binaryName = this.getTunnelBinaryName(this.config.tunnelMode);

    if (!binaryName) {
      this.tunnelBinaryInstalled = true;
      this.tunnelBinaryPath = null;
      this.tunnelAuthStatus = 'unknown';
      if (this.tunnelState !== 'running' && this.tunnelState !== 'error') {
        this.tunnelState = 'stopped';
      }
      const configuredPublicUrl = this.resolvePublicBaseUrlForMode(
        this.config.tunnelMode,
        this.config.publicBaseUrl,
        this.config.tunnelDomain,
      );
      if (configuredPublicUrl) {
        this.tunnelPublicUrl = configuredPublicUrl;
      }
      return;
    }

    const binaryPath = await this.resolveBinaryPath(binaryName);
    this.tunnelBinaryInstalled = Boolean(binaryPath);
    this.tunnelBinaryPath = binaryPath;

    if (!binaryPath) {
      this.tunnelAuthStatus = 'unknown';
      if (!this.tunnelProcess) {
        this.tunnelState = 'stopped';
        this.tunnelPid = null;
      }
      return;
    }

    if (this.config.tunnelMode === 'tailscale') {
      this.tunnelAuthStatus = await this.detectTailscaleAuthStatus(binaryPath);
    } else if (this.config.tunnelMode === 'cloudflare') {
      if (this.config.tunnelDomain) {
        this.tunnelAuthStatus = await this.detectCloudflareAuthStatus();
      } else {
        this.tunnelAuthStatus = 'authenticated';
      }
    } else {
      this.tunnelAuthStatus = 'unknown';
    }

    if (this.config.tunnelMode === 'cloudflare') {
      const processAlive = this.tunnelProcess && this.tunnelProcess.exitCode === null && !this.tunnelProcess.killed;
      if (processAlive) {
        this.tunnelState = 'running';
        this.tunnelPid = this.tunnelProcess?.pid ?? null;
        if (this.config.tunnelDomain && !this.tunnelPublicUrl) {
          this.tunnelPublicUrl = deriveUrlFromDomain(this.config.tunnelDomain);
        }
      } else if (this.tunnelState === 'starting') {
        this.tunnelState = 'stopped';
        this.tunnelPid = null;
      }
    }
  }

  private async startTailscaleTunnel(): Promise<void> {
    if (!this.tunnelBinaryPath) {
      throw new Error('Tailscale binary is unavailable.');
    }

    const origin = `http://127.0.0.1:${this.config.bindPort}`;
    this.tunnelState = 'starting';
    this.tunnelLastError = null;

    try {
      await this.runFirstSuccessful(this.tunnelBinaryPath, [
        ['serve', 'https', '/', origin],
        ['serve', '--bg', '--https=443', '/', origin],
      ]);
      await this.runFirstSuccessful(this.tunnelBinaryPath, [
        ['funnel', String(this.config.bindPort)],
        ['funnel', '--bg', String(this.config.bindPort)],
      ]);
    } catch (error) {
      this.tunnelState = 'error';
      this.tunnelLastError = `Failed to start Tailscale tunnel: ${formatCommandError(error)}`;
      throw new Error(this.tunnelLastError);
    }

    const inferredUrl = await this.deriveTailscalePublicUrl(this.tunnelBinaryPath);
    const publicUrl = this.config.publicBaseUrl || inferredUrl;
    if (publicUrl) {
      this.tunnelPublicUrl = publicUrl;
      if (!this.config.publicBaseUrl || this.config.publicBaseUrl !== publicUrl) {
        this.config.publicBaseUrl = publicUrl;
        this.config.updatedAt = now();
        await this.persistConfig();
      }
    }
    this.tunnelState = 'running';
    this.tunnelStartedAt = now();
    this.tunnelPid = null;
  }

  private async startCloudflareTunnel(): Promise<void> {
    if (!this.tunnelBinaryPath) {
      throw new Error('cloudflared binary is unavailable.');
    }

    const alive = this.tunnelProcess && this.tunnelProcess.exitCode === null && !this.tunnelProcess.killed;
    if (alive) {
      this.tunnelState = 'running';
      this.tunnelPid = this.tunnelProcess?.pid ?? null;
      return;
    }

    await this.stopCloudflareProcess();

    const targetUrl = `http://127.0.0.1:${this.config.bindPort}`;
    const domain = this.config.tunnelDomain;
    const desiredPublicUrl = this.resolvePublicBaseUrlForMode(this.config.tunnelMode, this.config.publicBaseUrl, domain);
    const cloudflareArgs = ['tunnel', '--url', targetUrl, '--no-autoupdate'];
    if (domain) {
      cloudflareArgs.push('--hostname', domain);
    }

    const child = spawn(this.tunnelBinaryPath, cloudflareArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      windowsHide: true,
    });
    this.tunnelProcess = child;
    this.tunnelState = 'starting';
    this.tunnelStartedAt = now();
    this.tunnelPid = child.pid ?? null;
    this.tunnelLastError = null;
    if (desiredPublicUrl) {
      this.tunnelPublicUrl = desiredPublicUrl;
      this.config.publicBaseUrl = desiredPublicUrl;
      this.config.updatedAt = now();
      void this.persistConfig().catch((error) => {
        process.stderr.write(`[remote-access] Failed to persist configured public URL: ${formatCommandError(error)}\n`);
      });
    }

    let settled = false;
    let resolveReady: (() => void) | null = null;
    let rejectReady: ((error: Error) => void) | null = null;
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const settleSuccess = (): void => {
      if (settled) return;
      settled = true;
      resolveReady?.();
    };
    const settleFailure = (error: Error): void => {
      if (settled) return;
      settled = true;
      rejectReady?.(error);
    };

    const handleOutput = (chunk: Buffer): void => {
      const output = chunk.toString('utf8');
      const url = parseCloudflareUrl(output);
      if (url) {
        this.tunnelPublicUrl = url;
        this.config.publicBaseUrl = url;
        this.config.updatedAt = now();
        void this.persistConfig().catch((error) => {
          process.stderr.write(`[remote-access] Failed to persist cloudflare URL: ${formatCommandError(error)}\n`);
        });
        settleSuccess();
      }

      if (/error/i.test(output) && !this.tunnelLastError) {
        this.tunnelLastError = output.trim().slice(0, 400);
      }
    };

    child.stdout.on('data', handleOutput);
    child.stderr.on('data', handleOutput);

    child.once('error', (error) => {
      settleFailure(error instanceof Error ? error : new Error(String(error)));
    });

    child.once('exit', (code, signal) => {
      const stoppedByUser = signal === 'SIGTERM' || signal === 'SIGINT' || code === 0;
      this.tunnelProcess = null;
      this.tunnelPid = null;
      this.tunnelStartedAt = null;
      this.tunnelPublicUrl = null;
      if (stoppedByUser) {
        this.tunnelState = 'stopped';
        this.tunnelLastError = null;
      } else {
        this.tunnelState = 'error';
        this.tunnelLastError = `cloudflared exited unexpectedly (${code ?? signal ?? 'unknown'})`;
      }
      settleFailure(new Error(this.tunnelLastError || 'cloudflared exited'));
    });

    const timeout = setTimeout(() => {
      if (this.tunnelPublicUrl) {
        settleSuccess();
        return;
      }
      const stillAlive = this.tunnelProcess && this.tunnelProcess.exitCode === null && !this.tunnelProcess.killed;
      if (domain && stillAlive) {
        this.tunnelPublicUrl = deriveUrlFromDomain(domain);
        settleSuccess();
        return;
      }
      settleFailure(new Error('Timed out while waiting for Cloudflare tunnel URL.'));
    }, CLOUDFLARE_START_TIMEOUT_MS);

    try {
      await readyPromise;
    } catch (error) {
      await this.stopCloudflareProcess();
      this.tunnelState = 'error';
      this.tunnelLastError = formatCommandError(error);
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    this.tunnelState = 'running';
    this.tunnelPid = child.pid ?? null;
    this.tunnelStartedAt = this.tunnelStartedAt ?? now();
    if (!this.tunnelPublicUrl && this.config.publicBaseUrl) {
      this.tunnelPublicUrl = this.config.publicBaseUrl;
    }
  }

  private async stopCloudflareProcess(): Promise<void> {
    const processRef = this.tunnelProcess;
    if (!processRef) return;
    this.tunnelProcess = null;

    if (processRef.exitCode !== null || processRef.killed) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        try {
          processRef.kill('SIGKILL');
        } catch {
          // Ignore kill errors.
        }
        resolve();
      }, 4000);

      processRef.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      try {
        processRef.kill('SIGTERM');
      } catch {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  async start(): Promise<void> {
    this.ensureInitialized();
    if (this.server) return;

    const server = createServer((request, response) => {
      void this.handleHttpRequest(request, response);
    });
    this.server = server;

    this.wsServer = new WebSocketServer({ noServer: true });
    this.server.on('upgrade', (request, socket, head) => {
      void this.handleUpgrade(request, socket, head);
    });

    this.wsServer.on('connection', (socket: WebSocket, _request: IncomingMessage, state: WsClientState) => {
      this.wsClients.set(socket, state);
      socket.send(JSON.stringify({
        type: 'ready',
        deviceId: state.deviceId,
        timestamp: now(),
      }));

      socket.on('message', (data: RawData) => {
        this.handleWsMessage(socket, data);
      });

      socket.on('close', () => {
        this.wsClients.delete(socket);
      });
    });

    this.unsubscribeEvents = eventEmitter.subscribe((event) => {
      this.broadcastAgentEvent(event);
    });

    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error): void => {
        this.server?.off('listening', handleListening);
        reject(error);
      };
      const handleListening = (): void => {
        this.server?.off('error', handleError);
        resolve();
      };
      server.once('error', handleError);
      server.once('listening', handleListening);
      server.listen(this.config.bindPort, this.config.bindHost);
    });

    const address = server.address();
    if (address && typeof address === 'object') {
      this.config.bindPort = address.port;
    }
    this.localBaseUrl = `http://${this.config.bindHost}:${this.config.bindPort}`;
    this.config.updatedAt = now();
    await this.persistConfig();
  }

  async stop(): Promise<void> {
    const ws = this.wsServer;
    this.wsServer = null;

    for (const socket of this.wsClients.keys()) {
      try {
        socket.close(1001, 'Remote access disabled');
      } catch {
        // Ignore websocket close failures.
      }
    }
    this.wsClients.clear();

    if (ws) {
      await new Promise<void>((resolve) => {
        ws.close(() => resolve());
      });
    }

    if (this.unsubscribeEvents) {
      this.unsubscribeEvents();
      this.unsubscribeEvents = null;
    }

    const current = this.server;
    this.server = null;
    this.localBaseUrl = null;

    if (current) {
      await new Promise<void>((resolve) => {
        current.close(() => resolve());
      });
    }
  }

  async shutdown(): Promise<void> {
    if (this.initialized) {
      await this.stopTunnel().catch((error) => {
        process.stderr.write(`[remote-access] Tunnel shutdown warning: ${formatCommandError(error)}\n`);
      });
    }
    await this.stop();
    this.pairingCodes.clear();
  }

  getStatus(): RemoteAccessStatus {
    const activeDevices = this.config.devices.filter((device) => !device.revokedAt && device.expiresAt > now());
    const configuredPublicUrl = this.resolvePublicBaseUrlForMode(
      this.config.tunnelMode,
      this.config.publicBaseUrl,
      this.config.tunnelDomain,
    );
    return {
      enabled: this.config.enabled,
      running: this.server !== null,
      bindHost: this.config.bindHost,
      bindPort: this.server ? this.config.bindPort : null,
      localBaseUrl: this.localBaseUrl,
      publicBaseUrl: configuredPublicUrl,
      tunnelMode: this.config.tunnelMode,
      tunnelName: this.config.tunnelName,
      tunnelDomain: this.config.tunnelDomain,
      tunnelVisibility: this.config.tunnelVisibility,
      tunnelHints: this.buildTunnelHints(),
      tunnelState: this.tunnelState,
      tunnelPublicUrl:
        this.tunnelPublicUrl || (this.config.tunnelMode === 'custom' || this.config.tunnelMode === 'cloudflare' ? configuredPublicUrl : null),
      tunnelLastError: this.tunnelLastError,
      tunnelBinaryInstalled: this.tunnelBinaryInstalled,
      tunnelBinaryPath: this.tunnelBinaryPath,
      tunnelAuthStatus: this.tunnelAuthStatus,
      tunnelStartedAt: this.tunnelStartedAt,
      tunnelPid: this.tunnelPid,
      configHealth: this.configHealth,
      configRepairReason: this.configRepairReason,
      lastOperation: this.lastOperation,
      lastOperationAt: this.lastOperationAt,
      diagnostics: this.diagnostics,
      deviceCount: activeDevices.length,
      devices: this.listDevices(),
    };
  }

  listDevices(): RemoteAccessDeviceSummary[] {
    return this.config.devices
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toDeviceSummary);
  }

  async revokeDevice(deviceId: string): Promise<boolean> {
    this.ensureInitialized();
    const device = this.config.devices.find((item) => item.id === deviceId);
    if (!device) return false;
    device.revokedAt = now();
    this.config.updatedAt = now();
    await this.persistConfig();

    for (const [socket, state] of this.wsClients.entries()) {
      if (state.deviceId === deviceId) {
        try {
          socket.close(4001, 'Device revoked');
        } catch {
          // Ignore websocket close failures.
        }
        this.wsClients.delete(socket);
      }
    }

    return true;
  }

  async deleteAll(): Promise<RemoteAccessStatus> {
    this.ensureInitialized();
    this.markOperation('delete_all');
    this.pushDiagnostic('warn', 'delete_all', 'Deleting all remote configuration and paired devices.');

    try {
      await this.stopTunnel();
    } catch (error) {
      this.pushDiagnostic(
        'warn',
        'delete_all',
        `Tunnel stop reported an error during delete: ${formatCommandError(error)}`,
      );
    }

    await this.stop();

    this.config = defaultConfig();
    this.config.updatedAt = now();
    this.pairingCodes.clear();
    this.tunnelState = 'stopped';
    this.tunnelPublicUrl = null;
    this.tunnelLastError = null;
    this.tunnelStartedAt = null;
    this.tunnelPid = null;
    this.tunnelProcess = null;
    this.clearConfigRepair();

    await this.persistConfig();
    this.pushDiagnostic('info', 'delete_all', 'Remote configuration and pairings were deleted.');
    return this.getStatus();
  }

  private buildTunnelHints(): string[] {
    const hints: string[] = [];
    const port = this.config.bindPort || 0;
    const nameHint = this.config.tunnelName ? ` (${this.config.tunnelName})` : '';
    const domainHint = this.config.tunnelDomain ? ` using ${this.config.tunnelDomain}` : '';

    if (this.config.tunnelMode === 'tailscale') {
      hints.push(`tailscale${nameHint}: serve https / http://127.0.0.1:${port}`);
      hints.push(`tailscale${nameHint}: funnel ${port}`);
      if (this.config.tunnelVisibility === 'private') {
        hints.push('Private mode: allow only authenticated tailnet devices to access this endpoint.');
      } else {
        hints.push('Public mode: tailscale funnel publishes the endpoint over HTTPS on the internet.');
      }
    } else if (this.config.tunnelMode === 'cloudflare') {
      if (this.config.tunnelDomain) {
        hints.push(`cloudflared${nameHint}: tunnel --url http://127.0.0.1:${port} --hostname ${this.config.tunnelDomain}`);
      } else {
        hints.push(`cloudflared${nameHint}: tunnel --url http://127.0.0.1:${port}`);
      }
      hints.push('Use Cloudflare quick tunnel for temporary public URLs or set a domain for stable routing.');
    } else {
      hints.push(`Expose http://127.0.0.1:${port} through your preferred secure tunnel${domainHint}`);
      hints.push('Custom mode expects you to manage the tunnel process and endpoint availability externally.');
    }

    return hints;
  }

  async generatePairingQr(): Promise<PairingQrResult> {
    this.ensureInitialized();
    if (!this.config.enabled || !this.server) {
      throw new Error('Remote access must be enabled before generating pairing QR.');
    }

    const endpoint =
      this.resolvePublicBaseUrlForMode(this.config.tunnelMode, this.config.publicBaseUrl, this.config.tunnelDomain) ||
      this.localBaseUrl;
    if (!endpoint) {
      throw new Error('Remote endpoint is not available yet. Please retry.');
    }

    const issuedAt = now();
    const expiresAt = issuedAt + PAIRING_TTL_MS;
    const pairingCode = randomBytes(24).toString('base64url');
    const payload: PairingPayload = {
      version: 1,
      endpoint,
      wsEndpoint: deriveWsEndpoint(endpoint),
      pairingCode,
      issuedAt,
      expiresAt,
    };

    this.cleanupExpiredPairingCodes();
    this.pairingCodes.set(pairingCode, { code: pairingCode, expiresAt });

    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const pairingUri = `cowork://pair?d=${encodeURIComponent(encoded)}`;
    const qrDataUrl = await QRCode.toDataURL(pairingUri, {
      margin: 1,
      width: 280,
      errorCorrectionLevel: 'M',
    });

    return {
      qrDataUrl,
      pairingUri,
      expiresAt,
    };
  }

  private cleanupExpiredPairingCodes(): void {
    const ts = now();
    for (const [key, value] of this.pairingCodes.entries()) {
      if (value.expiresAt <= ts) {
        this.pairingCodes.delete(key);
      }
    }
  }

  private consumePairingCode(code: string): boolean {
    this.cleanupExpiredPairingCodes();
    const record = this.pairingCodes.get(code);
    if (!record) return false;
    if (record.expiresAt <= now()) {
      this.pairingCodes.delete(code);
      return false;
    }
    this.pairingCodes.delete(code);
    return true;
  }

  private issueDeviceToken(deviceName: string, platform: string): { token: string; device: RemoteAccessDevice } {
    const token = `cwk_${randomBytes(32).toString('base64url')}`;
    const createdAt = now();
    const device: RemoteAccessDevice = {
      id: randomId('device'),
      name: deviceName || 'Unknown device',
      platform: platform || 'unknown',
      tokenHash: tokenHash(token),
      createdAt,
      lastUsedAt: createdAt,
      expiresAt: createdAt + DEVICE_TOKEN_TTL_MS,
    };

    this.config.devices.push(device);
    this.config.updatedAt = createdAt;
    this.scheduleConfigSave();
    return { token, device };
  }

  private authenticateToken(token: string | null): RemoteAccessDevice | null {
    if (!token) return null;
    const hash = tokenHash(token);
    const device = this.config.devices.find((candidate) => candidate.tokenHash === hash);
    if (!device) return null;
    if (device.revokedAt) return null;
    if (device.expiresAt <= now()) return null;

    device.lastUsedAt = now();
    this.config.updatedAt = now();
    this.scheduleConfigSave();
    return device;
  }

  private extractToken(request: IncomingMessage, url: URL): string | null {
    const authorization = request.headers.authorization;
    if (authorization && authorization.startsWith('Bearer ')) {
      const bearer = authorization.slice('Bearer '.length).trim();
      if (bearer) return bearer;
    }

    const queryToken = url.searchParams.get('token');
    if (queryToken && queryToken.trim()) {
      return queryToken.trim();
    }

    return null;
  }

  private async handleHttpRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const method = (request.method || 'GET').toUpperCase();
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const pathname = (url.pathname || '/').replace(/\/+$/, '') || '/';

      if (method === 'OPTIONS') {
        this.sendJson(response, 204, {});
        return;
      }

      if (method === 'GET' && pathname === '/v1/health') {
        this.sendJson(response, 200, {
          ok: true,
          timestamp: now(),
          running: this.server !== null,
          enabled: this.config.enabled,
        });
        return;
      }

      if (method === 'POST' && pathname === '/v1/pair') {
        await this.handlePairRequest(request, response);
        return;
      }

      const device = this.authenticateToken(this.extractToken(request, url));
      if (!device) {
        this.sendJson(response, 401, { error: 'Unauthorized' });
        return;
      }

      if (method === 'GET' && pathname === '/v1/me') {
        this.sendJson(response, 200, {
          device: toDeviceSummary(device),
          status: this.getStatus(),
        });
        return;
      }

      if (method === 'POST' && pathname === '/v1/logout') {
        device.revokedAt = now();
        this.config.updatedAt = now();
        await this.persistConfig();
        this.sendJson(response, 200, { success: true });
        return;
      }

      if (method === 'GET' && pathname === '/v1/sessions') {
        this.sendJson(response, 200, { sessions: agentRunner.listSessions() });
        return;
      }

      if (method === 'POST' && pathname === '/v1/sessions') {
        await this.handleCreateSession(request, response);
        return;
      }

      const sessionMatch = pathname.match(/^\/v1\/sessions\/([^/]+)$/);
      if (method === 'GET' && sessionMatch) {
        const sessionId = safeDecodeURIComponent(sessionMatch[1]!);
        const session = agentRunner.getSession(sessionId);
        if (!session) {
          this.sendJson(response, 404, { error: 'Session not found' });
          return;
        }
        this.sendJson(response, 200, { session });
        return;
      }

      const sessionMessageMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/messages$/);
      if (method === 'POST' && sessionMessageMatch) {
        const sessionId = safeDecodeURIComponent(sessionMessageMatch[1]!);
        await this.handleSendMessage(request, response, sessionId);
        return;
      }

      const sessionStopMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/stop$/);
      if (method === 'POST' && sessionStopMatch) {
        const sessionId = safeDecodeURIComponent(sessionStopMatch[1]!);
        agentRunner.stopGeneration(sessionId);
        this.sendJson(response, 200, { success: true });
        return;
      }

      const sessionPermissionMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/permissions$/);
      if (method === 'POST' && sessionPermissionMatch) {
        const sessionId = safeDecodeURIComponent(sessionPermissionMatch[1]!);
        await this.handlePermissionDecision(request, response, sessionId);
        return;
      }

      const sessionQuestionMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/questions$/);
      if (method === 'POST' && sessionQuestionMatch) {
        const sessionId = safeDecodeURIComponent(sessionQuestionMatch[1]!);
        await this.handleQuestionAnswer(request, response, sessionId);
        return;
      }

      if (method === 'GET' && pathname === '/v1/cron/jobs') {
        const jobs = await cronService.listJobs();
        this.sendJson(response, 200, { jobs });
        return;
      }

      const cronActionMatch = pathname.match(/^\/v1\/cron\/jobs\/([^/]+)\/(pause|resume|run)$/);
      if (method === 'POST' && cronActionMatch) {
        const jobId = safeDecodeURIComponent(cronActionMatch[1]!);
        const action = cronActionMatch[2]!;
        if (action === 'pause') {
          const job = await cronService.pauseJob(jobId);
          this.sendJson(response, 200, { job });
          return;
        }
        if (action === 'resume') {
          const job = await cronService.resumeJob(jobId);
          this.sendJson(response, 200, { job });
          return;
        }
        if (action === 'run') {
          const run = await cronService.triggerJob(jobId);
          this.sendJson(response, 200, { run });
          return;
        }
      }

      if (method === 'GET' && pathname === '/v1/workflow/scheduled') {
        const tasks = workflowService.listScheduledTasks(300, 0);
        this.sendJson(response, 200, { tasks });
        return;
      }

      const workflowActionMatch = pathname.match(/^\/v1\/workflow\/scheduled\/([^/]+)\/(pause|resume|run)$/);
      if (method === 'POST' && workflowActionMatch) {
        const workflowId = safeDecodeURIComponent(workflowActionMatch[1]!);
        const action = workflowActionMatch[2]!;
        if (action === 'pause') {
          const result = workflowService.pauseScheduledWorkflow(workflowId);
          this.sendJson(response, 200, { result });
          return;
        }
        if (action === 'resume') {
          const result = workflowService.resumeScheduledWorkflow(workflowId);
          this.sendJson(response, 200, { result });
          return;
        }
        if (action === 'run') {
          const run = await workflowService.run({
            workflowId,
            triggerType: 'manual',
            triggerContext: { source: 'mobile' },
          });
          this.sendJson(response, 200, { run });
          return;
        }
      }

      this.sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      this.sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handlePairRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const payload = await this.readJsonBody(request);
    const pairingCode = typeof payload.pairingCode === 'string' ? payload.pairingCode.trim() : '';
    if (!pairingCode) {
      this.sendJson(response, 400, { error: 'pairingCode is required' });
      return;
    }

    if (!this.consumePairingCode(pairingCode)) {
      this.sendJson(response, 400, { error: 'Invalid or expired pairing code' });
      return;
    }

    const deviceName = typeof payload.deviceName === 'string' ? payload.deviceName.trim() : 'Mobile device';
    const platform = typeof payload.platform === 'string' ? payload.platform.trim() : 'mobile';
    const tokenBundle = this.issueDeviceToken(deviceName, platform);

    const endpoint =
      this.resolvePublicBaseUrlForMode(this.config.tunnelMode, this.config.publicBaseUrl, this.config.tunnelDomain) ||
      this.localBaseUrl ||
      'http://127.0.0.1';
    this.sendJson(response, 200, {
      token: tokenBundle.token,
      device: toDeviceSummary(tokenBundle.device),
      expiresAt: tokenBundle.device.expiresAt,
      endpoint,
      wsEndpoint: deriveWsEndpoint(endpoint),
    });
  }

  private async handleCreateSession(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const payload = await this.readJsonBody(request);
    const workingDirectory =
      typeof payload.workingDirectory === 'string' && payload.workingDirectory.trim()
        ? payload.workingDirectory.trim()
        : process.cwd();
    const model = typeof payload.model === 'string' ? payload.model : undefined;
    const title = typeof payload.title === 'string' ? payload.title : undefined;
    const provider = typeof payload.provider === 'string' ? payload.provider : undefined;
    const executionMode = payload.executionMode === 'plan' ? 'plan' : 'execute';

    const session = await agentRunner.createSession(
      workingDirectory,
      model,
      title,
      'main',
      provider as
        | 'google'
        | 'openai'
        | 'anthropic'
        | 'openrouter'
        | 'moonshot'
        | 'glm'
        | 'deepseek'
        | 'lmstudio'
        | undefined,
      executionMode,
    );
    this.sendJson(response, 200, { session });
  }

  private async handleSendMessage(
    request: IncomingMessage,
    response: ServerResponse,
    sessionId: string,
  ): Promise<void> {
    const payload = await this.readJsonBody(request);
    const content = typeof payload.content === 'string' ? payload.content : '';
    const attachments = this.parseAttachments(payload.attachments);

    if (!content.trim() && attachments.length === 0) {
      this.sendJson(response, 400, { error: 'content or attachments is required' });
      return;
    }

    await agentRunner.sendMessage(sessionId, content, attachments);
    this.sendJson(response, 200, { success: true });
  }

  private async handlePermissionDecision(
    request: IncomingMessage,
    response: ServerResponse,
    sessionId: string,
  ): Promise<void> {
    const payload = await this.readJsonBody(request);
    const permissionId = typeof payload.permissionId === 'string' ? payload.permissionId : '';
    const decision =
      payload.decision === 'allow' ||
        payload.decision === 'deny' ||
        payload.decision === 'allow_once' ||
        payload.decision === 'allow_session'
        ? payload.decision
        : null;

    if (!permissionId || !decision) {
      this.sendJson(response, 400, { error: 'permissionId and decision are required' });
      return;
    }

    agentRunner.respondToPermission(sessionId, permissionId, decision);
    this.sendJson(response, 200, { success: true });
  }

  private async handleQuestionAnswer(
    request: IncomingMessage,
    response: ServerResponse,
    sessionId: string,
  ): Promise<void> {
    const payload = await this.readJsonBody(request);
    const questionId = typeof payload.questionId === 'string' ? payload.questionId : '';
    const answer =
      typeof payload.answer === 'string' || Array.isArray(payload.answer)
        ? payload.answer
        : null;

    if (!questionId || answer == null) {
      this.sendJson(response, 400, { error: 'questionId and answer are required' });
      return;
    }

    agentRunner.respondToQuestion(sessionId, questionId, answer as string | string[]);
    this.sendJson(response, 200, { success: true });
  }

  private parseAttachments(value: unknown): Attachment[] {
    if (!Array.isArray(value)) return [];
    const result: Attachment[] = [];
    for (const raw of value) {
      if (!raw || typeof raw !== 'object') continue;
      const candidate = raw as Record<string, unknown>;
      const name = typeof candidate.name === 'string' ? candidate.name : 'attachment';
      const data = typeof candidate.data === 'string' ? candidate.data : '';
      if (!data) continue;
      const type = this.normalizeAttachmentType(candidate.type);
      const mimeType =
        typeof candidate.mimeType === 'string' && candidate.mimeType
          ? candidate.mimeType
          : this.defaultMimeType(type);
      result.push({
        type,
        name,
        data,
        mimeType,
      });
    }
    return result;
  }

  private normalizeAttachmentType(value: unknown): Attachment['type'] {
    if (
      value === 'image' ||
      value === 'pdf' ||
      value === 'audio' ||
      value === 'video' ||
      value === 'text' ||
      value === 'file' ||
      value === 'other'
    ) {
      return value;
    }
    return 'file';
  }

  private defaultMimeType(type: Attachment['type']): string {
    switch (type) {
      case 'image':
        return 'image/jpeg';
      case 'audio':
        return 'audio/mpeg';
      case 'video':
        return 'video/mp4';
      case 'pdf':
        return 'application/pdf';
      case 'text':
        return 'text/plain';
      case 'other':
      case 'file':
      default:
        return 'application/octet-stream';
    }
  }

  private async handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<void> {
    const server = this.wsServer;
    if (!server) {
      socket.destroy();
      return;
    }

    let url: URL;
    try {
      url = new URL(request.url || '/', 'http://127.0.0.1');
    } catch {
      socket.destroy();
      return;
    }

    if ((url.pathname || '').replace(/\/+$/, '') !== '/v1/ws') {
      socket.destroy();
      return;
    }

    const token = this.extractToken(request, url);
    const device = this.authenticateToken(token);
    if (!device) {
      socket.destroy();
      return;
    }

    server.handleUpgrade(request, socket, head, (ws) => {
      server.emit('connection', ws, request, {
        deviceId: device.id,
      } as WsClientState);
    });
  }

  private handleWsMessage(socket: WebSocket, data: RawData): void {
    const raw = typeof data === 'string' ? data : data.toString('utf8');
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      socket.send(JSON.stringify({ type: 'error', error: 'Invalid JSON payload' }));
      return;
    }

    const messageType = typeof payload.type === 'string' ? payload.type : '';
    if (!messageType) {
      socket.send(JSON.stringify({ type: 'error', error: 'Missing type field' }));
      return;
    }

    void this.handleWsCommand(socket, messageType, payload);
  }

  private async handleWsCommand(
    socket: WebSocket,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const state = this.wsClients.get(socket);
    if (!state) return;

    if (type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', timestamp: now() }));
      return;
    }

    if (type === 'subscribe') {
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined;
      state.sessionId = sessionId || undefined;
      socket.send(JSON.stringify({ type: 'subscribed', sessionId: state.sessionId ?? null }));
      return;
    }

    if (type === 'send_message') {
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
      const content = typeof payload.content === 'string' ? payload.content : '';
      const attachments = this.parseAttachments(payload.attachments);
      if (!sessionId || (!content.trim() && attachments.length === 0)) {
        socket.send(JSON.stringify({ type: 'error', error: 'sessionId with content/attachments required' }));
        return;
      }
      await agentRunner.sendMessage(sessionId, content, attachments);
      socket.send(JSON.stringify({ type: 'ack', action: 'send_message', sessionId }));
      return;
    }

    if (type === 'stop_generation') {
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
      if (!sessionId) {
        socket.send(JSON.stringify({ type: 'error', error: 'sessionId is required' }));
        return;
      }
      agentRunner.stopGeneration(sessionId);
      socket.send(JSON.stringify({ type: 'ack', action: 'stop_generation', sessionId }));
      return;
    }

    socket.send(JSON.stringify({ type: 'error', error: `Unsupported command: ${type}` }));
  }

  private broadcastAgentEvent(event: SidecarEvent): void {
    if (this.wsClients.size === 0) return;
    const message = JSON.stringify({
      type: 'event',
      event,
      timestamp: now(),
    });

    for (const [socket, state] of this.wsClients.entries()) {
      if (state.sessionId && event.sessionId && state.sessionId !== event.sessionId) {
        continue;
      }

      if (state.sessionId && event.sessionId === null) {
        // Global events are still relevant while subscribed.
      }

      if (socket.readyState !== socket.OPEN) {
        this.wsClients.delete(socket);
        continue;
      }

      try {
        socket.send(message);
      } catch {
        this.wsClients.delete(socket);
      }
    }
  }

  private async readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let total = 0;
    return new Promise((resolve, reject) => {
      request.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_JSON_BODY_BYTES) {
          reject(new Error(`Payload too large (limit ${MAX_JSON_BODY_BYTES} bytes)`));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on('end', () => {
        if (chunks.length === 0) {
          resolve({});
          return;
        }
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            resolve({});
            return;
          }
          resolve(parsed as Record<string, unknown>);
        } catch (error) {
          reject(error);
        }
      });
      request.on('error', reject);
    });
  }

  private sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
    if (!response.headersSent) {
      response.statusCode = statusCode;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      response.setHeader('access-control-allow-origin', '*');
      response.setHeader('access-control-allow-headers', 'authorization, content-type');
      response.setHeader('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS');
    }
    response.end(JSON.stringify(payload));
  }
}

export const remoteAccessService = new RemoteAccessService();
