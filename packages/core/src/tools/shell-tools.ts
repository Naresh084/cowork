import { z } from 'zod';
import type { ToolHandler, ToolContext, ToolResult } from '../types.js';
import type { PermissionRequest } from '@gemini-cowork/shared';
import { CommandExecutor, CommandValidator } from '@gemini-cowork/sandbox';

// ============================================================================
// Shell Tools
// ============================================================================

const executor = new CommandExecutor();
const validator = new CommandValidator();

/**
 * Execute a shell command.
 */
export const executeCommandTool: ToolHandler = {
  name: 'execute_command',
  description: 'Execute a shell command in the current working directory',
  parameters: z.object({
    command: z.string().describe('The shell command to execute'),
    cwd: z.string().optional().describe('Working directory for the command'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
  }),

  requiresPermission: (args): PermissionRequest | null => {
    const { command } = args as { command: string };

    // Analyze the command for risk
    const analysis = validator.analyze(command);

    // Always require permission for shell commands
    return {
      type: 'shell_execute',
      resource: command,
      reason: `Execute command (risk: ${analysis.risk}): ${command}`,
    };
  },

  execute: async (args, context: ToolContext): Promise<ToolResult> => {
    const { command, cwd, timeout } = args as {
      command: string;
      cwd?: string;
      timeout?: number;
    };

    try {
      const result = await executor.execute(command, {
        cwd: cwd || context.workingDirectory,
        timeout: timeout || 30000,
      });

      if (result.exitCode === 0) {
        return {
          success: true,
          data: {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            duration: result.duration,
          },
        };
      }

      return {
        success: false,
        error: `Command exited with code ${result.exitCode}`,
        data: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          duration: result.duration,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Analyze a command without executing it.
 */
export const analyzeCommandTool: ToolHandler = {
  name: 'analyze_command',
  description: 'Analyze a shell command for potential risks without executing it',
  parameters: z.object({
    command: z.string().describe('The shell command to analyze'),
  }),

  execute: async (args): Promise<ToolResult> => {
    const { command } = args as { command: string };

    const analysis = validator.analyze(command);

    return {
      success: true,
      data: {
        command: analysis.command,
        risk: analysis.risk,
        reasons: analysis.reasons,
        modifiedPaths: analysis.modifiedPaths,
        networkAccess: analysis.networkAccess,
        processSpawn: analysis.processSpawn,
      },
    };
  },
};

/**
 * All shell tools.
 */
export const SHELL_TOOLS: ToolHandler[] = [
  executeCommandTool,
  analyzeCommandTool,
];
