# Gemini Cowork 5/5 - Internal Master Tasks

Date: 2026-02-12  
Source blueprint: Gemini Cowork 5/5 Execution Blueprint (12-month big-bang launch)

## 1. Program Control Rules

## 1.1 Non-negotiables

1. Quality is prioritized over schedule.
2. Public launch remains a single event after internal hardening.
3. No Must-Have feature can be deferred.
4. No P0/P1 defects at launch gate.
5. No unresolved critical/high security findings.

## 1.2 Scoring Contract (Launch Gates)

| Metric | Weight | Threshold |
|---|---:|---:|
| End-to-end task completion | 20% | >= 92% |
| Reliability/recovery | 15% | >= 99.8% crash-free sessions |
| Memory quality | 15% | >= 0.88 precision@8 and >= 0.82 nDCG@8 |
| Workflow/skills depth | 10% | >= 90% multi-step completion |
| Research/browser depth | 10% | >= 85% autonomous completion |
| UX simplicity/satisfaction | 10% | >= 4.6/5 |
| Latency/performance | 8% | P95 first-token < 2.5s |
| Security/trust | 7% | 0 critical vulnerabilities |
| Extensibility ecosystem | 5% | >= 20 production-quality packs |

Formula:
- `FinalScore = 0.70 * BenchmarkScore + 0.30 * FeatureChecklistScore`

Mandatory launch constraints:
1. FeatureChecklistScore = 100%.
2. No dimension below 4.5/5 equivalent.
3. 3 consecutive full benchmark passes with gate compliance.

## 1.3 Status, Evidence, and Definition of Done

Status values:
- `not_started`
- `in_progress`
- `blocked`
- `in_review`
- `done`

Task `done` criteria:
1. Code complete.
2. Tests passing (unit/integration/e2e as applicable).
3. Acceptance criteria matched.
4. Evidence file created at `docs/5-5-launch/evidence/<task_id>.md`.

## 1.4 Ownership Model

| Code | Area |
|---|---|
| `ARCH` | Architecture and runtime contracts |
| `RUNTIME` | Sidecar orchestrator, reliability, checkpoint/recovery |
| `RUST` | Tauri commands, transport, OS integrations |
| `MEM` | Memory kernel and retrieval quality |
| `UX` | React UI/UX and stores |
| `WF` | Workflow/skills engines |
| `RB` | Research/browser operator |
| `SEC` | Security, policy, secrets, audit |
| `OBS` | Observability, benchmark, release gates |
| `QA` | Test system and CI quality bars |
| `PM` | Program management, scope and gate control |

## 2. Must-Have Feature Coverage Map

| Must-Have Feature | Primary Tasks | Backup Tasks |
|---|---|---|
| Resumable runs with checkpoint replay | R1-01, R1-02, R1-04, Q10-04 | O9-01, O9-07 |
| Branch + merge sessions | B3-01, B3-02, B3-03, B3-04, B3-05 | B3-06, B3-07, B3-08 |
| Local-only encrypted memory with controls | M2-01, M2-02, M2-03, M2-07 | M2-06, M2-08, S7-01 |
| Hybrid lexical+dense+graph+rerank retrieval | M2-04, M2-05, M2-06 | Q10-05 |
| Adaptive skills/workflow packs | W4-03, W4-04, W4-07, W4-08 | W4-01, W4-05 |
| Wide research with subagents/evidence synthesis | RB5-01, RB5-02, RB5-08 | O9-04 |
| Robust browser operator with recovery | RB5-03, RB5-04, RB5-05 | RB5-06, Q10-06 |
| Unified run timeline UI | U8-03, U8-04, O9-02 | O9-05 |
| One-click simple setup + pro mode | U8-01, U8-02 | U8-07 |
| Keychain-backed secret management + enterprise policy | S7-01, S7-02, S7-03, P6-05, P6-06 | S7-04, S7-08 |
| Benchmark harness + release gate dashboard | O9-03, O9-04, O9-05, O9-06, O9-07, O9-08 | Q10-08 |

## 3. Program Management Tasks (Cross-Phase)

