# FLOW-05 Evidence

## Validation Summary

- Workflow pack run execution and resume/cancel mechanics are covered by E2E and sidecar tests.

## Verification Commands

```bash
cd apps/desktop && pnpm playwright test e2e/workflow.spec.ts --config=playwright.reliability.local.config.ts
cd apps/desktop/src-sidecar && pnpm test src/workflow/engine.resume.test.ts src/tools/workflow-tool.test.ts
```

## Acceptance Mapping

- Plan acceptance criteria: Workflow pack execution with resume/cancel path
- Result: Done.
