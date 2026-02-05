/**
 * Eligibility Checker Service
 *
 * Checks if skill requirements are met on the current system.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  SkillRequirements,
  SkillEligibility,
  InstallOption,
  SkillManifest,
} from '@gemini-cowork/shared';
import { getRequirements, getInstallOptions } from './skill-parser.js';

const execFileAsync = promisify(execFile);

// Cache for binary checks to avoid repeated lookups
const binaryCache = new Map<string, { exists: boolean; path?: string }>();

// Platform mapping
const PLATFORM_MAP: Record<string, string> = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
};

/**
 * Check if a binary exists in PATH
 */
export async function checkBinary(name: string): Promise<{ exists: boolean; path?: string }> {
  // Validate binary name to prevent command injection
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return { exists: false };
  }

  // Check cache first
  const cached = binaryCache.get(name);
  if (cached !== undefined) {
    return cached;
  }

  try {
    // Use 'which' on Unix, 'where' on Windows
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await execFileAsync(cmd, [name], { timeout: 5000 });
    const path = stdout.trim().split('\n')[0]; // Take first result

    const result = { exists: true, path };
    binaryCache.set(name, result);
    return result;
  } catch {
    const result = { exists: false };
    binaryCache.set(name, result);
    return result;
  }
}

/**
 * Check all binaries in list (all must exist)
 */
export async function checkAllBinaries(bins: string[]): Promise<{
  allMet: boolean;
  missing: string[];
  found: Map<string, string>;
}> {
  const missing: string[] = [];
  const found = new Map<string, string>();

  for (const bin of bins) {
    const result = await checkBinary(bin);
    if (result.exists && result.path) {
      found.set(bin, result.path);
    } else {
      missing.push(bin);
    }
  }

  return {
    allMet: missing.length === 0,
    missing,
    found,
  };
}

/**
 * Check if at least one binary exists from list
 */
export async function checkAnyBinary(bins: string[]): Promise<{
  anyMet: boolean;
  found: string | null;
  path?: string;
}> {
  for (const bin of bins) {
    const result = await checkBinary(bin);
    if (result.exists) {
      return { anyMet: true, found: bin, path: result.path };
    }
  }

  return { anyMet: false, found: null };
}

/**
 * Check if environment variable is set and non-empty
 */
export function checkEnvVar(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value !== '';
}

/**
 * Check all environment variables (all must be set)
 */
export function checkAllEnvVars(vars: string[]): {
  allMet: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  for (const varName of vars) {
    if (!checkEnvVar(varName)) {
      missing.push(varName);
    }
  }

  return {
    allMet: missing.length === 0,
    missing,
  };
}

/**
 * Check if current platform is in allowed list
 */
export function checkPlatform(allowedPlatforms: string[]): boolean {
  const currentPlatform = PLATFORM_MAP[process.platform];
  if (!currentPlatform) {
    return false;
  }

  return allowedPlatforms.includes(currentPlatform);
}

/**
 * Generate install hints based on requirements and available install options
 */
export function generateInstallHints(
  _requirements: SkillRequirements,
  installOptions: InstallOption[],
  missing: string[]
): string[] {
  const hints: string[] = [];
  const currentPlatform = PLATFORM_MAP[process.platform];

  for (const bin of missing) {
    // Find install option that provides this binary
    const option = installOptions.find((opt) => {
      if (opt.bins?.includes(bin)) return true;
      // For brew, formula name often matches binary name
      if (opt.kind === 'brew' && opt.formula === bin) return true;
      if (opt.kind === 'apt' && opt.package === bin) return true;
      if (opt.kind === 'npm' && opt.package === bin) return true;
      return false;
    });

    if (option) {
      const hint = formatInstallHint(option);
      if (hint && !hints.includes(hint)) {
        hints.push(hint);
      }
    } else {
      // Generic hint if no specific install option found
      if (currentPlatform === 'darwin') {
        hints.push(`brew install ${bin}`);
      } else if (currentPlatform === 'linux') {
        hints.push(`sudo apt install ${bin}`);
      } else if (currentPlatform === 'windows') {
        hints.push(`Install ${bin} from the official website`);
      }
    }
  }

  return hints;
}

