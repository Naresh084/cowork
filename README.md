<p align="center">
  <img src="apps/desktop/src-tauri/icons/icon.svg" width="100" height="100" alt="Cowork" />
</p>

<h1 align="center">Cowork</h1>

<p align="center">
  <strong>Your AI command center for coding, research, tools, and integrations</strong>
</p>

<p align="center">
  Multi-provider desktop app built with Tauri 2.0 + React + TypeScript + a Node.js sidecar agent runtime.
</p>

<p align="center">
  <a href="https://github.com/Naresh084/cowork/releases/latest"><img src="https://img.shields.io/github/v/release/Naresh084/cowork?style=flat-square&color=blue" alt="Latest Release" /></a>
  <a href="https://github.com/Naresh084/cowork/actions/workflows/build.yml"><img src="https://img.shields.io/github/actions/workflow/status/Naresh084/cowork/build.yml?branch=main&style=flat-square&label=build" alt="Build Status" /></a>
  <a href="https://github.com/Naresh084/cowork/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Naresh084/cowork?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen?style=flat-square" alt="Platform" />
  <a href="https://github.com/Naresh084/cowork/stargazers"><img src="https://img.shields.io/github/stars/Naresh084/cowork?style=flat-square" alt="Stars" /></a>
  <a href="https://github.com/Naresh084/cowork/releases"><img src="https://img.shields.io/github/downloads/Naresh084/cowork/total?style=flat-square&color=orange" alt="Downloads" /></a>
</p>

<p align="center">
  <a href="https://github.com/Naresh084/cowork/releases/latest">Download</a> &middot;
  <a href="docs/GET_STARTED.md">Get Started</a> &middot;
  <a href="docs/DEVELOPMENT.md">Development</a> &middot;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## Why Cowork

Stop juggling ChatGPT, Claude, Gemini, and a dozen browser tabs. Cowork puts 8 AI providers, 51 skills, and 6 messaging platforms into one native desktop app that actually does things on your computer.

### At a Glance

| | |
|---|---|
| **AI Providers** | Google, OpenAI, Anthropic, OpenRouter, Moonshot, GLM, DeepSeek, LM Studio |
| **Messaging** | WhatsApp, Slack, Telegram, Discord, iMessage, Microsoft Teams |
| **Skills** | 51 built-in skills, 10 subagents, 23 MCP connectors, 5 command packs |
| **Platforms** | macOS (Apple Silicon + Intel), Windows, Linux (deb/rpm/AppImage) |
| **Stack** | Tauri 2.0 (Rust) + React 18 + Node.js sidecar + SQLite |

### What You Get

- **Multi-provider chat** - switch AI providers mid-session, same tools everywhere
- **Web search + fetch** with provider-aware routing and external fallbacks (Exa / Tavily / Google)
- **Media generation** - images, video, editing from chat (Google / OpenAI / Fal backends)
- **Browser automation** - `computer_use` with native provider routing
- **Deep research** - autonomous long-form research flows
- **Workflow automation** - visual builder, triggers, scheduling, durable runs
- **6 messaging bridges** - receive and reply across platforms from one session
- **Session persistence** - memory system, tool policies, permission gates

---

## Platform Highlights

### AI and Tooling

- Multi-provider chat with per-session provider + model
- Provider-aware web search routing with external fallbacks (Exa / Tavily / Google fallback path)
- Provider-aware web fetch routing (Anthropic web fetch, GLM web reader, Google URL-context fallback path)
- Provider-aware computer use (Google, OpenAI, Anthropic native paths; Google fallback for others when configured)
- Media backend routing independent from chat provider (Google / OpenAI / Fal)

### Product UX

- Provider-first onboarding
- 3 settings tabs:
  - Provider
  - Media
  - Integrations
- Command sandbox controls in Provider settings (mode, network, path scope, trusted commands, runtime/output limits)
- Session-level Plan Mode (`Plan` -> `<proposed_plan>` -> Accept/Reject -> auto-execute on accept)
- Runtime config apply pipeline with explicit "start new session" notice when changes cross compatibility boundaries

### Workflow Platform (v1)

- Workflow-first automation runtime with durable runs, node events, and replayable history
- Build workflows from chat (`create_workflow_from_chat`) or by using workflow management tools from main chat
- Visual workflow builder with trigger editing, step editing, publish/run actions, and run timeline inspection
- Scheduler UI shows both legacy cron entries and workflow schedules in one automation surface
- `schedule_task` routes new recurring automations into workflow-backed definitions
- Scheduled automations are skill-first: conversation-derived managed skills are generated and bound as mandatory execution instructions

### Developer and Ops

