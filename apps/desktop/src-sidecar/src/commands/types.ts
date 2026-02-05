export interface CommandContext {
  workingDirectory: string;
  args: Record<string, unknown>;
  sessionId?: string;
  memoryService?: any;
  log: (message: string) => void;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  error?: {
    code: string;
    message: string;
    suggestion?: string;
  };
  data?: Record<string, unknown>;
  artifacts?: Array<{
    type: string;
    path: string;
    description: string;
  }>;
  actions?: Array<{
    type: string;
    payload?: unknown;
  }>;
}

export type CommandHandler = (ctx: CommandContext) => Promise<CommandResult>;
