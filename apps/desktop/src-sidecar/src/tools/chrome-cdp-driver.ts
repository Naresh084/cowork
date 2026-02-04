import CDP from 'chrome-remote-interface';
import type { Client } from 'chrome-remote-interface';

/**
 * Action for Gemini Computer Use
 */
interface ComputerUseAction {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Browser driver interface for computer use automation
 */
interface BrowserDriver {
  getScreenshot(): Promise<{ data: string; mimeType: string; url?: string }>;
  getUrl(): Promise<string>;
  performAction(action: ComputerUseAction): Promise<void>;
  close(): Promise<void>;
}

/**
 * Chrome DevTools Protocol driver for native browser automation.
 * Connects to Chrome running with --remote-debugging-port=9222.
 */
export class ChromeCDPDriver implements BrowserDriver {
  private client: Client;
  private width = 1440;
  private height = 900;

  private constructor(client: Client) {
    this.client = client;
  }

  /**
   * Connect to Chrome via CDP.
   * Chrome must be started with: --remote-debugging-port=9222
   */
  static async connect(port = 9222): Promise<ChromeCDPDriver> {
    try {
      // List available targets
      const targets = await CDP.List({ port });
      const pageTarget = targets.find((t: { type: string }) => t.type === 'page');

      if (!pageTarget) {
        throw new Error('No page target found. Open a Chrome tab first.');
      }

      const client = await CDP({ port, target: pageTarget.id });

      // Enable required domains
      await Promise.all([
        client.Page.enable(),
        client.Runtime.enable(),
        client.DOM.enable(),
      ]);

      return new ChromeCDPDriver(client);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes('ECONNREFUSED')) {
        throw new Error(
          `Cannot connect to Chrome. Please start Chrome with remote debugging:\n\n` +
          `macOS:\n  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222\n\n` +
          `Windows:\n  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222\n\n` +
          `Linux:\n  google-chrome --remote-debugging-port=9222`
        );
      }

      throw error;
    }
  }

