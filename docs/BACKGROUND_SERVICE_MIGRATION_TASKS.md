# Background Service Migration - Master Task Breakdown

This document is the execution source of truth for migrating Cowork from an app-coupled sidecar to a standalone background daemon with desktop UI as a pure client.

## Companion Internal Runbook

Use `/Users/naresh/Work/Personal/cowork/docs/BACKGROUND_SERVICE_INTERNAL_TASKS.md` for atomic internal implementation tasks, dependencies, evidence requirements, and rollout drills for each phase.

## Program Goals

- Run agent, integrations, scheduling, workflow, remote access, and persistence when desktop app is closed.
- Preserve command/API compatibility for frontend and existing Rust commands.
- Preserve UX parity with no regressions in chat, live indicators, permissions, questions, queueing, integrations, automations, and notifications.
- Support both service scopes in v1:
  - User-level service.
  - System-wide single-tenant service.
- Ship macOS, Windows, and Linux in one coordinated release after full validation.

## Hard Invariants (Must Never Break)

- Existing `invoke` command names continue to work.
- Existing event names continue to work.
- Session and chat history remain backward compatible.
- No silent credential scope crossing between user mode and system mode.
- Public remote tunnel is opt-in and remains disabled by default at service start.

## Change Control Rules

- One logical change set per task ID.
- Each task must include:
  - Code change.
  - Tests.
  - Verification evidence.
  - Rollback note.
- No task is marked done until all required verification steps pass.

## Task Status Legend

- `[ ]` Not started
- `[-]` In progress
- `[x]` Completed and verified
- `[!]` Blocked

## Workstream Map

- `WS-ARCH`: Runtime and transport architecture.
- `WS-DAEMON`: Daemon process and local IPC.
- `WS-RUST`: Rust backend command transport and service management.
- `WS-UI`: Frontend hydration, reconnect, and live UX parity.
- `WS-STATE`: Runtime state snapshotting and persistence.
- `WS-SEC`: Credentials, authz, local IPC security.
- `WS-OPS`: Packaging, install/uninstall, release operations.
- `WS-QA`: Testing and validation matrix.

---

## Phase 0 - Contract Freeze and Pre-Migration Hardening

### Deliverables

- API contract baseline for commands and events.
- Compatibility test harness that can run against multiple transports.
- "No UX Regression" acceptance checklist.

### Tasks

- [ ] `P0-T001` (`WS-ARCH`) Capture current command contract baseline from Rust command modules.
  - Files:
    - `apps/desktop/src-tauri/src/commands/agent.rs`
    - `apps/desktop/src-tauri/src/commands/cron.rs`
    - `apps/desktop/src-tauri/src/commands/workflow.rs`
    - `apps/desktop/src-tauri/src/commands/remote_access.rs`
    - `apps/desktop/src-tauri/src/commands/integrations.rs`
    - `apps/desktop/src-tauri/src/commands/connectors.rs`
  - Verification:
    - Generate a machine-readable command manifest.
    - Confirm no duplicate command names with conflicting payload schemas.

- [ ] `P0-T002` (`WS-ARCH`) Capture current sidecar command handlers and payload schemas.
  - Files:
    - `apps/desktop/src-sidecar/src/ipc-handler.ts`
    - `apps/desktop/src-sidecar/src/types.ts`
  - Verification:
    - Static check to ensure each Rust command maps to sidecar handler.

- [ ] `P0-T003` (`WS-ARCH`) Capture current event contract baseline.
  - Files:
    - `apps/desktop/src-sidecar/src/event-emitter.ts`
    - `apps/desktop/src/lib/event-types.ts`
    - `apps/desktop/src/hooks/useAgentEvents.ts`
  - Verification:
    - Event manifest generated and diffable.
    - Ensure each frontend-consumed event exists in sidecar emitter.

- [ ] `P0-T004` (`WS-QA`) Add transport-agnostic contract test suite skeleton.
  - Scope:
    - JSON-RPC request/response shape checks.
    - Event envelope schema checks.
  - Verification:
    - Tests pass in current stdio sidecar mode.

- [ ] `P0-T005` (`WS-UI`) Write "No UX Regression" acceptance matrix.
  - Scope:
    - Chat send/stream.
    - Tool cards and results.
    - Permission flow.
    - Question flow.
    - Queue operations.
    - Session list and live badges.
    - Integrations events.
    - Cron/workflow views.
    - Remote access views.
  - Verification:
    - Matrix reviewed and versioned in repo docs.

