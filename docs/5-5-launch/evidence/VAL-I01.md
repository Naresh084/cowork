# VAL-I01 Evidence

## Validation Summary

- IPC handler command-path/idempotency validation plus Rust command-layer compilation verifies the v2 command bridge path.

## Verification Commands

```bash
cd apps/desktop/src-sidecar && pnpm test src/ipc-handler.idempotency.test.ts
cd apps/desktop/src-tauri && cargo check --quiet
```

## Acceptance Mapping

- Plan acceptance criteria: Tauri command to sidecar IPC v2 path
- Result: Done.
