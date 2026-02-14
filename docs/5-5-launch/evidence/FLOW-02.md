# FLOW-02 Evidence

## Validation Summary

- Checkpoint resume and reliability E2E confirm long-run recovery behavior across interruptions.

## Verification Commands

```bash
cd apps/desktop/src-sidecar && pnpm test src/agent-runner.run-resume.test.ts
cd apps/desktop && pnpm playwright test e2e/reliability.spec.ts --config=playwright.reliability.local.config.ts
```

## Acceptance Mapping

- Plan acceptance criteria: Long multi-tool run with recovery flow
- Result: Done.
