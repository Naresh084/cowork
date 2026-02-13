import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const hoisted = vi.hoisted(() => {
  const state: {
    responses: Array<Record<string, unknown>>;
    driver: {
      getScreenshot: ReturnType<typeof vi.fn>;
      getUrl: ReturnType<typeof vi.fn>;
      performAction: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    } | null;
  } = {
    responses: [],
    driver: null,
  };

  const mockGenerateContent = vi.fn(async () => {
    const next = state.responses.shift();
    if (next) return next;
    return {
      candidates: [{ content: { parts: [{ text: 'done' }] } }],
      functionCalls: [],
    };
  });

  const mockForSession = vi.fn(async () => {
    if (!state.driver) {
      throw new Error('driver not configured');
    }
    return state.driver;
  });

  return {
    state,
    mockGenerateContent,
    mockForSession,
  };
});

vi.mock('@google/genai', () => ({
  Environment: {
    ENVIRONMENT_BROWSER: 'browser',
  },
  GoogleGenAI: class {
    models = {
      generateContent: hoisted.mockGenerateContent,
    };
  },
}));

vi.mock('./chrome-cdp-driver.js', () => ({
  ChromeCDPDriver: {
    forSession: hoisted.mockForSession,
  },
}));

import { createComputerUseTool } from './computer-use-tools.js';

function buildTool() {
  return createComputerUseTool(
    () => 'google',
    () => 'google-key',
    () => undefined,
    () => 'google-key',
    () => 'computer-use-model',
    () => 'computer-use-model',
  );
}

function baseContext() {
  return {
    workingDirectory: process.cwd(),
    sessionId: 'session_test',
    agentId: 'agent_test',
    appDataDir: testState.appDataDir,
  };
}

const testState: { appDataDir: string } = {
  appDataDir: '',
};

describe('computer-use reliability hardening', () => {
  beforeEach(async () => {
    testState.appDataDir = await mkdtemp(join(tmpdir(), 'cowork-computer-use-test-'));
    hoisted.mockGenerateContent.mockClear();
    hoisted.mockForSession.mockClear();

    hoisted.state.responses = [];
    hoisted.state.driver = {
      getScreenshot: vi.fn(async () => ({
        data: 'ZmFrZS1wbmc=',
        mimeType: 'image/png',
        url: 'https://example.com/page',
      })),
      getUrl: vi.fn(async () => 'https://example.com/page'),
      performAction: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
  });

  afterEach(async () => {
    if (testState.appDataDir) {
      await rm(testState.appDataDir, { recursive: true, force: true });
      testState.appDataDir = '';
    }
  });

  it('blocks unsafe navigation actions via action safety classifier', async () => {
    hoisted.state.responses = [
      {
        candidates: [{ finishReason: 'STOP' }],
        functionCalls: [
          {
            name: 'navigate',
            args: { url: 'file:///etc/passwd' },
          },
        ],
      },
    ];

    const tool = buildTool();
    const result = await tool.execute(
      {
        goal: 'Open a local file',
        maxSteps: 3,
      },
      baseContext(),
    );

    expect(result.success).toBe(true);
    const data = (result as { data?: { blocked?: boolean; blockedReason?: string } }).data;
    expect(data?.blocked).toBe(true);
    expect(String(data?.blockedReason || '')).toContain('Unsafe navigation target');
    expect(hoisted.state.driver?.performAction).not.toHaveBeenCalled();
  });

  it('retries transient browser action failures before succeeding', async () => {
    const actionFailure = new Error('navigation timeout while clicking');
    hoisted.state.driver?.performAction
      .mockRejectedValueOnce(actionFailure)
      .mockResolvedValue(undefined);

    hoisted.state.responses = [
      {
        candidates: [{ finishReason: 'STOP' }],
        functionCalls: [
          {
            name: 'click_at',
            args: { x: 200, y: 300 },
          },
        ],
      },
      {
        candidates: [{ content: { parts: [{ text: 'Task complete' }] } }],
        functionCalls: [],
      },
    ];

    const tool = buildTool();
    const result = await tool.execute(
      {
        goal: 'Click confirm and finish',
        maxSteps: 4,
      },
      baseContext(),
    );

    expect(result.success).toBe(true);
    expect(hoisted.state.driver?.performAction).toHaveBeenCalledTimes(2);
    const data = (result as { data?: { completed?: boolean; blocked?: boolean } }).data;
    expect(data?.blocked).toBe(false);
  });

  it('detects repeated action loops and exits deterministically', async () => {
    hoisted.state.responses = [
      {
        candidates: [{ finishReason: 'STOP' }],
        functionCalls: [{ name: 'click_at', args: { x: 100, y: 100 } }],
      },
      {
        candidates: [{ finishReason: 'STOP' }],
        functionCalls: [{ name: 'click_at', args: { x: 100, y: 100 } }],
      },
      {
        candidates: [{ finishReason: 'STOP' }],
        functionCalls: [{ name: 'click_at', args: { x: 100, y: 100 } }],
      },
      {
        candidates: [{ finishReason: 'STOP' }],
        functionCalls: [{ name: 'click_at', args: { x: 100, y: 100 } }],
      },
    ];

    const tool = buildTool();
    const result = await tool.execute(
      {
        goal: 'Do not loop forever',
        maxSteps: 8,
      },
      baseContext(),
    );

    expect(result.success).toBe(true);
    const data = (result as { data?: { blocked?: boolean; blockedReason?: string } }).data;
    expect(data?.blocked).toBe(true);
    expect(String(data?.blockedReason || '').toLowerCase()).toContain('loop detected');
  });

  it('persists checkpoint state and resumes from checkpoint without losing action history', async () => {
    hoisted.state.responses = [
      {
        candidates: [{ finishReason: 'STOP' }],
        functionCalls: [{ name: 'click_at', args: { x: 420, y: 360 } }],
      },
    ];

    const tool = buildTool();
    const firstRun = await tool.execute(
      {
        goal: 'Resume me later',
        maxSteps: 1,
      },
      baseContext(),
    );

    expect(firstRun.success).toBe(true);
    const firstData = (firstRun as {
      data?: {
        completed?: boolean;
        checkpointPath?: string;
        actions?: string[];
      };
    }).data;
    expect(firstData?.completed).toBe(false);
    expect(firstData?.checkpointPath).toBeTruthy();
    await access(String(firstData?.checkpointPath));
    expect((firstData?.actions || []).length).toBeGreaterThan(0);

    hoisted.state.responses = [
      {
        candidates: [{ content: { parts: [{ text: 'Finished after resume' }] } }],
        functionCalls: [],
      },
    ];

    const resumedRun = await tool.execute(
      {
        goal: 'Resume me later',
        maxSteps: 3,
        resumeFromCheckpoint: true,
      },
      baseContext(),
    );

    expect(resumedRun.success).toBe(true);
    const resumedData = (resumedRun as {
      data?: {
        completed?: boolean;
        resumedFromCheckpoint?: boolean;
        actions?: string[];
      };
    }).data;
    expect(resumedData?.resumedFromCheckpoint).toBe(true);
    expect(resumedData?.completed).toBe(true);
    expect((resumedData?.actions || []).length).toBeGreaterThan(0);
  });
});