- [x] `PM-01` Create master tracking system (`README`, master tasks, ledger, log).
- [x] `PM-02` Create evidence folder and evidence file standards.
- [x] `PM-03` Lock status and gate vocabulary.
- [ ] `PM-04` Capture benchmark baseline (all dimensions) before Month 1 execution.
- [ ] `PM-05` Publish weekly scorecard cadence and owners.
- [ ] `PM-06` Define release gate authority and escalation tree.
- [ ] `PM-07` Freeze API command naming contract for v2 additions.
- [ ] `PM-08` Freeze event schema compatibility policy.
- [ ] `PM-09` Define benchmark holdout set governance (anti-overfitting policy).
- [ ] `PM-10` Create launch-readiness reporting dashboard process.
- [ ] `PM-11` Open risk register with owners and mitigation due dates.
- [ ] `PM-12` Define defect triage SLA by severity.

## 4. Month-by-Month Phase Tasks and Exit Gates

## Month 1 - Contract and Skeleton Foundation

Target outputs:
1. Architecture and API contract freeze.
2. Schema v6 migration scaffolding.
3. Run state machine skeleton.
4. Event schema versioning skeleton.
5. Benchmark harness skeleton.

Tasks:
- [ ] `PH1-01` Freeze target architecture and flow diagrams in engineering ADR.
- [ ] `PH1-02` Freeze command/type/event contracts for v2 interfaces.
- [x] `PH1-03` Add database schema version scaffolding from v2 to v6 path.
- [ ] `PH1-04` Add run state machine skeleton in sidecar runtime.
- [ ] `PH1-05` Add event schema version + correlation id envelope.
- [x] `PH1-06` Add benchmark runner/suite scaffolds.

Exit criteria:
- Contract docs approved by `ARCH`, `RUNTIME`, `RUST`, `UX`.
- Build passes with scaffolding enabled.

## Month 2 - Reliability and Resume Path

Tasks:
- [x] `PH2-01` Implement checkpoint persistence and resume command path.
- [x] `PH2-02` Implement structured provider error taxonomy.
- [x] `PH2-03` Implement stream-stall detector and recover UX.
- [ ] `PH2-04` Start memory migration scaffolding and import adapters.

Exit criteria:
- Crash/restart resumes from valid checkpoint in integration tests.

## Month 3 - Memory Kernel Core

Tasks:
- [ ] `PH3-01` Complete DB-backed memory repositories.
- [x] `PH3-02` Implement hybrid retrieval baseline with scoring.
- [ ] `PH3-03` Add legacy memory importer (`.cowork/memories`, `GEMINI.md`).
- [x] `PH3-04` Deliver memory inspector alpha UI.

Exit criteria:
- Memory CRUD/retrieval integration tests pass.

## Month 4 - Branching and Reliability E2E

Tasks:
- [x] `PH4-01` Complete branch schema and APIs.
- [x] `PH4-02` Add branch-aware runtime context separation.
- [x] `PH4-03` Add branch graph + merge UX.
- [x] `PH4-04` Finish reliability/resume E2E suite.

Exit criteria:
- Branch create/merge lifecycle passes E2E.

## Month 5 - Workflow Depth

Tasks:
- [x] `PH5-01` Deterministic workflow resume + compensation hooks.
- [x] `PH5-02` Adaptive trigger confidence + explainability.
- [x] `PH5-03` Workflow pack templates.
- [x] `PH5-04` Workflow run timeline expansion.

Exit criteria:
- Multi-step workflows recover safely after interruption.

## Month 6 - Research and Browser Hardening

Tasks:
- [x] `PH6-01` Deep research resilient polling + partial results.
- [x] `PH6-02` Browser operator blocker detection + recovery.
- [x] `PH6-03` Add research/browser benchmark suites.
- [x] `PH6-04` Tool cards explain deep-tool failures and recovery.

Exit criteria:
- Research/browser reliability targets trend toward thresholds.

## Month 7 - Policy and Permission UX

Tasks:
- [x] `PH7-01` Permission queue UX + durable pending state.
- [x] `PH7-02` Policy explainability payloads.
- [x] `PH7-03` Enterprise policy profiles + settings UI.
- [x] `PH7-04` E2E policy/permission resilience tests.

Exit criteria:
- Pending approvals survive restart and unblock deterministically.

## Month 8 - Security and Secrets

Tasks:
- [x] `PH8-01` Replace plaintext credentials with keychain abstraction.
- [x] `PH8-02` Encrypt connector secrets + rotation.
- [x] `PH8-03` Signed pack validation for connectors/skills/workflows.
- [x] `PH8-04` Security audit log pipeline.

Exit criteria:
- Plaintext secret storage eliminated.

## Month 9 - Simplicity and UI Polish

Tasks:
- [ ] `PH9-01` Complete simple onboarding/pro mode switch UX.
- [ ] `PH9-02` Complete unified run timeline UX.
- [ ] `PH9-03` Artifact virtualization + preview boundaries.
- [ ] `PH9-04` Internal usability studies + iteration.

