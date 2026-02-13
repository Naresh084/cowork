import { GoogleGenAI } from '@google/genai';

export interface DeepResearchResumeToken {
  interactionId: string;
  agent: string;
  createdAt: number;
  lastStatus?: string;
  lastProgress?: number;
  lastPolledAt?: number;
}

export interface DeepResearchOptions {
  query: string;
  files?: string[];
  outputFormat?: 'markdown' | 'json';
  onProgress?: (status: string, progress: number) => void;
  onResumeToken?: (token: DeepResearchResumeToken) => void;
  /** Override the deep research agent model (default: deep-research-pro-preview-12-2025) */
  agent?: string;
  resumeToken?: DeepResearchResumeToken;
  pollIntervalMs?: number;
  maxPollIntervalMs?: number;
  maxPollingDurationMs?: number;
  retryBudget?: number;
  allowPartialResult?: boolean;
  abortSignal?: AbortSignal;
}

export interface DeepResearchResult {
  report: string;
  citations: Array<{ title: string; url: string }>;
  searchQueries: string[];
  duration: number;
  status: 'completed' | 'partial' | 'cancelled';
  partial: boolean;
  interactionId: string;
  pollAttempts: number;
  retryAttempts: number;
  resumeToken?: DeepResearchResumeToken;
}

interface InteractionSnapshot {
  id?: string;
  status?: string;
  error?: { message?: string };
  outputs?: Array<{ text?: string }>;
  metadata?: {
    citations?: Array<{ title?: string; url?: string }>;
    searchQueries?: string[];
    webSearchQueries?: string[];
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
    };
  };
}

const DEFAULT_AGENT_MODEL = 'deep-research-pro-preview-12-2025';
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_MAX_POLL_INTERVAL_MS = 30_000;
const DEFAULT_MAX_POLLING_DURATION_MS = 45 * 60 * 1000;
const DEFAULT_RETRY_BUDGET = 5;

function buildUserContent(options: DeepResearchOptions): string {
  const parts: string[] = [options.query];

  if (options.outputFormat === 'json') {
    parts.push('Respond with a JSON object only.');
  }

  if (options.files && options.files.length > 0) {
    parts.push(`Context files:\n${options.files.join('\n')}`);
  }

  return parts.join('\n\n');
}

function extractCitations(result: unknown): Array<{ title: string; url: string }> {
  const citations: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();

  const resultAny = result as {
    metadata?: {
      citations?: Array<{ title?: string; url?: string }>;
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
      };
    };
    outputs?: Array<{
      text?: string;
      citations?: Array<{ title?: string; url?: string }>;
      metadata?: { citations?: Array<{ title?: string; url?: string }> };
    }>;
  };

  const pushCitation = (title: string | undefined, url: string | undefined) => {
    if (!url) return;
    if (seen.has(url)) return;
    seen.add(url);
    citations.push({ title: title || url, url });
  };

  const metadataCitations = resultAny.metadata?.citations ?? [];
  for (const citation of metadataCitations) {
    pushCitation(citation.title, citation.url);
  }

  const outputCitations = resultAny.outputs ?? [];
  for (const output of outputCitations) {
    const direct = output.citations ?? [];
    const nested = output.metadata?.citations ?? [];
    for (const citation of [...direct, ...nested]) {
      pushCitation(citation.title, citation.url);
    }
  }

  const groundingChunks = resultAny.metadata?.groundingMetadata?.groundingChunks ?? [];
  for (const chunk of groundingChunks) {
    pushCitation(chunk.web?.title, chunk.web?.uri);
  }

  return citations;
}

function extractSearchQueries(result: InteractionSnapshot | null): string[] {
  if (!result?.metadata) return [];
  return result.metadata.searchQueries ?? result.metadata.webSearchQueries ?? [];
}

function extractReportText(result: InteractionSnapshot | null): string {
  if (!result?.outputs || result.outputs.length === 0) {
    return '';
  }

  const outputs = result.outputs;
  const lastWithText = [...outputs].reverse().find((item) => typeof item.text === 'string' && item.text.trim().length > 0);
  return lastWithText?.text || outputs[outputs.length - 1]?.text || '';
}

