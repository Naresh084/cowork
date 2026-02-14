// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';
import { join } from 'path';
import { homedir } from 'os';
import { mkdir, writeFile } from 'fs/promises';
import type { ToolHandler, ToolContext, ToolResult } from '@cowork/core';
import { runDeepResearch } from '@cowork/providers';
import { eventEmitter } from '../event-emitter.js';

interface ResearchEvidenceItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  confidence: number;
  rank: number;
  sourceType: 'provider_citation' | 'report_link';
  provenance: {
    query: string;
    reportPath?: string;
  };
}

/**
 * Get the reports directory for a session.
 * Uses appDataDir if available, otherwise falls back to ~/.cowork
 */
function getReportsDir(context: ToolContext): string {
  const baseDir = context.appDataDir || join(homedir(), '.cowork');
  return join(baseDir, 'sessions', context.sessionId, 'reports');
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    const normalizedPath = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname;
    parsed.pathname = normalizedPath;
    return parsed.toString();
  } catch {
    return '';
  }
}

function extractReportLinks(report: string): Array<{ title: string; url: string }> {
  const links: Array<{ title: string; url: string }> = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gim;
  let match: RegExpExecArray | null = regex.exec(report);
  while (match) {
    const title = (match[1] || '').trim();
    const url = (match[2] || '').trim();
    if (url) {
      links.push({ title: title || url, url });
    }
    match = regex.exec(report);
  }
  return links;
}

function scoreEvidence(title: string, url: string, sourceType: ResearchEvidenceItem['sourceType']): number {
  let score = 0.42;
  const normalizedTitle = title.trim();
  const normalizedUrl = url.trim().toLowerCase();

  if (normalizedUrl.startsWith('https://')) score += 0.17;
  if (normalizedTitle.length > 0 && normalizedTitle !== url) score += 0.12;
  if (sourceType === 'provider_citation') score += 0.14;

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.startsWith('www.')) score += 0.05;
    if (parsed.hostname.split('.').length >= 2) score += 0.05;
    if (!parsed.pathname || parsed.pathname === '/') score -= 0.03;
  } catch {
    score -= 0.15;
  }

  return Math.max(0.05, Math.min(0.99, score));
}

function normalizeEvidence(params: {
  query: string;
  report: string;
  citations: Array<{ title: string; url: string }>;
  reportPath: string;
}): ResearchEvidenceItem[] {
  const seen = new Map<string, ResearchEvidenceItem>();
  const providerEntries = params.citations.map((entry) => ({
    title: entry.title,
    url: entry.url,
    sourceType: 'provider_citation' as const,
  }));
  const reportEntries = extractReportLinks(params.report).map((entry) => ({
    title: entry.title,
    url: entry.url,
    sourceType: 'report_link' as const,
  }));

  for (const entry of [...providerEntries, ...reportEntries]) {
    const normalized = normalizeUrl(entry.url);
    if (!normalized) continue;
    const domain = (() => {
      try {
        return new URL(normalized).hostname.toLowerCase();
      } catch {
        return 'unknown';
      }
    })();
    const confidence = scoreEvidence(entry.title, normalized, entry.sourceType);
    const existing = seen.get(normalized);

    if (existing) {
      if (confidence > existing.confidence) {
        existing.confidence = confidence;
        existing.title = entry.title || existing.title;
        existing.sourceType = entry.sourceType;
      }
      continue;
    }

    seen.set(normalized, {
      id: `evidence-${seen.size + 1}`,
      title: entry.title || normalized,
      url: normalized,
      domain,
      confidence,
      rank: 0,
      sourceType: entry.sourceType,
      provenance: {
        query: params.query,
        reportPath: params.reportPath,
      },
    });
  }

  const ranked = [...seen.values()].sort((left, right) => {
    if (right.confidence !== left.confidence) return right.confidence - left.confidence;
    return left.url.localeCompare(right.url);
  });

  return ranked.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}

