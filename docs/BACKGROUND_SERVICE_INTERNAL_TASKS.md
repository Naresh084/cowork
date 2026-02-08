# Background Service Migration - Internal Execution Runbook

This runbook expands the master phase plan into atomic internal tasks so no engineering, QA, security, packaging, or rollout step is missed.

## How to Use This Document

- Treat this file as the implementation checklist.
- Complete tasks in ID order unless dependency says otherwise.
- Do not mark a task complete without evidence.
- Keep a per-task evidence log in `docs/migration-evidence/<task-id>.md`.
- If a task fails verification, reopen it and linked dependents.

## Internal Ownership Model

- `ARCH`: architecture and runtime refactor.
- `DAEMON`: daemon process, IPC server, orchestration.
- `RUST`: Tauri/Rust transport and service management.
- `UI`: React stores, hooks, and reconnect UX.
- `STATE`: persistence, replay cursor, bootstrap state.
- `SEC`: security, auth token, credential scopes.
- `OPS`: packaging, installers, release operations.
- `QA`: automated/manual validation and evidence.

## Global Internal Tasks (Cross-Phase)

- [ ] `INT-G-001` (`ARCH`) Create migration ADR with frozen decisions on daemon-first architecture, compatibility constraints, and fallback strategy.
- [ ] `INT-G-002` (`ARCH`) Define schema versioning policy for session/runtime persistence with forward/backward compatibility rules.
- [ ] `INT-G-003` (`STATE`) Add migration metadata table for daemon/service mode in persistence storage.
- [ ] `INT-G-004` (`QA`) Create canonical golden traces for chat streaming, tool calls, permissions, and question flows to compare pre/post migration behavior.
- [ ] `INT-G-005` (`OPS`) Create release branch map and merge gates for `p0-p2`, `p3-p5`, `p6-p8`, `p9-p11`.
- [ ] `INT-G-006` (`SEC`) Produce threat model for local IPC, credential stores, and remote tunnel controls.
- [ ] `INT-G-007` (`QA`) Add test data seeds for multi-session, long-running turn, pending permission, and pending question scenarios.
- [ ] `INT-G-008` (`OPS`) Define evidence retention and artifact naming standard for CI and manual verification.
- [ ] `INT-G-009` (`ARCH`) Define kill-switch and fallback behavior matrix for every migration feature flag.
- [ ] `INT-G-010` (`OPS`) Create rollback runbook for transport fallback, service disable, and daemon binary replacement.
- [ ] `INT-G-011` (`QA`) Define target latency budgets for bootstrap hydration and reconnect replay.
- [ ] `INT-G-012` (`SEC`) Define audit logging minimum set for security-sensitive actions (service mode switch, credential promotion, remote tunnel enable).

## Phase 0 Internal Tasks - Contract Freeze and Hardening

- [ ] `INT-P0-001` (`ARCH`) Generate Rust command manifest from all `#[tauri::command]` functions with request/response schema notes.
- [ ] `INT-P0-002` (`ARCH`) Generate sidecar command manifest from `ipc-handler.ts` handlers and normalize command naming.
- [ ] `INT-P0-003` (`ARCH`) Generate event manifest from sidecar emitter and frontend event consumers; map producer to consumer.
- [ ] `INT-P0-004` (`QA`) Build contract snapshot tests for commands and events against current stdio sidecar path.
- [ ] `INT-P0-005` (`QA`) Capture baseline behavior traces for send message, live stream, tool call, pending permission, pending question.
- [ ] `INT-P0-006` (`UI`) Define no-regression UX checklist with explicit acceptance per component and interaction.
- [ ] `INT-P0-007` (`ARCH`) Resolve any command naming drift now; add compatibility aliases where renaming is unavoidable.
- [ ] `INT-P0-008` (`OPS`) Add feature flags with documented defaults and runtime override locations.
- [ ] `INT-P0-009` (`QA`) Add CI job to fail on command/event contract drift unless manifest intentionally updated.
- [ ] `INT-P0-010` (`OPS`) Establish migration dashboard file tracking task completion and blocked items.