- [ ] `P0-T006` (`WS-OPS`) Add migration feature flags and default states.
  - Flags:
    - `daemon_transport_enabled`
    - `daemon_fallback_embedded_sidecar`
    - `daemon_bootstrap_state_enabled`
  - Verification:
    - Flags plumbed and default to safe legacy behavior.

### Exit Criteria

- Contract manifests exist for commands and events.
- Contract tests run against existing sidecar and pass.
- Regression acceptance matrix committed.

---

## Phase 1 - Sidecar Runtime Extraction (No Behavior Change)

### Deliverables

- Runtime bootstrap separated from stdio entrypoint.
- Event emitter supports pluggable sinks.

### Tasks

- [ ] `P1-T001` (`WS-ARCH`) Extract sidecar runtime bootstrap from `index.ts` into reusable module.
  - Files:
    - `apps/desktop/src-sidecar/src/index.ts`
    - New: `apps/desktop/src-sidecar/src/runtime/bootstrap.ts`
  - Verification:
    - Existing stdio mode behavior unchanged.

- [ ] `P1-T002` (`WS-ARCH`) Define transport interfaces for request ingress and event egress.
  - New:
    - `apps/desktop/src-sidecar/src/runtime/transport.ts`
  - Verification:
    - Type checks enforce single command router path.

- [ ] `P1-T003` (`WS-ARCH`) Implement stdio transport adapter using new interface.
  - New:
    - `apps/desktop/src-sidecar/src/runtime/transports/stdio.ts`
  - Verification:
    - Start sidecar and process sample commands successfully.

- [ ] `P1-T004` (`WS-ARCH`) Refactor event emitter to support multiple sinks.
  - Files:
    - `apps/desktop/src-sidecar/src/event-emitter.ts`
  - Verification:
    - Unit tests for sink fan-out and ordering.

- [ ] `P1-T005` (`WS-QA`) Preserve existing behavior via regression tests.
  - Verification:
    - Existing sidecar tests pass.
    - New transport abstraction tests pass.

- [ ] `P1-T006` (`WS-ARCH`) Keep IPC handler unchanged as command router.
  - Files:
    - `apps/desktop/src-sidecar/src/ipc-handler.ts`
  - Verification:
    - No command name changes.
    - Contract manifest diff shows no command deletions.

### Exit Criteria

- `index.ts` delegates to reusable bootstrap.
- Stdio transport works unchanged.
- Event sink architecture supports future daemon sink.

---

## Phase 2 - Daemon Process and Local Control Plane

### Deliverables

- Dedicated daemon entrypoint.
- Local IPC server for commands and event streaming.
- Health and readiness APIs.

### Tasks

- [ ] `P2-T001` (`WS-DAEMON`) Add daemon entrypoint.
  - New:
    - `apps/desktop/src-sidecar/src/daemon.ts`
  - Verification:
    - Daemon starts independent of stdin lifecycle.

- [ ] `P2-T002` (`WS-DAEMON`) Implement local IPC transport server.
  - Unix socket on macOS/Linux.
  - Named pipe on Windows.
  - New:
    - `apps/desktop/src-sidecar/src/runtime/transports/local-ipc-server.ts`
  - Verification:
    - Command round-trip test over local IPC on host OS.

- [ ] `P2-T003` (`WS-DAEMON`) Implement daemon readiness and health endpoint.
  - Commands:
    - `daemon_health`
    - `daemon_ready`
  - Verification:
    - Health checks pass before and after service initialization.

- [ ] `P2-T004` (`WS-DAEMON`) Implement event stream channel for subscribers.
  - Behavior:
    - Push all event envelopes to connected local clients.
  - Verification:
    - Event order preserved under backpressure.

- [ ] `P2-T005` (`WS-DAEMON`) Add daemon process lock to prevent duplicate instances.
  - Verification:
    - Second daemon launch exits with clear diagnostic.

- [ ] `P2-T006` (`WS-QA`) Add daemon integration tests.
  - Verification:
    - `create_session`, `send_message`, `list_sessions` through daemon transport.

### Exit Criteria

- Daemon accepts full command surface through local IPC.
- Event streaming functional without desktop process.

---

## Phase 3 - Runtime Snapshot Model and Catch-up

### Deliverables

