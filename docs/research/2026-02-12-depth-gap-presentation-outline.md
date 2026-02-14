# Presentation Outline: Product Depth Gap
## Gemini Cowork vs OpenClaw vs Manus

Date: 2026-02-12

## Slide 1 - Goal
- Move from feature parity to trusted usability depth.
- Explain exactly why users may prefer OpenClaw/Manus today.

## Slide 2 - Research Scope
- Internal codebase depth audit (frontend, runtime, packages, quality/security).
- External deep benchmark from official OpenClaw and Manus sources.
- Focus on "how it works", not a checkbox comparison.

## Slide 3 - Definition of Depth
- Reliability depth: succeeds under failures/interruption.
- Workflow depth: reusable packaged outcomes.
- Recovery depth: no data/work loss across interruptions.
- Trust depth: predictable permissions + security posture + observability.

## Slide 4 - Internal Strengths
- Strong modular architecture across Tauri, sidecar, and shared packages.
- Good baseline tool cards, session model, settings surface, and sandbox controls.
- Broad capability footprint already exists.

## Slide 5 - Internal Weaknesses
- Critical-path test coverage is thin.
- Retry/fallback behavior is not consistently productized.
- Permission and stream recovery UX still brittle under interruptions.
- Some security posture/documentation alignment concerns.

## Slide 6 - OpenClaw: Why It Feels Deep
- Multi-channel routing and parsing pipeline.
- Branch sessions, context folding/compaction, failover patterns.
- Security/sandbox/approval controls surfaced as first-class product concepts.
- Workflow and ecosystem orientation (tools/plugins/commands).

## Slide 7 - Manus: Why It Feels Deep
- Outcome-centric feature stack (projects, research, slides, browser, analysis).
- Skill lifecycle and adaptive skill triggering.
- Platform-style reusable modules for repeatable task completion.

## Slide 8 - The Main Gap
- Not missing features only.
- Missing operational depth and user trust in repeated real-world usage.

## Slide 9 - Depth Gap Matrix (High Level)
- Chat/stream recovery: Medium vs benchmark High.
- Permission ergonomics: Medium-Low vs benchmark High.
- Reliability/fallback: Partial vs benchmark High.
- Workflow packaging: Partial vs benchmark High.

## Slide 10 - User Pain Pattern 1
- Stream interruptions create uncertainty and manual rescue.
- No clear one-click recovery standard path.

## Slide 11 - User Pain Pattern 2
- Permission flow blocks momentum when multiple requests pile up.
- Queueing and persistence behavior are not first-class UX.

## Slide 12 - User Pain Pattern 3
- Primitive tools exist, but workflow templates are not strong enough.
- Users need "do this whole job" modes, not only atomic tool steps.

## Slide 13 - User Pain Pattern 4
- Sparse observability and brittle error typing slow quality iteration.

## Slide 14 - Security and Trust
- Sandbox foundation is good.
- Align implementation with documented key-storage claims.
- Add stronger auditability signals for user confidence.

## Slide 15 - Phase A (0-3 Weeks)
- Stream recovery UX + queue persistence.
- Permission queue with keyboard and timeout-safe behaviors.
- Structured error taxonomy.
- Critical integration tests for agent loop and permissions.

## Slide 16 - Phase B (3-8 Weeks)
- Retry/backoff/circuit-breaker style model and tool fallback.
- Harden deep-research/computer-use execution reliability.
- Add structured metrics and failure dashboards.

## Slide 17 - Phase C (8-14 Weeks)
- Launch skill/workflow packs for top user jobs.
- Add adaptive workflow activation patterns.
- Improve connector ecosystem reliability and monitoring.

## Slide 18 - KPI Targets
- Task success without manual retry +30%.
- Permission-related stalls -50%.
- Stream-recovery success >90%.
- Critical-path coverage >=80%.

## Slide 19 - First Engineering Worklist
- `apps/desktop/src/stores/chat-store.ts`
- `apps/desktop/src/components/chat/MessageList.tsx`
- `apps/desktop/src/components/dialogs/PermissionDialog.tsx`
- `packages/providers/src/gemini/gemini-provider.ts`
- `packages/providers/src/gemini/deep-research.ts`
- `packages/providers/src/gemini/computer-use.ts`
- `apps/desktop/src-sidecar/src/event-emitter.ts`
- `apps/desktop/src-tauri/src/commands/credentials.rs`

## Slide 20 - Decision
- Decision point: prioritize "reliability and workflow depth" as the next product pillar.
- This is the shortest path to competitive usability against OpenClaw and Manus.
