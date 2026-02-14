# Public API Schema Freeze (PH10-04)

Date: 2026-02-12
Status: Frozen for release candidate branch

## Frozen Surface

1. Tauri command schemas (`agent_*`, `deep_memory_*`) documented in `docs/5-5-launch/contracts/v2-contract-freeze.md`.
2. Sidecar IPC schemas (`run_*`, `memory_*`, `benchmark_*`, `release_gate_*`) documented in `docs/5-5-launch/contracts/v2-contract-freeze.md`.
3. Event schemas (`run:*`, `memory:*`, `branch:*`, `workflow:*`, `benchmark:*`, `release_gate:*`) documented in `docs/5-5-launch/contracts/v2-contract-freeze.md`.
4. Shared types (`Memory*`, `Run*`, `Branch*`, `Benchmark*`, `UxProfile`) frozen in `packages/shared/src/types/*`.

## Change Rule

- Additive-only changes are allowed after freeze.
- Any removal/retype requires release-gate exception + migration note.

## Verification

```bash
pnpm --filter @cowork/desktop typecheck
pnpm --filter @cowork/sidecar typecheck
cd apps/desktop/src-tauri && cargo check --quiet
```
