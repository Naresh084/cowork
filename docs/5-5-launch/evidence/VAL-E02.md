# VAL-E02 Evidence

## Validation Summary

- Reliability E2E verifies stalled run recovery interactions and run-state continuity behavior.

## Verification Commands

```bash
cd apps/desktop && pnpm playwright test e2e/reliability.spec.ts --config=playwright.reliability.local.config.ts
```

## Acceptance Mapping

- Plan acceptance criteria: Stream stall and recovery
- Result: Done.
