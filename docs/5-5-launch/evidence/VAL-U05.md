# VAL-U05 Evidence

## Validation Summary

- Policy explainability reason-code mapping tests pass for global deny, profile deny, and default ask paths.

## Verification Commands

```bash
cd apps/desktop/src-sidecar && pnpm test src/tool-policy.explainability.test.ts
```

## Acceptance Mapping

- Plan acceptance criteria: Policy reason-code mapping
- Result: Done.