- Tauri desktop shell with Rust command surface
- Node sidecar with JSON-RPC over stdio
- Zustand state stores with persisted settings/session metadata
- SQLite-backed persistence in sidecar storage layer

---

## Provider Capability Matrix

The table below describes current runtime behavior in this repository.

| Provider | Chat | Native Web Search Path | Native Web Fetch Path | Native Computer Use Path | Models API Path | Base URL Editable |
|---|---|---|---|---|---|---|
| Google | Yes | Yes | Yes (URL Context) | Yes | Yes | No |
| OpenAI | Yes | Yes | No (Google fallback path) | Yes | Yes | No |
| Anthropic | Yes | Yes | Yes | Yes | Yes | No |
| OpenRouter | Yes | No (fallback path) | No (Google fallback path) | No (Google fallback path) | Yes | Yes |
| Moonshot (Kimi) | Yes | Yes | No (Google fallback path) | No (Google fallback path) | Yes | Yes |
| GLM | Yes | Yes | Yes (web reader) | No (Google fallback path) | Curated fallback path by design | Yes |
| DeepSeek | Yes | No (fallback path) | No (Google fallback path) | No (Google fallback path) | Yes (curated fallback on endpoint failure) | Yes |
| LM Studio | Yes | No (fallback path) | No (Google fallback path) | No (Google fallback path) | Yes (curated fallback on endpoint failure) | Yes |

Notes:

- Media generation is not bound to chat provider. It is controlled by media backend settings.
- Tool availability is key-gated. Missing required keys means tools are not registered.

---

## Architecture

### System Diagram

```mermaid
flowchart LR
  U["User"] --> FE["Desktop UI (React + Zustand)"]
  FE --> TAURI["Tauri Commands (Rust)"]
  TAURI --> SCM["Sidecar Manager (Rust)"]
  SCM <--> IPC["JSON-RPC over stdio"]
  IPC <--> SR["Node Sidecar Runtime"]

  SR --> AR["Agent Runner"]
  AR --> TP["Tool Policy + Permission Layer"]
  AR --> TOOLS["Tool Modules"]
  AR --> WF["Workflow Service + Engine"]
  AR --> PROV["Provider Layer"]
  AR --> STORE["Persistence (SQLite + files)"]

  TOOLS --> EXT["FS / Shell / Browser / Search / Media / MCP / Integrations"]
  PROV --> APIs["Provider APIs (Google/OpenAI/Anthropic/etc.)"]

  SR --> EVT["Event Emitter"]
  EVT --> SCM
  SCM --> FE
```

### Message Flow

```mermaid
sequenceDiagram
  participant User
  participant UI as React UI
  participant Store as chat-store
  participant Rust as Tauri Rust
  participant Sidecar as Node Sidecar
  participant Agent as Agent Runner
  participant Provider as Provider API

  User->>UI: Send prompt
  UI->>Store: dispatch message
  Store->>Rust: agent_send_message
  Rust->>Sidecar: send_message (JSON-RPC)
  Sidecar->>Agent: execute turn
  Agent->>Agent: build toolset (key + capability gated)
  Agent->>Provider: stream completion / tool calls
  Provider-->>Agent: chunks + calls
  Agent-->>Sidecar: stream/tool/permission events
  Sidecar-->>Rust: event payloads
  Rust-->>UI: forwarded events
  UI->>Store: update session/chat items
  Store-->>User: render result
```

### Runtime Config Impact Flow

```mermaid
sequenceDiagram
  participant Settings as Settings UI
  participant Auth as auth-store
  participant Rust as Tauri Rust
  participant Sidecar as Agent Runner
  participant Header as Session Header

  Settings->>Auth: save provider/media/integration changes
  Auth->>Rust: persist key/base URL commands
  Auth->>Rust: agent_set_runtime_config
  Rust->>Sidecar: set_runtime_config
  Sidecar-->>Rust: RuntimeConfigUpdateResult
  Rust-->>Auth: appliedImmediately/requiresNewSession/reasons
  Auth->>Header: runtimeConfigNotice state
  Header-->>User: "Start new session" notice when required
```

---

## Tooling Model (How Tools Are Registered)

Tool registration is dynamic and session-aware:

1. Build runtime context:
   - Active provider
   - Provider/API/fallback keys
   - Media routing and specialized model IDs
2. Compute capability gates:
   - Provider-native support
   - Key presence
   - Fallback availability
3. Register only eligible tools:
   - Ineligible tools are omitted (not registered)
4. Generate system prompt tool section from registered tools

This prevents "known missing key" runtime failures by avoiding registration when configuration is incomplete.

### Canonical Tool Names

