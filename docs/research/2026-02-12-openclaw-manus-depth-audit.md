# Gemini Cowork vs OpenClaw and Manus
## Deep Feature and Usability Depth Audit

Date: 2026-02-12
Author: Codex research pass (internal code audit + external primary-source benchmark)

## 1) Objective
This document answers a product-depth question, not a feature checklist question:
- What is already implemented in Gemini Cowork end-to-end.
- How deeply those features work in real usage.
- How OpenClaw and Manus appear to implement depth (architecture, reliability, usability, operational maturity).
- Why users may still perceive Gemini Cowork as less usable even when feature parity exists.
- What should be changed first to move from "feature present" to "feature trusted and repeatedly used".

## 2) Method
Internal analysis:
- Frontend surface audit of chat UX, streaming, tool cards, permissions, sessions, settings, onboarding, artifacts/panels, and Zustand stores.
- Runtime audit of Rust Tauri bridge + Node sidecar (IPC lifecycle, permission flow, failure behavior, eventing).
- Shared package audit (`packages/core`, `providers`, `sandbox`, `storage`, `mcp`, `connectors`).
- Quality audit of tests, security controls, and error handling robustness.

External benchmark analysis:
- OpenClaw official repository and docs.
- Manus official docs and official product pages.
- Agent Skills open standard docs and reference implementation.
- A major public ecosystem security incident report tied to OpenClaw distribution ecosystem (for trust/safety implications).

## 3) Gemini Cowork: Current Feature Depth (Internal)

### 3.1 Chat UX and input pipeline
What exists:
- Rich chat shell with welcome actions, drag/drop, queueing, attachments, and model/working-directory guards.
- Input flow is integrated with command palette and folder selection gating.

Depth observed:
- Good happy-path controls for sending messages, attachments, and model checks.
- Robust basic edge handling: empty-message blocking, working directory modal, stream-aware scroll behavior.

Depth gaps:
- Pending message recovery is shallow during working-directory interruptions (single pending item behavior).
- Queue and pending permission state are not durable across app reloads.
- Stream-stall recovery is weak from user perspective (limited resume/recover affordances).

Relevant files:
- `apps/desktop/src/components/chat/ChatView.tsx`
- `apps/desktop/src/components/chat/InputArea.tsx`
- `apps/desktop/src/components/chat/MessageQueue.tsx`
- `apps/desktop/src/stores/chat-store.ts`

### 3.2 Streaming and message rendering
What exists:
- Streaming message path with activity rendering and tool/permission overlays.
- Search inside message history and "jump to end" affordances.

Depth observed:
- Smooth core behavior on normal streams.
- Good compositional rendering model for turn activities.

Depth gaps:
- If stream-state metadata gets out of sync, visible recovery options are weak.
- Large activity payloads can become heavy without virtualization-level controls.

Relevant files:
- `apps/desktop/src/components/chat/MessageList.tsx`
- `apps/desktop/src/components/chat/StreamingMessage.tsx`

### 3.3 Tool output and action transparency
What exists:
- Tool cards with status indicators, parsed metadata, argument/result expansion, and copy helpers.

Depth observed:
- Strong baseline explainability for tool operations.
- Reasonable structured display and status model.

Depth gaps:
- Very large JSON output can degrade UX.
- Fallbacks for clipboard and large payload handling are limited.

Relevant files:
- `apps/desktop/src/components/chat/ToolExecutionCard.tsx`
- `apps/desktop/src/components/chat/TaskToolCard.tsx`

### 3.4 Permission system UX
What exists:
- Inline permission cards + modal permission dialog.
- "Remember" behavior and response handling integration.

Depth observed:
- Permission intent and risk are visible.
- Basic dedupe and request resolution behavior is present.

Depth gaps:
- Multiple pending approvals are not presented as a first-class queue UX.
- Keyboard and timeout ergonomics are limited; stalled approval can block perceived flow.

Relevant files:
- `apps/desktop/src/components/dialogs/PermissionDialog.tsx`
- `apps/desktop/src/components/chat/MessageList.tsx`
- `apps/desktop/src/stores/chat-store.ts`

