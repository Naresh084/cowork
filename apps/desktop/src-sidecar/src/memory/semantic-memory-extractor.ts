import type { Message, MessageContentPart } from '@gemini-cowork/shared';
import {
  DEFAULT_EXTRACTION_CONFIG,
  type ExtractedMemory,
  type MemoryExtractionConfig,
  type MemoryExtractionResult,
  type MemoryGroup,
  type SemanticMemoryCandidate,
} from './types.js';

export interface SemanticMemoryExtractorInvocation {
  system: string;
  user: string;
}

export type SemanticMemoryExtractorInvoker = (
  input: SemanticMemoryExtractorInvocation,
) => Promise<string>;

interface SemanticMemoryExtractorOptions extends Partial<MemoryExtractionConfig> {
  invokeModel?: SemanticMemoryExtractorInvoker;
}

function getTextContent(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return (message.content as MessageContentPart[])
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sanitizeGroup(value: string): MemoryGroup {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'context';
  if (normalized === 'preference') return 'preferences';
  if (normalized === 'learning') return 'learnings';
  if (normalized === 'instruction') return 'instructions';
  return normalized;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '{}';

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function repairJson(jsonLike: string): string {
  return jsonLike
    .replace(/^[`\s]+|[`\s]+$/g, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function parsePayload(raw: string): { candidates?: unknown } {
  const candidate = extractJsonCandidate(raw);

  try {
    return JSON.parse(candidate) as { candidates?: unknown };
  } catch {
    const repaired = repairJson(candidate);
    return JSON.parse(repaired) as { candidates?: unknown };
  }
}

function generateTitle(content: string, fallbackGroup: MemoryGroup): string {
  const firstSentence = content.split(/[.!?]\s+/).find(Boolean) || content;
  const compact = normalizeWhitespace(firstSentence);
  const truncated = compact.length > 64 ? `${compact.slice(0, 61).trimEnd()}...` : compact;

  if (truncated.length > 0) {
    return truncated.charAt(0).toUpperCase() + truncated.slice(1);
  }

  const fallback = `${fallbackGroup} memory`;
  return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}

function uniqueNormalized(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function resolveStyleMaxAccepted(style: MemoryExtractionConfig['style']): number {
  if (style === 'conservative') return 1;
  if (style === 'aggressive') return 4;
  return 2;
}

function resolveStyleThreshold(style: MemoryExtractionConfig['style']): number {
  if (style === 'conservative') return 0.78;
  if (style === 'aggressive') return 0.58;
  return 0.68;
}

function canonicalContent(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPrompt(messages: Message[]): SemanticMemoryExtractorInvocation {
  const recent = messages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .slice(-10)
    .map((msg) => `${msg.role.toUpperCase()}: ${normalizeWhitespace(getTextContent(msg))}`)
    .filter((line) => line.length > 0)
    .join('\n');

  const system = [
    'You extract durable long-term memory candidates from a chat transcript.',
    'Return JSON only with this exact top-level shape:',
    '{"candidates":[{"group":"preferences|learnings|context|instructions|custom","content":"string","confidence":0.0,"stable":true,"scope":"user|project|workflow|general","sensitive":false,"title":"optional","tags":["optional"]}]}',
    'Rules:',
    '- Keep only durable, cross-session information.',
    '- Reject one-off, temporary, speculative, or already-completed task details.',
    '- Exclude secrets, credentials, tokens, private personal data, and anything sensitive (set sensitive=true only if absolutely needed).',
    '- Paraphrase naturally; do not quote verbatim unless necessary.',
    '- Use concise content statements (1-2 sentences).',
    '- If nothing durable exists, return {"candidates":[]}.',
  ].join('\n');

  const user = [
    'Extract durable memory candidates from this conversation:',
    '',
    recent || '(empty conversation)',
  ].join('\n');

  return { system, user };
}

export class SemanticMemoryExtractor {
  private config: MemoryExtractionConfig;
  private invokeModel?: SemanticMemoryExtractorInvoker;

  constructor(options: SemanticMemoryExtractorOptions = {}) {
    this.config = {
      ...DEFAULT_EXTRACTION_CONFIG,
      ...options,
      style: options.style || DEFAULT_EXTRACTION_CONFIG.style,
      maxAcceptedPerTurn:
        options.maxAcceptedPerTurn ?? resolveStyleMaxAccepted(options.style || DEFAULT_EXTRACTION_CONFIG.style),
      confidenceThreshold:
        options.confidenceThreshold ?? resolveStyleThreshold(options.style || DEFAULT_EXTRACTION_CONFIG.style),
    };
    this.invokeModel = options.invokeModel;
  }

  setInvoker(invokeModel: SemanticMemoryExtractorInvoker): void {
    this.invokeModel = invokeModel;
  }

  async extract(messages: Message[]): Promise<MemoryExtractionResult> {
    const extractedAt = new Date().toISOString();

    if (!this.config.enabled || !this.invokeModel) {
      return {
        memories: [],
        messagesProcessed: 0,
        extractedAt,
        candidates: [],
      };
    }

    const scoped = messages
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .slice(-10);
    const prompt = buildPrompt(scoped);

    let payload: { candidates?: unknown };
    try {
      const raw = await this.invokeModel(prompt);
      payload = parsePayload(raw);
    } catch {
      return {
        memories: [],
        messagesProcessed: scoped.length,
        extractedAt,
        candidates: [],
      };
    }

    const rawCandidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const seenCanonical = new Set<string>();
    const candidates: SemanticMemoryCandidate[] = [];

    for (const raw of rawCandidates) {
      const candidate = raw as Partial<SemanticMemoryCandidate>;
      const content = normalizeWhitespace(String(candidate.content || ''));
      const group = sanitizeGroup(String(candidate.group || 'context'));
      const confidence = clamp01(Number(candidate.confidence ?? 0));
      const stable = Boolean(candidate.stable);
      const sensitive = Boolean(candidate.sensitive);
      const scope = ((): SemanticMemoryCandidate['scope'] => {
        if (candidate.scope === 'user' || candidate.scope === 'project' || candidate.scope === 'workflow') {
          return candidate.scope;
        }
        return 'general';
      })();

      if (!content || content.length < 16) continue;
      if (!stable) continue;
      if (sensitive) continue;
      if (confidence < this.config.confidenceThreshold) continue;

      const canonical = canonicalContent(content);
      if (!canonical || seenCanonical.has(canonical)) continue;
      seenCanonical.add(canonical);

      candidates.push({
        group,
        content,
        confidence,
        stable,
        scope,
        sensitive,
        title: typeof candidate.title === 'string' ? normalizeWhitespace(candidate.title) : undefined,
        tags: Array.isArray(candidate.tags)
          ? uniqueNormalized(candidate.tags.map((tag) => String(tag)))
          : undefined,
      });

      if (candidates.length >= this.config.maxPerConversation) {
        break;
      }
    }

    const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
    const accepted = sorted.slice(0, this.config.maxAcceptedPerTurn);

    const memories: ExtractedMemory[] = accepted.map((candidate) => ({
      title: candidate.title && candidate.title.length > 3
        ? candidate.title
        : generateTitle(candidate.content, candidate.group),
      content: candidate.content,
      group: candidate.group,
      tags: uniqueNormalized(candidate.tags || []),
      confidence: candidate.confidence,
      scope: candidate.scope,
      stable: candidate.stable,
      sensitive: candidate.sensitive,
    }));

    return {
      memories,
      messagesProcessed: scoped.length,
      extractedAt,
      candidates,
    };
  }

  updateConfig(updates: Partial<MemoryExtractionConfig>): void {
    const style = updates.style || this.config.style;
    this.config = {
      ...this.config,
      ...updates,
      style,
      confidenceThreshold:
        updates.confidenceThreshold ?? this.config.confidenceThreshold ?? resolveStyleThreshold(style),
      maxAcceptedPerTurn:
        updates.maxAcceptedPerTurn ?? this.config.maxAcceptedPerTurn ?? resolveStyleMaxAccepted(style),
    };
  }

  getConfig(): MemoryExtractionConfig {
    return { ...this.config };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
}

export function createSemanticMemoryExtractor(
  options?: SemanticMemoryExtractorOptions,
): SemanticMemoryExtractor {
  return new SemanticMemoryExtractor(options);
}