/**
 * Format a single install option as a hint
 */
function formatInstallHint(option: InstallOption): string | null {
  const currentPlatform = PLATFORM_MAP[process.platform];

  switch (option.kind) {
    case 'brew':
      if (currentPlatform !== 'darwin' && currentPlatform !== 'linux') {
        return null;
      }
      if (option.tap) {
        return `brew install ${option.tap}/${option.formula}`;
      }
      return `brew install ${option.formula}`;

    case 'apt':
      if (currentPlatform !== 'linux') {
        return null;
      }
      return `sudo apt install ${option.package}`;

    case 'npm':
      return `npm install -g ${option.package}`;

    case 'go':
      return `go install ${option.module}`;

    case 'uv':
      return `uv tool install ${option.package}`;

    case 'download':
      return option.url ? `Download from: ${option.url}` : null;

    case 'manual':
      return option.instructions || null;

    default:
      return null;
  }
}

/**
 * Check full skill eligibility
 */
export async function checkSkillEligibility(manifest: SkillManifest): Promise<SkillEligibility> {
  const requirements = getRequirements(manifest.frontmatter);
  const installOptions = getInstallOptions(manifest.frontmatter);

  const result: SkillEligibility = {
    eligible: true,
    missingBins: [],
    missingEnvVars: [],
    platformMismatch: false,
    installHints: [],
    foundBins: {},
  };

  // Check platform first
  if (requirements.os && requirements.os.length > 0) {
    if (!checkPlatform(requirements.os)) {
      result.eligible = false;
      result.platformMismatch = true;
      const currentPlatform = PLATFORM_MAP[process.platform] || process.platform;
      result.installHints.push(`This skill requires ${requirements.os.join(' or ')} (current: ${currentPlatform})`);
      return result; // No point checking other requirements if platform doesn't match
    }
  }

  // Check required binaries (all must exist)
  if (requirements.bins && requirements.bins.length > 0) {
    const binCheck = await checkAllBinaries(requirements.bins);
    if (!binCheck.allMet) {
      result.eligible = false;
      result.missingBins = binCheck.missing;
    }
    // Store found bins
    result.foundBins = Object.fromEntries(binCheck.found);
  }

  // Check anyBins (at least one must exist)
  if (requirements.anyBins && requirements.anyBins.length > 0) {
    const anyCheck = await checkAnyBinary(requirements.anyBins);
    if (!anyCheck.anyMet) {
      result.eligible = false;
      // Add all as missing since none were found
      result.missingBins.push(...requirements.anyBins.filter((b) => !result.missingBins.includes(b)));
    } else if (anyCheck.path) {
      result.foundBins = result.foundBins || {};
      result.foundBins[anyCheck.found!] = anyCheck.path;
    }
  }

  // Check environment variables
  if (requirements.env && requirements.env.length > 0) {
    const envCheck = checkAllEnvVars(requirements.env);
    if (!envCheck.allMet) {
      result.eligible = false;
      result.missingEnvVars = envCheck.missing;
    }
  }

  // Generate install hints for missing items
  if (result.missingBins.length > 0) {
    const hints = generateInstallHints(requirements, installOptions, result.missingBins);
    result.installHints.push(...hints);
  }

  if (result.missingEnvVars.length > 0) {
    for (const envVar of result.missingEnvVars) {
      result.installHints.push(`Set environment variable: ${envVar}`);
    }
  }

  return result;
}

/**
 * Clear the binary cache (useful for testing or after installations)
 */
export function clearBinaryCache(): void {
  binaryCache.clear();
}

/**
 * Check eligibility for multiple skills in parallel
 */
export async function checkMultipleSkillsEligibility(
  manifests: SkillManifest[]
): Promise<Map<string, SkillEligibility>> {
  const results = new Map<string, SkillEligibility>();

  // Process in parallel with concurrency limit
  const CONCURRENCY = 5;
  for (let i = 0; i < manifests.length; i += CONCURRENCY) {
    const batch = manifests.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (manifest) => ({
        id: manifest.id,
        eligibility: await checkSkillEligibility(manifest),
      }))
    );

    for (const { id, eligibility } of batchResults) {
      results.set(id, eligibility);
    }
  }

  return results;
}
