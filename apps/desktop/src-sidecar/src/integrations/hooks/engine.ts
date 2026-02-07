import { randomUUID } from 'crypto';
import { watch, type FSWatcher } from 'fs';
import type { IntegrationActionRequest, IntegrationActionResult } from '../types.js';
import type {
  IntegrationHookRule,
  IntegrationHookRun,
  IntegrationHookTriggerType,
} from '../store.js';
import { IntegrationHooksStore } from './store.js';

type TriggerHandle = {
  timer?: NodeJS.Timeout;
  watcher?: FSWatcher;
};

type IntegrationEventPayload = {
  eventType: 'incoming' | 'outgoing' | 'status';
  platform: string;
  payload: Record<string, unknown>;
};

export interface CreateHookRuleInput {
  name: string;
  enabled?: boolean;
  trigger: {
    type: IntegrationHookTriggerType;
    config?: Record<string, unknown>;
  };
  action: {
    type: 'integration_action' | 'tool_call';
    config?: Record<string, unknown>;
  };
}

export interface UpdateHookRuleInput {
  id: string;
  name?: string;
  enabled?: boolean;
  trigger?: {
    type: IntegrationHookTriggerType;
    config?: Record<string, unknown>;
  };
  action?: {
    type: 'integration_action' | 'tool_call';
    config?: Record<string, unknown>;
  };
}

export class IntegrationHookEngine {
  private handles = new Map<string, TriggerHandle>();
  private initialized = false;

  constructor(
    private readonly hooksStore: IntegrationHooksStore,
    private readonly runIntegrationAction: (
      request: IntegrationActionRequest,
    ) => Promise<IntegrationActionResult>,
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    for (const rule of this.hooksStore.listRules()) {
      await this.installRuleTrigger(rule);
    }
  }

  listRules(): IntegrationHookRule[] {
    return this.hooksStore.listRules();
  }

  listRuns(ruleId?: string): IntegrationHookRun[] {
    return this.hooksStore.listRuns(ruleId);
  }

  async createRule(input: CreateHookRuleInput): Promise<IntegrationHookRule> {
    const now = Date.now();
    const rule: IntegrationHookRule = {
      id: `hook_${randomUUID()}`,
      name: input.name.trim(),
      enabled: input.enabled !== false,
      trigger: {
        type: input.trigger.type,
        config: input.trigger.config || {},
      },
      action: {
        type: input.action.type,
        config: input.action.config || {},
      },
      createdAt: now,
      updatedAt: now,
    };
    await this.hooksStore.upsertRule(rule);
    await this.installRuleTrigger(rule);
    return rule;
  }

  async updateRule(input: UpdateHookRuleInput): Promise<IntegrationHookRule> {
    const existing = this.hooksStore.getRule(input.id);
    if (!existing) {
      throw new Error(`Hook rule not found: ${input.id}`);
    }

    const updated: IntegrationHookRule = {
      ...existing,
      name: typeof input.name === 'string' ? input.name.trim() || existing.name : existing.name,
      enabled: typeof input.enabled === 'boolean' ? input.enabled : existing.enabled,
      trigger: input.trigger
        ? {
            type: input.trigger.type,
            config: input.trigger.config || {},
          }
        : existing.trigger,
      action: input.action
        ? {
            type: input.action.type,
            config: input.action.config || {},
          }
        : existing.action,
      updatedAt: Date.now(),
    };

    await this.hooksStore.upsertRule(updated);
    this.uninstallRuleTrigger(updated.id);
    await this.installRuleTrigger(updated);
    return updated;
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.uninstallRuleTrigger(ruleId);
    await this.hooksStore.deleteRule(ruleId);
  }

  async runNow(ruleId: string): Promise<IntegrationHookRun> {
    const rule = this.hooksStore.getRule(ruleId);
    if (!rule) {
      throw new Error(`Hook rule not found: ${ruleId}`);
    }
    return this.executeRule(rule, {
      eventType: 'status',
      platform: 'manual',
      payload: {},
    });
  }