Exit criteria:
- New-user first successful run <= 3 minutes in tests.

## Month 10 - Full Benchmark Stabilization

Tasks:
- [ ] `PH10-01` Run full 600-scenario benchmark.
- [ ] `PH10-02` Fix all benchmark blockers.
- [ ] `PH10-03` Stabilize dashboard and release gate panels.
- [ ] `PH10-04` Freeze public API schemas.

Exit criteria:
- Benchmark and dashboard repeatability validated.

## Month 11 - Code Freeze and Final Hardening

Tasks:
- [ ] `PH11-01` Enter bug-fix-only code freeze.
- [ ] `PH11-02` Complete 3 benchmark passes with no P0/P1.
- [ ] `PH11-03` Security audit + dependency hardening.
- [ ] `PH11-04` Migration docs and rollback artifact freeze.

Exit criteria:
- Release candidate meets all gate preconditions.

## Month 12 - Launch and Hypercare

Tasks:
- [ ] `PH12-01` Execute final release gate evaluation.
- [ ] `PH12-02` Perform public big-bang launch.
- [ ] `PH12-03` Operate 30-day hypercare with daily benchmark checks.
- [ ] `PH12-04` Enforce gate-controlled hotfix acceptance.

Exit criteria:
- Production launch remains gate compliant during hypercare.

## 5. Workstream Task Boards (Detailed)

## Workstream R1 - Runtime Reliability and Recovery

| Task ID | Internal Execution Checklist | Dependencies | Acceptance |
|---|---|---|---|
| R1-01 | Define explicit run states and transition map; implement state machine in `agent-runner.ts`; add invalid-transition guardrails; add deterministic unit tests for all paths | PH1-02 | Deterministic transitions, unit tested |
| R1-02 | Define checkpoint schema; checkpoint at tool and turn boundaries; persist checkpoints through storage repository; replay on restart from latest valid checkpoint | R1-01, PH2-01 | Restart resumes correctly |
| R1-03 | Add Rust retry envelope with transient error classification; add idempotency keys from command layer; dedupe duplicate retried actions | R1-01 | No duplicate execution |
| R1-04 | Add IPC handlers for resume/timeline commands; validate payloads with strict type schemas; return typed errors for invalid payloads | PH1-02 | Invalid payload returns typed errors |
| R1-05 | Replace provider substring matching with structured error taxonomy; map retry hints and backoff strategies; add fixture tests for error class precision | PH2-02 | >=98% mapping accuracy |
| R1-06 | Add stream stall detector in event hook; add recover action in chat store/UI; emit stall/recover events with diagnosis reason | R1-01, O9-01 | <=1 click recovery for >=90% scenarios |
| R1-07 | Persist message queue and pending permissions in durable state keyed by session/run; restore on reload | R1-02 | No pending-work loss on reload |
| R1-08 | Emit run health counters in event emitter; surface live reliability stats in benchmark UI | O9-05 | Live reliability metrics visible |

## Workstream M2 - Memory Kernel v2

| Task ID | Internal Execution Checklist | Dependencies | Acceptance |
|---|---|---|---|
| M2-01 | Create shared memory types (`memory.ts`); export through shared type index; validate payload contracts | PH1-02 | Memory payloads typed/validated |
| M2-02 | Bump DB schema and add memory tables; implement repositories for atoms/queries/feedback; add integration tests | M2-01 | CRUD/query integration passes |
| M2-03 | Refactor sidecar memory-service to DB-backed adapter; keep compatibility facade for existing commands | M2-02 | Legacy memory commands continue to work |
| M2-04 | Implement lexical + dense + graph fusion scoring and rerank pipeline in relevance scorer | M2-02, PH3-02 | precision@8 >= 0.88 |
| M2-05 | Add contradiction and sensitivity filters with provenance retention in semantic extractor | M2-03 | Sensitive false-positive persistence < 1% |
| M2-06 | Build consolidation service with decay/pinning policy and scheduled runs | M2-03 | Redundancy reduced >=35% no recall drop |
| M2-07 | Build memory inspector/editor/panel UX with evidence source, pin/delete/edit/feedback | M2-03, PH3-04 | Full memory control in UI |
| M2-08 | Extend memory store to support confidence/explanations and feedback APIs | M2-04, M2-07 | Feedback influences ranking |

## Workstream B3 - Branching, Merge, Long-Run Context

