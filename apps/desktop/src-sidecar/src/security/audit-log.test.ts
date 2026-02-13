import * as fs from 'fs';
import { mkdtemp, readFile, rm } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { securityAuditLog } from './audit-log.js';

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('security audit log', () => {
  it('writes redacted structured log lines', async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), 'cowork-audit-log-'));
    tempDirs.push(baseDir);
    securityAuditLog.setBaseDir(baseDir);

    await securityAuditLog.log({
      category: 'ipc_command',
      command: 'configure_connector_secrets',
      outcome: 'success',
      sessionId: 'session-test',
      connectorId: 'managed:slack',
      metadata: {
        payload: {
          apiKey: 'raw-secret-value',
          nested: {
            access_token: 'another-secret',
          },
          safeField: 'ok',
        },
      },
    });

    const logPath = path.join(baseDir, 'security', 'audit.log');
    expect(fs.existsSync(logPath)).toBe(true);

    const content = await readFile(logPath, 'utf-8');
    expect(content).toContain('"command":"configure_connector_secrets"');
    expect(content).toContain('"apiKey":"[REDACTED]"');
    expect(content).toContain('"access_token":"[REDACTED]"');
    expect(content).toContain('"safeField":"ok"');
    expect(content).not.toContain('raw-secret-value');
    expect(content).not.toContain('another-secret');
  });
});
