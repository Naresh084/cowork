# Contributing to Cowork

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js** 20+ (see `.nvmrc` for exact version)
- **pnpm** 9+
- **Rust** (latest stable) - for Tauri backend
- **Platform dependencies** - see below

### macOS

```bash
xcode-select --install
brew install pkg-config
```

### Linux (Ubuntu/Debian)

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libxdo-dev \
  libssl-dev
```

### Getting Started

```bash
# Clone the repo
git clone https://github.com/Naresh084/cowork.git
cd cowork

# Install dependencies
pnpm install

# Build the sidecar
cd apps/desktop/src-sidecar && pnpm build && cd ../../..

# Run in development mode
pnpm dev
```

## Workflow

1. **Fork** the repository
2. **Create a branch** from `main`: `git checkout -b feature/my-feature`
3. **Make your changes** and test locally
4. **Commit** with a clear message describing the change
5. **Push** to your fork and open a **Pull Request** against `main`

## Pull Request Guidelines

- Keep PRs focused - one feature or fix per PR
- All CI checks must pass (Build, Quality Gates, Security Audit)
- Fill out the PR template
- Add/update tests for new functionality
- No secrets, credentials, or API keys in code

## Project Structure

```
apps/desktop/
  src/           # React frontend
  src-tauri/     # Rust backend (Tauri)
  src-sidecar/   # Node.js AI agent sidecar
packages/
  core/          # Core utilities
  auth/          # Authentication
  providers/     # AI provider integrations
  mcp/           # MCP protocol
  connectors/    # Service connectors
  sandbox/       # Code sandbox
  storage/       # Data persistence
  shared/        # Shared types
  gems/          # Gem system
```

## Code Style

- TypeScript/JavaScript: Prettier (see `.prettierrc`)
- Rust: `cargo fmt`
- ESLint for linting

## Running Tests

```bash
# Run all tests
pnpm test

# Run sidecar tests
pnpm --filter @cowork/sidecar test

# Run specific test file
pnpm --filter @cowork/sidecar test -- src/agent-runner.run-state.test.ts
```

## Reporting Issues

Use the [issue templates](https://github.com/Naresh084/cowork/issues/new/choose) for bug reports and feature requests.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