  async notifyIntegrationEvent(event: IntegrationEventPayload): Promise<void> {
    const rules = this.hooksStore.listRules();
    for (const rule of rules) {
      if (!rule.enabled || rule.trigger.type !== 'integration_event') continue;
      const triggerEventType =
        typeof rule.trigger.config?.eventType === 'string'
          ? String(rule.trigger.config?.eventType).toLowerCase()
          : '';
      const triggerPlatform =
        typeof rule.trigger.config?.platform === 'string'
          ? String(rule.trigger.config?.platform).toLowerCase()
          : '';
      if (triggerEventType && triggerEventType !== event.eventType) continue;
      if (triggerPlatform && triggerPlatform !== event.platform.toLowerCase()) continue;
      await this.executeRule(rule, event);
    }
  }

  private uninstallRuleTrigger(ruleId: string): void {
    const handle = this.handles.get(ruleId);
    if (!handle) return;
    if (handle.timer) clearInterval(handle.timer);
    if (handle.watcher) handle.watcher.close();
    this.handles.delete(ruleId);
  }

  private async installRuleTrigger(rule: IntegrationHookRule): Promise<void> {
    this.uninstallRuleTrigger(rule.id);
    if (!rule.enabled) return;

    if (rule.trigger.type === 'cron') {
      const intervalSeconds = Number(rule.trigger.config?.intervalSeconds || 0);
      if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
        return;
      }
      const timer = setInterval(() => {
        void this.executeRule(rule, {
          eventType: 'status',
          platform: 'cron',
          payload: { intervalSeconds },
        });
      }, Math.max(5, intervalSeconds) * 1000);
      this.handles.set(rule.id, { timer });
      return;
    }

    if (rule.trigger.type === 'path') {
      const pathValue = String(rule.trigger.config?.path || '').trim();
      if (!pathValue) return;
      const watcher = watch(pathValue, (_eventType, filename) => {
        void this.executeRule(rule, {
          eventType: 'status',
          platform: 'path',
          payload: {
            filename: filename ? String(filename) : undefined,
          },
        });
      });
      this.handles.set(rule.id, { watcher });
      return;
    }
  }

  private async executeRule(
    rule: IntegrationHookRule,
    event: IntegrationEventPayload,
  ): Promise<IntegrationHookRun> {
    const startedAt = Date.now();
    const runId = `hookrun_${randomUUID()}`;
    let status: 'success' | 'error' = 'success';
    let error: string | undefined;
    let result: unknown;

    try {
      if (rule.action.type === 'integration_action') {
        const cfg = rule.action.config || {};
        const request: IntegrationActionRequest = {
          channel: String(cfg.channel || event.platform || '').trim(),
          action: String(cfg.action || 'send') as IntegrationActionRequest['action'],
          target:
            cfg.target && typeof cfg.target === 'object' && !Array.isArray(cfg.target)
              ? (cfg.target as IntegrationActionRequest['target'])
              : undefined,
          payload:
            cfg.payload && typeof cfg.payload === 'object' && !Array.isArray(cfg.payload)
              ? (cfg.payload as IntegrationActionRequest['payload'])
              : undefined,
        };
        result = await this.runIntegrationAction(request);
        if (!result || (result as IntegrationActionResult).success !== true) {
          status = 'error';
          error = (result as IntegrationActionResult | undefined)?.reason || 'Integration action failed';
        }
      } else {
        status = 'error';
        error = 'tool_call hook action is not implemented in this phase';
      }
    } catch (runError) {
      status = 'error';
      error = runError instanceof Error ? runError.message : String(runError);
    }

    const run: IntegrationHookRun = {
      id: runId,
      ruleId: rule.id,
      status,
      startedAt,
      finishedAt: Date.now(),
      error,
      result,
    };

    await this.hooksStore.addRun(run);
    return run;
  }
}