## Phase 1 Internal Tasks - Runtime Extraction Without Behavior Change

- [ ] `INT-P1-001` (`ARCH`) Inventory all startup side effects currently in `index.ts` and classify into runtime boot vs transport boot.
- [ ] `INT-P1-002` (`ARCH`) Introduce runtime bootstrap module that receives pluggable ingress/egress adapters.
- [ ] `INT-P1-003` (`ARCH`) Define `TransportAdapter` interface with lifecycle methods and error callbacks.
- [ ] `INT-P1-004` (`ARCH`) Implement stdio adapter with identical JSON-RPC framing and shutdown semantics.
- [ ] `INT-P1-005` (`ARCH`) Refactor event emitter into sink fan-out bus with ordering guarantee and sink isolation.
- [ ] `INT-P1-006` (`ARCH`) Add sink backpressure strategy (bounded queue + drop policy + diagnostics).
- [ ] `INT-P1-007` (`QA`) Add unit tests for runtime boot, adapter wiring, event fan-out, and ordering.
- [ ] `INT-P1-008` (`QA`) Replay golden traces from Phase 0 and ensure output parity in stdio mode.
- [ ] `INT-P1-009` (`OPS`) Add logging tags that identify active transport and runtime mode.
- [ ] `INT-P1-010` (`ARCH`) Confirm `ipc-handler.ts` remains the single router path and no command logic moved into transport layer.

## Phase 2 Internal Tasks - Daemon Process and Local Control Plane

- [ ] `INT-P2-001` (`DAEMON`) Add daemon entrypoint script and process lifecycle manager independent from stdin.
- [ ] `INT-P2-002` (`DAEMON`) Implement platform socket endpoint strategy with deterministic path naming and cleanup.
- [ ] `INT-P2-003` (`DAEMON`) Implement startup lock/PID guard to prevent multiple daemon instances.
- [ ] `INT-P2-004` (`DAEMON`) Build JSON-RPC local IPC server transport with request correlation and timeout handling.
- [ ] `INT-P2-005` (`DAEMON`) Add authenticated event subscription channel for local clients.
- [ ] `INT-P2-006` (`DAEMON`) Implement health/readiness state machine with explicit boot phases.
- [ ] `INT-P2-007` (`STATE`) Persist daemon runtime identity and startup timestamp for diagnostics.
- [ ] `INT-P2-008` (`QA`) Add integration tests for full command round-trip over local IPC on host OS.
- [ ] `INT-P2-009` (`QA`) Add resilience tests for client disconnect/reconnect and daemon socket restart.
- [ ] `INT-P2-010` (`OPS`) Add daemon startup logs and failure diagnostics with actionable error codes.

## Phase 3 Internal Tasks - Runtime Snapshot, Cursor, and Replay

- [ ] `INT-P3-001` (`STATE`) Add `SessionRuntimeState` schema with explicit version and migration hooks.
- [ ] `INT-P3-002` (`STATE`) Implement deterministic snapshot builder from live in-memory run state.
- [ ] `INT-P3-003` (`STATE`) Add persistence write path for runtime snapshots on every significant state transition.
- [ ] `INT-P3-004` (`STATE`) Add cold-start load path restoring runtime snapshots before accepting requests.
- [ ] `INT-P3-005` (`STATE`) Add monotonic sequence IDs for all outbound event envelopes.
- [ ] `INT-P3-006` (`STATE`) Add replay buffer storage with retention policy and pruning logic.
- [ ] `INT-P3-007` (`STATE`) Implement `agent_get_bootstrap_state` returning sessions + runtime + pending interactions + cursor.
- [ ] `INT-P3-008` (`STATE`) Implement `agent_get_events_since` with strict range semantics and stale-cursor response code.
- [ ] `INT-P3-009` (`QA`) Add crash simulation tests proving runtime snapshot recovery after daemon restart.
- [ ] `INT-P3-010` (`QA`) Add replay correctness tests for gapless catch-up and duplicate suppression.