| Task ID | Internal Execution Checklist | Dependencies | Acceptance |
|---|---|---|---|
| B3-01 | Add branch/merge shared types; ensure Rust-Node-UI serialization compatibility | PH1-02 | Cross-layer type compatibility |
| B3-02 | Add session branch and merge lineage tables + repository methods | B3-01 | Branch metadata persists reliably |
| B3-03 | Add branch-aware run context and checkpoint isolation in agent-runner | R1-02, B3-02 | Branch context isolation preserved |
| B3-04 | Expose branch commands in Rust agent command layer | B3-01 | Typed branch API responses/errors |
| B3-05 | Build branch graph + merge controls in chat header/panel | B3-04 | Branch create/merge in chat UI |
| B3-06 | Add session-store branch cache and active-branch switch performance path | B3-05 | Branch switch < 300ms cached |
| B3-07 | Handle branch lifecycle events in event hook/store updates | B3-06 | UI consistency across branch operations |
| B3-08 | Add E2E test for branch create/merge scenario | B3-05 | E2E passes in CI |

## Workstream W4 - Workflow and Skill Depth

| Task ID | Internal Execution Checklist | Dependencies | Acceptance |
|---|---|---|---|
| W4-01 | Add deterministic resume points in workflow engine; add compensation hooks to prevent duplicate side effects | R1-02 | Resume without duplicate effects |
| W4-02 | Add policy profiles (`fast_safe`, `balanced`, `strict_enterprise`) in retry policy | W4-01 | Profile contract enforced |
| W4-03 | Build adaptive trigger router with confidence scoring + explainability payload | W4-02 | False positives < 3% |
| W4-04 | Expand workflow builder/inspector for pack templates and trigger diagnostics | W4-03 | Workflow creation completion >=90% |
| W4-05 | Upgrade workflow run panel to timeline + node drilldown + replay controls | W4-01 | Diagnose failed run <=2 minutes |
| W4-06 | Extend workflow-store with live run stream buffering and scheduled health state | W4-05 | Live progression without refresh |
| W4-07 | Add workflow pack invocation API + typed error map in workflow tool | W4-02 | Structured actionable tool output |
| W4-08 | Add skill pack lifecycle states and trust signals in skills UI/store | W4-04 | Skill lifecycle visibility before use |

## Workstream RB5 - Research and Browser Hardening

| Task ID | Internal Execution Checklist | Dependencies | Acceptance |
|---|---|---|---|
| RB5-01 | Harden deep-research with polling/retry budget/partial-result handling/cancel resume token | PH6-01 | >=95% reliability under failures |
| RB5-02 | Normalize evidence and source confidence in research tools | RB5-01 | Ranked citations with provenance |
| RB5-03 | Harden browser operator with action safety classifier, blocker detection, stop criteria, retries | PH6-02 | >=85% benchmark completion |
| RB5-04 | Persist browser action history and checkpoints for restart recovery | RB5-03 | Restart resumes browser task state |
| RB5-05 | Expand live browser view with progress timeline, blockers, and recovery controls | RB5-04 | Recovery in <=3 clicks |
| RB5-06 | Upgrade tool execution cards for replay and failure explanations | RB5-02, RB5-03 | Non-experts can understand outcomes |
| RB5-07 | Handle new research/browser event envelopes in event hook | O9-02 | No dropped events in stress tests |
| RB5-08 | Add failure-injected reliability tests for research/browser tools | RB5-01, RB5-03 | Retry/fallback contracts enforced |

## Workstream P6 - Permission, Policy, Safe Power UX

| Task ID | Internal Execution Checklist | Dependencies | Acceptance |
|---|---|---|---|
| P6-01 | Upgrade permission dialog with queue mode, keyboard shortcuts, timeout-safe defaults, batch actions | R1-07 | Queue approvals manageable |
| P6-02 | Add inline queue summary + jump-to-pending actions in message list | P6-01 | Chronological resolution path |
| P6-03 | Persist pending permission/question state in chat-store across restart | R1-07 | No pending-loss on reload |
| P6-04 | Add policy explainability payloads and reason codes in runner events | P6-05 | Clear allow/deny rationale shown |
| P6-05 | Extend tool-policy shared types with enterprise profiles + deny enums | PH1-02 | Auditable typed policy behavior |
| P6-06 | Build policy profile editor settings panel with impact preview | P6-05 | Safe policy edit preview |
| P6-07 | Add sandbox command intent classification + trust scoring | P6-05 | >=97% alignment in validation tests |
| P6-08 | Add idempotency markers in sandbox executor for retried shell actions | P6-07 | No duplicate destructive effects |

