#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const connectorsDir = path.join(rootDir, 'connectors');

const allowedCategories = new Set([
  'google',
  'microsoft',
  'communication',
  'productivity',
  'developer',
  'database',
  'ai-search',
  'utility',
  'custom',
]);

const packageStatusCache = new Map();
const canonicalOAuthRemoteEndpoints = new Map([
  ['notion', 'https://mcp.notion.com/mcp'],
  ['github', 'https://api.githubcopilot.com/mcp/'],
  ['jira', 'https://mcp.atlassian.com/v1/mcp'],
  ['sentry', 'https://mcp.sentry.dev/mcp'],
]);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assert(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function normalizePackageName(spec) {
  if (typeof spec !== 'string') return '';

  if (spec.startsWith('@')) {
    const slashIndex = spec.indexOf('/');
    if (slashIndex === -1) return spec;
    const versionAt = spec.indexOf('@', slashIndex + 1);
    return versionAt === -1 ? spec : spec.slice(0, versionAt);
  }

  const versionAt = spec.indexOf('@');
  return versionAt === -1 ? spec : spec.slice(0, versionAt);
}

function firstNpxPackage(args) {
  if (!Array.isArray(args)) return null;
  for (const arg of args) {
    if (typeof arg !== 'string') continue;
    if (arg.startsWith('-')) continue;
    return arg;
  }
  return null;
}

function findRemoteUrl(args, packageSpec) {
  if (!Array.isArray(args) || typeof packageSpec !== 'string') return null;
  const packageIndex = args.findIndex((arg) => arg === packageSpec);
  if (packageIndex === -1) return null;

  for (let i = packageIndex + 1; i < args.length; i += 1) {
    const arg = args[i];
    if (typeof arg === 'string' && /^https?:\/\//i.test(arg)) {
      return arg;
    }
  }

  return null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function validateNpmPackage(packageName) {
  if (packageStatusCache.has(packageName)) {
    return packageStatusCache.get(packageName);
  }

  let result;
  try {
    const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const response = await fetchWithTimeout(registryUrl, { method: 'GET' });
    if (response.status === 404) {
      result = { ok: false, reason: `Package not found on npm registry: ${packageName}` };
    } else if (!response.ok) {
      result = {
        ok: false,
        reason: `Failed to resolve npm package ${packageName} (HTTP ${response.status})`,
      };
    } else {
      result = { ok: true };
    }
  } catch (error) {
    result = {
      ok: false,
      reason: `Failed to resolve npm package ${packageName}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  packageStatusCache.set(packageName, result);
  return result;
}

function isReachableStatus(status) {
  return status >= 200 && status < 500 && status !== 404 && status !== 410;
}

async function validateRemoteEndpoint(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: `Remote URL must use http/https: ${url}` };
    }
  } catch {
    return { ok: false, reason: `Invalid remote URL: ${url}` };
  }

  try {
    let response = await fetchWithTimeout(url, { method: 'HEAD', redirect: 'follow' });

    // Some endpoints reject HEAD, probe with GET in that case.
    if (response.status === 405 || response.status === 404 || response.status === 410) {
      response = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' });
    }

    if (!isReachableStatus(response.status)) {
      return {
        ok: false,
        reason: `Remote endpoint did not respond as reachable: ${url} (HTTP ${response.status})`,
      };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      reason: `Failed to reach remote endpoint ${url}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function validateSecretDefinition(secret, context, errors) {
  assert(isRecord(secret), `${context}: secret must be an object`, errors);
  if (!isRecord(secret)) return;

  assert(typeof secret.key === 'string' && secret.key.length > 0, `${context}: secret.key is required`, errors);
  assert(
    typeof secret.description === 'string' && secret.description.length > 0,
    `${context}: secret.description is required`,
    errors
  );
  assert(typeof secret.required === 'boolean', `${context}: secret.required must be boolean`, errors);

  if ('envVar' in secret) {
    assert(typeof secret.envVar === 'string' && secret.envVar.length > 0, `${context}: secret.envVar must be a non-empty string`, errors);
  }
  if ('placeholder' in secret) {
    assert(typeof secret.placeholder === 'string', `${context}: secret.placeholder must be a string`, errors);
  }
  if ('validation' in secret) {
    assert(typeof secret.validation === 'string', `${context}: secret.validation must be a string`, errors);
  }
  if ('link' in secret) {
    assert(typeof secret.link === 'string', `${context}: secret.link must be a string`, errors);
  }
}

async function validateManifest(manifestPath) {
  const errors = [];
  const checks = {
    connectorId: null,
    authType: null,
    packageName: null,
    isRemote: false,
    remoteUrl: null,
  };

  let manifest;
  try {
    const raw = await readFile(manifestPath, 'utf8');
    manifest = JSON.parse(raw);
  } catch (error) {
    return {
      manifestPath,
      errors: [`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`],
      checks,
    };
  }

  assert(isRecord(manifest), 'Manifest root must be an object', errors);
  if (!isRecord(manifest)) {
    return { manifestPath, errors, checks };
  }

  const requiredStringFields = [
    'id',
    'name',
    'displayName',
    'description',
    'version',
    'icon',
    'category',
  ];

  for (const field of requiredStringFields) {
    assert(
      typeof manifest[field] === 'string' && manifest[field].length > 0,
      `Missing or invalid string field: ${field}`,
      errors
    );
  }
  if (typeof manifest.id === 'string' && manifest.id.length > 0) {
    checks.connectorId = manifest.id;
  }

  if (typeof manifest.category === 'string') {
    assert(allowedCategories.has(manifest.category), `Invalid category: ${manifest.category}`, errors);
  }

  assert(Array.isArray(manifest.tags), 'tags must be an array', errors);
  if (Array.isArray(manifest.tags)) {
    assert(manifest.tags.every((tag) => typeof tag === 'string'), 'tags must contain only strings', errors);
  }

  assert(isRecord(manifest.transport), 'transport must be an object', errors);

  if (isRecord(manifest.transport)) {
    if (manifest.transport.type === 'stdio') {
      assert(
        typeof manifest.transport.command === 'string' && manifest.transport.command.length > 0,
        'transport.command must be a non-empty string for stdio',
        errors
      );
      assert(Array.isArray(manifest.transport.args), 'transport.args must be an array for stdio', errors);
      if (Array.isArray(manifest.transport.args)) {
        assert(
          manifest.transport.args.every((arg) => typeof arg === 'string'),
          'transport.args must contain only strings',
          errors
        );
      }

      const command = typeof manifest.transport.command === 'string' ? manifest.transport.command.trim() : '';
      const commandName = command.split(/[\\/]/).pop() || '';
      if (commandName === 'npx' && Array.isArray(manifest.transport.args)) {
        const packageSpec = firstNpxPackage(manifest.transport.args);
        if (!packageSpec) {
          errors.push('Unable to determine npm package from npx args');
        } else {
          const packageName = normalizePackageName(packageSpec);
          checks.packageName = packageName;

          if (packageName === 'mcp-remote') {
            checks.isRemote = true;
            checks.remoteUrl = findRemoteUrl(manifest.transport.args, packageSpec);
            if (!checks.remoteUrl) {
              errors.push('mcp-remote transport must include a remote URL argument');
            }
          }
        }
      }
    } else if (manifest.transport.type === 'http') {
      assert(
        typeof manifest.transport.url === 'string' && manifest.transport.url.length > 0,
        'transport.url must be a non-empty string for http transport',
        errors
      );
      if ('headers' in manifest.transport) {
        assert(isRecord(manifest.transport.headers), 'transport.headers must be an object', errors);
        if (isRecord(manifest.transport.headers)) {
          for (const [key, value] of Object.entries(manifest.transport.headers)) {
            assert(typeof value === 'string', `transport.headers.${key} must be a string`, errors);
          }
        }
      }
    } else {
      errors.push(`Unsupported transport.type: ${String(manifest.transport.type)}`);
    }
  }

  assert(isRecord(manifest.auth), 'auth must be an object', errors);
  if (isRecord(manifest.auth)) {
    if (typeof manifest.auth.type === 'string' && manifest.auth.type.length > 0) {
      checks.authType = manifest.auth.type;
    }
    if (manifest.auth.type === 'none') {
      // No-op
    } else if (manifest.auth.type === 'env') {
      assert(Array.isArray(manifest.auth.secrets), 'auth.secrets must be an array for env auth', errors);
      if (Array.isArray(manifest.auth.secrets)) {
        for (let i = 0; i < manifest.auth.secrets.length; i += 1) {
          validateSecretDefinition(manifest.auth.secrets[i], `auth.secrets[${i}]`, errors);
        }
      }
    } else if (manifest.auth.type === 'oauth') {
      assert(typeof manifest.auth.provider === 'string', 'auth.provider must be set for oauth', errors);
      assert(typeof manifest.auth.flow === 'string', 'auth.flow must be set for oauth', errors);
      assert(Array.isArray(manifest.auth.scopes), 'auth.scopes must be an array for oauth', errors);
      if (Array.isArray(manifest.auth.scopes)) {
        assert(manifest.auth.scopes.every((scope) => typeof scope === 'string'), 'auth.scopes must contain only strings', errors);
      }

      if ('secrets' in manifest.auth) {
        assert(Array.isArray(manifest.auth.secrets), 'auth.secrets must be an array when provided', errors);
        if (Array.isArray(manifest.auth.secrets)) {
          for (let i = 0; i < manifest.auth.secrets.length; i += 1) {
            validateSecretDefinition(manifest.auth.secrets[i], `auth.secrets[${i}]`, errors);
          }
        }
      }
    } else {
      errors.push(`Unsupported auth.type: ${String(manifest.auth.type)}`);
    }
  }

  return { manifestPath, errors, checks };
}

async function main() {
  const entries = await readdir(connectorsDir, { withFileTypes: true });
  const connectorDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  const manifestPaths = connectorDirs.map((dir) => path.join(connectorsDir, dir, 'connector.json'));

  const manifestResults = await Promise.all(manifestPaths.map((manifestPath) => validateManifest(manifestPath)));

  const allErrors = [];

  for (const result of manifestResults) {
    for (const error of result.errors) {
      allErrors.push(`${path.relative(rootDir, result.manifestPath)}: ${error}`);
    }
  }

  for (const result of manifestResults) {
    const connectorId = result.checks.connectorId;
    if (!connectorId) continue;

    const expectedUrl = canonicalOAuthRemoteEndpoints.get(connectorId);
    if (!expectedUrl) continue;

    const manifestLabel = path.relative(rootDir, result.manifestPath);
    if (result.checks.packageName !== 'mcp-remote') {
      allErrors.push(`${manifestLabel}: ${connectorId} must use mcp-remote transport`);
    }
    if (result.checks.authType !== 'none') {
      allErrors.push(`${manifestLabel}: ${connectorId} must use auth.type \"none\" for MCP-native OAuth`);
    }
    if (result.checks.remoteUrl !== expectedUrl) {
      allErrors.push(
        `${manifestLabel}: ${connectorId} remote URL must be ${expectedUrl} (found ${result.checks.remoteUrl || 'none'})`
      );
    }
  }

  const packageChecks = [];
  const remoteChecks = [];

  for (const result of manifestResults) {
    if (result.checks.packageName) {
      packageChecks.push({ manifestPath: result.manifestPath, packageName: result.checks.packageName });
    }
    if (result.checks.isRemote && result.checks.remoteUrl) {
      remoteChecks.push({ manifestPath: result.manifestPath, url: result.checks.remoteUrl });
    }
  }

  const uniquePackages = [...new Set(packageChecks.map((check) => check.packageName))].sort();
  const packageValidationResults = await Promise.all(
    uniquePackages.map(async (packageName) => ({ packageName, ...(await validateNpmPackage(packageName)) }))
  );

  for (const check of packageValidationResults) {
    if (!check.ok) {
      allErrors.push(check.reason);
    }
  }

  const remoteValidationResults = await Promise.all(
    remoteChecks.map(async (check) => ({
      manifestPath: check.manifestPath,
      url: check.url,
      ...(await validateRemoteEndpoint(check.url)),
    }))
  );

  for (const check of remoteValidationResults) {
    if (!check.ok) {
      allErrors.push(`${path.relative(rootDir, check.manifestPath)}: ${check.reason}`);
    }
  }

  if (allErrors.length > 0) {
    console.error('Connector validation failed.');
    for (const error of allErrors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Validated ${manifestResults.length} connector manifests.`);
  console.log(`Verified ${uniquePackages.length} npm package(s).`);
  console.log(`Verified ${remoteChecks.length} remote MCP endpoint(s).`);
  console.log('Connector validation passed.');
}

main().catch((error) => {
  console.error(`Connector validation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
