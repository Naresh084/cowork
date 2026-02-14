// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

export type JsonRpcRequestId = number | string;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcRequestId;
  method: string;
  params: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc?: string;
  id?: JsonRpcRequestId;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

export interface JsonRpcNotification {
  jsonrpc?: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcServerRequest {
  jsonrpc?: string;
  id: JsonRpcRequestId;
  method: string;
  params?: Record<string, unknown>;
}

export function buildJsonRpcRequest(
  id: number,
  method: string,
  params: Record<string, unknown>,
): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };
}

export function isJsonRpcServerRequest(value: unknown): value is JsonRpcServerRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Record<string, unknown>;
  const idValid = typeof item.id === 'number' || typeof item.id === 'string';
  return idValid && typeof item.method === 'string';
}

export function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Record<string, unknown>;
  const idValid = typeof item.id === 'number' || typeof item.id === 'string';
  return idValid && ('result' in item || 'error' in item);
}

export function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Record<string, unknown>;
  return typeof item.method === 'string' && !('id' in item);
}
