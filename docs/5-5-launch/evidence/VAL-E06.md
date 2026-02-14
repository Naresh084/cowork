# VAL-E06 Evidence

## Validation Summary

- Workflow E2E validates draft/publish, run timeline completion, and recoverable resume flow.

## Verification Commands

```bash
cd apps/desktop && pnpm playwright test e2e/workflow.spec.ts --config=playwright.reliability.local.config.ts
```

## Acceptance Mapping

- Plan acceptance criteria: Workflow build/run/resume lifecycle
- Result: Done.