### 3.5 Sessions, settings, onboarding
What exists:
- Session CRUD + paging/search behavior.
- Working-directory onboarding gate.
- Multi-tab settings and provider/model configuration.

Depth observed:
- Practical baseline for single-user session lifecycle.
- Solid settings breadth.

Depth gaps:
- Failure recovery guidance in some settings/session errors is shallow (toast-only in critical paths).
- Onboarding interruption/recovery durability could improve.

Relevant files:
- `apps/desktop/src/stores/session-store.ts`
- `apps/desktop/src/components/chat/SessionHeader.tsx`
- `apps/desktop/src/components/settings/SettingsView.tsx`
- `apps/desktop/src/components/onboarding/Onboarding.tsx`

### 3.6 Artifacts, preview, and side panels
What exists:
- Artifact list, preview pane, live browser screenshot view, context and progress panels.

Depth observed:
- Feature breadth is high.
- Good foundational panel decomposition.

Depth gaps:
- Artifact scale handling (long runs) needs stronger list performance and retrieval ergonomics.
- Error boundary behavior around some heavy preview flows (example: PDF) can be hardened.

Relevant files:
- `apps/desktop/src/components/panels/WorkingFolderSection.tsx`
- `apps/desktop/src/components/panels/PreviewPanel.tsx`
- `apps/desktop/src/components/panels/LiveBrowserView.tsx`

### 3.7 Runtime architecture and IPC maturity
What exists:
- Rust command handlers route to sidecar manager.
- Sidecar startup includes daemon-first strategy and embedded fallback.
- IPC request/response IDs, timeout handling, pending request map, and event forwarding are implemented.

Depth observed:
- Runtime plumbing is comparatively mature.
- Permission request-response loop and cancellation pathways are meaningful.

Depth gaps:
- Observability remains shallow for production incidents (limited structured metrics/tracing).
- Some resilience aspects rely on in-memory behavior and ad hoc logs.

Relevant files:
- `apps/desktop/src-tauri/src/main.rs`
- `apps/desktop/src-tauri/src/sidecar.rs`
- `apps/desktop/src-sidecar/src/ipc-handler.ts`
- `apps/desktop/src-sidecar/src/bootstrap.ts`
- `apps/desktop/src-sidecar/src/event-emitter.ts`
- `apps/desktop/src-sidecar/src/agent-runner.ts`

### 3.8 Shared package depth
What exists:
- `packages/core`: agent loop, tool contracts, compaction service.
- `packages/providers`: Gemini + other provider abstractions, model service/catalog.
- `packages/sandbox`: command risk evaluation + execution wrapper.
- `packages/storage`: local SQLite repositories.
- `packages/mcp`: MCP client manager with tool/resource/prompt discovery.
- `packages/connectors`: connector manager with Drive/Docs baseline.

Depth observed:
- Core architecture is modular and extensible.
- Sandbox and provider abstractions are credible foundations.

Depth gaps:
- Deep Research / Computer Use wrappers are still thin in error and retry behavior.
- MCP reconnect/backoff and discovery resilience are limited.
- Connector breadth and operational depth are still early.

Relevant files:
- `packages/core/src/agent.ts`
- `packages/core/src/compaction/compaction-service.ts`
- `packages/providers/src/gemini/gemini-provider.ts`
- `packages/providers/src/gemini/deep-research.ts`
- `packages/providers/src/gemini/computer-use.ts`
- `packages/sandbox/src/validator.ts`
- `packages/sandbox/src/executor.ts`
- `packages/storage/src/database.ts`
- `packages/mcp/src/client.ts`
- `packages/connectors/src/index.ts`

### 3.9 Quality and security maturity
What exists:
- Unit tests for some stores and minimal core unit test coverage.
- E2E smoke test exists.
- Sandbox policies block major dangerous paths by default.

Depth gaps with direct product impact:
- Sparse test coverage on highest-risk flows (provider loop, sandbox enforcement edge cases, full tool loop).
- Error classification patterns rely heavily on substring matching in places, which is brittle.
- Credential handling implementation appears inconsistent with keychain-oriented security claims in docs.

