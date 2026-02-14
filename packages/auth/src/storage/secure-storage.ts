// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { AuthStorage } from '../types.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SERVICE_NAME = 'cowork';
const LEGACY_SERVICE_NAME = 'cowork';
const CREDENTIALS_FILE = 'credentials.json';

interface CredentialStore {
  credentials: Record<string, string>;
}

function getConfigDir(serviceName: string): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', serviceName);
  }

  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), serviceName);
  }

  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(xdg, serviceName);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export class FileSecureStorage implements AuthStorage {
  private serviceName: string;
  private filePath: string;

  constructor(serviceName = SERVICE_NAME) {
    this.serviceName = serviceName;
    this.filePath = join(getConfigDir(serviceName), CREDENTIALS_FILE);
  }

  private keyFor(itemKey: string): string {
    return `${this.serviceName}.${itemKey}`;
  }

  private async ensureStorePath(): Promise<void> {
    await fs.mkdir(getConfigDir(this.serviceName), { recursive: true });
  }

  private async ensureFilePermissions(): Promise<void> {
    if (process.platform === 'win32') {
      return;
    }

    try {
      await fs.chmod(this.filePath, 0o600);
    } catch {
      // Best-effort only.
    }
  }

  private async migrateLegacyStoreIfNeeded(): Promise<void> {
    if (await pathExists(this.filePath)) {
      return;
    }

    const legacyPath = join(getConfigDir(LEGACY_SERVICE_NAME), CREDENTIALS_FILE);
    if (!(await pathExists(legacyPath))) {
      return;
    }

    await this.ensureStorePath();
    try {
      await fs.copyFile(legacyPath, this.filePath);
      await this.ensureFilePermissions();
    } catch {
      // Ignore migration failures; caller will start with a fresh store.
    }
  }

  private async readStore(): Promise<CredentialStore> {
    await this.ensureStorePath();
    await this.migrateLegacyStoreIfNeeded();

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<CredentialStore>;
      return {
        credentials: parsed.credentials ?? {},
      };
    } catch {
      return { credentials: {} };
    }
  }

  private async writeStore(store: CredentialStore): Promise<void> {
    await this.ensureStorePath();
    await fs.writeFile(this.filePath, JSON.stringify(store, null, 2), { mode: 0o600 });
    await this.ensureFilePermissions();
  }

  async get(key: string): Promise<string | null> {
    const store = await this.readStore();
    return store.credentials[this.keyFor(key)] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const store = await this.readStore();
    store.credentials[this.keyFor(key)] = value;
    await this.writeStore(store);
  }

  async delete(key: string): Promise<void> {
    const store = await this.readStore();
    delete store.credentials[this.keyFor(key)];
    await this.writeStore(store);
  }

  async clear(): Promise<void> {
    const store = await this.readStore();
    const prefix = `${this.serviceName}.`;

    for (const key of Object.keys(store.credentials)) {
      if (key.startsWith(prefix)) {
        delete store.credentials[key];
      }
    }

    await this.writeStore(store);
  }
}

export async function createSecureStorage(): Promise<AuthStorage> {
  return new FileSecureStorage();
}
