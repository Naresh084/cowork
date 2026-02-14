# Gemini Cowork — Agent Guidelines

> **The AI-Powered Desktop Coding Assistant**
> Built with Tauri + React + Gemini API

---

## Quick Reference

| Item                 | Value                                                        |
| -------------------- | ------------------------------------------------------------ |
| **Stack**            | Tauri 2 (Rust) + React 18 + TypeScript 5.7 + Node.js Sidecar |
| **Package Manager**  | pnpm 9.15 (monorepo with Turbo)                              |
| **AI Provider**      | Google Gemini API (`@google/generative-ai`, `@google/genai`) |
| **State Management** | Zustand 5 with persist middleware                            |
| **Styling**          | Tailwind CSS 3.4                                             |
| **Testing**          | Vitest (unit), Playwright (E2E)                              |

---

## Project Structure

```
cowork/
│
├── apps/
│   └── desktop/                    # Main Tauri desktop application
│       ├── src/                    # React frontend
│       │   ├── components/         # UI components
│       │   │   ├── chat/           # ChatView, MessageList, InputArea, ToolExecutionCard
│       │   │   ├── dialogs/        # PermissionDialog, confirmations
│       │   │   ├── layout/         # MainLayout, Sidebar
│       │   │   ├── modals/         # Modal windows
│       │   │   ├── onboarding/     # First-run setup
│       │   │   ├── panels/         # PreviewPanel, WorkingFolderSection
│       │   │   └── ui/             # Primitives (Button, Toast, etc.)
│       │   ├── hooks/              # React hooks (useAgentEvents, etc.)
│       │   ├── lib/                # Utilities (agent-events, event-types)
│       │   ├── stores/             # Zustand stores
│       │   │   ├── agent-store.ts  # Agent execution state
│       │   │   ├── app-store.ts    # Global app state
│       │   │   ├── auth-store.ts   # Authentication
│       │   │   ├── chat-store.ts   # Messages & conversations
│       │   │   ├── session-store.ts # Session management
│       │   │   └── settings-store.ts # User preferences
│       │   ├── App.tsx             # Root component
│       │   └── main.tsx            # Entry point
│       │
│       ├── src-tauri/              # Rust backend
│       │   ├── src/
│       │   │   ├── commands/       # Tauri command handlers
│       │   │   │   ├── agent.rs    # Agent IPC commands
│       │   │   │   ├── files.rs    # File system commands
│       │   │   │   └── keychain.rs # Credential storage
│       │   │   ├── main.rs         # App setup & event loop
│       │   │   └── sidecar.rs      # Node.js process manager
│       │   ├── Cargo.toml          # Rust dependencies
│       │   └── tauri.conf.json     # Tauri configuration
│       │
│       ├── src-sidecar/            # Node.js agent runner
│       │   ├── src/
│       │   │   ├── tools/          # Tool implementations
│       │   │   ├── agent-runner.ts # Agent lifecycle & loop
│       │   │   ├── event-emitter.ts # Event streaming to Rust
│       │   │   ├── index.ts        # Entry point (readline IPC)
│       │   │   ├── ipc-handler.ts  # Command routing
│       │   │   └── types.ts        # TypeScript types
│       │   └── package.json
│       │
│       ├── e2e/                    # Playwright E2E tests
│       └── package.json
│
├── packages/                       # Shared libraries
│   ├── core/                       # Agent loop & tools
│   │   └── src/
│   │       ├── tools/
│   │       │   ├── file-tools.ts   # read, write, edit, list, delete
│   │       │   └── shell-tools.ts  # Command execution
│   │       ├── agent.ts            # CoworkAgent class
│   │       └── types.ts            # Core types
│   │
│   ├── providers/                  # AI provider integrations
│   │   └── src/
│   │       └── gemini/
│   │           ├── gemini-provider.ts  # Main provider class
│   │           ├── models.ts           # Model definitions
│   │           ├── deep-research.ts    # Deep Research agent
│   │           └── computer-use.ts     # Browser automation
│   │
│   ├── shared/                     # Common types & utilities
│   │   └── src/
│   │       ├── types.ts            # Shared TypeScript types
│   │       ├── errors.ts           # Error classes
│   │       └── utils.ts            # Helper functions
│   │
│   ├── sandbox/                    # Command validation
│   │   └── src/
│   │       └── validator.ts        # Shell command risk assessment
│   │
│   ├── storage/                    # Persistence layer
│   │   └── src/
│   │       └── sqlite.ts           # SQLite operations
│   │
│   ├── mcp/                        # Model Context Protocol
│   │   └── src/
│   │       └── index.ts            # MCP client/server
│   │
│   └── connectors/                 # External integrations
│       └── src/
│           └── index.ts            # Calendar, APIs, etc.
│
├── gems/                           # Utility modules
│
├── AGENTS.md                       # This file
├── AGENT_MISSION.md                # Detailed implementation mission
├── package.json                    # Root package.json
├── pnpm-workspace.yaml             # Workspace configuration
└── turbo.json                      # Turbo build config
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                  │
│                                                                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│   │  ChatView   │  │  Sidebar    │  │  Panels     │  │  Dialogs    │       │
│   │  Messages   │  │  Sessions   │  │  Preview    │  │  Permissions│       │
│   │  Input      │  │  Settings   │  │  Artifacts  │  │  Modals     │       │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│          │                │                │                │               │
│          └────────────────┴────────────────┴────────────────┘               │
│                                    │                                        │
│                           ┌────────▼────────┐                               │
│                           │  Zustand Stores │                               │
│                           │  chat, session, │                               │
│                           │  agent, auth    │                               │
│                           └────────┬────────┘                               │
│                                    │                                        │
│                           ┌────────▼────────┐                               │
│                           │ useAgentEvents  │                               │
│                           │ Event Listener  │                               │
│                           └────────┬────────┘                               │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │ Tauri Events
┌────────────────────────────────────┼────────────────────────────────────────┐
│                           TAURI RUST BACKEND                                │
│                                    │                                        │
│   ┌────────────────────────────────▼────────────────────────────────────┐  │
│   │                         Command Handlers                             │  │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │  │
│   │  │ agent.rs     │  │ files.rs     │  │ keychain.rs  │               │  │
│   │  │ send_message │  │ read_file    │  │ get_api_key  │               │  │
│   │  │ create_sess  │  │ write_file   │  │ set_api_key  │               │  │
│   │  └──────┬───────┘  └──────────────┘  └──────────────┘               │  │
│   └─────────┼───────────────────────────────────────────────────────────┘  │
│             │                                                               │
│   ┌─────────▼───────────────────────────────────────────────────────────┐  │
│   │                      Sidecar Manager (sidecar.rs)                    │  │
│   │  • Spawn Node.js process                                             │  │
│   │  • JSON-RPC over stdio                                               │  │
│   │  • Forward events to frontend                                        │  │
│   └─────────┬───────────────────────────────────────────────────────────┘  │
└─────────────┼───────────────────────────────────────────────────────────────┘
              │ stdio (JSON-RPC)
┌─────────────┼───────────────────────────────────────────────────────────────┐
│             │              NODE.JS SIDECAR                                  │
│   ┌─────────▼───────────────────────────────────────────────────────────┐  │
│   │                       IPC Handler (ipc-handler.ts)                   │  │
│   │  • Parse JSON-RPC requests                                           │  │
│   │  • Route to appropriate handler                                      │  │
│   │  • Return responses                                                  │  │
│   └─────────┬───────────────────────────────────────────────────────────┘  │
│             │                                                               │
│   ┌─────────▼───────────────────────────────────────────────────────────┐  │
│   │                     Agent Runner (agent-runner.ts)                   │  │
│   │  • Session management                                                │  │
│   │  • Agent loop execution                                              │  │
│   │  • Tool orchestration                                                │  │
│   │  • Permission handling                                               │  │
│   └─────────┬───────────────────────────────────────────────────────────┘  │
│             │                                                               │
│   ┌─────────▼───────────────────────────────────────────────────────────┐  │
│   │                        Event Emitter                                 │  │
│   │  stream:start, stream:chunk, stream:end                              │  │
│   │  tool:start, tool:result, tool:error                                 │  │
│   │  permission:request, permission:response                             │  │
│   │  question:ask, question:answer                                       │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
              │
┌─────────────┼───────────────────────────────────────────────────────────────┐
│             │                 SHARED PACKAGES                               │
│   ┌─────────▼─────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│   │ @cowork/   │  │ @cowork/ │  │ @cowork/ │          │
│   │ providers         │  │ core            │  │ shared          │          │
│   │ • GeminiProvider  │  │ • CoworkAgent   │  │ • Types         │          │
│   │ • DeepResearch    │  │ • FileTools     │  │ • Errors        │          │
│   │ • ComputerUse     │  │ • ShellTools    │  │ • Utils         │          │
│   └─────────┬─────────┘  └─────────────────┘  └─────────────────┘          │
└─────────────┼───────────────────────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────────────────────┐
│                            EXTERNAL SERVICES                                │
│                                                                             │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │   Gemini API    │  │   File System   │  │   Shell/Bash    │            │
│   │   • Generate    │  │   • Read/Write  │  │   • Execute     │            │
│   │   • Stream      │  │   • List        │  │   • Git, etc.   │            │
│   │   • Tools       │  │   • Delete      │  │                 │            │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                             │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │  Google Search  │  │  Deep Research  │  │  Computer Use   │            │
│   │  (Grounding)    │  │  (Interactions) │  │  (Browser)      │            │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Instructions

### Understanding the Codebase

When working on this project, understand these key data flows:

#### 1. Message Flow (User → AI → Response)

```
User types message
  → InputArea.tsx dispatches to chat-store
  → chat-store calls Tauri command `agent_send_message`
  → Rust receives, forwards to sidecar via IPC
  → Sidecar's agent-runner processes with Gemini API
  → Events stream back: stream:chunk → tool:start → tool:result → stream:end
  → Rust forwards events to frontend
  → useAgentEvents hook updates stores
  → React re-renders with new content
