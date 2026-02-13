# Migration Rollback Pack (PH11-04)

Date: 2026-02-12

## Included Artifacts

1. Schema migration logic: `packages/storage/src/database.ts`.
2. Legacy import path: `apps/desktop/src-sidecar/src/memory/memory-service.ts`.
3. Migration diagnostics: `deep_memory_get_migration_report` command path.
4. Preservation tests:
   - `packages/storage/test/migration-preservation.test.ts`
   - `apps/desktop/src-sidecar/src/memory/memory-service.migration.test.ts`

## Rollback Procedure

1. Snapshot DB file (`~/.cowork/data.db`) before migration.
2. Execute migration in dry-run environment and validate diagnostics.
3. If corruption detected, restore snapshot and disable migration-triggering build.
4. Re-run preservation tests before next migration attempt.
