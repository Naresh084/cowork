const MAX_TIMEOUT_MS = 2147483647;
const DEFAULT_MIN_CONFIDENCE = 0.2;
const DEFAULT_ACTIVATION_THRESHOLD = 0.72;

export interface TriggerRouterDelegate {
  getNextScheduleAt: () => Promise<number | null>;
  runDueSchedules: () => Promise<void>;
}

export interface ChatTriggerCandidate {
  workflowId: string;
  workflowVersion: number;
  triggerId: string;
  phrases: string[];
  strictMatch?: boolean;
  enabled?: boolean;
}

export interface TriggerConfidenceBreakdown {
  exactMatch: boolean;
  substringMatch: boolean;
  tokenCoverage: number;
  messageCoverage: number;
  strictMatch: boolean;
  effectiveThreshold: number;
  componentScores: {
    exactScore: number;
    substringScore: number;
    lexicalScore: number;
    penaltyScore: number;
  };
}

export interface TriggerActivationResult {
  workflowId: string;
  workflowVersion: number;
  triggerId: string;
  confidence: number;
  shouldActivate: boolean;
  matchedPhrase: string | null;
  reasonCodes: string[];
  breakdown: TriggerConfidenceBreakdown;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\\s]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
}

function overlapRatio(source: Set<string>, target: Set<string>): number {
  if (target.size === 0) return 0;
  let overlap = 0;
  for (const token of target) {
    if (source.has(token)) overlap += 1;
  }
  return overlap / target.size;
}

function evaluateCandidatePhrase(
  message: string,
  messageTokens: Set<string>,
  phrase: string,
  strictMatch: boolean,
): {
    score: number;
    reasonCodes: string[];
    exactMatch: boolean;
    substringMatch: boolean;
    tokenCoverage: number;
    messageCoverage: number;
  } {
  const normalizedMessage = normalizeText(message);
  const normalizedPhrase = normalizeText(phrase);
  const phraseTokens = new Set(tokenize(phrase));

  const exactMatch = normalizedMessage.length > 0 && normalizedMessage === normalizedPhrase;
  const substringMatch =
    !exactMatch
    && normalizedPhrase.length > 0
    && normalizedMessage.includes(normalizedPhrase);
  const tokenCoverage = overlapRatio(messageTokens, phraseTokens);
  const messageCoverage = overlapRatio(phraseTokens, messageTokens);

  const exactScore = exactMatch ? 1 : 0;
  const substringScore = substringMatch ? 0.88 : 0;
  const lexicalScore = clamp((tokenCoverage * 0.75) + (messageCoverage * 0.15));

  const reasonCodes: string[] = [];
  if (exactMatch) reasonCodes.push('exact_phrase_match');
  if (substringMatch) reasonCodes.push('substring_phrase_match');
  if (tokenCoverage >= 0.8) reasonCodes.push('high_token_coverage');
  else if (tokenCoverage >= 0.5) reasonCodes.push('partial_token_coverage');

  let penaltyScore = 0;
  if (normalizedPhrase.length > 0 && normalizedPhrase.length < 5) {
    penaltyScore -= 0.08;
    reasonCodes.push('short_phrase_penalty');
  }
  if (phraseTokens.size === 1 && !exactMatch) {
    penaltyScore -= 0.07;
    reasonCodes.push('single_token_penalty');
  }

  let score = Math.max(exactScore, substringScore, lexicalScore) + penaltyScore;

  if (strictMatch && !exactMatch) {
    score *= 0.25;
    reasonCodes.push('strict_requires_exact');
  }

  return {
    score: clamp(score),
    reasonCodes,
    exactMatch,
    substringMatch,
    tokenCoverage,
    messageCoverage,
  };
}

function getSpecificityBoost(phrase: string): number {
  const tokens = tokenize(phrase);
  if (tokens.length >= 6) return 0.08;
  if (tokens.length >= 4) return 0.05;
  if (tokens.length >= 2) return 0.02;
  return 0;
}

export class WorkflowTriggerRouter {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private delegate: TriggerRouterDelegate;

