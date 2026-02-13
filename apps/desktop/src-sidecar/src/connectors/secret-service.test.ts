import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileStorage, SecretService } from './secret-service.js';

const tempDirs: string[] = [];

function createTempConfigDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-secret-service-'));
  tempDirs.push(dir);
  return dir;
}

function readVault(dir: string): {
  version: number;
  activeKeyVersion: string;
  records: Record<string, { payload: string; keyVersion: string; updatedAt: number }>;
} {
  const raw = fs.readFileSync(path.join(dir, 'secrets.vault.json'), 'utf8');
  return JSON.parse(raw) as {
    version: number;
    activeKeyVersion: string;
    records: Record<string, { payload: string; keyVersion: string; updatedAt: number }>;
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('secret-service encrypted storage', () => {
  it('migrates legacy plaintext secrets into encrypted vault', async () => {
    const configDir = createTempConfigDir();
    const legacyPlaintextPath = path.join(configDir, 'secrets.json');
    const token = 'xoxb-secret-token';
    fs.writeFileSync(
      legacyPlaintextPath,
      JSON.stringify(
        {
          'connector.slack.SLACK_BOT_TOKEN': token,
        },
        null,
        2
      )
    );

    const secretService = new SecretService(
      new FileStorage({
        configDir,
        keyMaterialResolver: () => 'seed-alpha',
      })
    );

    const migrated = await secretService.getSecret('slack', 'SLACK_BOT_TOKEN');
    expect(migrated).toBe(token);
    expect(fs.existsSync(legacyPlaintextPath)).toBe(false);

    const vaultRaw = fs.readFileSync(path.join(configDir, 'secrets.vault.json'), 'utf8');
    expect(vaultRaw).not.toContain(token);
  });

  it('rotates encryption key and preserves revoke behavior', async () => {
    const configDir = createTempConfigDir();
    const connectorId = 'github';
    const secretKey = 'GITHUB_TOKEN';
    const secretValue = 'ghp_secret_123';

    const storage = new FileStorage({
      configDir,
      keyMaterialResolver: () => 'seed-v1',
    });
    const secretService = new SecretService(storage);
    await secretService.setSecret(connectorId, secretKey, secretValue);

    const before = readVault(configDir);
    const account = `connector.${connectorId}.${secretKey}`;
    const beforeRecord = before.records[account];
    expect(beforeRecord).toBeDefined();

    const rotationResult = await secretService.rotateEncryptionKey('seed-v2');
    expect(rotationResult.rotatedEntries).toBe(1);
    expect(rotationResult.fromKeyVersion).not.toBe(rotationResult.toKeyVersion);

    const after = readVault(configDir);
    const afterRecord = after.records[account];
    expect(afterRecord).toBeDefined();
    expect(afterRecord.keyVersion).toBe(rotationResult.toKeyVersion);
    expect(afterRecord.payload).not.toBe(beforeRecord.payload);

    const rotatedService = new SecretService(
      new FileStorage({
        configDir,
        keyMaterialResolver: () => 'seed-v2',
      })
    );

    expect(await rotatedService.getSecret(connectorId, secretKey)).toBe(secretValue);
    expect(await rotatedService.deleteSecret(connectorId, secretKey)).toBe(true);
    expect(await rotatedService.getSecret(connectorId, secretKey)).toBeNull();
  });
});