- `web_search` (with compatibility alias `google_grounded_search`)
- `web_fetch`
- `generate_image`
- `edit_image`
- `generate_video`
- `analyze_video`
- `computer_use`
- `deep_research`
- `create_workflow_from_chat`
- `create_workflow` / `update_workflow` / `publish_workflow`
- `run_workflow` / `manage_workflow` / `get_workflow_runs`
- `schedule_task` (workflow-backed automation creation)
- `draft_skill_from_conversation` / `create_skill_from_conversation`
- plus file/system/integration tooling

---

## Onboarding and Settings

### Onboarding (Provider-first)

Required:

1. Name
2. Provider selection
3. Provider API key (optional for LM Studio)
4. Base URL for editable providers
5. Model selection (or custom model ID)

Optional:

- Media backend + key/model setup (Google/OpenAI/Fal)
- External search fallback config (Google/Exa/Tavily)
- Integration and capability keys (Stitch, etc.)

### Settings Tabs

1. **Provider**
   - Active provider
   - Provider key
   - Provider base URL (editable providers only)
2. **Media**
   - Image/video backend routing (Google/OpenAI/Fal)
   - Google/OpenAI/Fal media keys
   - Model overrides for image/video generation
3. **Integrations**
   - External search fallback provider + Exa/Tavily keys

### Workflow Automation

- Use chat for natural-language workflow creation and management.
- Use the Workflows view for visual graph editing, trigger configuration, and run inspection.
- Use Automations for mixed schedule visibility (legacy cron + workflow schedules).
- New recurring automation requests through `schedule_task` are workflow-backed.
- `schedule_task` now performs internal skill-first binding: it derives one or more reusable managed skills from current conversation context and injects mandatory skill-use instructions into scheduled execution prompts.

## Plan Mode Workflow

Plan mode is a per-session analyze-only mode:

1. Switch the session header mode from `Execute` to `Plan`.
2. Agent investigates with read-only tool access and returns `<proposed_plan>...</proposed_plan>`.
3. Review the in-chat `Plan Approval` card:
   - `Accept and Execute`: switches to execute mode and auto-runs the approved plan.
   - `Reject and Revise`: keeps plan mode and requests a revised plan.

Plan mode tool behavior:

- Allowed: read tools, `web_search`, `web_fetch`, and safe read-only shell commands.
- Blocked: writes, destructive shell, scheduling, notifications, media generation, browser automation, and other side effects.

Execute mode discipline:

- Agent is expected to call `write_todos` early for multi-step work and continuously update todo statuses as execution progresses.

### Runtime Apply Behavior

- Usually hot-applies:
  - key rotations
  - media backend/key/model changes
  - fallback search/integration key changes
- May require new session:
  - provider change
  - base URL change
  - chat model change

When required, UI surfaces a "Start new session" notice in chat header.

For deep onboarding/settings details, see:

- [docs/GET_STARTED.md](docs/GET_STARTED.md)

---

## Messaging Integrations (6 Platforms)

Cowork supports full shared-session ingress and outbound notification flows across:

- WhatsApp
- Slack
- Telegram
- Discord
- iMessage (BlueBubbles bridge; macOS host required)
- Microsoft Teams (Azure Graph app credentials)

When a platform is connected:

- Inbound messages can trigger shared-session workflows.
- Outbound notification tool is registered dynamically:
  - `send_notification_whatsapp`
  - `send_notification_slack`
  - `send_notification_telegram`
  - `send_notification_discord`
  - `send_notification_imessage`
  - `send_notification_teams`
- Attachment messages are normalized into the shared message model, with URL metadata fallback where raw bytes are unavailable.

Setup prerequisites:

- Discord: bot token, optional guild/channel allowlists, optional DM ingress.
- iMessage: BlueBubbles server URL + access token; unsupported on non-macOS hosts.
- Teams: tenant ID, client ID, client secret, team ID, channel ID.

---

## Model Catalog Strategy

Model listing is provider-aware and robust to endpoint gaps:

- API-first where stable
- Curated fallback for providers/endpoints that are unavailable or unreliable
- Custom model ID input always supported in UI

Current notable behavior:

- GLM uses curated catalog path by design in model-service fallback logic
- Moonshot, DeepSeek, LM Studio can fall back to curated lists on API failure
- Provider-specific context/output metadata is stored when available

---

## Repository Layout

