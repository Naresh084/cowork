import { z } from 'zod';
import { readFile, writeFile, mkdir, readdir, stat, unlink, realpath } from 'fs/promises';
import { join, dirname, resolve, isAbsolute, normalize } from 'path';
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
    return normalize(path);
  }
  return normalize(resolve(cwd, path));
}

/**
 * Validate that a path is within the allowed working directory.
 * Prevents path traversal attacks (e.g., ../../etc/passwd)
 */
function validatePathSecurity(absolutePath: string, workingDirectory: string): { valid: boolean; error?: string } {
  const normalizedPath = normalize(absolutePath);
  const normalizedWorkDir = normalize(workingDirectory);

  // Check for path traversal attempts
  if (normalizedPath.includes('..')) {
    // After normalization, '..' should be resolved, but check the relative path
    const relativePath = normalizedPath.replace(normalizedWorkDir, '');
    if (relativePath.includes('..')) {
      return { valid: false, error: 'Path traversal detected: cannot access paths outside working directory' };
    }
  }

  // Ensure the path starts with the working directory
  if (!normalizedPath.startsWith(normalizedWorkDir)) {
    return { valid: false, error: `Access denied: path must be within working directory (${workingDirectory})` };
  }

  // Block access to sensitive system directories
  const blockedPaths = ['/etc', '/System', '/usr', '/var', '/bin', '/sbin', '/private', '/Library'];
  for (const blocked of blockedPaths) {
    if (normalizedPath.startsWith(blocked)) {
      return { valid: false, error: `Access denied: cannot access system directory (${blocked})` };
    }
  }

  return { valid: true };
}

/**
 * Validate path and check for symlink escapes.
 * Returns the real path after resolving symlinks.
 */
async function validateAndResolvePath(path: string, workingDirectory: string): Promise<{ path: string; error?: string }> {
  const absolutePath = resolvePath(path, workingDirectory);

  // First validation: check the requested path
  const pathCheck = validatePathSecurity(absolutePath, workingDirectory);
  if (!pathCheck.valid) {
    return { path: absolutePath, error: pathCheck.error };
  }

  try {
    // Resolve symlinks to get the real path
    const realPath = await realpath(absolutePath);

    // Second validation: check the resolved real path (prevents symlink escape)
    const realPathCheck = validatePathSecurity(realPath, workingDirectory);
    if (!realPathCheck.valid) {
      return { path: absolutePath, error: 'Symlink escape detected: target is outside working directory' };
    }

    return { path: realPath };
  } catch {
    // File doesn't exist yet, use the normalized absolute path
    return { path: absolutePath };
  }
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

    // Validate path security
    const { path: validatedPath, error: validationError } = await validateAndResolvePath(path, context.workingDirectory);
    if (validationError) {
      return { success: false, error: validationError };
    }

    try {
      const content = await readFile(validatedPath, 'utf-8');
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

    // Validate path security (use resolvePath for non-existent files)
    const absolutePath = resolvePath(path, context.workingDirectory);
    const validationCheck = validatePathSecurity(absolutePath, context.workingDirectory);
    if (!validationCheck.valid) {
      return { success: false, error: validationCheck.error };
    }

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

    // Validate path security
    const { path: validatedPath, error: validationError } = await validateAndResolvePath(path, context.workingDirectory);
    if (validationError) {
      return { success: false, error: validationError };
    }

    try {
      const entries = await readdir(validatedPath, { withFileTypes: true });
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

    // Validate path security
    const { path: validatedPath, error: validationError } = await validateAndResolvePath(path, context.workingDirectory);
    if (validationError) {
      return { success: false, error: validationError };
    }

    try {
      const stats = await stat(validatedPath);
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

    // Validate path security (use resolvePath for non-existent directories)
    const absolutePath = resolvePath(path, context.workingDirectory);
    const validationCheck = validatePathSecurity(absolutePath, context.workingDirectory);
    if (!validationCheck.valid) {
      return { success: false, error: validationCheck.error };
    }

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

    // Validate path security
    const { path: validatedPath, error: validationError } = await validateAndResolvePath(path, context.workingDirectory);
    if (validationError) {
      return { success: false, error: validationError };
    }

    try {
      await unlink(validatedPath);
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
