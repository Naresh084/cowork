import { agentRunner } from './agent-runner.js';
import type {
  IPCRequest,
  IPCResponse,
  CreateSessionParams,
  SendMessageParams,
  RespondPermissionParams,
  RespondQuestionParams,
  StopGenerationParams,
  GetSessionParams,
  DeleteSessionParams,
  LoadMemoryParams,
  SaveMemoryParams,
  MemoryEntry,
} from './types.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// ============================================================================
// IPC Handler
// ============================================================================

type CommandHandler = (params: Record<string, unknown>) => Promise<unknown>;

const handlers: Map<string, CommandHandler> = new Map();

/**
 * Register a command handler.
 */
function registerHandler(command: string, handler: CommandHandler): void {
  handlers.set(command, handler);
}

/**
 * Handle an IPC request.
 */
export async function handleRequest(request: IPCRequest): Promise<IPCResponse> {
  const handler = handlers.get(request.command);

  if (!handler) {
    return {
      id: request.id,
      success: false,
      error: `Unknown command: ${request.command}`,
    };
  }

  try {
    const result = await handler(request.params);
    return {
      id: request.id,
      success: true,
      result,
    };
  } catch (error) {
    return {
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Command Handlers
// ============================================================================

// Set API key
registerHandler('set_api_key', async (params) => {
  const { apiKey } = params as { apiKey: string };
  agentRunner.setApiKey(apiKey);
  return { success: true };
});

// Check if ready
registerHandler('is_ready', async () => {
  return { ready: agentRunner.isReady() };
});

// Create session
registerHandler('create_session', async (params) => {
  const p = params as unknown as CreateSessionParams;
  if (!p.workingDirectory) throw new Error('workingDirectory is required');
  const session = await agentRunner.createSession(p.workingDirectory, p.model, p.title);
  return session;
});

// Send message
registerHandler('send_message', async (params) => {
  const p = params as unknown as SendMessageParams;
  if (!p.sessionId || !p.content) throw new Error('sessionId and content are required');
  await agentRunner.sendMessage(p.sessionId, p.content, p.attachments);
  return { success: true };
});

// Respond to permission
registerHandler('respond_permission', async (params) => {
  const p = params as unknown as RespondPermissionParams;
  if (!p.sessionId || !p.permissionId || !p.decision) {
    throw new Error('sessionId, permissionId, and decision are required');
  }
  agentRunner.respondToPermission(p.sessionId, p.permissionId, p.decision);
  return { success: true };
});

// Stop generation
registerHandler('stop_generation', async (params) => {
  const p = params as unknown as StopGenerationParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  agentRunner.stopGeneration(p.sessionId);
  return { success: true };
});

// Respond to question
registerHandler('respond_question', async (params) => {
  const p = params as unknown as RespondQuestionParams;
  if (!p.sessionId || !p.questionId) {
    throw new Error('sessionId and questionId are required');
  }
  agentRunner.respondToQuestion(p.sessionId, p.questionId, p.answer);
  return { success: true };
});

// List sessions
registerHandler('list_sessions', async () => {
  return agentRunner.listSessions();
});

// Get session
registerHandler('get_session', async (params) => {
  const p = params as unknown as GetSessionParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  const session = agentRunner.getSession(p.sessionId);
  if (!session) {
    throw new Error(`Session not found: ${p.sessionId}`);
  }
  return session;
});

// Delete session
registerHandler('delete_session', async (params) => {
  const p = params as unknown as DeleteSessionParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  const success = agentRunner.deleteSession(p.sessionId);
  return { success };
});

// Update session title
registerHandler('update_session_title', async (params) => {
  const p = params as { sessionId: string; title: string };
  if (!p.sessionId || !p.title) throw new Error('sessionId and title are required');
  agentRunner.updateSessionTitle(p.sessionId, p.title);
  return { success: true };
});

// Update session working directory
registerHandler('update_session_working_directory', async (params) => {
  const p = params as { sessionId: string; workingDirectory: string };
  if (!p.sessionId || !p.workingDirectory) throw new Error('sessionId and workingDirectory are required');
  agentRunner.updateSessionWorkingDirectory(p.sessionId, p.workingDirectory);
  return { success: true };
});

// Get tasks
registerHandler('get_tasks', async (params) => {
  const p = params as unknown as GetSessionParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  return agentRunner.getTasks(p.sessionId);
});

// Get artifacts
registerHandler('get_artifacts', async (params) => {
  const p = params as unknown as GetSessionParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  return agentRunner.getArtifacts(p.sessionId);
});

// Get context usage
registerHandler('get_context_usage', async (params) => {
  const p = params as unknown as GetSessionParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  return agentRunner.getContextUsage(p.sessionId);
});

// Load memory from GEMINI.md
registerHandler('load_memory', async (params) => {
  const p = params as unknown as LoadMemoryParams;
  if (!p.workingDirectory) throw new Error('workingDirectory is required');
  const workingDirectory = p.workingDirectory;
  const memoryPath = join(workingDirectory, 'GEMINI.md');

  if (!existsSync(memoryPath)) {
    return { entries: [] };
  }

  try {
    const content = await readFile(memoryPath, 'utf-8');
    const entries = parseGeminiMd(content);
    return { entries };
  } catch (error) {
    throw new Error(`Failed to load memory: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// Save memory to GEMINI.md
registerHandler('save_memory', async (params) => {
  const p = params as unknown as SaveMemoryParams;
  if (!p.workingDirectory || !p.entries) {
    throw new Error('workingDirectory and entries are required');
  }
  const memoryPath = join(p.workingDirectory, 'GEMINI.md');
  const entries = p.entries;

  try {
    // Ensure directory exists
    const dir = dirname(memoryPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const content = generateGeminiMd(entries);
    await writeFile(memoryPath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to save memory: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// Ping (for health checks)
registerHandler('ping', async () => {
  return { pong: true, timestamp: Date.now() };
});

// ============================================================================
// GEMINI.md Parsing
// ============================================================================

const CATEGORY_HEADERS: Record<string, MemoryEntry['category']> = {
  'project context': 'project',
  'preferences': 'preferences',
  'code patterns': 'patterns',
  'additional context': 'context',
  'custom': 'custom',
};

function parseGeminiMd(content: string): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const lines = content.split('\n');

  let currentCategory: MemoryEntry['category'] = 'project';
  let entryId = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for category headers
    const headerMatch = line.match(/^##\s+(.+)$/i);
    if (headerMatch) {
      const headerText = headerMatch[1].toLowerCase();
      for (const [key, category] of Object.entries(CATEGORY_HEADERS)) {
        if (headerText.includes(key)) {
          currentCategory = category;
          break;
        }
      }
      continue;
    }

    // Check for list items
    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      entries.push({
        id: `mem_${entryId++}`,
        category: currentCategory,
        content: listMatch[1],
        createdAt: Date.now(),
        source: 'user',
      });
    }
  }

  return entries;
}

function generateGeminiMd(entries: MemoryEntry[]): string {
  const sections: Record<MemoryEntry['category'], string[]> = {
    project: [],
    preferences: [],
    patterns: [],
    context: [],
    custom: [],
  };

  // Group entries by category
  for (const entry of entries) {
    sections[entry.category].push(`- ${entry.content}`);
  }

  // Build markdown
  const lines: string[] = ['# Project Memory', ''];

  if (sections.project.length > 0) {
    lines.push('## Project Context', ...sections.project, '');
  }

  if (sections.preferences.length > 0) {
    lines.push('## Preferences', ...sections.preferences, '');
  }

  if (sections.patterns.length > 0) {
    lines.push('## Code Patterns', ...sections.patterns, '');
  }

  if (sections.context.length > 0) {
    lines.push('## Additional Context', ...sections.context, '');
  }

  if (sections.custom.length > 0) {
    lines.push('## Custom', ...sections.custom, '');
  }

  return lines.join('\n');
}

// ============================================================================
// Export
// ============================================================================

export { handlers, registerHandler };