Relevant files:
- `apps/desktop/e2e/app.spec.ts`
- `packages/core/src/agent.test.ts`
- `packages/providers/src/gemini/gemini-provider.ts`
- `packages/sandbox/src/validator.ts`
- `apps/desktop/src-tauri/src/commands/credentials.rs`

## 4) OpenClaw: Deep Feature Behavior (External)

This section summarizes OpenClaw from official docs/repo and highlights depth mechanisms, not only feature names.

### 4.1 Architectural depth signals
OpenClaw publicly describes:
- Multi-channel architecture with intent-driven channel routing.
- Parsing and routing reliability techniques (pattern+heuristic based).
- Message pipeline strategies with retry and graceful degradation behavior.

Why this matters:
- Usability depth is often produced by route correctness + retries + fallback behavior, not by adding more UI surfaces.

### 4.2 Session and context depth
OpenClaw docs describe:
- Branch sessions and merged flows.
- Session routing concepts.
- Context optimization patterns including folding/compaction and pruning.

Why this matters:
- Long-running agent usability depends on context cost and branch ergonomics being built-in and visible.

### 4.3 Tooling and extensibility depth
OpenClaw docs describe:
- Tool architecture with default providers and security boundaries.
- MCP support and app/plugin style ecosystem surfaces.
- Commands/workflows and automation-oriented operation modes.

Why this matters:
- Users feel "power" when advanced behaviors are packaged as repeatable, discoverable workflows.

### 4.4 Reliability depth
OpenClaw docs and README indicate:
- Model fallback/failover behavior.
- Local-first and async-first runtime principles.
- Production-minded retry semantics in multiple subsystems.

Why this matters:
- Reliability depth is visible when users can continue work despite transient model/tool errors.

### 4.5 Security and trust depth
OpenClaw docs include dedicated areas for:
- Security model.
- Sandboxing controls.
- Execution approvals and permission models.

Important ecosystem reality:
- Public reporting documented a malicious package incident in the ClawHub ecosystem. The OpenClaw team later disabled third-party plugin installs in response.

Why this matters:
- A serious security incident can also increase maturity if governance response is fast and transparent.

### 4.6 Product surface breadth
OpenClaw docs and README present broad user-facing features:
- Terminal, desktop, and web experiences.
- Voice mode, browser mode, canvas mode.
- Scheduled tasks, workflows, memory, branching, context tools.

Inference note:
- Breadth alone does not guarantee depth, but breadth plus strong reliability and governance can create stronger retention.

## 5) Manus: Deep Feature Behavior and Skills Model (External)

### 5.1 Manus feature system
Official Manus docs surface the following integrated capabilities:
- Projects (context handoff and relaunch).
- Scheduled tasks.
- Cloud browser and browser operator.
- Integrations.
- Design view.
- Wide Research (up to 100 parallel agents, per docs).
- Slides, data analysis, multimedia, mail, and collaboration features.

Depth signal:
- Manus positions itself as a workflow platform where high-value task shapes are pre-packaged and routed into specialized modes.

### 5.2 Manus skills: how it works
Official Manus docs describe skills as reusable automation modules with a staged execution model:
- Stage 1: Understand requirement.
- Stage 2: Activate skill.
- Stage 3: Execute workflow.
- Stage 4: Deliver result.

Invocation model:
- Direct invocation by user intent.
- Adaptive triggering based on detected task context.

Skill composition:
- Can include scripts, templates, and external APIs.
- Distributed via a skill library and reusable by non-technical users.

Why this matters:
- Skills increase depth when they encode repeatable best-practice behavior, not just static prompts.

### 5.3 Manus product quality implication
Inference from docs:
- Manus is optimizing for "outcome bundles" (research, slides, analysis, browser work) rather than exposing primitive tools only.
- This lowers cognitive load and increases usability for broader users.

## 6) Direct Depth Comparison (Not Feature Checklist)

Scoring legend:
- Feature Presence: Yes/Partial/No
- Operational Depth: Low/Med/High (how robustly it works under real-world variability)
- Usable Depth: Low/Med/High (how often normal users can succeed without manual rescue)

