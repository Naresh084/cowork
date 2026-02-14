# DOD-03 Evidence

## Validation Summary

- Migration behavior validated for both clean and legacy paths:
  - clean schema + repository integration tests,
  - legacy-to-v6 preservation/migration tests.

## Verification Commands

```bash
pnpm --filter @cowork/storage test
cd apps/desktop/src-sidecar && pnpm test src/memory/memory-service.migration.test.ts
```

## Acceptance Mapping

- Plan acceptance criteria: Migration passes on clean + legacy datasets.
- Result: Done.

