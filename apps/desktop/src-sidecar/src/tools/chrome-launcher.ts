// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { spawn, exec, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const execAsync = promisify(exec);

const CDP_PORT = 9222;

// Session-based Chrome instance management
// Each session gets its own Chrome instance with a dedicated profile
interface SessionChromeInstance {
  sessionId: string;
  port: number;
  profileDir: string;
  process: ChildProcess | null;
  startedAt: number;
}

// Track all session Chrome instances
const sessionInstances = new Map<string, SessionChromeInstance>();
let nextPort = 9300; // Start session ports from 9300 to avoid conflicts

/**
 * Get the Chrome executable path based on the platform
 */
function getChromePath(): string {
  switch (process.platform) {
    case 'darwin':
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    case 'win32':
      // Try common Windows paths
      const windowsPaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      ];
      for (const p of windowsPaths) {
        if (fs.existsSync(p)) return p;
      }
      return windowsPaths[0];
    default:
      // Linux
      return 'google-chrome';
  }
}

/**
 * Get the default Chrome user data directory
 */
function getDefaultUserDataDir(): string {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    case 'win32':
      return path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
    default:
      return path.join(os.homedir(), '.config', 'google-chrome');
  }
}

/**
 * Get a separate user data directory for automation
 * This allows us to run Chrome with debugging without affecting the user's main browser
 */
function getAutomationUserDataDir(): string {
  const baseDir = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : process.platform === 'win32'
      ? process.env.LOCALAPPDATA || os.homedir()
      : path.join(os.homedir(), '.config');

  return path.join(baseDir, 'Cowork', 'ChromeAutomation');
}

/**
 * Check if Chrome is currently running
 */
async function isChromeRunning(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execAsync('pgrep -x "Google Chrome"');
      return stdout.trim().length > 0;
    } else if (process.platform === 'win32') {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq chrome.exe" /NH');
      return stdout.includes('chrome.exe');
    } else {
      const { stdout } = await execAsync('pgrep -x chrome');
      return stdout.trim().length > 0;
    }
  } catch {
    return false;
  }
}

/**
 * Gracefully close Chrome (gives it time to save state)
 */