## Phase 4 Internal Tasks - Rust Transport Migration

- [ ] `INT-P4-001` (`RUST`) Add daemon client module for local IPC request/response and event streaming.
- [ ] `INT-P4-002` (`RUST`) Define unified transport trait implemented by daemon client and legacy sidecar manager.
- [ ] `INT-P4-003` (`RUST`) Integrate daemon-first connection flow with exponential backoff and diagnostics.
- [ ] `INT-P4-004` (`RUST`) Wire feature-flagged fallback to embedded sidecar when daemon unavailable.
- [ ] `INT-P4-005` (`RUST`) Keep existing command modules API-stable and route transport changes behind abstraction.
- [ ] `INT-P4-006` (`RUST`) Map daemon event envelopes back into existing `agent:*` frontend event names.
- [ ] `INT-P4-007` (`RUST`) Add startup status events for UI diagnostics without breaking existing listeners.
- [ ] `INT-P4-008` (`QA`) Run command manifest compatibility tests against daemon and fallback paths.
- [ ] `INT-P4-009` (`QA`) Add failure-path tests: daemon down, stale socket, auth failure, fallback disabled.
- [ ] `INT-P4-010` (`OPS`) Add telemetry counters for daemon connect success, fallback activation, and transport errors.

## Phase 5 Internal Tasks - Frontend Hydration and Reconnect Parity

- [ ] `INT-P5-001` (`UI`) Add startup bootstrap call path in `session-store` before attaching live event listeners.
- [ ] `INT-P5-002` (`UI`) Extend `chat-store` hydration logic to ingest `SessionRuntimeState`.
- [ ] `INT-P5-003` (`UI`) Add catch-up flow in `useAgentEvents` using stored cursor then switch to live subscribe.
- [ ] `INT-P5-004` (`UI`) Add stale-cursor handling: force full bootstrap refresh then resume live stream.
- [ ] `INT-P5-005` (`UI`) Ensure pending permission/question cards hydrate from backend state immediately.
- [ ] `INT-P5-006` (`UI`) Ensure live thinking/tool indicators hydrate immediately and remain synchronized.
- [ ] `INT-P5-007` (`UI`) Add reconnect indicator states for disconnected, catching-up, live, degraded.
- [ ] `INT-P5-008` (`QA`) Add UI integration tests for open-mid-run, reopen-after-closed, and reconnect-after-network-flap.
- [ ] `INT-P5-009` (`QA`) Validate no duplicate messages/tools after replay + live subscription handoff.
- [ ] `INT-P5-010` (`ARCH`) Confirm no frontend command name changes or breaking payload changes.

## Phase 6 Internal Tasks - Service Lifecycle Management (User + System)

- [ ] `INT-P6-001` (`RUST`) Add service command module and register all lifecycle commands in `main.rs`.
- [ ] `INT-P6-002` (`RUST`) Integrate `service-manager` crate and abstract per-OS adapters where needed.
- [ ] `INT-P6-003` (`RUST`) Implement user-mode install/uninstall/start/stop/status for macOS LaunchAgent.
- [ ] `INT-P6-004` (`RUST`) Implement user-mode install/uninstall/start/stop/status for Linux systemd user units.
- [ ] `INT-P6-005` (`RUST`) Implement user-mode install/uninstall/start/stop/status for Windows Scheduled Task.
- [ ] `INT-P6-006` (`RUST`) Implement system-mode install/uninstall/start/stop/status for macOS LaunchDaemon.
- [ ] `INT-P6-007` (`RUST`) Implement system-mode install/uninstall/start/stop/status for Linux system services.
- [ ] `INT-P6-008` (`RUST`) Implement system-mode install/uninstall/start/stop/status for Windows Services.
- [ ] `INT-P6-009` (`SEC`) Add mode-switch safety checks and explicit elevation/promotion prompts.
- [ ] `INT-P6-010` (`QA`) Add per-OS lifecycle scripts and automated smoke tests across all modes.

## Phase 7 Internal Tasks - Security, Credential Scopes, Remote Defaults

