# VAL-U04 Evidence

## Validation Summary

- Added and validated conflict-aware branch merge behavior for auto/manual conflict status and explicit ours/theirs resolution.

## Verification Commands

```bash
cd apps/desktop/src-sidecar && pnpm test src/agent-runner.run-resume.test.ts
```

## Acceptance Mapping

- Plan acceptance criteria: Branch merge conflict selection logic
- Result: Done.
