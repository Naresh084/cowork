// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type {
  AttachmentPayload,
  CronJob,
  RemoteStatus,
  SessionDetails,
  SessionSummary,
  WorkflowScheduledTaskSummary,
} from '@/types/remote';

export interface RemoteAuth {
  endpoint: string;
  token: string;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) return payload.error;
  } catch {
    // Use default fallback below.
  }
  return `Request failed (${response.status})`;
}

export class CoworkRemoteClient {
  private endpoint: string;
  private token: string;

  constructor(auth: RemoteAuth) {
    this.endpoint = normalizeBaseUrl(auth.endpoint);
    this.token = auth.token;
  }

  setAuth(auth: RemoteAuth): void {
    this.endpoint = normalizeBaseUrl(auth.endpoint);
    this.token = auth.token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${this.endpoint}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.token}`,
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  async getMe(): Promise<{ status: RemoteStatus }> {
    return this.request<{ status: RemoteStatus }>('/v1/me');
  }

  async listSessions(): Promise<SessionSummary[]> {
    const payload = await this.request<{ sessions: SessionSummary[] }>('/v1/sessions');
    return payload.sessions;
  }

  async createSession(input: {
    workingDirectory?: string;
    model?: string;
    provider?: string;
    executionMode?: 'execute' | 'plan';
    title?: string;
  }): Promise<SessionSummary> {
    const payload = await this.request<{ session: SessionSummary }>('/v1/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return payload.session;
  }

  async getSession(sessionId: string): Promise<SessionDetails> {
    const payload = await this.request<{ session: SessionDetails }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
    );
    return payload.session;
  }

  async sendMessage(
    sessionId: string,
    content: string,
    attachments: AttachmentPayload[] = [],
  ): Promise<void> {
    await this.request<{ success: boolean }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          content,
          attachments,
        }),
      },
    );
  }

  async stopGeneration(sessionId: string): Promise<void> {
    await this.request<{ success: boolean }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/stop`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  async respondPermission(
    sessionId: string,
    permissionId: string,
    decision: 'allow' | 'deny' | 'allow_once' | 'allow_session',
  ): Promise<void> {
    await this.request<{ success: boolean }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/permissions`,
      {
        method: 'POST',
        body: JSON.stringify({ permissionId, decision }),
      },
    );
  }

  async respondQuestion(
    sessionId: string,
    questionId: string,
    answer: string | string[],
  ): Promise<void> {
    await this.request<{ success: boolean }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/questions`,
      {
        method: 'POST',
        body: JSON.stringify({ questionId, answer }),
      },
    );
  }

  async listCronJobs(): Promise<CronJob[]> {
    const payload = await this.request<{ jobs: CronJob[] }>('/v1/cron/jobs');
    return payload.jobs;
  }

  async pauseCronJob(jobId: string): Promise<void> {
    await this.request<{ job: CronJob }>(
      `/v1/cron/jobs/${encodeURIComponent(jobId)}/pause`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  async resumeCronJob(jobId: string): Promise<void> {
    await this.request<{ job: CronJob }>(
      `/v1/cron/jobs/${encodeURIComponent(jobId)}/resume`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  async runCronJob(jobId: string): Promise<void> {
    await this.request<{ run: unknown }>(
      `/v1/cron/jobs/${encodeURIComponent(jobId)}/run`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  async listScheduledWorkflows(): Promise<WorkflowScheduledTaskSummary[]> {
    const payload = await this.request<{ tasks: WorkflowScheduledTaskSummary[] }>(
      '/v1/workflow/scheduled',
    );
    return payload.tasks;
  }

  async pauseScheduledWorkflow(workflowId: string): Promise<void> {
    await this.request<{ result: unknown }>(
      `/v1/workflow/scheduled/${encodeURIComponent(workflowId)}/pause`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  async resumeScheduledWorkflow(workflowId: string): Promise<void> {
    await this.request<{ result: unknown }>(
      `/v1/workflow/scheduled/${encodeURIComponent(workflowId)}/resume`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  async runScheduledWorkflow(workflowId: string): Promise<void> {
    await this.request<{ run: unknown }>(
      `/v1/workflow/scheduled/${encodeURIComponent(workflowId)}/run`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  async logout(): Promise<void> {
    await this.request<{ success: boolean }>('/v1/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }
}
