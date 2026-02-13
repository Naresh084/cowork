# Risk Mitigation Validation (RISK-01..RISK-06)

Date: 2026-02-12

## RISK-01 Integration Complexity

- Mitigation tracking: `docs/5-5-launch/governance/risk-register.md`.
- Cross-surface E2E validation executed in one matrix run:
  - onboarding, reliability, memory, branching, workflow, browser operator.

## RISK-02 Migration Corruption

- Dry-run and preservation tests:
  - `packages/storage/test/migration-preservation.test.ts`
  - `apps/desktop/src-sidecar/src/memory/memory-service.migration.test.ts`

## RISK-03 Provider API Drift

- Structured provider taxonomy + retry hint tests:
  - `apps/desktop/src-sidecar/src/providers/gemini-provider.taxonomy.test.ts`
  - `packages/providers/src/gemini/gemini-provider.test.ts`

## RISK-04 UI Complexity Creep

- Simple-path E2E and profile behavior validation:
  - `apps/desktop/e2e/onboarding.spec.ts`
  - `apps/desktop/e2e/reliability.spec.ts`

## RISK-05 Benchmark Overfitting

- Holdout governance policy: `docs/5-5-launch/governance/holdout-governance.md`.
- Deterministic benchmark suite distribution and regression checks:
  - `apps/desktop/src-sidecar/src/benchmark/suites/twin-track-core.test.ts`
  - `apps/desktop/src-sidecar/src/benchmark/runner.regression.test.ts`

## RISK-06 Security Regression Enforcement

- CI gate and audit enforcement path:
  - `.github/workflows/quality-gates.yml`
  - `pnpm audit --audit-level high --prod` (must pass before release)