- [ ] `INT-P7-001` (`SEC`) Implement daemon-issued local auth token and secure token file lifecycle.
- [ ] `INT-P7-002` (`SEC`) Enforce socket/pipe ACLs and token file permissions per OS best practices.
- [ ] `INT-P7-003` (`SEC`) Add token validation, expiration policy, and rotation command.
- [ ] `INT-P7-004` (`SEC`) Separate user-mode and system-mode credential stores with explicit namespace boundaries.
- [ ] `INT-P7-005` (`SEC`) Implement explicit credential promotion workflow (user to system) with audit trail.
- [ ] `INT-P7-006` (`SEC`) Add remote-access boot default enforcement: local-only until explicit enable.
- [ ] `INT-P7-007` (`SEC`) Require explicit command/UI confirmation before enabling public tunnel.
- [ ] `INT-P7-008` (`SEC`) Keep existing device pairing flow and verify compatibility with daemon transport.
- [ ] `INT-P7-009` (`QA`) Add unauthorized access tests for local IPC and rejected token scenarios.
- [ ] `INT-P7-010` (`QA`) Add credential scope tests proving no silent cross-scope reads.

## Phase 8 Internal Tasks - Background Continuity (Integrations, Scheduler, Workflow)

- [ ] `INT-P8-001` (`DAEMON`) Build ordered daemon startup orchestrator with dependency graph and retry policy.
- [ ] `INT-P8-002` (`DAEMON`) Start persistence load before integrations/scheduler/workflow workers.
- [ ] `INT-P8-003` (`DAEMON`) Start integration bridge in supervised loop with reconnect backoff.
- [ ] `INT-P8-004` (`DAEMON`) Start cron scheduler in daemon mode with duplicate-run protection.
- [ ] `INT-P8-005` (`DAEMON`) Start workflow trigger router and verify it runs independent of desktop process.
- [ ] `INT-P8-006` (`DAEMON`) Start notification dispatcher with queued delivery for app-closed periods.
- [ ] `INT-P8-007` (`STATE`) Ensure pending interaction and error state transitions persist while app is closed.
- [ ] `INT-P8-008` (`UI`) On app reopen, hydrate all background-produced messages and status updates immediately.
- [ ] `INT-P8-009` (`QA`) Run app-closed continuity tests for inbound integration messages and scheduled tasks.
- [ ] `INT-P8-010` (`QA`) Run long-duration soak test with app closed and periodic reopen checks.

## Phase 9 Internal Tasks - Packaging and Build Pipeline

- [ ] `INT-P9-001` (`OPS`) Add daemon build target to sidecar package scripts for all supported platforms.
- [ ] `INT-P9-002` (`OPS`) Add daemon binary and helper assets to Tauri bundle resources.
- [ ] `INT-P9-003` (`OPS`) Add installer hooks for service registration in user/system mode flows.
- [ ] `INT-P9-004` (`OPS`) Add uninstall hooks that remove service registrations and stale socket/token files.
- [ ] `INT-P9-005` (`OPS`) Add CI asset validation to verify daemon binaries exist and are executable.
- [ ] `INT-P9-006` (`OPS`) Add signing/notarization pipeline updates for new daemon artifacts.
- [ ] `INT-P9-007` (`OPS`) Add version pinning and compatibility checks between app and daemon binary versions.
- [ ] `INT-P9-008` (`QA`) Execute packaging smoke tests for clean install, upgrade, downgrade, and uninstall.
- [ ] `INT-P9-009` (`QA`) Verify service mode metadata persists correctly through app upgrades.
- [ ] `INT-P9-010` (`SEC`) Verify packaged default config keeps remote tunnel disabled by default.

## Phase 10 Internal Tasks - Full Validation Matrix and Release Gate