```text
cowork/
├── apps/
│   └── desktop/
│       ├── src/                  # React frontend
│       ├── src-tauri/            # Rust backend (Tauri commands + sidecar manager)
│       ├── src-sidecar/          # Node sidecar agent runtime
│       └── e2e/                  # Playwright tests
├── packages/
│   ├── core/                     # Agent core interfaces + tools
│   ├── providers/                # Multi-provider abstraction and model services
│   ├── shared/                   # Shared types
│   ├── storage/                  # Persistence helpers
│   ├── mcp/                      # MCP client manager
│   ├── sandbox/                  # Command risk validation
│   ├── connectors/               # Connector framework
│   ├── auth/                     # Auth utility package
│   └── gems/                     # Shared gem utilities
├── skills/                       # 51 skills
├── subagents/                    # 10 subagents
├── connectors/                   # 23 connector configs
├── commands/                     # 5 slash-command packs
└── docs/                         # Docs (install/dev/connectors/get-started)
```

---

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Rust stable toolchain
- Tauri system prerequisites: https://tauri.app/start/prerequisites/

### Install and Run (Monorepo)

```bash
git clone https://github.com/Naresh084/cowork.git
cd cowork

pnpm install

# Build sidecar TypeScript output
cd apps/desktop/src-sidecar
pnpm build
cd ../../..

# Start dev workspace
pnpm dev
```

Alternative (desktop only):

```bash
cd apps/desktop
pnpm tauri dev
```

### First Run

Complete provider onboarding in-app, then configure optional media/integration capabilities from Settings.

Detailed flow:

- [docs/GET_STARTED.md](docs/GET_STARTED.md)

---

## Scripts

### Root

| Command | Description |
|---|---|
| `pnpm dev` | Run workspace dev tasks via Turbo |
| `pnpm build` | Build all packages/apps |
| `pnpm test` | Run all tests |
| `pnpm test:e2e` | Run E2E pipelines |
| `pnpm lint` | Lint workspace |
| `pnpm typecheck` | Type check workspace |
| `pnpm clean` | Clean artifacts |

### Desktop App (`apps/desktop`)

| Command | Description |
|---|---|
| `pnpm tauri dev` | Run desktop app in development |
| `pnpm tauri build` | Build release bundle |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | Playwright E2E |

### Sidecar (`apps/desktop/src-sidecar`)

| Command | Description |
|---|---|
| `pnpm build` | Build TypeScript to `dist/` |
| `pnpm start` | Run built sidecar |
| `pnpm pkg:macos-arm64` | Package macOS ARM sidecar binary |
| `pnpm pkg:macos-x64` | Package macOS x64 sidecar binary |
| `pnpm pkg:win-x64` | Package Windows x64 sidecar binary |
| `pnpm pkg:linux-x64` | Package Linux x64 sidecar binary |

---

## Testing

Recommended validation stack:

1. Type check
2. Unit tests
3. E2E tests
4. Manual provider/tool smoke checks

Commands:

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
```

---

## Security and Credential Handling

- Provider and capability keys are stored through Rust credential commands (system credential manager integration)
- Keys are not committed to repo and not expected in plaintext config
- Tool actions pass through permission and policy gates
- Sidecar command execution uses command sandbox policy + approval mode layering
- Sandbox supports `read-only`, `workspace-write`, `danger-full-access`
- Shell policy controls include network/process toggles, allowed/denied roots, trusted command prefixes, timeout/output caps
- Capability snapshot and session header expose effective sandbox mode and enforcement status

---

## Build and Release

Production desktop bundle:

```bash
pnpm build
cd apps/desktop
pnpm tauri build
```

Output path:

- `apps/desktop/src-tauri/target/release/bundle/`

Auto-update:

- The Tauri updater plugin is configured with signed releases. The app checks for updates on launch from GitHub Releases.

---

## Troubleshooting

### Sidecar does not start

- Rebuild sidecar:
  - `cd apps/desktop/src-sidecar && pnpm build`
- Verify `dist/index.js` exists

### Model list is empty

- Check provider key/base URL in Settings -> Provider
- For providers with fallback catalogs, use curated/custom model IDs

### Tool missing in chat

- Tool is key/capability gated
- Verify required keys and backend routing in Settings
- Recheck active provider and fallback provider selections

### Config changed but behavior did not switch

- If UI shows "Start new session", create a new chat session to fully apply provider/base URL/model boundary changes

### Web search not working on fallback providers

- Configure Exa or Tavily key in Settings -> Integrations
- Or configure Google key for Google fallback path

---

## Documentation Map

- [docs/GET_STARTED.md](docs/GET_STARTED.md): onboarding/settings/tool behavior
- [docs/INSTALLATION.md](docs/INSTALLATION.md): install and first launch
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): developer workflow
- [docs/CONNECTORS.md](docs/CONNECTORS.md): connectors setup
- [docs/skills/auto-skill-generation.md](docs/skills/auto-skill-generation.md): conversation-derived skill synthesis and skill-first scheduling
- [AGENTS.md](AGENTS.md): architecture and internal development conventions

---

## License

[MIT License](LICENSE) - Copyright (c) 2026 Naresh