function hasPartialResult(result: InteractionSnapshot | null): boolean {
  if (!result) return false;
  if (extractReportText(result).trim().length > 0) return true;
  return extractCitations(result).length > 0;
}

function inferProgress(status: string | undefined, previous: number): number {
  const normalized = String(status || '').toLowerCase();
  if (!normalized) {
    return previous;
  }

  if (normalized === 'completed') return 1;
  if (normalized === 'queued' || normalized === 'pending') return Math.max(previous, 0.05);
  if (normalized.includes('running')) return Math.max(previous, 0.35);
  if (normalized.includes('research')) return Math.max(previous, 0.55);
  if (normalized.includes('synth') || normalized.includes('draft')) return Math.max(previous, 0.8);
  if (normalized.includes('final')) return Math.max(previous, 0.92);
  if (normalized === 'failed' || normalized === 'cancelled') return previous;

  return Math.max(previous, 0.15);
}

function toResumeToken(
  interactionId: string,
  agent: string,
  status: string,
  progress: number,
): DeepResearchResumeToken {
  return {
    interactionId,
    agent,
    createdAt: Date.now(),
    lastStatus: status,
    lastProgress: progress,
    lastPolledAt: Date.now(),
  };
}

function isTransientError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  const normalized = text.toLowerCase();

  return (
    normalized.includes('timeout')
    || normalized.includes('timed out')
    || normalized.includes('network')
    || normalized.includes('socket')
    || normalized.includes('fetch failed')
    || normalized.includes('temporar')
    || normalized.includes('connection reset')
    || normalized.includes('connection aborted')
    || normalized.includes('econnreset')
    || normalized.includes('etimedout')
    || normalized.includes('503')
    || normalized.includes('502')
    || normalized.includes('429')
  );
}

async function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  if (!abortSignal) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }

  if (abortSignal.aborted) {
    throw new Error('Deep research cancelled by caller.');
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      abortSignal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      abortSignal.removeEventListener('abort', onAbort);
      reject(new Error('Deep research cancelled by caller.'));
    };

    abortSignal.addEventListener('abort', onAbort, { once: true });
  });
}

async function cancelInteractionIfSupported(ai: GoogleGenAI, interactionId: string): Promise<void> {
  const interactionsAny = ai.interactions as unknown as {
    cancel?: (id: string) => Promise<unknown>;
  };

  if (!interactionsAny.cancel) return;

  try {
    await interactionsAny.cancel(interactionId);
  } catch {
    // best effort cancel only
  }
}

function buildResult(params: {
  snapshot: InteractionSnapshot | null;
  startTime: number;
  status: DeepResearchResult['status'];
  partial: boolean;
  interactionId: string;
  pollAttempts: number;
  retryAttempts: number;
  resumeToken?: DeepResearchResumeToken;
}): DeepResearchResult {
  return {
    report: extractReportText(params.snapshot),
    citations: extractCitations(params.snapshot),
    searchQueries: extractSearchQueries(params.snapshot),
    duration: Date.now() - params.startTime,
    status: params.status,
    partial: params.partial,
    interactionId: params.interactionId,
    pollAttempts: params.pollAttempts,
    retryAttempts: params.retryAttempts,
    resumeToken: params.resumeToken,
  };
}

