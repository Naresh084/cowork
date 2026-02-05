import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { PlatformType, PlatformConfig } from '@gemini-cowork/shared';

const CONFIG_DIR = join(homedir(), '.geminicowork', 'integrations');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface IntegrationStoreData {
  platforms: Record<string, PlatformConfig>;
  lastSessionId?: string;
}

export class IntegrationStore {
  private data: IntegrationStoreData = { platforms: {} };
  private savePromise: Promise<void> | null = null;
  private pendingSave = false;

  async load(): Promise<void> {
    try {
      if (existsSync(CONFIG_FILE)) {
        const raw = await readFile(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // Basic structural validation
        if (parsed && typeof parsed === 'object' && parsed.platforms) {
          this.data = parsed;
        } else {
          process.stderr.write('[integration-store] Config file has invalid structure, resetting\n');
          this.data = { platforms: {} };
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[integration-store] Failed to load config: ${msg}\n`);
      this.data = { platforms: {} };
    }
  }

  /** Serialized save - prevents concurrent writes from corrupting the file */
  private async save(): Promise<void> {
    if (this.savePromise) {
      // Another save is in progress - mark pending and return
      this.pendingSave = true;
      return;
    }

    this.savePromise = this.doSave();
    try {
      await this.savePromise;
    } finally {
      this.savePromise = null;
    }

    // If a save was requested while we were writing, do it now
    if (this.pendingSave) {
      this.pendingSave = false;
      await this.save();
    }
  }

  private async doSave(): Promise<void> {
    try {
      if (!existsSync(CONFIG_DIR)) {
        await mkdir(CONFIG_DIR, { recursive: true });
      }
      await writeFile(CONFIG_FILE, JSON.stringify(this.data, null, 2));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[integration-store] Failed to save config: ${msg}\n`);
    }
  }

  getConfig(platform: PlatformType): PlatformConfig | null {
    return this.data.platforms[platform] || null;
  }

  async setConfig(platform: PlatformType, config: PlatformConfig): Promise<void> {
    this.data.platforms[platform] = config;
    await this.save();
  }

  async removeConfig(platform: PlatformType): Promise<void> {
    delete this.data.platforms[platform];
    await this.save();
  }

  getEnabledPlatforms(): PlatformConfig[] {
    return Object.values(this.data.platforms).filter(p => p.enabled);
  }

  getLastSessionId(): string | undefined {
    return this.data.lastSessionId;
  }

  async setLastSessionId(sessionId: string): Promise<void> {
    this.data.lastSessionId = sessionId;
    await this.save();
  }
}
