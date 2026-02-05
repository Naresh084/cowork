/**
 * Slash Commands - Pure Prompt Templates
 *
 * Commands are simple prompt shortcuts. When user types /init, it expands
 * to a detailed prompt and sends as a normal message. No handlers, no
 * execution logic, no installation.
 *
 * Flow:
 * 1. User types "/" -> Command palette opens
 * 2. User selects command -> Input shows "/commandname "
 * 3. User can add more text after command
 * 4. On Enter:
 *    - If action command (like /clear) -> execute action directly
 *    - If prompt command -> expand prompt + user addition -> send as normal message
 * 5. AI responds with streaming (standard message flow)
 */

export type CommandCategory = 'setup' | 'memory' | 'utility' | 'workflow';

export interface SlashCommand {
  /** Unique identifier (e.g., "init") */
  name: string;

  /** Human-readable name */
  displayName: string;

  /** Short description for auto-suggest */
  description: string;

  /** Alternative names (e.g., ["initialize", "setup"]) */
  aliases: string[];

  /** Command category */
  category: CommandCategory;

  /** Icon name for UI (lucide icon) */
  icon?: string;

  /** Prompt template to expand (null for action-only commands) */
  prompt: string | null;

  /** Frontend-only action (e.g., 'clear_chat') */
  action?: 'clear_chat';

  /** Sort order (higher = first) */
  priority?: number;
}

// =============================================================================
// Prompt Templates
// =============================================================================

const INIT_PROMPT = `Generate a comprehensive AGENTS.md file for this project.

IMPORTANT INSTRUCTIONS:

1. ANALYZE the project structure by examining:
   - Package files (package.json, pyproject.toml, Cargo.toml, go.mod, pom.xml)
   - Configuration files (.eslintrc, tsconfig.json, prettier.config.js, etc.)
   - Directory structure and naming conventions
   - README.md if present
   - Source code patterns (first few files in src/)

2. CREATE an AGENTS.md file at the project root with these sections:

## Project Overview
[Project name, purpose, and what it does in 2-3 sentences]

## Tech Stack
| Component | Technology |
|-----------|------------|
| Language | [detected language(s)] |
| Framework | [detected framework] |
| Build Tool | [detected build tool] |
| Package Manager | [npm/pnpm/yarn/pip/cargo/etc.] |
| Testing | [detected test framework] |

## Architecture
[Brief description of architecture pattern - MVC, Clean Architecture, Monorepo, etc.]

### Directory Structure
\`\`\`
project-root/
├── src/           # [purpose]
├── tests/         # [purpose]
└── ...
\`\`\`

## Key Commands
| Command | Purpose |
|---------|---------|
| \`npm run dev\` | Start development server |
| \`npm run build\` | Build for production |
| \`npm test\` | Run tests |
| [etc.] |

## Coding Standards
- [Detected indentation style]
- [Naming conventions: camelCase, snake_case, etc.]
- [Import style and organization]
- [Any linting rules detected]

## Important Files
- [Entry point file]
- [Main config file]
- [Key module files]

## Agent Guidelines
### Do
- Follow existing patterns and conventions in this codebase
- Use the established utilities and helpers
- Match the existing code style exactly
- Write tests for new functionality

### Don't
- Introduce new dependencies without asking
- Change existing APIs without a migration plan
- Skip error handling
- Over-engineer solutions

3. WRITE the file to AGENTS.md in the project root

4. SHOW a summary of what was detected and created

Note: If AGENTS.md already exists, show its contents and ask before overwriting.`;

const HELP_PROMPT = `Here are the available slash commands:

## Setup Commands
- **/init** (aliases: /initialize, /setup) - Generate an AGENTS.md project context file with smart detection of your tech stack, conventions, and architecture

## Memory Commands
- **/memory** (aliases: /mem, /memories) - Manage long-term memories stored in .cowork/memories/

## Utility Commands
- **/help** (aliases: /?, /commands) - Show this help message
- **/clear** (aliases: /cls, /reset) - Clear the current conversation

## Tips
- Type "/" to see command suggestions with autocomplete
- You can add additional instructions after any command
- Example: "/init focus on the API layer and authentication flow"
- Commands expand to detailed prompts - you'll see exactly what's sent`;

