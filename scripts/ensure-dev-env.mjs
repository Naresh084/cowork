// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const rootDir = process.cwd();

function run(command, args, description) {
  console.log(`[dev-preflight] ${description}...`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    throw new Error(`[dev-preflight] Failed: ${command} ${args.join(' ')}`);
  }
}

function ensureDependencies() {
  const pnpmStorePath = join(rootDir, 'node_modules', '.pnpm');
  if (!existsSync(pnpmStorePath)) {
    run('pnpm', ['install'], 'Installing workspace dependencies');
  }
}

function ensureBuildArtifacts() {
  const requiredArtifacts = [
    {
      path: join(rootDir, 'apps', 'desktop', 'src-sidecar', 'dist', 'index.js'),
      command: ['--filter', '@cowork/sidecar', 'build'],
      description: 'Building desktop sidecar',
    },
    {
      path: join(rootDir, 'packages', 'shared', 'dist', 'index.js'),
      command: ['--filter', '@cowork/shared', 'build'],
      description: 'Building shared package',
    },
  ];

  for (const artifact of requiredArtifacts) {
    if (!existsSync(artifact.path)) {
      run('pnpm', artifact.command, artifact.description);
    }
  }
}

try {
  ensureDependencies();
  ensureBuildArtifacts();
  console.log('[dev-preflight] Environment ready.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