- Session runtime snapshots and persisted runtime state.
- Bootstrap state API and event replay cursor support.

### Tasks

- [ ] `P3-T001` (`WS-STATE`) Introduce `SessionRuntimeState` type in sidecar types.
  - Fields:
    - `runState`
    - `isStreaming`
    - `isThinking`
    - `activeTurnId`
    - `activeToolIds`
    - `pendingPermissions`
    - `pendingQuestions`
    - `messageQueue`
    - `lastError`
  - Files:
    - `apps/desktop/src-sidecar/src/types.ts`
  - Verification:
    - Type checks pass and serialized output stable.

- [ ] `P3-T002` (`WS-STATE`) Add runtime snapshot builders in `agent-runner`.
  - Files:
    - `apps/desktop/src-sidecar/src/agent-runner.ts`
  - Verification:
    - Snapshots reflect in-memory truth for active sessions.

- [ ] `P3-T003` (`WS-STATE`) Persist runtime snapshots.
  - Files:
    - `apps/desktop/src-sidecar/src/persistence.ts`
  - Verification:
    - Restart daemon restores runtime snapshot for interrupted sessions.

- [ ] `P3-T004` (`WS-STATE`) Add command `agent_get_bootstrap_state`.
  - Returns:
    - Sessions.
    - Runtime snapshots.
    - Pending interactions.
    - Latest event sequence cursor.
  - Files:
    - `apps/desktop/src-sidecar/src/ipc-handler.ts`
  - Verification:
    - Single API call hydrates complete UI state.

- [ ] `P3-T005` (`WS-STATE`) Add event envelope sequence IDs and replay buffer.
  - Commands:
    - `agent_get_events_since`
  - Files:
    - `apps/desktop/src-sidecar/src/event-emitter.ts`
  - Verification:
    - Missed-event replay returns exactly expected range.

- [ ] `P3-T006` (`WS-QA`) Add crash/restart runtime snapshot tests.
  - Verification:
    - Pending permission/question survives restart and is visible on reconnect.

### Exit Criteria

- Bootstrap API available and validated.
- Sequence-based catch-up available and validated.

---

## Phase 4 - Rust Backend Transport Migration

### Deliverables

- Rust command layer talks to daemon client manager.
- Optional fallback to embedded sidecar.

### Tasks

- [ ] `P4-T001` (`WS-RUST`) Add daemon client manager abstraction in Rust.
  - New:
    - `apps/desktop/src-tauri/src/daemon_client.rs`
  - Verification:
    - Basic ping command over local IPC passes.

- [ ] `P4-T002` (`WS-RUST`) Wrap existing sidecar manager behind unified client trait.
  - Files:
    - `apps/desktop/src-tauri/src/sidecar.rs`
    - `apps/desktop/src-tauri/src/commands/agent.rs`
  - Verification:
    - Command modules remain unchanged at call sites.

- [ ] `P4-T003` (`WS-RUST`) Implement daemon-first connect flow with fallback.
  - Order:
    - Connect daemon.
    - If unavailable and fallback flag enabled, start embedded sidecar.
  - Verification:
    - Both pathways function.

- [ ] `P4-T004` (`WS-RUST`) Forward daemon events in existing `agent:*` frontend event namespace.
  - Verification:
    - Existing UI listeners continue to receive expected events.

- [ ] `P4-T005` (`WS-RUST`) Add startup diagnostics and retries.
  - Verification:
    - Clear error surface when daemon unavailable.

- [ ] `P4-T006` (`WS-QA`) Regression-test all Rust command modules with daemon backend.
  - Verification:
    - No command API breakage.

### Exit Criteria

- Rust transport is daemon-first with compatible fallback.
- Frontend API remains stable.

---

## Phase 5 - Frontend Bootstrap Hydration and Reconnect

### Deliverables

- Frontend hydrates from bootstrap state and catches up missed events.
- Live indicators accurate immediately on app open.

### Tasks

- [ ] `P5-T001` (`WS-UI`) Add frontend client call for `agent_get_bootstrap_state`.
  - Files:
    - `apps/desktop/src/stores/session-store.ts`
  - Verification:
    - Startup loads sessions and runtime metadata from one bootstrap call.

- [ ] `P5-T002` (`WS-UI`) Hydrate `chat-store` from runtime snapshot fields.
  - Files:
    - `apps/desktop/src/stores/chat-store.ts`
  - Verification:
    - `isStreaming`, `isThinking`, `currentTool`, `pendingPermissions`, `pendingQuestions`, `messageQueue` reflect bootstrap state.

