import { GoogleGenAI, Environment } from '@google/genai';
import { chromium, type Browser, type Page } from 'playwright';

export interface ComputerUseSession {
  browser: Browser;
  page: Page;
  goal: string;
}

export interface ComputerUseStepResult {
  completed: boolean;
  actions: string[];
  blocked?: boolean;
  blockedReason?: string;
}

export async function createComputerSession(
  _apiKey: string,
  goal: string,
  startUrl?: string,
  headless = false
): Promise<ComputerUseSession> {
  void _apiKey;
  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  if (startUrl) {
    await page.goto(startUrl);
  }

  return { browser, page, goal };
}

export async function runComputerUseStep(
  apiKey: string,
  session: ComputerUseSession
): Promise<ComputerUseStepResult> {
  const ai = new GoogleGenAI({ apiKey });
  const screenshot = await session.page.screenshot({ type: 'png' });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-computer-use-preview-10-2025',
    contents: [
      {
        role: 'user',
        parts: [
          { text: `Goal: ${session.goal}\n\nCurrent URL: ${session.page.url()}` },
          {
            inlineData: {
              mimeType: 'image/png',
              data: Buffer.from(screenshot).toString('base64'),
            },
          },
        ],
      },
    ],
    config: {
      tools: [
        {
          computerUse: { environment: Environment.ENVIRONMENT_BROWSER },
        },
      ],
    },
  });

  const finishReason = (response.candidates?.[0]?.finishReason ?? '').toString();
  if (finishReason.toLowerCase().includes('safety')) {
    return { completed: true, actions: [], blocked: true, blockedReason: finishReason };
  }

  const functionCalls = (response as { functionCalls?: ComputerUseCall[] }).functionCalls;
  if (!functionCalls?.length) {
    return { completed: true, actions: [] };
  }

  const executedActions: string[] = [];

  for (const call of functionCalls) {
    await executeAction(session.page, call);
    executedActions.push(`${call.name}(${JSON.stringify(call.args)})`);
  }

  return { completed: false, actions: executedActions };
}

interface ComputerUseCall {
  name: string;
  args: Record<string, unknown>;
}

async function executeAction(page: Page, call: ComputerUseCall) {
  const { name, args } = call;
  const x = denormalize(Number(args.x ?? 0), 1440);
  const y = denormalize(Number(args.y ?? 0), 900);

  switch (name) {
    case 'open_web_browser': {
      const url = String(args.url ?? '');
      if (url) {
        await page.goto(url);
      }
      break;
    }
    case 'search': {
      const query = String(args.query ?? '');
      if (query) {
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        await page.goto(url);
      }
      break;
    }
    case 'click_at':
      await page.mouse.click(x, y);
      break;
    case 'hover_at':
      await page.mouse.move(x, y);
      break;
    case 'type_text_at': {
      await page.mouse.click(x, y);
      if (args.clear_text) {
        await page.keyboard.press('Control+a');
      }
      await page.keyboard.type(String(args.text ?? ''));
      if (args.press_enter) {
        await page.keyboard.press('Enter');
      }
      break;
    }
    case 'scroll_at': {
      const direction = String(args.direction ?? 'down');
      const amount = Number(args.amount ?? 500);
      const delta = direction === 'down' ? amount : -amount;
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, delta);
      break;
    }
    case 'scroll_document': {
      const direction = String(args.direction ?? 'down');
      const delta = direction === 'down' ? 500 : -500;
      await page.mouse.wheel(0, delta);
      break;
    }
    case 'drag_and_drop': {
      const toX = denormalize(Number(args.to_x ?? 0), 1440);
      const toY = denormalize(Number(args.to_y ?? 0), 900);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(toX, toY);
      await page.mouse.up();
      break;
    }
    case 'navigate': {
      const url = String(args.url ?? '');
      if (url) {
        await page.goto(url);
      }
      break;
    }
    case 'go_back':
      await page.goBack();
      break;
    case 'go_forward':
      await page.goForward();
      break;
    case 'key_combination': {
      const keys = Array.isArray(args.keys) ? args.keys.map(String) : [];
      if (keys.length > 0) {
        await page.keyboard.press(keys.join('+'));
      }
      break;
    }
    case 'wait_5_seconds':
      await new Promise((resolve) => setTimeout(resolve, 5000));
      break;
  }

  await page.waitForLoadState('networkidle').catch(() => {});
}

function denormalize(coord: number, max: number): number {
  return Math.round((coord / 1000) * max);
}
