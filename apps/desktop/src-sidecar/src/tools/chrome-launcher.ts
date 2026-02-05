import { spawn, exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const CDP_PORT = 9222;

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

  return path.join(baseDir, 'GeminiCowork', 'ChromeAutomation');
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
    console.log('[chrome-launcher] Chrome already running, launching separate automation instance...');
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
        if (usingSeparateProfile) {
          console.log('[chrome-launcher] Separate automation Chrome instance ready');
        }
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
 * Get the path to the Chrome extension folder
 */
export function getExtensionPath(): string {
  // The extension is in the apps/chrome-extension folder relative to the monorepo root
  // In production, this would be bundled differently
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  // Navigate from src-sidecar/src/tools to apps/chrome-extension
  return path.resolve(currentDir, '..', '..', '..', '..', 'chrome-extension');
}

/**
 * Open Chrome to the extensions page for installing the extension
 */
export async function openChromeExtensionsPage(): Promise<{ success: boolean; error?: string }> {
  const chromePath = getChromePath();

  // Check if Chrome executable exists
  if (process.platform !== 'linux' && !fs.existsSync(chromePath)) {
    return {
      success: false,
      error: `Chrome not found at: ${chromePath}`,
    };
  }

  try {
    // Open Chrome to the extensions page
    const args = ['chrome://extensions/'];

    if (process.platform === 'darwin') {
      // On macOS, use 'open' to open URL in existing Chrome
      execSync(`open -a "Google Chrome" "chrome://extensions/"`);
    } else if (process.platform === 'win32') {
      // On Windows, use start
      execSync(`start "" "${chromePath}" "chrome://extensions/"`);
    } else {
      // On Linux
      spawn(chromePath, args, { detached: true, stdio: 'ignore' }).unref();
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to open Chrome: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Open the extension folder in the system file browser
 */
export async function openExtensionFolder(): Promise<{ success: boolean; error?: string; path?: string }> {
  const extensionPath = getExtensionPath();

  if (!fs.existsSync(extensionPath)) {
    return {
      success: false,
      error: `Extension folder not found at: ${extensionPath}`,
    };
  }

  try {
    if (process.platform === 'darwin') {
      execSync(`open "${extensionPath}"`);
    } else if (process.platform === 'win32') {
      execSync(`explorer "${extensionPath}"`);
    } else {
      execSync(`xdg-open "${extensionPath}"`);
    }

    return { success: true, path: extensionPath };
  } catch (error) {
    return {
      success: false,
      error: `Failed to open folder: ${error instanceof Error ? error.message : String(error)}`,
      path: extensionPath,
    };
  }
}

/**
 * Open Chrome extensions page AND the extension folder for easy installation
 */
export async function openExtensionInstallHelper(): Promise<{ success: boolean; error?: string; extensionPath?: string }> {
  const extensionPath = getExtensionPath();

  // First open the extension folder
  const folderResult = await openExtensionFolder();

  // Then open Chrome extensions page
  const chromeResult = await openChromeExtensionsPage();

  if (!folderResult.success && !chromeResult.success) {
    return {
      success: false,
      error: `${folderResult.error}\n${chromeResult.error}`,
    };
  }

  return {
    success: true,
    extensionPath,
  };
}

export { CDP_PORT, isChromeRunning, hasDebuggingEnabled, closeChrome };