export async function runDeepResearch(
  apiKey: string,
  options: DeepResearchOptions,
): Promise<DeepResearchResult> {
  const ai = new GoogleGenAI({ apiKey });
  const startTime = Date.now();

  const agentModel = options.agent || options.resumeToken?.agent || DEFAULT_AGENT_MODEL;
  const pollIntervalBaseMs = Math.max(1_000, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const maxPollIntervalMs = Math.max(
    pollIntervalBaseMs,
    options.maxPollIntervalMs ?? DEFAULT_MAX_POLL_INTERVAL_MS,
  );
  const maxPollingDurationMs = Math.max(
    30_000,
    options.maxPollingDurationMs ?? DEFAULT_MAX_POLLING_DURATION_MS,
  );
  const allowPartialResult = options.allowPartialResult ?? true;

  let interactionId = options.resumeToken?.interactionId;
  if (!interactionId) {
    const interaction = await ai.interactions.create({
      agent: agentModel,
      input: buildUserContent(options),
      background: true,
    });
    interactionId = interaction.id;
  }

  let pollAttempts = 0;
  let retryAttempts = 0;
  let consecutiveRetries = 0;
  let currentPollIntervalMs = pollIntervalBaseMs;
  let latestSnapshot: InteractionSnapshot | null = null;
  let lastProgress = Math.max(0, Math.min(1, options.resumeToken?.lastProgress ?? 0));
  let lastStatus = options.resumeToken?.lastStatus || 'queued';

  const initialToken = toResumeToken(interactionId, agentModel, lastStatus, lastProgress);
  options.onResumeToken?.(initialToken);

  while (true) {
    if (options.abortSignal?.aborted) {
      await cancelInteractionIfSupported(ai, interactionId);
      const resumeToken = toResumeToken(interactionId, agentModel, 'cancelled', lastProgress);
      return buildResult({
        snapshot: latestSnapshot,
        startTime,
        status: 'cancelled',
        partial: true,
        interactionId,
        pollAttempts,
        retryAttempts,
        resumeToken,
      });
    }

    if (Date.now() - startTime > maxPollingDurationMs) {
      if (allowPartialResult && hasPartialResult(latestSnapshot)) {
        const resumeToken = toResumeToken(interactionId, agentModel, lastStatus, lastProgress);
        return buildResult({
          snapshot: latestSnapshot,
          startTime,
          status: 'partial',
          partial: true,
          interactionId,
          pollAttempts,
          retryAttempts,
          resumeToken,
        });
      }

      throw new Error(`Deep research timed out after ${Math.round(maxPollingDurationMs / 1000)}s`);
    }

    try {
      pollAttempts += 1;
      const result = (await ai.interactions.get(interactionId)) as InteractionSnapshot;
      latestSnapshot = result;
      consecutiveRetries = 0;
      currentPollIntervalMs = pollIntervalBaseMs;

      const status = result.status || 'running';
      lastStatus = status;
      lastProgress = inferProgress(status, lastProgress);

      options.onProgress?.(status, lastProgress);
      options.onResumeToken?.(
        toResumeToken(interactionId, agentModel, status, lastProgress),
      );

      if (status === 'completed') {
        return buildResult({
          snapshot: result,
          startTime,
          status: 'completed',
          partial: false,
          interactionId,
          pollAttempts,
          retryAttempts,
        });
      }

      if (status === 'failed') {
        if (allowPartialResult && hasPartialResult(result)) {
          return buildResult({
            snapshot: result,
            startTime,
            status: 'partial',
            partial: true,
            interactionId,
            pollAttempts,
            retryAttempts,
            resumeToken: toResumeToken(interactionId, agentModel, status, lastProgress),
          });
        }

        throw new Error(
          `Research failed: ${result.error?.message || status || 'Unknown error'}`,
        );
      }

      if (status === 'cancelled') {
        return buildResult({
          snapshot: result,
          startTime,
          status: 'cancelled',
          partial: true,
          interactionId,
          pollAttempts,
          retryAttempts,
          resumeToken: toResumeToken(interactionId, agentModel, status, lastProgress),
        });
      }

      await sleep(currentPollIntervalMs, options.abortSignal);
    } catch (error) {
      const retryBudget = Math.max(0, options.retryBudget ?? DEFAULT_RETRY_BUDGET);
      const canRetry = isTransientError(error) && consecutiveRetries < retryBudget;

      if (!canRetry) {
        if (allowPartialResult && hasPartialResult(latestSnapshot)) {
          return buildResult({
            snapshot: latestSnapshot,
            startTime,
            status: 'partial',
            partial: true,
            interactionId,
            pollAttempts,
            retryAttempts,
            resumeToken: toResumeToken(interactionId, agentModel, lastStatus, lastProgress),
          });
        }

        throw error;
      }

      consecutiveRetries += 1;
      retryAttempts += 1;
      currentPollIntervalMs = Math.min(
        maxPollIntervalMs,
        Math.round(currentPollIntervalMs * 1.6),
      );
      options.onProgress?.('retrying', lastProgress);
      await sleep(currentPollIntervalMs, options.abortSignal);
    }
  }
}
