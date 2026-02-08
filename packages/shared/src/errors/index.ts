import { sanitizeProviderErrorMessage } from '../utils/index.js';

// ============================================================================
// Base Error Class
// ============================================================================

export abstract class GeminiCoworkError extends Error {
  abstract readonly code: string;
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = Date.now();
    this.context = context;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

export class AuthenticationError extends GeminiCoworkError {
  readonly code = 'AUTH_ERROR';

  static notAuthenticated(): AuthenticationError {
    return new AuthenticationError('Not authenticated. Please sign in or provide an API key.');
  }

  static invalidApiKey(): AuthenticationError {
    return new AuthenticationError('Invalid API key. Please check your API key and try again.');
  }

  static tokenExpired(): AuthenticationError {
    return new AuthenticationError('Authentication token expired. Please sign in again.');
  }

  static refreshFailed(reason?: string): AuthenticationError {
    return new AuthenticationError(`Failed to refresh authentication token${reason ? `: ${reason}` : ''}`);
  }
}

// ============================================================================
// Permission Errors
// ============================================================================

export class PermissionError extends GeminiCoworkError {
  readonly code = 'PERMISSION_ERROR';
  readonly permissionType: string;
  readonly resource: string;

  constructor(permissionType: string, resource: string, message?: string) {
    super(message || `Permission denied: ${permissionType} for ${resource}`);
    this.permissionType = permissionType;
    this.resource = resource;
  }

  static fileRead(path: string): PermissionError {
    return new PermissionError('file_read', path, `Permission denied: Cannot read file ${path}`);
  }

  static fileWrite(path: string): PermissionError {
    return new PermissionError('file_write', path, `Permission denied: Cannot write to file ${path}`);
  }

  static fileDelete(path: string): PermissionError {
    return new PermissionError('file_delete', path, `Permission denied: Cannot delete file ${path}`);
  }

  static shellExecute(command: string): PermissionError {
    return new PermissionError('shell_execute', command, `Permission denied: Cannot execute command`);
  }

  static networkRequest(url: string): PermissionError {
    return new PermissionError('network_request', url, `Permission denied: Cannot make network request to ${url}`);
  }
}

// ============================================================================
// Provider Errors
// ============================================================================

export class ProviderError extends GeminiCoworkError {
  readonly code = 'PROVIDER_ERROR';
  readonly provider: string;
  readonly statusCode?: number;

  constructor(provider: string, message: string, statusCode?: number, context?: Record<string, unknown>) {
    super(message, context);
    this.provider = provider;
    this.statusCode = statusCode;
  }

  static rateLimit(provider: string): ProviderError {
    return new ProviderError(provider, 'Rate limit exceeded. Please try again later.', 429);
  }

  static quotaExceeded(provider: string): ProviderError {
    return new ProviderError(provider, 'API quota exceeded. Please check your usage limits.', 429);
  }

  static modelNotFound(provider: string, model: string): ProviderError {
    return new ProviderError(provider, `Model "${model}" not found or not available.`, 404, { model });
  }

  static requestFailed(provider: string, statusCode: number, message?: string): ProviderError {
    const normalized = message ? sanitizeProviderErrorMessage(message) : undefined;
    return new ProviderError(provider, normalized || `Request failed with status ${statusCode}`, statusCode);
  }

  static streamError(provider: string, reason?: string): ProviderError {
    return new ProviderError(provider, `Stream error${reason ? `: ${reason}` : ''}`);
  }
}

// ============================================================================
// Tool Errors
// ============================================================================

export class ToolError extends GeminiCoworkError {
  readonly code = 'TOOL_ERROR';
  readonly toolName: string;

  constructor(toolName: string, message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.toolName = toolName;
  }

  static notFound(toolName: string): ToolError {
    return new ToolError(toolName, `Tool "${toolName}" not found.`);
  }

  static invalidArgs(toolName: string, reason?: string): ToolError {
    return new ToolError(toolName, `Invalid arguments for tool "${toolName}"${reason ? `: ${reason}` : ''}`);
  }

