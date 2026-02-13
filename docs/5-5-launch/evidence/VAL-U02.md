# VAL-U02 Evidence

## Validation Summary

- Retry profile timing, idempotent command replay, and sandbox idempotency behavior are verified.

## Verification Commands

```bash
cd apps/desktop/src-sidecar && pnpm test src/workflow/retry-policy.profile.test.ts src/ipc-handler.idempotency.test.ts
pnpm --filter @gemini-cowork/sandbox test -- src/validator.test.ts src/executor.test.ts
```

## Acceptance Mapping

- Plan acceptance criteria: Retry/backoff/idempotency math
- Result: Done.