## Workstream S7 - Security and Secret Management

| Task ID | Internal Execution Checklist | Dependencies | Acceptance |
|---|---|---|---|
| S7-01 | Replace plaintext credential storage with OS keychain adapter + encrypted fallback vault | PH8-01 | No plaintext secrets at rest |
| S7-02 | Route provider auth operations through secure credential abstraction | S7-01 | Backward-compatible auth APIs |
| S7-03 | Register secure credential module and one-time migration cleanup in command registration | S7-01 | Old plaintext migrated then deleted |
| S7-04 | Encrypt connector secrets with keychain-derived key + rotation support | S7-01 | Secret rotation/revoke integration passes |
| S7-05 | Build security settings panel with migration status/audit summary | S7-03 | User-visible security posture |
| S7-06 | Add signed package validation in connector/skill pack service | S7-01 | Unsigned/tampered packs blocked |
| S7-07 | Tighten external CLI allowlist and signature checks | S7-06 | Abuse risk reduced to accepted level |
| S7-08 | Add structured redacted security audit logs | S7-01 | Diagnosable incidents without secret leakage |

## Workstream U8 - Stunning UI + Simple Config

| Task ID | Internal Execution Checklist | Dependencies | Acceptance |
|---|---|---|---|
| U8-01 | Build 4-step onboarding with environment health checks and defaults | PH9-01 | First successful run <=3 minutes |
| U8-02 | Add settings profile switch (`simple`/`pro`) and capability surfacing | U8-01 | Simple mode reduces complexity safely |
| U8-03 | Add chat run-status rail + recovery controls + branch context pill | R1-06, B3-05 | Active run state always actionable |
| U8-04 | Add unified timeline grouping across stream/tool/permission/memory events | U8-03 | Timeline readable under heavy runs |
| U8-05 | Add resilient preview boundaries + lazy virtualization in preview panel | U8-04 | Large artifacts do not freeze panel |
| U8-06 | Add artifact pagination/search for long sessions | U8-05 | Scalable artifact navigation |
| U8-07 | Create design tokens file with motion/typography hierarchy | U8-02 | UX consistency score >=4.6/5 |
| U8-08 | Add shared UI primitives for timeline/reliability/policy badges | U8-07 | Shared primitives used consistently |

## Workstream O9 - Observability, Benchmarks, Release Gates

| Task ID | Internal Execution Checklist | Dependencies | Acceptance |
|---|---|---|---|
| O9-01 | Add event schema versioning + correlation IDs in event emitter | PH1-05 | Full event trace correlation |
| O9-02 | Extend frontend event types for benchmark/release gate envelopes | O9-01 | Strict type-safe frontend compile |
| O9-03 | Build benchmark runner with seeded deterministic scenarios | PH1-06 | Deterministic runs within tolerance |
| O9-04 | Add Twin-Track comparable suites (target 600 scenarios) | O9-03 | Suite available in CI/local |
| O9-05 | Build benchmark dashboard scorecard + trends | O9-03 | Daily score movement visibility |
| O9-06 | Build release gate panel with hard fail criteria | O9-05 | Auto-block release on fail |
| O9-07 | Add Rust wrappers for benchmark trigger/poll + gate status | O9-03 | Frontend can run/poll benchmarks |
| O9-08 | Add shared benchmark type schema | O9-03 | Portable typed benchmark artifacts |

## Workstream Q10 - Testing and Quality System

| Task ID | Internal Execution Checklist | Dependencies | Acceptance |
|---|---|---|---|
| Q10-01 | Add provider error taxonomy and failover tests | R1-05 | Retry hint coverage complete |
| Q10-02 | Add sandbox validator/executor tests for policy/idempotency | P6-07, P6-08 | Regressions caught pre-merge |
| Q10-03 | Add core agent integration tests for tool/permission/retry/resume | R1-02 | Agent loop stability in CI |
| Q10-04 | Add reliability E2E: stream recovery, permission queue, restart-resume | R1-06, P6-03 | UX resilience validated E2E |
| Q10-05 | Add memory E2E: create/retrieve/conflict/feedback | M2-08 | Memory quality targets validated |
| Q10-06 | Add workflow E2E: build/run/retry/resume | W4-05 | Workflow reliability validated |
| Q10-07 | Add chaos fault-injection module for provider/network/storage/IPC | R1-08 | Reliability under chaos validated |
| Q10-08 | Add CI gates for benchmark delta and reliability regression | O9-04, Q10-07 | PRs blocked on quality regression |