| Capability | Gemini Cowork | OpenClaw | Manus | Depth Gap Summary |
|---|---|---|---|---|
| Core chat + streaming | Presence: Yes, Op: Med, Usable: Med | Presence: Yes, Op: High (per docs emphasis), Usable: High | Presence: Yes, Op: High, Usable: High | Gemini needs stronger stream recovery and interruption-resilient state. |
| Permission workflow | Presence: Yes, Op: Med, Usable: Med-Low | Presence: Yes, Op: High (documented approvals/sandbox) | Presence: Yes, Op: Med-High (mode-specific workflows) | Queue UX, retry ergonomics, and persistence are key missing polish points. |
| Tool execution transparency | Presence: Yes, Op: Med, Usable: Med | Presence: Yes, Op: High | Presence: Yes, Op: High via packaged workflows | Gemini has good cards, but large-output resilience and robust failure explanations need work. |
| Sessions and context branching | Presence: Partial (sessions strong, branching not productized as in benchmark) | Presence: High (branch sessions/routing concepts) | Presence: High (projects/task contexts) | Need first-class branching/project context workflows in UX. |
| Reliability (retry/fallback) | Presence: Partial | Presence: High (documented failover + retries) | Presence: High (specialized mode workflows) | Reliability is a decisive benchmark gap, even where feature parity exists. |
| Workflow automation | Presence: Partial | Presence: High (commands/workflows/scheduled tasks) | Presence: High (scheduled + skillified outcome flows) | Gemini should package reusable end-to-end workflows, not only primitive tool calls. |
| Research depth mode | Presence: Partial/experimental wrappers | Presence: High (deep research ecosystem) | Presence: High (wide research + project handoff) | Gemini research path needs stronger orchestration and output standards. |
| Browser/computer use | Presence: Partial | Presence: High | Presence: High | Gemini has foundations but needs hardened operator loops and UX state clarity. |
| Extensibility ecosystem | Presence: Partial (MCP + connectors early) | Presence: High (tool/plugin ecosystem) | Presence: High (skill library ecosystem) | Build repeatable ecosystem standards + trust controls + easier publishing. |
| Security governance | Presence: Med | Presence: Med-High (public docs + incident response), with ecosystem risk history | Presence: Med (official safeguards implied) | Gemini should align implementation with stated key-management posture and strengthen auditability. |
| Testing confidence | Presence: Low-Med | Unknown publicly (not scored in depth) | Unknown publicly (not scored in depth) | Internally this is a major weakness for shipping reliability quickly. |

## 7) Why Users Feel "Not Usable Enough" Despite Feature Presence

### 7.1 Reliability debt is user-visible
Primary problem:
- Users tolerate missing features longer than unreliable behavior.
- Retry and fallback depth appears weaker than benchmark expectations.

### 7.2 Workflow packaging is shallow
Primary problem:
- Many capabilities exist as primitives, but not as polished end-to-end task products.
- Manus/OpenClaw style success comes from repeatable predefined workflows and context transfer models.

### 7.3 State durability and recovery are incomplete
Primary problem:
- Interrupted workflows (permissions, queue, stream) need better persistence and restoration.

### 7.4 Observability and QA depth are below scale needs
Primary problem:
- Hard-to-debug runtime incidents and limited coverage over critical paths slow quality iteration.

### 7.5 Security posture alignment needs tightening
Primary problem:
- Any mismatch between stated and actual key handling damages trust, even if other controls are strong.

## 8) Priority Roadmap (Quality Over Speed)

### Phase A (0-3 weeks): Make existing features reliably usable
1. Implement robust stream recovery and timeout-aware resume behavior in chat UX/store.
2. Add first-class pending approval queue UI with persistence across reloads.
3. Persist message queue and unresolved in-flight actions to prevent user work loss.
4. Replace brittle string-match error typing with structured error categories.
5. Add deterministic integration tests for permission loop, tool failure/retry, and session recovery.

