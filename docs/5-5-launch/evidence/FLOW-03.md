# FLOW-03 Evidence

## Validation Summary

- Hybrid memory retrieval and user feedback loop are validated in unit and E2E layers.

## Verification Commands

```bash
cd apps/desktop/src-sidecar && pnpm test src/memory/semantic-memory-extractor.test.ts src/memory/memory-service.hybrid.test.ts
cd apps/desktop && pnpm playwright test e2e/memory.spec.ts --config=playwright.reliability.local.config.ts
```

## Acceptance Mapping

- Plan acceptance criteria: Memory-driven continuation loop with feedback effect
- Result: Done.