  constructor(delegate: TriggerRouterDelegate) {
    this.delegate = delegate;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.arm();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async refresh(): Promise<void> {
    if (!this.running) return;
    await this.arm();
  }

  evaluateChatTriggers(input: {
    message: string;
    candidates: ChatTriggerCandidate[];
    minConfidence?: number;
    activationThreshold?: number;
    maxResults?: number;
  }): TriggerActivationResult[] {
    const message = input.message || '';
    const messageTokens = new Set(tokenize(message));
    if (messageTokens.size === 0) return [];

    const minConfidence = clamp(input.minConfidence ?? DEFAULT_MIN_CONFIDENCE);
    const baseActivationThreshold = clamp(input.activationThreshold ?? DEFAULT_ACTIVATION_THRESHOLD);
    const results: TriggerActivationResult[] = [];

    for (const candidate of input.candidates) {
      if (candidate.enabled === false) continue;
      if (!Array.isArray(candidate.phrases) || candidate.phrases.length === 0) continue;

      let bestScore = 0;
      let bestPhrase: string | null = null;
      let bestReasonCodes: string[] = [];
      let bestExactMatch = false;
      let bestSubstringMatch = false;
      let bestTokenCoverage = 0;
      let bestMessageCoverage = 0;

      for (const phrase of candidate.phrases) {
        const evaluation = evaluateCandidatePhrase(
          message,
          messageTokens,
          phrase,
          Boolean(candidate.strictMatch),
        );

        if (evaluation.score > bestScore) {
          bestScore = evaluation.score;
          bestPhrase = phrase;
          bestReasonCodes = evaluation.reasonCodes;
          bestExactMatch = evaluation.exactMatch;
          bestSubstringMatch = evaluation.substringMatch;
          bestTokenCoverage = evaluation.tokenCoverage;
          bestMessageCoverage = evaluation.messageCoverage;
        }
      }

      const specificityBoost = bestPhrase ? getSpecificityBoost(bestPhrase) : 0;
      const effectiveThreshold = clamp(baseActivationThreshold - specificityBoost, 0.5, 0.95);
      const shouldActivate = bestScore >= effectiveThreshold;
      if (bestScore < minConfidence) continue;

      results.push({
        workflowId: candidate.workflowId,
        workflowVersion: candidate.workflowVersion,
        triggerId: candidate.triggerId,
        confidence: bestScore,
        shouldActivate,
        matchedPhrase: bestPhrase,
        reasonCodes: shouldActivate
          ? [...bestReasonCodes, 'activation_threshold_met']
          : [...bestReasonCodes, 'activation_threshold_not_met'],
        breakdown: {
          exactMatch: bestExactMatch,
          substringMatch: bestSubstringMatch,
          tokenCoverage: bestTokenCoverage,
          messageCoverage: bestMessageCoverage,
          strictMatch: Boolean(candidate.strictMatch),
          effectiveThreshold,
          componentScores: {
            exactScore: bestExactMatch ? 1 : 0,
            substringScore: bestSubstringMatch ? 0.88 : 0,
            lexicalScore: clamp((bestTokenCoverage * 0.75) + (bestMessageCoverage * 0.15)),
            penaltyScore: clamp(bestScore - Math.max(
              bestExactMatch ? 1 : 0,
              bestSubstringMatch ? 0.88 : 0,
              clamp((bestTokenCoverage * 0.75) + (bestMessageCoverage * 0.15)),
            ), -1, 1),
          },
        },
      });
    }

    const sorted = results.sort((a, b) => b.confidence - a.confidence);
    const maxResults = input.maxResults ? Math.max(1, input.maxResults) : sorted.length;
    return sorted.slice(0, maxResults);
  }

  private async arm(): Promise<void> {
    if (!this.running) return;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const nextAt = await this.delegate.getNextScheduleAt();
    if (!nextAt) return;

    const delay = Math.min(Math.max(0, nextAt - Date.now()), MAX_TIMEOUT_MS);

    this.timer = setTimeout(() => {
      void this.onTick();
    }, delay);

    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  private async onTick(): Promise<void> {
    if (!this.running) return;

    try {
      await this.delegate.runDueSchedules();
    } finally {
      await this.arm();
    }
  }
}
