# VAL-U01 Evidence

## Validation Summary

- Provider taxonomy mapping and retry-hint fixtures pass in both sidecar and provider package tests.

## Verification Commands

```bash
cd apps/desktop/src-sidecar && pnpm test src/providers/gemini-provider.taxonomy.test.ts
pnpm --filter @cowork/providers test -- src/gemini/gemini-provider.test.ts
```

## Acceptance Mapping

- Plan acceptance criteria: Provider taxonomy mapping
- Result: Done.
