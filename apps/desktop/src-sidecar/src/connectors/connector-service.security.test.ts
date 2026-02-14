// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import * as fs from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectorService } from './connector-service.js';

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeConnectorManifest(targetDir: string, name: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    path.join(targetDir, 'connector.json'),
    JSON.stringify(
      {
        id: name,
        name,
        displayName: `Connector ${name}`,
        description: `Connector ${name} description`,
        version: '1.0.0',
        icon: 'Plug',
        category: 'custom',
        tags: ['test'],
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
        auth: {
          type: 'none',
        },
      },
      null,
      2
    ),
    'utf-8'
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('connector-service signed pack validation', () => {
  it('blocks unsigned managed connector packs by default', async () => {
    const appDataDir = createTempDir('cowork-connectors-appdata-');
    const managedDir = path.join(appDataDir, 'connectors');
    await writeConnectorManifest(path.join(managedDir, 'unsigned-connector'), 'unsigned-connector');

    const service = new ConnectorService(appDataDir);
    const discovered = await service.discoverFromDirectory(managedDir, 'managed', 50);
    expect(discovered).toHaveLength(0);
  });

  it('signs connector pack during install so managed discovery remains valid', async () => {
    const appDataDir = createTempDir('cowork-connectors-appdata-');
    const bundledDir = createTempDir('cowork-connectors-bundled-');
    await writeConnectorManifest(path.join(bundledDir, 'signed-on-install'), 'signed-on-install');

    const service = new ConnectorService(appDataDir);
    service.setBundledDir(bundledDir);

    const bundled = await service.discoverAll();
    const target = bundled.find((connector) => connector.name === 'signed-on-install');
    expect(target).toBeDefined();

    await service.installConnector(target!.id);

    const signaturePath = path.join(appDataDir, 'connectors', 'signed-on-install', 'SIGNATURE.json');
    expect(fs.existsSync(signaturePath)).toBe(true);

    const managedDiscovered = await service.discoverFromDirectory(
      path.join(appDataDir, 'connectors'),
      'managed',
      50
    );
    expect(managedDiscovered.some((connector) => connector.name === 'signed-on-install')).toBe(true);
  });
});