```

#### 2. Tool Execution Flow

```
Gemini returns function_call
  → agent-runner checks permission (requiresPermission)
  → If needed: emit permission:request, wait for permission:response
  → Execute tool (file/shell/research/etc.)
  → Emit tool:result
  → Feed result back to Gemini
  → Continue agent loop
```

#### 3. Session Management

```
Sessions stored in: session-store.ts (Zustand + localStorage)
Each session has:
  • id: unique identifier
  • title: display name
  • workingDirectory: file operation context
  • modelId: which Gemini model
  • messages: conversation history (in chat-store)
```

---

## Code Style Guidelines

### TypeScript

```typescript
// Use explicit types, avoid `any`
interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Use async/await, never raw promises
async function executeCommand(cmd: string): Promise<ToolResult> {
  try {
    const result = await runCommand(cmd);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Prefer early returns
function processMessage(msg: Message | null): string {
  if (!msg) return '';
  if (typeof msg.content === 'string') return msg.content;
  return msg.content.map((part) => part.text || '').join('');
}
```

### React Components

```tsx
// Functional components with explicit props
interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  onRetry?: () => void;
}

export function ChatMessage({ message, isStreaming = false, onRetry }: ChatMessageProps) {
  // Hooks at top
  const [expanded, setExpanded] = useState(false);

  // Early returns for edge cases
  if (!message.content) return null;

  // Render
  return <div className={cn('message', isStreaming && 'streaming')}>{/* content */}</div>;
}
```

### Zustand Stores

```typescript
interface ChatState {
  messages: Map<string, Message[]>;
  isLoading: boolean;

  // Actions
  addMessage: (sessionId: string, message: Message) => void;
  clearMessages: (sessionId: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: new Map(),
      isLoading: false,

      addMessage: (sessionId, message) =>
        set((state) => {
          const messages = new Map(state.messages);
          const sessionMessages = messages.get(sessionId) || [];
          messages.set(sessionId, [...sessionMessages, message]);
          return { messages };
        }),

      clearMessages: (sessionId) =>
        set((state) => {
          const messages = new Map(state.messages);
          messages.delete(sessionId);
          return { messages };
        }),
    }),
    { name: 'chat-storage' }
  )
);
```

### Rust Commands

```rust
#[tauri::command]
async fn agent_send_message(
    state: tauri::State<'_, AppState>,
    session_id: String,
    message: String,
) -> Result<(), String> {
    let sidecar = state.sidecar.lock().await;

    sidecar
        .send_request("send_message", json!({
            "sessionId": session_id,
            "message": message,
        }))
        .await
        .map_err(|e| e.to_string())
}
```

---

## Common Tasks

### Adding a New Tool

1. **Define the tool handler** in `packages/core/src/tools/`:

```typescript
export const myNewTool: ToolHandler = {
  name: 'my_tool',
  description: 'What this tool does',
  parameters: z.object({
    param1: z.string().describe('Description'),
    param2: z.number().optional(),
  }),

  requiresPermission: (args) => ({
    type: 'custom',
    resource: args.param1 as string,
    reason: 'Why permission is needed',
  }),

  execute: async (args, context) => {
    // Implementation
    return { success: true, data: result };
  },
};
```

2. **Register the tool** in the tools index
3. **Add UI handling** if the tool has special output

### Adding a New Gemini Capability

1. **Update gemini-provider.ts** to include the tool:

```typescript
// In toolsToGeminiTools()
return [{ functionDeclarations }, { googleSearch: {} }, { myNewCapability: { config: 'value' } }];
```

2. **Handle the response metadata** if applicable
3. **Update UI** to display results appropriately

### Adding a New Store

1. **Create the store** in `apps/desktop/src/stores/`:

```typescript
interface MyState {
  data: SomeType[];
  actions: {
    add: (item: SomeType) => void;
  };
}

