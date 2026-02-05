# Gemini Cowork

An AI-powered desktop coding assistant built with Tauri, React, and Google's Gemini API.

## Overview

Gemini Cowork is a desktop application that provides an intelligent AI agent to assist with coding tasks. It features a modern chat interface where you can interact with the Gemini AI model to get help with code, file operations, shell commands, and more.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + Tauri)                  │
│  React, TypeScript, Zustand, Tailwind CSS                   │
└─────────────────────────┬───────────────────────────────────┘
                          │ Tauri IPC
┌─────────────────────────▼───────────────────────────────────┐
│                    Rust Backend (Tauri)                      │
│  App lifecycle, IPC commands, keychain, file operations     │
└─────────────────────────┬───────────────────────────────────┘
                          │ stdio JSON-RPC
┌─────────────────────────▼───────────────────────────────────┐
│                    Node.js Sidecar                           │
│  Agent runner, Gemini API integration, tool execution       │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Zustand
- **Desktop Framework**: Tauri 2.0 (Rust)
- **AI Provider**: Google Gemini API
- **Build Tools**: Vite, Turborepo, pnpm
- **Testing**: Vitest, Playwright

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Rust** (latest stable) - [Install Rust](https://rustup.rs/)
- **Tauri CLI prerequisites** - [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Platform-specific requirements

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

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/geminicowork.git
cd geminicowork
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up environment variables

Create a `.env` file in the `apps/desktop` directory:

```bash
cp apps/desktop/.env.example apps/desktop/.env
```

Add your Gemini API key:
```env
GEMINI_API_KEY=your_api_key_here
```

> **Note**: Get your API key from [Google AI Studio](https://aistudio.google.com/apikey)

### 4. Build the sidecar

```bash
cd apps/desktop/src-sidecar
pnpm build
cd ../../..
```

### 5. Run in development mode

```bash
pnpm dev
```

Or run just the desktop app:
```bash
cd apps/desktop
pnpm tauri dev
```

## Project Structure

```
geminicowork/
├── apps/
│   └── desktop/              # Main desktop application
│       ├── src/              # React frontend
│       ├── src-tauri/        # Rust backend
│       └── src-sidecar/      # Node.js agent runner
├── packages/
│   ├── auth/                 # Authentication utilities
│   ├── connectors/           # External service connectors
│   ├── core/                 # Core agent loop and tools
│   ├── gems/                 # Gemini-specific utilities
│   ├── mcp/                  # Model Context Protocol
│   ├── providers/            # AI provider implementations
│   ├── sandbox/              # Command validation/sandboxing
│   ├── shared/               # Shared types and utilities
│   └── storage/              # Storage layer (SQLite)
├── docs/                     # Documentation
└── scripts/                  # Build and utility scripts
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

## Development

### Type checking

```bash
pnpm typecheck
```

### Linting

```bash
pnpm lint
```

### Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and proprietary.

## Support

For issues and questions, please open an issue on GitHub.
