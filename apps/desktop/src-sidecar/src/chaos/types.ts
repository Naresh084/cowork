export type ChaosDomain = 'provider' | 'network' | 'storage' | 'ipc';

export type ChaosMode = 'throw' | 'delay' | 'timeout' | 'drop';

export interface ChaosExecutionContext {
  domain: ChaosDomain;
  operation: string;
  attempt?: number;
  metadata?: Record<string, unknown>;
}

export interface ChaosRule {
  id?: string;
  domain: ChaosDomain;
  operationPattern?: string | RegExp;
  mode: ChaosMode;
  probability: number;
  delayMs?: number;
  maxActivations?: number;
  errorMessage?: string;
  dropValueFactory?: (context: ChaosExecutionContext) => unknown;
}

export interface ChaosRuleState {
  activations: number;
  lastActivatedAt?: number;
}

export interface ChaosStats {
  totalExecutions: number;
  totalInjected: number;
  byDomain: Record<ChaosDomain, number>;
  byMode: Record<ChaosMode, number>;
  perRule: Record<string, ChaosRuleState>;
}
