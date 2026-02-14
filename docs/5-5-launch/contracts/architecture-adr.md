# ADR-001: Runtime Architecture and Flow Freeze

Date: 2026-02-12  
Status: Accepted (Frozen)

## Context

The launch branch requires a stable end-to-end architecture so all reliability, memory, policy, workflow, research, and benchmark workstreams can converge without interface drift.

## Decision

Freeze the target architecture as:

1. React desktop UI + Zustand stores for operator surfaces and durable client state.
2. Tauri command layer (Rust) as trusted transport and OS-security boundary.
3. Sidecar runtime (Node) as orchestration runtime for agent loops and tools.
4. Orchestrator v2 with reliability engine, policy engine, workflow/skills engine, memory kernel v2, provider router, and observability bus.
5. Local-only memory stack backed by encrypted SQLite + local vector index + memory graph edges.
6. Unified event bus powering run timeline, benchmark console, and release-gate evaluation.

No breaking architectural changes are allowed without release-gate exception.

## Frozen Topology

```mermaid
graph TD
A["React Desktop UI"] --> B["Zustand Stores"]
B --> C["Tauri Command Layer (Rust)"]
C --> D["Sidecar Runtime (Node)"]
D --> E["Orchestrator Kernel v2"]
E --> F["Reliability Engine"]
E --> G["Policy and Approval Engine"]
E --> H["Workflow and Skills Engine"]
E --> I["Memory Kernel v2 (Local-Only)"]
E --> J["Provider Router"]
E --> K["Tool Fabric (Native, MCP, Connectors)"]
E --> L["Observability and Benchmark Bus"]
I --> M["Encrypted SQLite Memory Store"]
I --> N["Local Vector Index"]
I --> O["Memory Graph Layer"]
L --> P["Run Timeline UI"]
L --> Q["Benchmark Console UI"]
L --> R["Release Gate Evaluator"]
```

## Frozen Run Sequence

```mermaid
sequenceDiagram
participant U as "User"
participant UI as "Desktop UI"
participant TA as "Tauri Layer"
participant SC as "Sidecar"
participant OR as "Orchestrator v2"
participant ME as "Memory Kernel v2"
participant PO as "Policy Engine"
participant TL as "Tool Fabric"
participant PR as "Provider Router"
participant EV as "Event Bus"

U->>UI: submit message
UI->>TA: agent_send_message_v2
TA->>SC: IPC request with run_id
SC->>OR: start run state machine
OR->>ME: retrieve context pack
ME-->>OR: ranked memory evidence
OR->>PO: policy/permission precheck
PO-->>OR: allow or request approval
OR->>TL: execute tools/workflows
TL-->>OR: outputs and artifacts
OR->>PR: model call with retry/failover
PR-->>OR: response chunks/directives
OR->>ME: persist episodic/semantic/procedural memory
OR->>EV: emit structured run events
EV-->>UI: stream, timeline, diagnostics
OR-->>SC: final run result
SC-->>TA: completion
TA-->>UI: persisted final state
```

## Frozen Memory Loop

```mermaid
flowchart LR
A["Conversation Events"] --> B["Episodic Extractor"]
B --> C["Semantic Distiller"]
C --> D["Atom Store"]
D --> E["Hybrid Retrieval (Lexical + Vector + Graph)"]
E --> F["Cross-Encoder Rerank"]
F --> G["Contradiction Filter"]
G --> H["Prompt Context Pack"]
H --> I["Model Inference"]
I --> J["Feedback Signals"]
J --> K["Memory Re-scoring and Consolidation"]
K --> D
```

## Consequences

1. All command/type/event additions must remain backward compatible with the frozen contracts.
2. Delivery focus shifts from breadth to depth: reliability, correctness, safety, and usability.
3. Release gate can reject any change violating this ADR without exception approval.

## Verification

- Cross-reference contract freeze: `docs/5-5-launch/contracts/v2-contract-freeze.md`
- Architecture references now centralized in this ADR for design review and execution tracking.

