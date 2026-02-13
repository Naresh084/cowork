# V2 Contract Freeze

Date: 2026-02-12  
Status: Frozen for launch branch (breaking changes require release-gate exception)

## Scope

This document freezes month-1 command/type/event contracts for v2 interfaces and establishes compatibility policy for transport envelopes and payload evolution.

## 1. Tauri Command Contract (Frozen)

### Agent + Session

1. `agent_send_message_v2(session_id, message, run_options)`
2. `agent_resume_run(session_id, run_id)`
3. `agent_branch_session(session_id, from_turn_id, branch_name)`
4. `agent_merge_branch(session_id, source_branch_id, target_branch_id, strategy)`
5. `agent_get_run_timeline(run_id)`

### Memory

1. `deep_memory_query(session_id, query, options)`
2. `deep_memory_feedback(session_id, query_id, atom_id, feedback)`
3. `deep_memory_export_bundle(project_id, path, encrypted)`
4. `deep_memory_import_bundle(project_id, path, merge_mode)`
5. `deep_memory_get_migration_report(project_id?)`

### Benchmark + Release Gate

1. `agent_run_benchmark(suite_id, profile)`
2. `agent_get_release_gate_status()`
3. `agent_assert_release_gate()`

## 2. Sidecar IPC Contract (Frozen)

1. `run_start_v2`
2. `run_resume_from_checkpoint`
3. `run_get_timeline`
4. `session_branch_create`
5. `session_branch_merge`
6. `memory_retrieve_pack`
7. `memory_write_atoms`
8. `memory_consolidate`
9. `workflow_pack_execute`
10. `research_wide_run`
11. `benchmark_run_suite`
12. `release_gate_evaluate`
13. `deep_memory_get_migration_report`

## 3. Event Contract (Frozen)

### Run and Reliability

1. `run:checkpoint`
2. `run:recovered`
3. `run:fallback_applied`
4. `run:stalled`
5. `run:health`

### Memory Lifecycle

1. `memory:retrieved`
2. `memory:consolidated`
3. `memory:conflict_detected`

### Branch + Workflow

1. `branch:created`
2. `branch:merged`
3. `workflow:activated`
4. `workflow:fallback`

### Benchmark + Gate

1. `benchmark:progress`
2. `benchmark:score_updated`
3. `release_gate:status`

## 4. Type Contract (Frozen)

1. `MemoryAtom`
2. `MemoryEdge`
3. `MemoryQueryResult`
4. `MemoryFeedback`
5. `RunCheckpoint`
6. `RunRecoveryState`
7. `BranchSession`
8. `BranchMergeResult`
9. `BenchmarkSuite`
10. `BenchmarkRun`
11. `BenchmarkScorecard`
12. `UxProfile = "simple" | "pro"`

## 5. Naming Policy (Frozen)

1. Commands use verb-first snake_case with area prefixes (`agent_`, `deep_memory_`).
2. Sidecar IPC methods use domain-first snake_case (`run_*`, `memory_*`, `session_branch_*`).
3. Event names use `domain:action` lowercase convention.
4. No ambiguous aliases; each external name has one canonical form.

## 6. Compatibility Policy

1. Additive changes only for frozen contract payloads until next major.
2. Existing fields cannot be removed or retyped.
3. New optional fields must default safely when absent.
4. Event consumers must ignore unknown fields and unknown event variants.
5. Any breaking change requires:
   - release-gate exception,
   - migration note,
   - dual-write/dual-read window where possible.

## 7. Change Control

1. Contract edits require approval from `ARCH + RUNTIME + RUST + UX`.
2. Every contract change must include:
   - schema/type update,
   - transport validation update,
   - integration test update,
   - release-note entry.
