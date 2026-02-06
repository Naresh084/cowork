<p align="center">
  <img src="apps/desktop/src-tauri/icons/icon.svg" width="80" height="80" alt="Cowork" />
</p>

<h1 align="center">Cowork</h1>

<p align="center">
  <strong>Your AI command center for coding</strong>
</p>

<p align="center">
  A desktop coding assistant powered by Google Gemini — with 51 skills, 10 subagents, 23 MCP connectors, deep research, computer use, and persistent memory.
</p>

---

## Downloads

| Platform | Download |
|----------|----------|
| Windows (64-bit) | [Download .exe](https://github.com/AiCodingBattle/geminicowork/releases/latest) |
| macOS (Apple Silicon) | [Download .dmg (M1/M2/M3)](https://github.com/AiCodingBattle/geminicowork/releases/latest) |
| macOS (Intel) | [Download .dmg (Intel)](https://github.com/AiCodingBattle/geminicowork/releases/latest) |
| Linux (AppImage) | [Download .AppImage](https://github.com/AiCodingBattle/geminicowork/releases/latest) |
| Linux (Debian) | [Download .deb](https://github.com/AiCodingBattle/geminicowork/releases/latest) |

## Features

### AI Capabilities

- **Gemini Integration** — Native Gemini API with streaming, function calling, and grounded search
- **Deep Research** — Multi-step web research with report generation and citations
- **Computer Use** — Live browser view with split-pane interaction
- **Vision** — Image and video understanding from files, clipboard, or camera
- **Image & Video Generation** — Create visuals from natural language prompts

### Agent System

- **51 Skills** across automation, creative, development, DevOps, productivity, and research categories
- **10 Subagents** — code-architect, code-reviewer, documentation-writer, performance-optimizer, refactoring-assistant, security-auditor, task-planner, test-engineer, web-researcher, api-integrator
- **23 MCP Connectors** — databases (Postgres, MySQL, MongoDB, Redis, SQLite), cloud (GitHub, GitLab, Jira, Linear, Sentry), productivity (Slack, Discord, Notion, Todoist, Microsoft 365, Google Workspace, Teams), and dev tools (Puppeteer, Brave Search, Exa)
- **5 Commands** — `/help`, `/clear`, `/init`, `/memory`, bundled utilities

### Core Features

- **Memory System** — Groups, persistence, tagging, and relevance-based recall
- **Session Persistence** — SQLite-backed session history with full conversation replay
- **Cron & Automations** — Job scheduling with execution history
- **Artifact System** — File tracking with preview panel
- **Permission System** — Approval modes and tool policies for safe execution
- **Todo Tracking** — In-agent task management with status tracking

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Frontend (React + Tauri)                    │
│  React 18, TypeScript, Zustand, Tailwind CSS, Framer Motion  │
└────────────────────────┬─────────────────────────────────────┘
                         │ Tauri IPC
┌────────────────────────▼─────────────────────────────────────┐
│                   Rust Backend (Tauri 2.0)                    │
│  App lifecycle, IPC commands, keychain, file I/O, sessions   │
└────────────────────────┬─────────────────────────────────────┘
                         │ stdio JSON-RPC
┌────────────────────────▼─────────────────────────────────────┐
│                   Node.js Sidecar                             │
│  Agent runner, Gemini API, tool execution, MCP, subagents    │
└──────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Zustand, Framer Motion
- **Desktop Framework**: Tauri 2.0 (Rust)
- **AI Provider**: Google Gemini API
- **Storage**: SQLite (via better-sqlite3)
- **Build Tools**: Vite, Turborepo, pnpm
- **Testing**: Vitest, Playwright

## Getting Started

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Rust** (latest stable) — [Install Rust](https://rustup.rs/)
- **Tauri CLI prerequisites** — [Tauri Prerequisites](https://tauri.app/start/prerequisites/)

#### macOS
```bash
xcode-select --install
```

#### Linux (Debian/Ubuntu)
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

#### Windows
- Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

### Setup

```bash
# Clone the repository
git clone https://github.com/AiCodingBattle/geminicowork.git
cd geminicowork

# Install dependencies
pnpm install

# Set up environment
cp apps/desktop/.env.example apps/desktop/.env
# Add your Gemini API key to apps/desktop/.env

# Build the sidecar
cd apps/desktop/src-sidecar && pnpm build && cd ../../..

# Run in development mode
pnpm dev
```

> Get your API key from [Google AI Studio](https://aistudio.google.com/apikey)

## Project Structure

```
geminicowork/
├── apps/
│   └── desktop/                # Main desktop application
│       ├── src/                # React frontend
│       ├── src-tauri/          # Rust backend
│       └── src-sidecar/        # Node.js agent runner
├── packages/
│   ├── core/                   # Core agent loop and tools
│   ├── auth/                   # Authentication utilities
│   ├── providers/              # AI provider implementations
│   ├── mcp/                    # Model Context Protocol client
│   ├── connectors/             # External service connectors
│   ├── sandbox/                # Command validation and sandboxing
│   ├── storage/                # Storage layer (SQLite)
│   ├── shared/                 # Shared types and utilities
│   └── gems/                   # Gemini-specific utilities
├── skills/                     # 51 agent skills (SKILL.md + config)
├── subagents/                  # 10 specialized subagents
├── connectors/                 # 23 MCP connector configs
├── commands/                   # 5 slash commands
├── docs/                       # Documentation
└── scripts/                    # Build and utility scripts
```

## Available Scripts

### Root level (Turborepo)

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all packages and apps |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all packages |
| `pnpm format` | Format code with Prettier |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm clean` | Clean all build artifacts |

### Desktop app (`apps/desktop`)

| Command | Description |
|---------|-------------|
| `pnpm tauri dev` | Run Tauri in development mode |
| `pnpm tauri build` | Build production release |
| `pnpm test` | Run unit tests |
| `pnpm test:e2e` | Run E2E tests with Playwright |

## Building for Production

```bash
# Build all packages
pnpm build

# Build desktop app
cd apps/desktop
pnpm tauri build
```

The built application will be in `apps/desktop/src-tauri/target/release/bundle/`.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and proprietary.