- [ ] `P5-T003` (`WS-UI`) Add event catch-up step using `agent_get_events_since`.
  - Files:
    - `apps/desktop/src/hooks/useAgentEvents.ts`
  - Verification:
    - No missing events after app reopen or reconnect.

- [ ] `P5-T004` (`WS-UI`) Verify sidebar and chat live indicators on reconnect.
  - Files:
    - `apps/desktop/src/components/layout/Sidebar.tsx`
    - `apps/desktop/src/components/chat/MessageList.tsx`
  - Verification:
    - Running tool badges and pending interaction cards visible instantly after open.

- [ ] `P5-T005` (`WS-UI`) Add fallback behavior for stale cursors.
  - Verification:
    - Full state refresh occurs safely if replay window unavailable.

- [ ] `P5-T006` (`WS-QA`) UI integration tests for mid-run reopen.
  - Verification:
    - App open during live turn shows current state without user action.

### Exit Criteria

- UI hydrates live state from backend.
- Replay + subscription path is stable.

---

## Phase 6 - Service Lifecycle Management (Both Modes)

### Deliverables

- Service install/uninstall/start/stop/restart/status APIs.
- Mode switch between user-level and system-wide single-tenant.

### Tasks

- [ ] `P6-T001` (`WS-RUST`) Add service management Rust module.
  - New:
    - `apps/desktop/src-tauri/src/commands/service.rs`
  - Commands:
    - `service_install`
    - `service_uninstall`
    - `service_start`
    - `service_stop`
    - `service_restart`
    - `service_status`
    - `service_set_mode`
    - `service_get_mode`
  - Verification:
    - Command wiring visible in `main.rs`.

- [ ] `P6-T002` (`WS-RUST`) Add `service-manager` crate integration and adapters.
  - Files:
    - `apps/desktop/src-tauri/Cargo.toml`
  - Verification:
    - Build succeeds on macOS/Linux/Windows targets.

- [ ] `P6-T003` (`WS-RUST`) Implement user-level service installers.
  - macOS LaunchAgent.
  - Linux systemd user unit.
  - Windows Scheduled Task.
  - Verification:
    - Services start at user session start and survive app close.

- [ ] `P6-T004` (`WS-RUST`) Implement system-wide service installers.
  - macOS LaunchDaemon.
  - Linux system service.
  - Windows Service.
  - Verification:
    - Service starts at boot with machine-level profile.

- [ ] `P6-T005` (`WS-RUST`) Add mode-switch safety checks.
  - Verification:
    - No silent credential migration.
    - Explicit user action required for scope promotion.

- [ ] `P6-T006` (`WS-QA`) Add service lifecycle test script per OS.
  - Verification:
    - install -> start -> status -> restart -> stop -> uninstall.

### Exit Criteria

- Both modes operational on all OS targets.
- Mode transitions guarded and explicit.

---

## Phase 7 - Security, Credential Scope, and Remote Policy

### Deliverables

- Secure local daemon control channel.
- Explicit credential scope model.
- Remote access local-only default policy enforced.

### Tasks

- [ ] `P7-T001` (`WS-SEC`) Add local IPC auth token mechanism.
  - Scope:
    - Daemon generates token file with strict permissions.
    - Client must present token for command channel.
  - Verification:
    - Unauthorized local client rejected.

- [ ] `P7-T002` (`WS-SEC`) Add filesystem ACL enforcement for socket/pipe and token path.
  - Verification:
    - Only expected principals can connect/read.

- [ ] `P7-T003` (`WS-SEC`) Implement credential scope segregation.
  - User-mode credential store.
  - System-mode credential store.
  - Verification:
    - User-mode credentials not auto-visible in system mode.

- [ ] `P7-T004` (`WS-SEC`) Implement explicit credential promotion flow for system mode.
  - Verification:
    - Promotion requires explicit command/UI action.

- [ ] `P7-T005` (`WS-SEC`) Enforce remote-access default local-only on daemon startup.
  - Files:
    - `apps/desktop/src-sidecar/src/remote-access/service.ts`
  - Verification:
    - No tunnel auto-start unless explicitly enabled.

- [ ] `P7-T006` (`WS-QA`) Add security tests.
  - Verification:
    - Unauthorized IPC calls fail.
    - Token rotation works.
    - Mode scope credential separation confirmed.

