#!/usr/bin/env node
// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const command = process.argv[2] ?? 'check';
const cliVersion = readFlagValue('--version');

if (!['check', 'sync'].includes(command)) {
  console.error('Usage: node scripts/version-sync.mjs <check|sync> [--version x.y.z]');
  process.exit(1);
}

const packageJsonFiles = [
  'package.json',
  'apps/desktop/package.json',
  'apps/desktop/src-sidecar/package.json',
  ...fs
    .readdirSync(path.join(repoRoot, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.posix.join('packages', entry.name, 'package.json')),
];

const versionFiles = [
  ...packageJsonFiles.map((file) => ({ type: 'json', file, key: 'version' })),
  { type: 'json', file: 'apps/desktop/src-tauri/tauri.conf.json', key: 'version' },
  { type: 'cargo', file: 'apps/desktop/src-tauri/Cargo.toml' },
];

const rootVersion = readJson('package.json').version;
const targetVersion = cliVersion ?? rootVersion;

if (!isSemver(targetVersion)) {
  console.error(`Invalid version "${targetVersion}". Expected semantic version like 0.2.1`);
  process.exit(1);
}

if (command === 'sync') {
  runSync(targetVersion);
}

runCheck(targetVersion);

function runSync(version) {
  const changed = [];

  for (const entry of versionFiles) {
    if (entry.type === 'json') {
      const data = readJson(entry.file);
      if (data[entry.key] !== version) {
        data[entry.key] = version;
        writeJson(entry.file, data);
        changed.push(entry.file);
      }
      continue;
    }

    const cargoPath = abs(entry.file);
    const current = fs.readFileSync(cargoPath, 'utf8');
    const updated = updateCargoPackageVersion(current, version);
    if (updated !== current) {
      fs.writeFileSync(cargoPath, updated);
      changed.push(entry.file);
    }
  }

  if (changed.length === 0) {
    console.log(`Version sync: all files already at ${version}`);
  } else {
    console.log(`Version sync: updated to ${version}`);
    for (const file of changed) {
      console.log(`- ${file}`);
    }
  }
}

function runCheck(expectedVersion) {
  const mismatches = [];

  for (const entry of versionFiles) {
    let actualVersion = null;
    if (entry.type === 'json') {
      actualVersion = readJson(entry.file)[entry.key];
    } else {
      const cargoContent = fs.readFileSync(abs(entry.file), 'utf8');
      actualVersion = readCargoPackageVersion(cargoContent);
    }

    if (!actualVersion) {
      mismatches.push({
        file: entry.file,
        expected: expectedVersion,
        actual: '(missing)',
      });
      continue;
    }

    if (actualVersion !== expectedVersion) {
      mismatches.push({
        file: entry.file,
        expected: expectedVersion,
        actual: actualVersion,
      });
    }
  }

  if (mismatches.length > 0) {
    console.error(`Version check failed. Expected ${expectedVersion} everywhere:`);
    for (const mismatch of mismatches) {
      console.error(`- ${mismatch.file}: found ${mismatch.actual}`);
    }
    process.exit(1);
  }

  console.log(`Version check passed: ${expectedVersion}`);
}

function readFlagValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function abs(file) {
  return path.join(repoRoot, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(abs(file), 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(abs(file), `${JSON.stringify(data, null, 2)}\n`);
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function readCargoPackageVersion(content) {
  const lines = content.split(/\r?\n/);
  let inPackageSection = false;

  for (const line of lines) {
    const sectionMatch = line.match(/^\s*\[(.+)]\s*$/);
    if (sectionMatch) {
      inPackageSection = sectionMatch[1].trim() === 'package';
      continue;
    }

    if (!inPackageSection) continue;
    const versionMatch = line.match(/^\s*version\s*=\s*"([^"]+)"\s*$/);
    if (versionMatch) return versionMatch[1];
  }

  return null;
}

function updateCargoPackageVersion(content, version) {
  const lines = content.split(/\r?\n/);
  let inPackageSection = false;
  let replaced = false;

  const updatedLines = lines.map((line) => {
    const sectionMatch = line.match(/^\s*\[(.+)]\s*$/);
    if (sectionMatch) {
      inPackageSection = sectionMatch[1].trim() === 'package';
      return line;
    }

    if (!inPackageSection || replaced) {
      return line;
    }

    if (/^\s*version\s*=/.test(line)) {
      replaced = true;
      return `version = "${version}"`;
    }

    return line;
  });

  if (!replaced) {
    throw new Error('Could not find [package] version in Cargo.toml');
  }

  return `${updatedLines.join('\n')}\n`;
}
