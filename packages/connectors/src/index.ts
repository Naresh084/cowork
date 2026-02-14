// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';

// ============================================================================
// Connector Types
// ============================================================================

export const ConnectorTypeSchema = z.enum(['google_drive', 'google_docs', 'google_sheets', 'gmail']);
export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;

export interface Connector {
  id: string;
  type: ConnectorType;
  name: string;
  description: string;
  isConnected: boolean;
  lastSync?: number;
}

export interface ConnectorConfig {
  type: ConnectorType;
  credentials?: {
    accessToken?: string;
    refreshToken?: string;
  };
  settings?: Record<string, unknown>;
}

// ============================================================================
// Base Connector Class
// ============================================================================

export abstract class BaseConnector {
  abstract readonly type: ConnectorType;
  abstract readonly name: string;
  abstract readonly description: string;

  protected accessToken: string | null = null;

  /**
   * Connect to the service.
   */
  abstract connect(accessToken: string): Promise<void>;

  /**
   * Disconnect from the service.
   */
  abstract disconnect(): Promise<void>;

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.accessToken !== null;
  }
}

// ============================================================================
// Google Drive Connector
// ============================================================================

export class GoogleDriveConnector extends BaseConnector {
  readonly type = 'google_drive' as const;
  readonly name = 'Google Drive';
  readonly description = 'Access and manage files in Google Drive';

  async connect(accessToken: string): Promise<void> {
    this.accessToken = accessToken;
  }

  async disconnect(): Promise<void> {
    this.accessToken = null;
  }

  async listFiles(query?: string): Promise<DriveFile[]> {
    if (!this.accessToken) throw new Error('Not connected');

    const params = new URLSearchParams({
      fields: 'files(id,name,mimeType,modifiedTime,size)',
      ...(query && { q: query }),
    });

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    if (!response.ok) throw new Error('Failed to list files');

    const data = await response.json();
    return data.files || [];
  }

  async getFileContent(fileId: string): Promise<string> {
    if (!this.accessToken) throw new Error('Not connected');

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    if (!response.ok) throw new Error('Failed to get file content');

    return response.text();
  }
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

// ============================================================================
// Google Docs Connector
// ============================================================================

export class GoogleDocsConnector extends BaseConnector {
  readonly type = 'google_docs' as const;
  readonly name = 'Google Docs';
  readonly description = 'Access and edit Google Documents';

  async connect(accessToken: string): Promise<void> {
    this.accessToken = accessToken;
  }

  async disconnect(): Promise<void> {
    this.accessToken = null;
  }

  async getDocument(documentId: string): Promise<GoogleDoc> {
    if (!this.accessToken) throw new Error('Not connected');

    const response = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    if (!response.ok) throw new Error('Failed to get document');

    return response.json();
  }
}

export interface GoogleDoc {
  documentId: string;
  title: string;
  body?: {
    content?: unknown[];
  };
}

// ============================================================================
// Connector Manager
// ============================================================================

export class ConnectorManager {
  private connectors: Map<ConnectorType, BaseConnector> = new Map();

  constructor() {
    // Register default connectors
    this.register(new GoogleDriveConnector());
    this.register(new GoogleDocsConnector());
  }

  register(connector: BaseConnector): void {
    this.connectors.set(connector.type, connector);
  }

  get(type: ConnectorType): BaseConnector | undefined {
    return this.connectors.get(type);
  }

  getAll(): BaseConnector[] {
    return Array.from(this.connectors.values());
  }

  async connectAll(accessToken: string): Promise<void> {
    await Promise.all(
      this.getAll().map((connector) => connector.connect(accessToken))
    );
  }

  async disconnectAll(): Promise<void> {
    await Promise.all(
      this.getAll().map((connector) => connector.disconnect())
    );
  }
}

export function createConnectorManager(): ConnectorManager {
  return new ConnectorManager();
}
