# VAL-B02 Evidence

## Validation Summary

- Fault-injection chaos scenarios pass for provider/network/storage/IPC failure classes.

## Verification Commands

```bash
cd apps/desktop/src-sidecar && pnpm test src/chaos/fault-injector.test.ts
```

## Acceptance Mapping

- Plan acceptance criteria: Reliability chaos (network/provider)
- Result: Done.