- [ ] `INT-P10-001` (`QA`) Build consolidated matrix runner for lifecycle, reconnect, persistence, integration, scheduler, remote, UX, performance, and security.
- [ ] `INT-P10-002` (`QA`) Run matrix for user mode across macOS/Windows/Linux and collect evidence.
- [ ] `INT-P10-003` (`QA`) Run matrix for system mode across macOS/Windows/Linux and collect evidence.
- [ ] `INT-P10-004` (`QA`) Run crash-recovery tests at multiple run phases (idle, active stream, pending permission).
- [ ] `INT-P10-005` (`QA`) Run replay correctness tests with forced disconnects and delayed reconnect.
- [ ] `INT-P10-006` (`QA`) Run performance tests for bootstrap latency across realistic session counts.
- [ ] `INT-P10-007` (`QA`) Run security tests for unauthorized IPC, token misuse, and mode-switch authorization checks.
- [ ] `INT-P10-008` (`QA`) Run UX parity walkthrough against the frozen acceptance matrix from Phase 0.
- [ ] `INT-P10-009` (`OPS`) Require sign-off file from ARCH, SEC, QA, and OPS before release candidate approval.
- [ ] `INT-P10-010` (`OPS`) Block release if any P0-P10 task remains open, blocked, or missing evidence.

## Phase 11 Internal Tasks - One-Shot Release and Rollback Readiness

- [ ] `INT-P11-001` (`OPS`) Freeze schema and wire protocol versions for release.
- [ ] `INT-P11-002` (`OPS`) Build release candidates for all OS targets with both service modes enabled.
- [ ] `INT-P11-003` (`QA`) Execute final canary on all targets with production-like data and workflows.
- [ ] `INT-P11-004` (`OPS`) Publish coordinated release and update migration notes for existing users.
- [ ] `INT-P11-005` (`OPS`) Validate rollback path to embedded sidecar transport using runtime flag.
- [ ] `INT-P11-006` (`OPS`) Validate downgrade compatibility window and persistence compatibility.
- [ ] `INT-P11-007` (`SEC`) Verify post-release security posture: local-only tunnel default and credential scope boundaries.
- [ ] `INT-P11-008` (`OPS`) Activate post-release monitoring dashboard for daemon uptime, reconnect errors, and fallback activations.
- [ ] `INT-P11-009` (`OPS`) Enable incident response runbook and on-call ownership rotation.
- [ ] `INT-P11-010` (`OPS`) Produce closure report with open risks and deferred work list.

## Per-Task Evidence Requirements (Mandatory)

Each task requires a matching evidence file in `docs/migration-evidence/<task-id>.md` with the following sections:

- `Change Summary`: concise statement of what changed.
- `Files Changed`: exact paths touched.
- `Verification Commands`: exact commands run.
- `Verification Output`: short pass/fail snippets.
- `Behavior Proof`: screenshots/log snippets/test reports that prove expected behavior.
- `Risk Notes`: known residual risk after completion.
- `Rollback Path`: exact command/flag/commit strategy to revert safely.

## Standard Verification Command Set

Run this command set for every task unless explicitly not applicable:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --filter @gemini-cowork/core`
- `pnpm test --filter @gemini-cowork/providers`
- `cd apps/desktop && pnpm vitest`

Run targeted additions when transport/service code changes:

- `cd apps/desktop/src-sidecar && pnpm test`
- `cd apps/desktop/src-tauri && cargo test`
- `cd apps/desktop && pnpm playwright test`

## Hard Stop Conditions

- Stop and fix before proceeding if any command/event contract mismatch appears.
- Stop and fix before proceeding if replay causes duplicate or missing timeline events.
- Stop and fix before proceeding if app reopen does not show live state immediately.
- Stop and fix before proceeding if integration/scheduler behavior differs with app closed.
- Stop and fix before proceeding if unauthorized local IPC access succeeds.
- Stop and fix before proceeding if remote tunnel can start without explicit enable.

## Completion Definition

Migration is complete only when all conditions are true:

- All tasks from `INT-G-*` and `INT-P0-*` to `INT-P11-*` are `[x]`.
- All evidence files exist and are reviewable.
- Full Phase 10 matrix passes across macOS/Windows/Linux for user and system modes.
- One-shot release completed and rollback path validated in production-like environment.