const MEMORY_PROMPT = `I'll help you manage your long-term memories. Memories persist across conversations and help me remember your preferences, learnings, and project context.

## What would you like to do?

**List memories**: Say "list all memories" or "show memories in preferences"

**Add a memory**: Say "remember that I prefer TypeScript with strict mode" or "add a learning about our API patterns"

**Search memories**: Say "find memories about React" or "search for authentication"

**Remove a memory**: Say "forget the memory about old API" or "delete memory [id]"

**Show memory details**: Say "show memory [id]" or "what do you remember about coding style"

## Memory Groups
- **preferences/** - Your coding style, tool preferences, and personal choices
- **learnings/** - Patterns, insights, and things learned from past sessions
- **context/** - Project architecture decisions and important context
- **instructions/** - Custom guidelines for how I should behave

## Examples
- "Remember that I prefer functional components over class components"
- "List all my preferences"
- "What do you know about this project's architecture?"
- "Forget the outdated API documentation memory"

What would you like me to help you with?`;

// =============================================================================
// Built-in Commands
// =============================================================================

export const BUILT_IN_COMMANDS: SlashCommand[] = [
  {
    name: 'init',
    displayName: 'Initialize Project',
    description: 'Generate an AGENTS.md file for this project',
    aliases: ['initialize', 'setup'],
    category: 'setup',
    icon: 'file-plus',
    priority: 100,
    prompt: INIT_PROMPT,
  },
  {
    name: 'help',
    displayName: 'Help',
    description: 'Show available commands',
    aliases: ['?', 'commands'],
    category: 'utility',
    icon: 'help-circle',
    priority: 90,
    prompt: HELP_PROMPT,
  },
  {
    name: 'clear',
    displayName: 'Clear Conversation',
    description: 'Clear the current conversation',
    aliases: ['cls', 'reset'],
    category: 'utility',
    icon: 'trash-2',
    priority: 80,
    action: 'clear_chat',
    prompt: null,
  },
  {
    name: 'memory',
    displayName: 'Memory Management',
    description: 'Manage long-term memories',
    aliases: ['mem', 'memories'],
    category: 'memory',
    icon: 'brain',
    priority: 85,
    prompt: MEMORY_PROMPT,
  },
];

// =============================================================================
// Utilities
// =============================================================================

/**
 * Find a command by name or alias
 */
export function findCommandByAlias(alias: string): SlashCommand | undefined {
  const lowerAlias = alias.toLowerCase();
  return BUILT_IN_COMMANDS.find(
    (cmd) =>
      cmd.name.toLowerCase() === lowerAlias ||
      cmd.aliases.some((a) => a.toLowerCase() === lowerAlias)
  );
}

/**
 * Expand a command prompt with optional user addition
 */
export function expandCommandPrompt(
  command: SlashCommand,
  userAddition?: string
): string | null {
  if (!command.prompt) return null;

  let expanded = command.prompt;
  if (userAddition?.trim()) {
    expanded += `\n\nAdditional user instructions: ${userAddition.trim()}`;
  }
  return expanded;
}

/**
 * Parse command input string
 * Returns { commandName, userAddition } or null if not a command
 */
export function parseCommandInput(input: string): {
  commandName: string;
  userAddition: string;
} | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex > 0) {
    return {
      commandName: trimmed.slice(1, spaceIndex),
      userAddition: trimmed.slice(spaceIndex + 1),
    };
  }

  return {
    commandName: trimmed.slice(1),
    userAddition: '',
  };
}

/**
 * Check if input is a command
 */
export function isCommandInput(input: string): boolean {
  return input.trim().startsWith('/');
}