async function closeChrome(): Promise<{ success: boolean; error?: string }> {
  try {
    if (process.platform === 'darwin') {
      // Use AppleScript for graceful quit on macOS
      await execAsync('osascript -e \'quit app "Google Chrome"\'');
    } else if (process.platform === 'win32') {
      // Use taskkill with /IM for graceful close on Windows
      await execAsync('taskkill /IM chrome.exe');
    } else {
      // Use pkill for Linux
      await execAsync('pkill -TERM chrome');
    }

    // Wait for Chrome to close (up to 5 seconds)
    const maxWaitMs = 5000;
    const pollIntervalMs = 500;
    let waited = 0;

    while (waited < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      waited += pollIntervalMs;

      const stillRunning = await isChromeRunning();
      if (!stillRunning) {
        return { success: true };
      }
    }

    // If still running, force kill
    if (process.platform === 'darwin') {
      await execAsync('pkill -9 "Google Chrome"');
    } else if (process.platform === 'win32') {
      await execAsync('taskkill /F /IM chrome.exe');
    } else {
      await execAsync('pkill -9 chrome');
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    return { success: true };
  } catch (error) {
    // Even if the command fails, check if Chrome is still running
    const stillRunning = await isChromeRunning();
    if (!stillRunning) {
      return { success: true };
    }
    return {
      success: false,
      error: `Failed to close Chrome: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if Chrome has remote debugging enabled on the specified port
 */
async function hasDebuggingEnabled(port = CDP_PORT): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Launch Chrome with remote debugging enabled.
 * If Chrome is already running without debugging, launches a SEPARATE instance
 * with a dedicated automation profile instead of disrupting the user's browser.
 *
 * @param autoRestart - Legacy option, no longer used (kept for backward compat)
 */
async function launchChromeWithDebugging(_autoRestart = true): Promise<{ success: boolean; error?: string; usingSeparateProfile?: boolean }> {
  const chromePath = getChromePath();

  // Check if Chrome executable exists
  if (process.platform !== 'linux' && !fs.existsSync(chromePath)) {
    return {
      success: false,
      error: `Chrome not found at: ${chromePath}`,
    };
  }

  // Check if debugging is already available
  const hasDebug = await hasDebuggingEnabled();
  if (hasDebug) {
    return { success: true }; // Already available
  }

  // Check if Chrome is already running
  const running = await isChromeRunning();

  // Determine which profile to use
  let userDataDir: string;
  let usingSeparateProfile = false;

  if (running) {
    // Chrome is running without debugging - use a SEPARATE profile
    // This allows automation without disrupting the user's browsing session
    userDataDir = getAutomationUserDataDir();
    usingSeparateProfile = true;

    // Ensure the directory exists
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
  } else {
    // Chrome is not running - use the user's default profile for best experience
    userDataDir = getDefaultUserDataDir();
  }

  // Chrome is not running - launch it with debugging
  try {
    const args = [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ];

    // Spawn Chrome detached so it continues running after sidecar exits
    const chromeProcess = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
    });
    chromeProcess.unref();

    // Wait for Chrome to start and be ready
    const maxWaitMs = 10000;
    const pollIntervalMs = 500;
    let waited = 0;

    while (waited < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      waited += pollIntervalMs;

      const ready = await hasDebuggingEnabled();
      if (ready) {
        return { success: true, usingSeparateProfile };
      }
    }

    return {
      success: false,
      error: 'Chrome launched but remote debugging is not responding. Please try again.',
      usingSeparateProfile,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to launch Chrome: ${error instanceof Error ? error.message : String(error)}`,
      usingSeparateProfile,
    };
  }
}

/**
 * Ensure Chrome is available with remote debugging enabled.
 * Will launch Chrome automatically if needed.
 */
export async function ensureChromeWithDebugging(): Promise<{ success: boolean; error?: string }> {
  // First check if debugging is already available
  const hasDebug = await hasDebuggingEnabled();
  if (hasDebug) {
    return { success: true };
  }

  // Try to launch Chrome with debugging
  return launchChromeWithDebugging();
}

/**
 * Get or create a Chrome instance for a specific session.
 * Each session gets exactly ONE Chrome instance with its own profile.
 * Reuses existing instance if already running for this session.
 */
export async function getOrCreateSessionChrome(sessionId: string): Promise<{
  success: boolean;
  port?: number;
  error?: string;
  reused?: boolean;
}> {
  // Check if we already have an instance for this session
  const existing = sessionInstances.get(sessionId);
  if (existing) {
    // Verify it's still running
    const isRunning = await hasDebuggingEnabled(existing.port);
    if (isRunning) {
      return { success: true, port: existing.port, reused: true };
    }
    // Instance died, clean up and create new
    sessionInstances.delete(sessionId);
  }

  // Create new Chrome instance for this session
  const port = nextPort++;
  const profileDir = getSessionProfileDir(sessionId);

  // Ensure profile directory exists
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const chromePath = getChromePath();
  if (process.platform !== 'linux' && !fs.existsSync(chromePath)) {
    return { success: false, error: `Chrome not found at: ${chromePath}` };
  }

  try {
    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--new-window',
      'about:blank', // Start with blank page
    ];

    const chromeProcess = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
    });
    chromeProcess.unref();

    // Track this instance
    const instance: SessionChromeInstance = {
      sessionId,
      port,
      profileDir,
      process: chromeProcess,
      startedAt: Date.now(),
    };
    sessionInstances.set(sessionId, instance);

    // Wait for Chrome to be ready
    const maxWaitMs = 10000;
    const pollIntervalMs = 500;
    let waited = 0;

    while (waited < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      waited += pollIntervalMs;

      const ready = await hasDebuggingEnabled(port);
      if (ready) {
        return { success: true, port, reused: false };
      }
    }

    // Failed to start
    sessionInstances.delete(sessionId);
    return { success: false, error: 'Chrome launched but not responding' };
  } catch (error) {
    sessionInstances.delete(sessionId);
    return {
      success: false,
      error: `Failed to launch Chrome: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get the profile directory for a specific session
 */
function getSessionProfileDir(sessionId: string): string {
  const baseDir = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : process.platform === 'win32'
      ? process.env.LOCALAPPDATA || os.homedir()
      : path.join(os.homedir(), '.config');

  // Use a sanitized session ID for the folder name
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(baseDir, 'Cowork', 'ChromeSessions', safeSessionId);
}

/**
 * Close the Chrome instance for a specific session
 */
export async function closeSessionChrome(sessionId: string): Promise<{ success: boolean; error?: string }> {
  const instance = sessionInstances.get(sessionId);
  if (!instance) {
    return { success: true }; // No instance to close
  }

  try {
    // Try to close gracefully via CDP
    try {
      const response = await fetch(`http://127.0.0.1:${instance.port}/json/close`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        sessionInstances.delete(sessionId);
        return { success: true };
      }
    } catch {
      // CDP close failed, try process kill
    }

    // Kill the process if it's tracked
    if (instance.process && instance.process.pid) {
      try {
        process.kill(instance.process.pid);
      } catch {
        // Process might already be dead
      }
    }

    sessionInstances.delete(sessionId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to close Chrome: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get the CDP port for an existing session Chrome instance
 */
export function getSessionChromePort(sessionId: string): number | null {
  const instance = sessionInstances.get(sessionId);
  return instance?.port ?? null;
}

/**
 * Check if a session has an active Chrome instance
 */
export async function hasSessionChrome(sessionId: string): Promise<boolean> {
  const instance = sessionInstances.get(sessionId);
  if (!instance) return false;
  return hasDebuggingEnabled(instance.port);
}

/**
 * Clean up all session Chrome instances (call on app shutdown)
 */
export async function cleanupAllSessionChromes(): Promise<void> {
  const promises = Array.from(sessionInstances.keys()).map(sessionId => closeSessionChrome(sessionId));
  await Promise.allSettled(promises);
}

export { CDP_PORT, isChromeRunning, hasDebuggingEnabled, closeChrome };