  /**
   * Capture a screenshot of the current page.
   */
  async getScreenshot(): Promise<{ data: string; mimeType: string; url?: string }> {
    // Set viewport for consistent screenshots
    await this.client.Emulation.setDeviceMetricsOverride({
      width: this.width,
      height: this.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const { data } = await this.client.Page.captureScreenshot({
      format: 'png',
      captureBeyondViewport: false,
    });

    // Get current URL
    const { result } = await this.client.Runtime.evaluate({
      expression: 'window.location.href',
      returnByValue: true,
    });

    return {
      data,
      mimeType: 'image/png',
      url: result.value as string,
    };
  }

  /**
   * Get the current page URL.
   */
  async getUrl(): Promise<string> {
    const { result } = await this.client.Runtime.evaluate({
      expression: 'window.location.href',
      returnByValue: true,
    });
    return (result.value as string) || '';
  }

  /**
   * Perform a computer use action.
   */
  async performAction(action: ComputerUseAction): Promise<void> {
    const { name, args } = action;

    // Denormalize coordinates from 0-1000 to actual pixels
    const denorm = (val: unknown, max: number) => {
      const num = Number(val);
      if (!Number.isFinite(num)) return 0;
      return Math.round((num / 1000) * max);
    };

    const x = denorm(args.x, this.width);
    const y = denorm(args.y, this.height);

    switch (name) {
      case 'navigate':
      case 'open_web_browser': {
        const url = String(args.url || '');
        if (url) {
          await this.client.Page.navigate({ url });
          await this.waitForLoad();
        }
        break;
      }

      case 'search': {
        const query = String(args.query || '');
        if (query) {
          const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
          await this.client.Page.navigate({ url });
          await this.waitForLoad();
        }
        break;
      }

      case 'click_at': {
        await this.client.Input.dispatchMouseEvent({
          type: 'mousePressed',
          x,
          y,
          button: 'left',
          clickCount: 1,
        });
        await this.client.Input.dispatchMouseEvent({
          type: 'mouseReleased',
          x,
          y,
          button: 'left',
        });
        await this.waitForIdle();
        break;
      }

      case 'type_text_at': {
        // Click first
        await this.client.Input.dispatchMouseEvent({
          type: 'mousePressed',
          x,
          y,
          button: 'left',
          clickCount: 1,
        });
        await this.client.Input.dispatchMouseEvent({
          type: 'mouseReleased',
          x,
          y,
          button: 'left',
        });

        // Clear if requested
        if (args.clear_text || args.clear_before_typing) {
          await this.client.Input.dispatchKeyEvent({
            type: 'keyDown',
            key: 'a',
            modifiers: 2, // Ctrl/Cmd
          });
          await this.client.Input.dispatchKeyEvent({
            type: 'keyUp',
            key: 'a',
            modifiers: 2,
          });
          await this.client.Input.dispatchKeyEvent({
            type: 'keyDown',
            key: 'Backspace',
          });
          await this.client.Input.dispatchKeyEvent({
            type: 'keyUp',
            key: 'Backspace',
          });
        }

        // Type text character by character
        const text = String(args.text || '');
        for (const char of text) {
          await this.client.Input.dispatchKeyEvent({
            type: 'char',
            text: char,
          });
        }

        // Press Enter if requested
        if (args.press_enter) {
          await this.client.Input.dispatchKeyEvent({
            type: 'keyDown',
            key: 'Enter',
          });
          await this.client.Input.dispatchKeyEvent({
            type: 'keyUp',
            key: 'Enter',
          });
          await this.waitForLoad();
        }
        break;
      }

      case 'scroll_document': {
        const direction = String(args.direction || 'down');
        const deltaY = direction === 'down' ? 500 : -500;
        await this.client.Input.dispatchMouseEvent({
          type: 'mouseWheel',
          x: this.width / 2,
          y: this.height / 2,
          deltaX: 0,
          deltaY,
        });
        await this.waitForIdle();
        break;
      }

      case 'scroll_at': {
        const direction = String(args.direction || 'down');
        const magnitude = Number(args.magnitude) || 500;
        const deltaY = direction === 'down' ? magnitude : -magnitude;
        await this.client.Input.dispatchMouseEvent({
          type: 'mouseWheel',
          x,
          y,
          deltaX: 0,
          deltaY,
        });
        await this.waitForIdle();
        break;
      }

      case 'hover_at': {
        await this.client.Input.dispatchMouseEvent({
          type: 'mouseMoved',
          x,
          y,
        });
        break;
      }

      case 'go_back': {
        await this.client.Runtime.evaluate({
          expression: 'history.back()',
        });
        await this.waitForLoad();
        break;
      }

      case 'go_forward': {
        await this.client.Runtime.evaluate({
          expression: 'history.forward()',
        });
        await this.waitForLoad();
        break;
      }

      case 'key_combination': {
        const keys = String(args.keys || '').split('+');
        let modifiers = 0;
        let mainKey = '';

        for (const key of keys) {
          const k = key.trim().toLowerCase();
          if (k === 'control' || k === 'ctrl') modifiers |= 2;
          else if (k === 'alt') modifiers |= 1;
          else if (k === 'shift') modifiers |= 8;
          else if (k === 'meta' || k === 'cmd') modifiers |= 4;
          else mainKey = key.trim();
        }

        if (mainKey) {
          await this.client.Input.dispatchKeyEvent({
            type: 'keyDown',
            key: mainKey,
            modifiers,
          });
          await this.client.Input.dispatchKeyEvent({
            type: 'keyUp',
            key: mainKey,
            modifiers,
          });
        }
        break;
      }

      case 'wait_5_seconds': {
        await new Promise(resolve => setTimeout(resolve, 5000));
        break;
      }

      case 'drag_and_drop': {
        const toX = denorm(args.to_x || args.destination_x, this.width);
        const toY = denorm(args.to_y || args.destination_y, this.height);

        await this.client.Input.dispatchMouseEvent({
          type: 'mousePressed',
          x,
          y,
          button: 'left',
        });

        // Move in steps for smooth drag
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          await this.client.Input.dispatchMouseEvent({
            type: 'mouseMoved',
            x: x + ((toX - x) * i) / steps,
            y: y + ((toY - y) * i) / steps,
          });
        }

        await this.client.Input.dispatchMouseEvent({
          type: 'mouseReleased',
          x: toX,
          y: toY,
          button: 'left',
        });
        break;
      }

      default:
        console.warn(`Unknown CDP action: ${name}`);
    }
  }

  /**
   * Wait for page load event.
   */
  private async waitForLoad(): Promise<void> {
    try {
      await Promise.race([
        this.client.Page.loadEventFired(),
        new Promise(resolve => setTimeout(resolve, 10000)),
      ]);
    } catch {
      // Ignore timeout
    }
  }

  /**
   * Wait for page to become idle.
   */
  private async waitForIdle(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  /**
   * Close the CDP connection.
   */
  async close(): Promise<void> {
    await this.client.close();
  }
}

/**
 * Check if Chrome is available for CDP connection.
 */
export async function checkChromeAvailable(port = 9222): Promise<boolean> {
  try {
    const targets = await CDP.List({ port });
    return targets.some((t: { type: string }) => t.type === 'page');
  } catch {
    return false;
  }
}