## 6. Database Migration Tasks (Schema v2 -> v6)

- [ ] `DB-01` Bump `SCHEMA_VERSION` from 2 to 6.
- [ ] `DB-02` Add new tables:
  - `memory_atoms`
  - `memory_edges`
  - `memory_query_logs`
  - `memory_feedback`
  - `memory_consolidation_runs`
  - `session_branches`
  - `session_branch_merges`
  - `run_checkpoints`
  - `benchmark_suites`
  - `benchmark_runs`
  - `benchmark_results`
  - `release_gate_snapshots`
- [ ] `DB-03` Wrap migration in rollback-safe transaction + checkpoint.
- [ ] `DB-04` Import `.cowork/memories` legacy files into memory atoms.
- [ ] `DB-05` Import legacy `GEMINI.md` as `instructions` atoms with `legacy_gemini_md` provenance.
- [ ] `DB-06` Preserve existing sessions/messages/workflows untouched.
- [ ] `DB-07` Generate migration report and surface in settings diagnostics.

## 7. UX Flow Validation Tasks

- [ ] `FLOW-01` Validate simple setup to first success flow.
- [ ] `FLOW-02` Validate long multi-tool run with crash/recovery flow.
- [ ] `FLOW-03` Validate memory-driven continuation loop with feedback effect.
- [ ] `FLOW-04` Validate heavy permission queue flow under restart scenarios.
- [ ] `FLOW-05` Validate workflow pack execution + resume/cancel path.

## 8. Validation Matrix Tasks

## Unit
- [ ] `VAL-U01` Provider taxonomy mapping
- [ ] `VAL-U02` Retry/backoff/idempotency math
- [ ] `VAL-U03` Memory scoring/contradiction filtering
- [ ] `VAL-U04` Branch merge conflict logic
- [ ] `VAL-U05` Policy reason-code mapping

## Integration
- [ ] `VAL-I01` Tauri command -> sidecar IPC v2 path
- [ ] `VAL-I02` Checkpoint write/read + resume
- [ ] `VAL-I03` Memory migration from file source
- [ ] `VAL-I04` Workflow node resume with retries
- [ ] `VAL-I05` Secure credential migration

## E2E
- [ ] `VAL-E01` Onboarding simple flow
- [ ] `VAL-E02` Stream stall + recovery
- [ ] `VAL-E03` Permission queue with restart
- [ ] `VAL-E04` Memory inspector edit/pin/delete/retrieval effect
- [ ] `VAL-E05` Branch create/merge lifecycle
- [ ] `VAL-E06` Workflow build/run/resume lifecycle
- [ ] `VAL-E07` Browser blocker + recovery path

## Benchmark
- [ ] `VAL-B01` Coding multi-file edits
- [ ] `VAL-B02` Reliability chaos (network/provider)
- [ ] `VAL-B03` Memory recall/contamination resistance
- [ ] `VAL-B04` Research citation quality
- [ ] `VAL-B05` Browser completion/safety behavior
- [ ] `VAL-B06` Enterprise policy compliance

## 9. Big-Bang Release Control Tasks

- [ ] `REL-01` Internal feature flags enabled for controlled hardening.
- [ ] `REL-02` Benchmark/checklist/security/crash-free hard gate automation active.
- [ ] `REL-03` Enforce release slip policy when any gate fails.
- [ ] `REL-04` Freeze launch change window and bug severity policy.
- [ ] `REL-05` Execute final release gate and archive evidence bundle.

## 10. Risk Register Tasks

- [ ] `RISK-01` Big-bang integration complexity mitigation tracking.
- [ ] `RISK-02` Memory migration corruption dry-run and backup tests.
- [ ] `RISK-03` Provider API drift monitoring + fallback drills.
- [ ] `RISK-04` UI complexity creep reviews for simple/pro parity.
- [ ] `RISK-05` Benchmark overfitting prevention via hidden holdout checks.
- [ ] `RISK-06` Security regression pre-release audit enforcement.

## 11. Final Definition of Done Checklist

- [ ] `DOD-01` All workstream tasks `R1`..`Q10` complete.
- [ ] `DOD-02` All new commands/types/events documented and tested.
- [ ] `DOD-03` Migration passes on clean + legacy datasets.
- [ ] `DOD-04` 3 consecutive benchmark passes meet thresholds.
- [ ] `DOD-05` No open P0/P1 defects.
- [ ] `DOD-06` Security audit unresolved critical/high = 0.