### Phase B (3-8 weeks): Build operational depth
1. Add model/tool retry policies with circuit-breaker style backoff and visible fallback explanations.
2. Harden Deep Research and Computer Use wrappers with step-level retries and richer failure semantics.
3. Add richer observability (structured event logs + counters + failure taxonomy dashboards).
4. Implement project/branch workflow UX to make long-running work manageable.

### Phase C (8-14 weeks): Productize power workflows
1. Create reusable workflow packs for common tasks (research brief, code fix with tests, deployment check, etc.).
2. Introduce skill-like reusable modules (direct invocation + adaptive triggers) inside your own toolchain.
3. Improve connector ecosystem depth (auth lifecycle, sync guarantees, operational monitoring).

## 9) Measurable Success Criteria
1. 95th percentile successful task completion without manual retry improves by >= 30%.
2. Permission-related user stalls reduced by >= 50%.
3. Stream interruption recovery success > 90% within one-click recovery.
4. Tool/run failure diagnostics become actionable in <= 2 minutes from logs/events.
5. High-risk path test coverage reaches >= 80% for agent loop, provider errors, sandbox policy, and permission flow.

## 10) Concrete "Start Here" Worklist
1. `apps/desktop/src/stores/chat-store.ts`: persist queued/pending interaction state + stream recovery metadata.
2. `apps/desktop/src/components/chat/MessageList.tsx`: pending permission queue UX + bulk visibility controls.
3. `apps/desktop/src/components/dialogs/PermissionDialog.tsx`: keyboard actions, timeout-safe defaults, queue navigation.
4. `packages/providers/src/gemini/gemini-provider.ts`: structured error taxonomy + typed fallback decisions.
5. `packages/providers/src/gemini/deep-research.ts`: retry/backoff and richer partial-failure reporting.
6. `packages/providers/src/gemini/computer-use.ts`: operator robustness, deterministic step outcomes, and recovery semantics.
7. `apps/desktop/src-sidecar/src/event-emitter.ts`: emit reliability counters and standardized event metadata.
8. `apps/desktop/src-tauri/src/commands/credentials.rs`: align credential storage implementation with documented security expectations.

## 11) External Sources
OpenClaw:
- https://github.com/steipete/openclaw
- https://docs.openclaw.ai
- https://docs.openclaw.ai/overview
- https://docs.openclaw.ai/overview/what-is-openclaw
- https://docs.openclaw.ai/features
- https://docs.openclaw.ai/security
- https://docs.openclaw.ai/security/sandboxing
- https://docs.openclaw.ai/security/execution-approvals
- https://docs.openclaw.ai/concepts/tools
- https://docs.openclaw.ai/concepts/channel-routing
- https://docs.openclaw.ai/concepts/sessions
- https://docs.openclaw.ai/advanced/model-failover
- https://docs.openclaw.ai/optimization/resource-constraints
- https://docs.openclaw.ai/optimization/conversation-pruning
- https://docs.openclaw.ai/optimization/context-compaction
- https://docs.openclaw.ai/skills
- https://www.theverge.com/news/754675/openclaw-ai-coding-assistant-malware-crypto-clawhub

Manus:
- https://docs.manus.im
- https://docs.manus.im/features/skills
- https://docs.manus.im/features/projects
- https://docs.manus.im/features/scheduled-tasks
- https://docs.manus.im/features/cloud-browser
- https://docs.manus.im/features/browser-operator
- https://docs.manus.im/features/wide-research
- https://docs.manus.im/features/slides
- https://docs.manus.im/features/data-analysis
- https://docs.manus.im/features/integrations
- https://docs.manus.im/features/collaboration
- https://manus.im/pages/skills

Agent Skills standard:
- https://agentskills.io
- https://agentskills.io/integrate-skills
- https://agentskills.io/skills-ref
- https://github.com/agentskills/agentskills

## 12) Confidence and Limits
- Confidence is high on internal feature/depth mapping because the audit used repository-level code inspection.
- Confidence is medium-high on OpenClaw and Manus external details where official docs were available.
- Some benchmark internals are inferred from public documentation and should be validated with hands-on product runs before final strategy lock.