export function createDeepResearchTool(
  getApiKey: () => string | null,
  getDeepResearchModel?: () => string,
): ToolHandler {
  return {
    name: 'deep_research',
    description: 'Perform deep autonomous research on a topic. Takes 5-60 minutes. Returns a report with citations.',
    parameters: z.object({
      query: z.string().describe('The research question or topic'),
      includeFiles: z.array(z.string()).optional().describe('File paths or context strings to include'),
      resumeToken: z
        .object({
          interactionId: z.string(),
          agent: z.string(),
          createdAt: z.number(),
          lastStatus: z.string().optional(),
          lastProgress: z.number().optional(),
          lastPolledAt: z.number().optional(),
        })
        .optional()
        .describe('Optional resume token from a previous partial/cancelled run'),
      retryBudget: z
        .number()
        .int()
        .min(0)
        .max(20)
        .optional()
        .describe('Maximum transient polling retries before returning partial or failing'),
      maxDurationMinutes: z
        .number()
        .min(1)
        .max(180)
        .optional()
        .describe('Hard timeout budget for this run before returning partial output'),
    }),

    requiresPermission: (): { type: 'network_request'; resource: string; reason: string } => ({
      type: 'network_request',
      resource: 'Deep Research API',
      reason: 'Perform autonomous web research',
    }),

    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const {
        query,
        includeFiles,
        resumeToken,
        retryBudget,
        maxDurationMinutes,
      } = args as {
        query: string;
        includeFiles?: string[];
        resumeToken?: {
          interactionId: string;
          agent: string;
          createdAt: number;
          lastStatus?: string;
          lastProgress?: number;
          lastPolledAt?: number;
        };
        retryBudget?: number;
        maxDurationMinutes?: number;
      };
      const apiKey = getApiKey();

      if (!apiKey) {
        return { success: false, error: 'API key not set. Please configure an API key first.' };
      }

      try {
        const result = await runDeepResearch(apiKey, {
          query,
          files: includeFiles,
          resumeToken,
          retryBudget,
          maxPollingDurationMs: typeof maxDurationMinutes === 'number'
            ? Math.round(maxDurationMinutes * 60 * 1000)
            : undefined,
          allowPartialResult: true,
          agent: getDeepResearchModel?.() || 'deep-research-pro-preview-12-2025',
          onProgress: (status, progress) => {
            eventEmitter.researchProgress(context.sessionId, status, progress);
            eventEmitter.flushSync();
          },
        });
        const reportDir = getReportsDir(context);
        await mkdir(reportDir, { recursive: true });
        const suffix =
          result.status === 'completed'
            ? 'complete'
            : result.status === 'cancelled'
              ? 'cancelled'
              : 'partial';
        const reportPath = join(reportDir, `deep-research-${suffix}-${Date.now()}.md`);
        const reportBody =
          result.report?.trim().length > 0
            ? result.report
            : `# Deep Research (${result.status})\n\nNo final report text was available at this checkpoint.`;
        await writeFile(reportPath, reportBody, 'utf-8');
        const evidence = normalizeEvidence({
          query,
          report: reportBody,
          citations: result.citations || [],
          reportPath,
        });
        const avgConfidence =
          evidence.length > 0
            ? evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length
            : 0;
        eventEmitter.researchEvidence(context.sessionId, {
          query,
          totalSources: evidence.length,
          avgConfidence,
          topSources: evidence.slice(0, 5).map((item) => ({
            title: item.title,
            url: item.url,
            confidence: item.confidence,
            rank: item.rank,
          })),
        });
        eventEmitter.flushSync();

        return {
          success: true,
          data: {
            ...result,
            reportPath,
            evidence,
            evidenceSummary: {
              totalSources: evidence.length,
              avgConfidence,
              highConfidenceSources: evidence.filter((item) => item.confidence >= 0.75).length,
            },
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

export function createResearchTools(
  getApiKey: () => string | null,
  getDeepResearchModel?: () => string,
): ToolHandler[] {
  return [createDeepResearchTool(getApiKey, getDeepResearchModel)];
}