### Exit Criteria

- Local control path protected.
- Scope-safe credentials behavior validated.
- Remote default policy enforced.

---

## Phase 8 - Background Continuity for Integrations and Scheduling

### Deliverables

- Daemon boot sequence initializes long-running services independent of desktop app.

### Tasks

- [ ] `P8-T001` (`WS-DAEMON`) Add deterministic daemon startup sequence:
  - Agent runtime init.
  - Persistence init.
  - Cron start.
  - Workflow trigger router start.
  - Integration bridge auto-reconnect.
  - Remote access init.
  - Heartbeat init/start.
  - Verification:
    - Startup logs show all services initialized in order.

- [ ] `P8-T002` (`WS-STATE`) Ensure session and runtime state are loaded before accepting client subscriptions.
  - Verification:
    - First client bootstrap includes fully restored state.

- [ ] `P8-T003` (`WS-DAEMON`) Validate integrations process inbound messages while UI closed.
  - Files:
    - `apps/desktop/src-sidecar/src/integrations/index.ts`
  - Verification:
    - Inbound message triggers routing and responses.

- [ ] `P8-T004` (`WS-DAEMON`) Validate cron/workflow executes while UI closed.
  - Verification:
    - Runs recorded and visible upon app reopen.

- [ ] `P8-T005` (`WS-UI`) Ensure reconnect after background activity reflects all history and live state.
  - Verification:
    - User sees updated chat, tasks, artifacts, and statuses immediately.

- [ ] `P8-T006` (`WS-QA`) End-to-end continuity tests with app closed.
  - Verification:
    - Automations and integrations continue uninterrupted.

### Exit Criteria

- Background services continue correctly with app closed.
- Reopen hydration and continuity verified.

---

## Phase 9 - Packaging and Build Pipeline

### Deliverables

- Daemon binaries built and bundled for all targets.
- Installer-aware service helper integration.

### Tasks

- [ ] `P9-T001` (`WS-OPS`) Add daemon build scripts in sidecar package.
  - Files:
    - `apps/desktop/src-sidecar/package.json`
  - Verification:
    - `pnpm --filter @cowork/sidecar build` emits daemon artifacts.

- [ ] `P9-T002` (`WS-OPS`) Add daemon binaries/resources in Tauri bundling config.
  - Files:
    - `apps/desktop/src-tauri/tauri.conf.json`
    - `apps/desktop/src-tauri/capabilities/default.json`
  - Verification:
    - Bundled app includes daemon executable and required helpers.

- [ ] `P9-T003` (`WS-OPS`) Add installer post-install/post-uninstall hooks.
  - Verification:
    - No orphaned services after uninstall.

- [ ] `P9-T004` (`WS-OPS`) Add package integrity checks for daemon assets.
  - Verification:
    - Binary presence and executable permissions validated during CI.

- [ ] `P9-T005` (`WS-QA`) Cross-platform packaging smoke tests.
  - Verification:
    - Installers launch daemon-managed runtime successfully on each OS.

### Exit Criteria

- Packaging contains daemon + helper assets.
- Install/uninstall lifecycle clean.

---

## Phase 10 - Full Validation Matrix

### Deliverables

- Automated and manual evidence that all migration goals are met.

### Tasks

- [ ] `P10-T001` (`WS-QA`) Daemon lifecycle matrix:
  - user-level and system-wide.
  - install/start/stop/restart/status.
  - Verification:
    - All commands pass across macOS/Windows/Linux.

- [ ] `P10-T002` (`WS-QA`) Reconnect and live-state matrix.
  - Verification:
    - Mid-run app reopen shows live thinking/tool/pending interactions.

- [ ] `P10-T003` (`WS-QA`) Persistence crash matrix.
  - Verification:
    - Daemon crash/restart does not corrupt sessions and preserves recoverable state.

- [ ] `P10-T004` (`WS-QA`) Integration continuity matrix.
  - Verification:
    - Inbound/outbound flows keep working with app closed.

- [ ] `P10-T005` (`WS-QA`) Scheduler/workflow continuity matrix.
  - Verification:
    - Scheduled runs execute with app closed and appear in history.

- [ ] `P10-T006` (`WS-QA`) Remote access matrix.
  - Verification:
    - local-only default.
    - explicit tunnel enable path.
    - paired device auth and event stream.

