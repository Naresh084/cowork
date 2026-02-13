import { describe, expect, it } from 'vitest';
import { ChaosFaultInjectedError, createChaosFaultInjector } from './fault-injector.js';

describe('ChaosFaultInjector', () => {
  it('injects provider throw faults', async () => {
    const injector = createChaosFaultInjector(() => 0);
    injector.registerRule({
      domain: 'provider',
      operationPattern: 'generate',
      mode: 'throw',
      probability: 1,
      errorMessage: 'provider fault injected',
    });

    await expect(
      injector.executeWithFault(
        { domain: 'provider', operation: 'generate-content' },
        async () => 'ok',
      ),
    ).rejects.toThrow(ChaosFaultInjectedError);

    const stats = injector.getStats();
    expect(stats.totalExecutions).toBe(1);
    expect(stats.totalInjected).toBe(1);
    expect(stats.byDomain.provider).toBe(1);
    expect(stats.byMode.throw).toBe(1);
  });

  it('injects network delay without failing the handler', async () => {
    const injector = createChaosFaultInjector(() => 0);
    injector.registerRule({
      domain: 'network',
      operationPattern: 'fetch',
      mode: 'delay',
      probability: 1,
      delayMs: 15,
    });

    const start = Date.now();
    const result = await injector.executeWithFault(
      { domain: 'network', operation: 'fetch-search' },
      async () => 'ok',
    );
    const elapsed = Date.now() - start;

    expect(result).toBe('ok');
    expect(elapsed).toBeGreaterThanOrEqual(10);
    expect(injector.getStats().byMode.delay).toBe(1);
  });

  it('injects storage timeout faults', async () => {
    const injector = createChaosFaultInjector(() => 0);
    injector.registerRule({
      domain: 'storage',
      operationPattern: 'checkpoint',
      mode: 'timeout',
      probability: 1,
      delayMs: 5,
    });

    await expect(
      injector.executeWithFault(
        { domain: 'storage', operation: 'write-checkpoint' },
        async () => 'ok',
      ),
    ).rejects.toThrow(/timeout/i);
    expect(injector.getStats().byDomain.storage).toBe(1);
  });

  it('injects ipc drop values with domain-specific fallback payload', async () => {
    const injector = createChaosFaultInjector(() => 0);
    injector.registerRule({
      domain: 'ipc',
      operationPattern: 'invoke',
      mode: 'drop',
      probability: 1,
      dropValueFactory: () => null,
    });

    const result = await injector.executeWithFault(
      { domain: 'ipc', operation: 'invoke:agent_send_message_v2' },
      async () => 'unexpected',
    );

    expect(result).toBeNull();
    expect(injector.getStats().byMode.drop).toBe(1);
  });

  it('honors probability and max activations limits', async () => {
    let randomValue = 0.99;
    const injector = createChaosFaultInjector(() => randomValue);
    injector.registerRule({
      domain: 'provider',
      operationPattern: 'generate',
      mode: 'throw',
      probability: 0.1,
      maxActivations: 1,
    });

    const first = await injector.executeWithFault(
      { domain: 'provider', operation: 'generate' },
      async () => 'pass-through',
    );
    expect(first).toBe('pass-through');

    randomValue = 0;
    await expect(
      injector.executeWithFault(
        { domain: 'provider', operation: 'generate' },
        async () => 'should-fail',
      ),
    ).rejects.toThrow(ChaosFaultInjectedError);

    randomValue = 0;
    const afterLimit = await injector.executeWithFault(
      { domain: 'provider', operation: 'generate' },
      async () => 'after-limit',
    );
    expect(afterLimit).toBe('after-limit');

    const stats = injector.getStats();
    expect(stats.totalExecutions).toBe(3);
    expect(stats.totalInjected).toBe(1);
    const ruleIds = Object.keys(stats.perRule);
    expect(ruleIds).toHaveLength(1);
    expect(stats.perRule[ruleIds[0]!]!.activations).toBe(1);
  });
});
