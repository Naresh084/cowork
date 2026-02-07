import type {
  IntegrationHookRule,
  IntegrationHookRun,
} from '../store.js';
import type { IntegrationStore } from '../store.js';

export class IntegrationHooksStore {
  constructor(private readonly store: IntegrationStore) {}

  listRules(): IntegrationHookRule[] {
    return this.store.listHookRules();
  }

  getRule(ruleId: string): IntegrationHookRule | null {
    return this.store.getHookRule(ruleId);
  }

  async upsertRule(rule: IntegrationHookRule): Promise<void> {
    await this.store.upsertHookRule(rule);
  }

  async deleteRule(ruleId: string): Promise<void> {
    await this.store.deleteHookRule(ruleId);
  }

  listRuns(ruleId?: string): IntegrationHookRun[] {
    return this.store.listHookRuns(ruleId);
  }

  async addRun(run: IntegrationHookRun): Promise<void> {
    await this.store.addHookRun(run);
  }
}

