import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScheduleTaskTool } from './cron-tool.js';
import { workflowService } from '../workflow/index.js';
import { decodeSessionPermissionBootstrap } from '../permission-bootstrap.js';

const baseContext = {
  workingDirectory: process.cwd(),
  sessionId: 'session_test',
  agentId: 'agent_test',
};

describe('cron-tool schedule_task temporal grounding', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('injects temporal grounding and defaults recurring schedules to local timezone', async () => {
    const nextRunAt = Date.now() + 60 * 60 * 1000;
    const createDraftSpy = vi
      .spyOn(workflowService, 'createDraft')
      .mockImplementation((input: unknown) => ({ id: 'wf_daily', ...(input as object) }) as never);
    vi.spyOn(workflowService, 'publish').mockReturnValue({
      id: 'wf_daily',
      version: 1,
      name: 'Daily Deep Research',
    } as never);
    vi.spyOn(workflowService, 'listScheduledTasks').mockReturnValue([
      {
        workflowId: 'wf_daily',
        workflowVersion: 1,
        name: 'Daily Deep Research',
        status: 'published',
        schedules: [],
        enabled: true,
        nextRunAt,
        runCount: 0,
        lastRunAt: null,
        lastRunStatus: null,
      },
    ] as never);

    const tool = createScheduleTaskTool(() => ({
      platform: 'slack',
      chatId: 'C123456',
      senderName: 'Ops',
    }), () => ({
      version: 1,
      sourceSessionId: 'session_test',
      approvalMode: 'auto',
      permissionScopes: {
        shell_execute: ['/usr/local/bin'],
      },
      permissionCache: {
        'shell_execute:ls /usr/local/bin': 'allow_session',
      },
      createdAt: Date.now(),
    }));

    const result = await tool.execute(
      {
        name: 'Daily Deep Research',
        prompt: 'Give me detailed deep research updates every day.',
        schedule: {
          type: 'daily',
          time: '09:00',
        },
      },
      baseContext,
    );

    expect(result.success).toBe(true);
    expect(createDraftSpy).toHaveBeenCalledTimes(1);

    const draftInput = createDraftSpy.mock.calls[0]?.[0] as {
      triggers: Array<{ schedule: { timezone?: string } }>;
      nodes: Array<{ type: string; config: { promptTemplate?: string } }>;
    };

    const expectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    expect(draftInput.triggers[0]?.schedule.timezone).toBe(expectedTimezone);
    const permissionsProfile = (draftInput as { permissionsProfile?: string }).permissionsProfile;
    expect(typeof permissionsProfile).toBe('string');
    const decoded = decodeSessionPermissionBootstrap(permissionsProfile);
    expect(decoded?.sourceSessionId).toBe('session_test');
    expect(decoded?.permissionScopes.shell_execute).toContain('/usr/local/bin');

    const promptTemplate =
      draftInput.nodes.find((node) => node.type === 'agent_step')?.config.promptTemplate || '';
    expect(promptTemplate).toContain('Temporal execution contract for this scheduled task:');
    expect(promptTemplate).toContain('{{system.now}}');
    expect(promptTemplate).toContain('Never use relative-only dates');
    expect(promptTemplate).toContain('YYYY-MM-DD');
    expect(promptTemplate).toContain('send_notification_slack');

    const resultData = (result as { data?: Record<string, unknown> }).data || {};
    expect(resultData.timezone).toBe(expectedTimezone);
    expect(resultData.inheritedPermissionPolicy).toBe(true);
    expect(resultData.nextRunAtIso).toBe(new Date(nextRunAt).toISOString());
    expect(String(resultData.message || '')).toContain('Next run target:');
  });

  it('preserves explicit timezone for recurring schedule input', async () => {
    const createDraftSpy = vi
      .spyOn(workflowService, 'createDraft')
      .mockImplementation((input: unknown) => ({ id: 'wf_weekly', ...(input as object) }) as never);
    vi.spyOn(workflowService, 'publish').mockReturnValue({
      id: 'wf_weekly',
      version: 1,
      name: 'Weekly Review',
    } as never);
    vi.spyOn(workflowService, 'listScheduledTasks').mockReturnValue([] as never);

    const tool = createScheduleTaskTool();
    const result = await tool.execute(
      {
        name: 'Weekly Review',
        prompt: 'Run weekly review workflow and summarize blockers.',
        schedule: {
          type: 'weekly',
          dayOfWeek: 'monday',
          time: '08:30',
          timezone: 'Asia/Kolkata',
        },
      },
      baseContext,
    );

    expect(result.success).toBe(true);
    const draftInput = createDraftSpy.mock.calls[0]?.[0] as {
      triggers: Array<{ schedule: { timezone?: string } }>;
    };
    expect(draftInput.triggers[0]?.schedule.timezone).toBe('Asia/Kolkata');
  });

  it('does not duplicate delivery instructions when prompt already includes explicit notification tool', async () => {
    const createDraftSpy = vi
      .spyOn(workflowService, 'createDraft')
      .mockImplementation((input: unknown) => ({ id: 'wf_notify', ...(input as object) }) as never);
    vi.spyOn(workflowService, 'publish').mockReturnValue({
      id: 'wf_notify',
      version: 1,
      name: 'Explicit Notify',
    } as never);
    vi.spyOn(workflowService, 'listScheduledTasks').mockReturnValue([] as never);

    const tool = createScheduleTaskTool(() => ({
      platform: 'slack',
      chatId: 'C123456',
    }));

    const result = await tool.execute(
      {
        name: 'Explicit Notify',
        prompt:
          'Collect update and send via send_notification_telegram with chatId "ops-room".',
        schedule: {
          type: 'interval',
          every: 30,
        },
      },
      baseContext,
    );

    expect(result.success).toBe(true);
    const draftInput = createDraftSpy.mock.calls[0]?.[0] as {
      nodes: Array<{ type: string; config: { promptTemplate?: string } }>;
    };
    const promptTemplate =
      draftInput.nodes.find((node) => node.type === 'agent_step')?.config.promptTemplate || '';
    expect(promptTemplate).toContain('send_notification_telegram');
    expect(promptTemplate).not.toContain('Delivery requirement for this scheduled task:');
  });
});
