import type {
  ChaosDomain,
  ChaosExecutionContext,
  ChaosMode,
  ChaosRule,
  ChaosStats,
} from './types.js';

export class ChaosFaultInjectedError extends Error {
  readonly domain: ChaosDomain;
  readonly mode: ChaosMode;
  readonly ruleId: string;

  constructor(domain: ChaosDomain, mode: ChaosMode, ruleId: string, message: string) {
    super(message);
    this.name = 'ChaosFaultInjectedError';
    this.domain = domain;
    this.mode = mode;
    this.ruleId = ruleId;
  }
}

interface RegisteredRule {
  id: string;
  config: ChaosRule;
  matcher?: RegExp;
  activations: number;
  lastActivatedAt?: number;
}

type RandomSource = () => number;

const DEFAULT_STATS_BY_DOMAIN: Record<ChaosDomain, number> = {
  provider: 0,
  network: 0,
  storage: 0,
  ipc: 0,
};

const DEFAULT_STATS_BY_MODE: Record<ChaosMode, number> = {
  throw: 0,
  delay: 0,
  timeout: 0,
  drop: 0,
};

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeMatcher(pattern?: string | RegExp): RegExp | undefined {
  if (!pattern) return undefined;
  if (pattern instanceof RegExp) return pattern;
  const trimmed = pattern.trim();
  if (!trimmed) return undefined;
  return new RegExp(trimmed, 'i');
}

function sleep(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class ChaosFaultInjector {
  private readonly random: RandomSource;
  private readonly rules: Map<string, RegisteredRule> = new Map();
  private ruleCounter = 0;
  private totalExecutions = 0;
  private totalInjected = 0;
  private readonly byDomain: Record<ChaosDomain, number> = { ...DEFAULT_STATS_BY_DOMAIN };
  private readonly byMode: Record<ChaosMode, number> = { ...DEFAULT_STATS_BY_MODE };

  constructor(randomSource: RandomSource = Math.random) {
    this.random = randomSource;
  }

  registerRule(rule: ChaosRule): string {
    const id = rule.id?.trim() || `chaos-rule-${++this.ruleCounter}`;
    const normalized: RegisteredRule = {
      id,
      config: {
        ...rule,
        probability: clampProbability(rule.probability),
      },
      matcher: normalizeMatcher(rule.operationPattern),
      activations: 0,
    };
    this.rules.set(id, normalized);
    return id;
  }

  clearRules(): void {
    this.rules.clear();
  }

  listRules(): ChaosRule[] {
    return Array.from(this.rules.values()).map((entry) => ({
      ...entry.config,
      id: entry.id,
    }));
  }

  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  getStats(): ChaosStats {
    const perRule: ChaosStats['perRule'] = {};
    for (const [ruleId, rule] of this.rules.entries()) {
      perRule[ruleId] = {
        activations: rule.activations,
        lastActivatedAt: rule.lastActivatedAt,
      };
    }
    return {
      totalExecutions: this.totalExecutions,
      totalInjected: this.totalInjected,
      byDomain: { ...this.byDomain },
      byMode: { ...this.byMode },
      perRule,
    };
  }

  async executeWithFault<T>(
    context: ChaosExecutionContext,
    handler: () => Promise<T> | T,
  ): Promise<T> {
    this.totalExecutions += 1;

    const matching = Array.from(this.rules.values()).filter((rule) => {
      if (rule.config.domain !== context.domain) return false;
      if (rule.matcher && !rule.matcher.test(context.operation)) return false;
      if (
        typeof rule.config.maxActivations === 'number' &&
        rule.config.maxActivations >= 0 &&
        rule.activations >= rule.config.maxActivations
      ) {
        return false;
      }
      return true;
    });

    for (const rule of matching) {
      if (this.random() > clampProbability(rule.config.probability)) {
        continue;
      }

      rule.activations += 1;
      rule.lastActivatedAt = Date.now();
      this.totalInjected += 1;
      this.byDomain[context.domain] += 1;
      this.byMode[rule.config.mode] += 1;

      const delayMs = Number.isFinite(rule.config.delayMs) ? Math.max(0, rule.config.delayMs || 0) : 0;

      switch (rule.config.mode) {
        case 'delay': {
          await sleep(delayMs);
          break;
        }
        case 'throw': {
          throw new ChaosFaultInjectedError(
            context.domain,
            'throw',
            rule.id,
            rule.config.errorMessage || `Injected ${context.domain} fault for ${context.operation}`,
          );
        }
        case 'timeout': {
          await sleep(delayMs > 0 ? delayMs : 1_000);
          throw new ChaosFaultInjectedError(
            context.domain,
            'timeout',
            rule.id,
            rule.config.errorMessage || `Injected ${context.domain} timeout for ${context.operation}`,
          );
        }
        case 'drop': {
          if (rule.config.dropValueFactory) {
            return rule.config.dropValueFactory(context) as T;
          }
          throw new ChaosFaultInjectedError(
            context.domain,
            'drop',
            rule.id,
            rule.config.errorMessage || `Injected ${context.domain} drop for ${context.operation}`,
          );
        }
        default:
          break;
      }
    }

    return await handler();
  }
}

export function createChaosFaultInjector(randomSource?: RandomSource): ChaosFaultInjector {
  return new ChaosFaultInjector(randomSource);
}