  static executionFailed(toolName: string, reason?: string): ToolError {
    return new ToolError(toolName, `Tool "${toolName}" execution failed${reason ? `: ${reason}` : ''}`);
  }

  static timeout(toolName: string, timeoutMs: number): ToolError {
    return new ToolError(toolName, `Tool "${toolName}" timed out after ${timeoutMs}ms`, { timeoutMs });
  }
}

// ============================================================================
// Storage Errors
// ============================================================================

export class StorageError extends GeminiCoworkError {
  readonly code = 'STORAGE_ERROR';

  static notFound(entity: string, id: string): StorageError {
    return new StorageError(`${entity} with id "${id}" not found.`, { entity, id });
  }

  static saveFailed(entity: string, reason?: string): StorageError {
    return new StorageError(`Failed to save ${entity}${reason ? `: ${reason}` : ''}`, { entity });
  }

  static deleteFailed(entity: string, reason?: string): StorageError {
    return new StorageError(`Failed to delete ${entity}${reason ? `: ${reason}` : ''}`, { entity });
  }

  static connectionFailed(reason?: string): StorageError {
    return new StorageError(`Database connection failed${reason ? `: ${reason}` : ''}`);
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

export class ValidationError extends GeminiCoworkError {
  readonly code = 'VALIDATION_ERROR';
  readonly field?: string;

  constructor(message: string, field?: string, context?: Record<string, unknown>) {
    super(message, context);
    this.field = field;
  }

  static required(field: string): ValidationError {
    return new ValidationError(`${field} is required.`, field);
  }

  static invalid(field: string, reason?: string): ValidationError {
    return new ValidationError(`Invalid ${field}${reason ? `: ${reason}` : ''}`, field);
  }

  static outOfRange(field: string, min?: number, max?: number): ValidationError {
    let message = `${field} is out of range`;
    if (min !== undefined && max !== undefined) {
      message += ` (must be between ${min} and ${max})`;
    } else if (min !== undefined) {
      message += ` (must be at least ${min})`;
    } else if (max !== undefined) {
      message += ` (must be at most ${max})`;
    }
    return new ValidationError(message, field, { min, max });
  }
}

// ============================================================================
// Network Errors
// ============================================================================

export class NetworkError extends GeminiCoworkError {
  readonly code = 'NETWORK_ERROR';
  readonly url?: string;

  constructor(message: string, url?: string, context?: Record<string, unknown>) {
    super(message, context);
    this.url = url;
  }

  static connectionFailed(url?: string): NetworkError {
    return new NetworkError('Network connection failed. Please check your internet connection.', url);
  }

  static timeout(url?: string, timeoutMs?: number): NetworkError {
    return new NetworkError(`Network request timed out${timeoutMs ? ` after ${timeoutMs}ms` : ''}`, url, { timeoutMs });
  }

  static offline(): NetworkError {
    return new NetworkError('No internet connection. Please check your network settings.');
  }
}

// ============================================================================
// Error Type Guards
// ============================================================================

export function isGeminiCoworkError(error: unknown): error is GeminiCoworkError {
  return error instanceof GeminiCoworkError;
}

export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

export function isPermissionError(error: unknown): error is PermissionError {
  return error instanceof PermissionError;
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

export function isToolError(error: unknown): error is ToolError {
  return error instanceof ToolError;
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

// ============================================================================
// Error Wrapping
// ============================================================================

export function wrapError(error: unknown, fallbackMessage = 'An unexpected error occurred'): GeminiCoworkError {
  if (isGeminiCoworkError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new class extends GeminiCoworkError {
      readonly code = 'UNKNOWN_ERROR';
    }(error.message || fallbackMessage, { originalError: error.name });
  }

  return new class extends GeminiCoworkError {
    readonly code = 'UNKNOWN_ERROR';
  }(String(error) || fallbackMessage);
}
