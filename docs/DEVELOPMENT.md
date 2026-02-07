# Gemini Cowork Developer Guide

## Prerequisites

### All Platforms
- Node.js 20+
- pnpm 9+
- Rust 1.75+

### Windows
- Visual Studio Build Tools 2022 with "Desktop development with C++"
- WebView2 Runtime

### macOS
- Xcode Command Line Tools: `xcode-select --install`

### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

---

## Setup

```bash
# Clone repository
git clone https://github.com/AiCodingBattle/geminicowork.git
cd geminicowork

# Install dependencies
pnpm install

# Start development server
cd apps/desktop
pnpm tauri dev
```

---

## Building for Production

### Build for Current Platform
```bash
cd apps/desktop

# Build sidecar first
cd src-sidecar
pnpm build
# Then package for your platform (choose one):
pnpm pkg:macos-arm64   # macOS Apple Silicon
pnpm pkg:macos-x64     # macOS Intel
pnpm pkg:linux-x64     # Linux
pnpm pkg:win-x64       # Windows
cd ..

# Build Tauri app
pnpm tauri build
```

### Build for All Platforms
Use GitHub Actions - push a tag starting with `v`:
```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## Project Structure

```
geminicowork/
├── apps/
│   └── desktop/
│       ├── src/              # React frontend
│       ├── src-tauri/        # Rust backend
│       │   ├── src/
│       │   │   ├── commands/ # Tauri commands
│       │   │   ├── main.rs   # Entry point
│       │   │   └── sidecar.rs # Sidecar manager
│       │   ├── binaries/     # Bundled sidecar binaries
│       │   └── Cargo.toml
│       └── src-sidecar/      # Node.js sidecar
│           ├── src/
│           └── package.json
├── packages/                 # Shared packages
│   ├── core/                 # Core agent logic
│   ├── providers/            # AI provider implementations
│   ├── shared/               # Shared types
│   └── storage/              # Data persistence
├── docs/                     # Documentation
└── .github/                  # CI/CD workflows
```

---

## Architecture

### Cross-Platform Credential Storage
The app uses the `keyring` Rust crate for secure credential storage:
- **macOS**: Keychain (via Security.framework)
- **Windows**: Credential Manager
- **Linux**: Secret Service (GNOME Keyring/KWallet via D-Bus)

### Sidecar
The Node.js sidecar handles:
- AI model communication (Gemini API)
- MCP server integration
- Session management
- Tool execution
- Workflow runtime (definitions, compiler, engine, trigger router, run history)

In development, it runs via `npx tsx`. In production, it's bundled as a standalone binary using `pkg`.

### Workflow Runtime Stack

Core workflow implementation lives in:

- `apps/desktop/src-sidecar/src/workflow/` (service, engine, compiler, triggers, node executor)
- `apps/desktop/src-sidecar/src/tools/workflow-tool.ts` (agent-facing workflow tools)
- `apps/desktop/src-sidecar/src/ipc-handler.ts` (`workflow_*` IPC commands)
- `apps/desktop/src-tauri/src/commands/workflow.rs` (Rust bridge)
- `apps/desktop/src/components/workflow/` (visual builder + run inspector)
- `packages/shared/src/types/workflow.ts` (workflow contracts)
- `packages/storage/src/repositories/workflow*.ts` (workflow persistence)

### Auto-Updater
The app automatically checks for updates using Tauri's updater plugin:
- Checks on startup (after 3 seconds)
- Checks every 30 minutes while running
- Downloads and installs updates automatically
- Restarts the app after installation

---

## Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Type checking
pnpm typecheck
```

Workflow-focused validation:

```bash
# Sidecar workflow logic
pnpm --filter @gemini-cowork/sidecar typecheck
pnpm --filter @gemini-cowork/sidecar test

# Desktop workflow UI and stores
pnpm --filter @gemini-cowork/desktop typecheck
pnpm --filter @gemini-cowork/desktop test

# Rust command bridge
cd apps/desktop/src-tauri && cargo check
```

---

## Release Process

1. Update version in `apps/desktop/src-tauri/tauri.conf.json`
2. Update CHANGELOG.md
3. Commit and push
4. Create and push a tag:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
5. GitHub Actions will build and create a release
6. Review the draft release and publish

### Signing Keys Setup (One-time)

Generate signing keys for the updater:
```bash
# Generate key pair
tauri signer generate -w ~/.tauri/geminicowork.key
```

Add to GitHub repository secrets:
- `TAURI_SIGNING_PRIVATE_KEY`: The private key content
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: The password you set

Update `tauri.conf.json` with the public key.

---

## Troubleshooting

### Rust compilation errors
```bash
# Clean and rebuild
cd apps/desktop/src-tauri
cargo clean
cargo build
```

### Frontend build issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules
pnpm install
```

### Sidecar communication issues
Check the sidecar logs in the terminal running `pnpm tauri dev`.
