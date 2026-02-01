import { z } from 'zod';
import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { join, dirname, resolve, isAbsolute } from 'path';
import type { ToolHandler, ToolContext, ToolResult } from '../types.js';
import type { PermissionRequest } from '@gemini-cowork/shared';

// ============================================================================
// File Tools
// ============================================================================

/**
 * Resolve a path relative to the working directory.
 */
function resolvePath(path: string, cwd: string): string {
  if (isAbsolute(path)) {
    return path;
  }
  return resolve(cwd, path);
}

/**
 * Read a file.
 */
export const readFileTool: ToolHandler = {
  name: 'read_file',
  description: 'Read the contents of a file',
  parameters: z.object({
    path: z.string().describe('The path to the file to read'),
  }),

  requiresPermission: (args): PermissionRequest | null => {
    const { path } = args as { path: string };
    return {
      type: 'file_read',
      resource: path,
      reason: `Read file: ${path}`,
    };
  },

  execute: async (args, context: ToolContext): Promise<ToolResult> => {
    const { path } = args as { path: string };
    const absolutePath = resolvePath(path, context.workingDirectory);

    try {
      const content = await readFile(absolutePath, 'utf-8');
      return {
        success: true,
        data: content,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Write to a file.
 */
export const writeFileTool: ToolHandler = {
  name: 'write_file',
  description: 'Write content to a file. Creates the file if it does not exist.',
  parameters: z.object({
    path: z.string().describe('The path to the file to write'),
    content: z.string().describe('The content to write to the file'),
  }),

  requiresPermission: (args): PermissionRequest | null => {
    const { path } = args as { path: string };
    return {
      type: 'file_write',
      resource: path,
      reason: `Write to file: ${path}`,
    };
  },

  execute: async (args, context: ToolContext): Promise<ToolResult> => {
    const { path, content } = args as { path: string; content: string };
    const absolutePath = resolvePath(path, context.workingDirectory);

    try {
      // Ensure directory exists
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf-8');
      return {
        success: true,
        data: `Successfully wrote to ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * List directory contents.
 */
export const listDirectoryTool: ToolHandler = {
  name: 'list_directory',
  description: 'List the contents of a directory',
  parameters: z.object({
    path: z.string().describe('The path to the directory to list').default('.'),
  }),

  requiresPermission: (args): PermissionRequest | null => {
    const { path } = args as { path: string };
    return {
      type: 'file_read',
      resource: path,
      reason: `List directory: ${path}`,
    };
  },

  execute: async (args, context: ToolContext): Promise<ToolResult> => {
    const { path } = args as { path: string };
    const absolutePath = resolvePath(path, context.workingDirectory);

    try {
      const entries = await readdir(absolutePath, { withFileTypes: true });
      const results = entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: join(path, entry.name),
      }));
      return {
        success: true,
        data: results,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list directory: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Get file or directory info.
 */
export const getFileInfoTool: ToolHandler = {
  name: 'get_file_info',
  description: 'Get information about a file or directory',
  parameters: z.object({
    path: z.string().describe('The path to the file or directory'),
  }),

  requiresPermission: (args): PermissionRequest | null => {
    const { path } = args as { path: string };
    return {
      type: 'file_read',
      resource: path,
      reason: `Get file info: ${path}`,
    };
  },

  execute: async (args, context: ToolContext): Promise<ToolResult> => {
    const { path } = args as { path: string };
    const absolutePath = resolvePath(path, context.workingDirectory);

    try {
      const stats = await stat(absolutePath);
      return {
        success: true,
        data: {
          path,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          size: stats.size,
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get file info: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Create a directory.
 */
export const createDirectoryTool: ToolHandler = {
  name: 'create_directory',
  description: 'Create a directory',
  parameters: z.object({
    path: z.string().describe('The path to the directory to create'),
  }),

  requiresPermission: (args): PermissionRequest | null => {
    const { path } = args as { path: string };
    return {
      type: 'file_write',
      resource: path,
      reason: `Create directory: ${path}`,
    };
  },

  execute: async (args, context: ToolContext): Promise<ToolResult> => {
    const { path } = args as { path: string };
    const absolutePath = resolvePath(path, context.workingDirectory);

    try {
      await mkdir(absolutePath, { recursive: true });
      return {
        success: true,
        data: `Successfully created directory: ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Delete a file.
 */
export const deleteFileTool: ToolHandler = {
  name: 'delete_file',
  description: 'Delete a file',
  parameters: z.object({
    path: z.string().describe('The path to the file to delete'),
  }),

  requiresPermission: (args): PermissionRequest | null => {
    const { path } = args as { path: string };
    return {
      type: 'file_delete',
      resource: path,
      reason: `Delete file: ${path}`,
    };
  },

  execute: async (args, context: ToolContext): Promise<ToolResult> => {
    const { path } = args as { path: string };
    const absolutePath = resolvePath(path, context.workingDirectory);

    try {
      await unlink(absolutePath);
      return {
        success: true,
        data: `Successfully deleted: ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * All file tools.
 */
export const FILE_TOOLS: ToolHandler[] = [
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  getFileInfoTool,
  createDirectoryTool,
  deleteFileTool,
];