export const useMyStore = create<MyState>()(
  persist(
    (set) => ({
      data: [],
      actions: {
        add: (item) => set((s) => ({ data: [...s.data, item] })),
      },
    }),
    { name: 'my-storage' }
  )
);
```

2. **Use in components** via hooks
3. **Connect to events** if needed in `useAgentEvents`

---

## Testing

### Run All Tests

```bash
pnpm test
```

### Run Specific Package Tests

```bash
pnpm test --filter=@cowork/core
pnpm test --filter=@cowork/providers
```

### Run Desktop Tests

```bash
cd apps/desktop
pnpm vitest          # Unit tests
pnpm playwright test # E2E tests
```

### Run Type Checking

```bash
pnpm tsc --noEmit
```

### Run Linting

```bash
pnpm lint
```

---

## Development Workflow

### Starting Development

```bash
# Install dependencies
pnpm install

# Build packages
pnpm build

# Build sidecar
cd apps/desktop/src-sidecar && pnpm build

# Start Tauri dev server
cd apps/desktop && pnpm tauri dev
```

### Making Changes

1. **Create a feature branch**
2. **Make changes** following the style guidelines
3. **Run tests** before committing
4. **Commit with clear messages**:
   ```
   feat(tools): add edit_file tool for surgical edits
   fix(chat): resolve streaming race condition
   refactor(stores): simplify session management
   ```

### Building for Production

```bash
cd apps/desktop && pnpm tauri build
```

---

## Debugging

### Frontend (React)

- Open DevTools: `Cmd+Option+I`
- React DevTools for component inspection
- Zustand DevTools for store state

### Sidecar (Node.js)

- Logs output to stdout, captured by Rust
- Add `console.error()` for debugging (shows in terminal)
- Check `src-sidecar/dist/` for compiled output

### Rust Backend

- Use `println!()` or `eprintln!()` for debugging
- Logs appear in terminal running `pnpm tauri dev`
- Use `cargo check` for quick compilation verification

### IPC Issues

- Check event flow in browser console
- Verify sidecar is running: look for process in Activity Monitor
- Check for JSON serialization errors in Rust logs

---

## Key Files Reference

| Purpose        | File(s)                                              |
| -------------- | ---------------------------------------------------- |
| App entry      | `apps/desktop/src/main.tsx`, `src-tauri/src/main.rs` |
| Chat UI        | `src/components/chat/ChatView.tsx`, `InputArea.tsx`  |
| Agent loop     | `src-sidecar/src/agent-runner.ts`                    |
| Gemini API     | `packages/providers/src/gemini/gemini-provider.ts`   |
| File tools     | `packages/core/src/tools/file-tools.ts`              |
| Shell tools    | `packages/core/src/tools/shell-tools.ts`             |
| Message state  | `src/stores/chat-store.ts`                           |
| Session state  | `src/stores/session-store.ts`                        |
| Event handling | `src/hooks/useAgentEvents.ts`                        |
| IPC (Rust)     | `src-tauri/src/sidecar.rs`                           |
| IPC (Node)     | `src-sidecar/src/ipc-handler.ts`                     |
| Tauri commands | `src-tauri/src/commands/*.rs`                        |

---

## Gemini API Features

### Currently Implemented

- [x] Generate content (streaming)
- [x] Function calling (tools)
- [x] Multi-turn conversations
- [x] System instructions

### To Be Implemented

- [ ] `googleSearch` - Web search grounding
- [ ] `urlContext` - URL fetching
- [ ] `codeExecution` - Python sandbox
- [ ] `fileSearch` - Document search
- [ ] Deep Research (Interactions API)
- [ ] Computer Use (Browser automation)
- [ ] `googleMaps` - Location grounding

### SDK Requirements

```json
{
  "@google/generative-ai": "^0.21.0", // Standard API
  "@google/genai": "^1.33.0" // Interactions API (Deep Research)
}
```

---

## Security Considerations

### File Operations

- All paths validated against working directory
- Symlink escape detection
- Blocked system directories (`/etc`, `/usr`, `/System`, etc.)

### Shell Commands

- Sandbox validator assesses risk level
- High-risk commands require explicit permission
- Commands logged for audit

### API Keys

- Stored in system keychain (not plaintext)
- Never logged or transmitted
- Scoped to Gemini API only

### Permissions

- Every tool operation can require permission
- User approves before execution
- Permission decisions not persisted by default

---

## Troubleshooting

| Issue                   | Solution                                                    |
| ----------------------- | ----------------------------------------------------------- |
| Sidecar won't start     | Check `src-sidecar/dist/` exists, rebuild with `pnpm build` |
| API key not found       | Re-enter in settings, check keychain access                 |
| Events not received     | Verify `useAgentEvents` hook is mounted                     |
| Streaming stops         | Check for unhandled promise rejections in sidecar           |
| Permission dialog stuck | Check permission event flow in console                      |
| Build fails             | Run `pnpm install`, check Rust toolchain version            |

---

## Mission Reference

For detailed implementation tasks, see **[AGENT_MISSION.md](./AGENT_MISSION.md)**

That document contains:

- Phase-by-phase implementation plan
- Complete code for all new features
- Testing checklists
- Success criteria

---

_Last updated: 2025-02_