- [ ] `P10-T007` (`WS-QA`) UX parity matrix from Phase 0 acceptance list.
  - Verification:
    - No UX regression failures.

- [ ] `P10-T008` (`WS-QA`) Performance matrix.
  - Verification:
    - Cold open and bootstrap latency under target for realistic session counts.

- [ ] `P10-T009` (`WS-QA`) Security matrix.
  - Verification:
    - Unauthorized local control attempts rejected.
    - Scope promotion requires explicit flow.

### Exit Criteria

- All matrix rows marked pass with evidence.

---

## Phase 11 - Release and Rollback

### Deliverables

- One-shot cross-platform release with controlled rollback.

### Tasks

- [ ] `P11-T001` (`WS-OPS`) Freeze schema/version contracts.
  - Verification:
    - Migration docs and compatibility windows locked.

- [ ] `P11-T002` (`WS-OPS`) Run full pre-release canary on all target OS and modes.
  - Verification:
    - Canary sign-off from QA checklist.

- [ ] `P11-T003` (`WS-OPS`) Publish release artifacts and release notes.
  - Verification:
    - Install, update, and fresh setup validated.

- [ ] `P11-T004` (`WS-OPS`) Maintain emergency rollback flag path.
  - Verification:
    - Runtime fallback to embedded sidecar validated.

- [ ] `P11-T005` (`WS-QA`) Post-release monitoring and incident runbook activation.
  - Verification:
    - Startup error rates, daemon uptime, reconnect failures within thresholds.

### Exit Criteria

- Release complete with rollback and monitoring validated.

---

## Verification Protocol Per Task (Mandatory)

For every completed task ID:

- Run static checks:
  - `pnpm typecheck`
  - `pnpm lint`
- Run targeted tests for touched modules.
- Run command contract tests if command/event surfaces changed.
- Run end-to-end checks for affected user flows.
- Capture evidence:
  - command output snippet.
  - test pass summary.
  - any benchmark/security checks required.
- Record rollback note:
  - exactly which flag/path reverts behavior safely.

No task can be marked `[x]` without all five protocol items.

---

## End-to-End Verification Gates (Per Milestone)

- Milestone A: End of Phase 3.
  - Daemon can run independently.
  - Bootstrap state + event replay functional.

- Milestone B: End of Phase 5.
  - Desktop reconnect/hydration parity validated.

- Milestone C: End of Phase 8.
  - Integrations + automations continuity validated with app closed.

- Milestone D: End of Phase 10.
  - Full matrix pass across all OS/service modes.

- Milestone E: End of Phase 11.
  - Release + rollback path verified.

---

## Command and Event Additions Checklist

- [ ] `agent_get_bootstrap_state` implemented and documented.
- [ ] `agent_get_events_since` implemented and documented.
- [ ] `agent_subscribe_events` implemented and documented.
- [ ] `service_install` implemented and documented.
- [ ] `service_uninstall` implemented and documented.
- [ ] `service_start` implemented and documented.
- [ ] `service_stop` implemented and documented.
- [ ] `service_restart` implemented and documented.
- [ ] `service_status` implemented and documented.
- [ ] `service_set_mode` implemented and documented.
- [ ] `service_get_mode` implemented and documented.
- [ ] Event envelope includes `{ seq, timestamp, type, sessionId, data }`.
- [ ] Legacy event names remain available.

---

## Known Risks and Mitigations

- Risk: Transport migration breaks command behavior.
  - Mitigation: Contract tests + daemon-first with legacy fallback.

- Risk: UI state mismatch on reconnect.
  - Mitigation: Bootstrap snapshot + sequence replay + stale-cursor fallback.

- Risk: Credential leakage across service modes.
  - Mitigation: Strict store separation + explicit promotion flow.

- Risk: OS service differences cause startup failures.
  - Mitigation: Per-OS adapters + lifecycle test matrix + clear diagnostics.

- Risk: Packaging misses daemon assets.
  - Mitigation: CI artifact presence checks + installer smoke tests.

---

## Execution Tracking

Create one implementation branch per phase group:

- `codex/background-service-p0-p2`
- `codex/background-service-p3-p5`
- `codex/background-service-p6-p8`
- `codex/background-service-p9-p11`

For each phase group:

- Keep task IDs in commit messages.
- Attach verification evidence for each completed task.
- Do not merge if any task in phase is `[!]` or unverified.
