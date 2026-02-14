import type {
  ChatItem,
  Message,
  SkillBinding,
  SkillGenerationCandidate,
  SkillGenerationDraft,
  SkillGenerationRequest,
  SkillGenerationResult,
  SkillGenerationSummary,
} from '@gemini-cowork/shared';
import {
  SkillGenerationRequestSchema,
} from '@gemini-cowork/shared';
import { parseSkillMarkdown, validateSkillSchema } from './skill-parser.js';
import { skillService } from './skill-service.js';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'we',
  'with',
  'you',
  'your',
]);

export interface SkillGenerationSessionContext {
  sessionId: string;
  workingDirectory: string;
  chatItems: ChatItem[];
}

type SessionContextResolver = (sessionId: string) => SkillGenerationSessionContext | null;

interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

export class SkillGenerationService {
  private readonly resolveSessionContext: SessionContextResolver;

  constructor(resolveSessionContext: SessionContextResolver) {
    this.resolveSessionContext = resolveSessionContext;
  }

  async draftFromSession(request: SkillGenerationRequest): Promise<SkillGenerationDraft> {
    const normalizedRequest = SkillGenerationRequestSchema.parse({
      ...request,
      mode: 'draft',
    });
    const session = this.resolveSessionContext(normalizedRequest.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${normalizedRequest.sessionId}`);
    }

    await this.ensureSkillCreatorBootstrap();
    const turns = this.extractConversationTurns(session.chatItems);
    if (turns.length === 0) {
      throw new Error('No usable conversation context found for skill generation.');
    }

    const summary = this.buildSummary(turns);
    const goal = this.resolveGoal(normalizedRequest.goal, turns, normalizedRequest.purpose);
    const topics = this.deriveTopics(goal, turns, normalizedRequest.maxSkills);
    const skills = topics.map((topic, index) => {
      const sourceSignals = this.pickSourceSignals(turns, topic, 3);
      const name = this.generateSkillName(topic, index);
      const description = this.generateDescription(topic, normalizedRequest.purpose, turns);
      const content = this.generateSkillBody({
        topic,
        goal,
        purpose: normalizedRequest.purpose,
        summary,
        sourceSignals,
      });
      const skillMarkdown = this.buildSkillMarkdown(name, description, content);
      this.validateCandidate(skillMarkdown);
      return {
        name,
        description,
        content,
        skillMarkdown,
        sourceSignals,
      } satisfies SkillGenerationCandidate;
    });

    return {
      request: normalizedRequest,
      summary,
      skills,
      generatedAt: Date.now(),
    };
  }

  async createFromSession(request: SkillGenerationRequest): Promise<SkillGenerationResult> {
    const normalizedRequest = SkillGenerationRequestSchema.parse({
      ...request,
      mode: 'create',
    });
    const draft = await this.draftFromSession(normalizedRequest);
    const createdSkills: SkillBinding[] = [];
    const skippedSkills: string[] = [];

    for (const candidate of draft.skills) {
      const uniqueName = await this.reserveSkillName(candidate.name);
      if (!uniqueName) {
        skippedSkills.push(candidate.name);
        continue;
      }

      const description = candidate.description;
      const content = candidate.content;
      const skillId = await skillService.createSkill({
        name: uniqueName,
        description,
        emoji: '🛠️',
        category: normalizedRequest.purpose === 'scheduled_task' ? 'automation' : 'custom',
        content,
      });

      createdSkills.push({
        skillId,
        skillName: uniqueName,
        bindingMode: 'instruction_only',
        createdFromSessionId: normalizedRequest.sessionId,
        createdAt: Date.now(),
      });
    }

    if (createdSkills.length === 0) {
      throw new Error('Skill generation completed but no skills were created.');
    }

    return {
      draft,
      createdSkills,
      skippedSkills,
    };
  }

  private async ensureSkillCreatorBootstrap(): Promise<void> {
    await skillService.ensureDefaultManagedSkillInstalled('skill-creator');
  }

  private extractConversationTurns(chatItems: ChatItem[]): ConversationTurn[] {
    const turns: ConversationTurn[] = [];

    for (const item of chatItems) {
      if (item.kind !== 'user_message' && item.kind !== 'assistant_message') {
        continue;
      }
      const text = this.extractTextFromMessageContent(item.content as Message['content']);
      if (!text) continue;
      turns.push({
        role: item.kind === 'user_message' ? 'user' : 'assistant',
        text,
      });
    }

    return turns.slice(-60);
  }

  private extractTextFromMessageContent(content: Message['content']): string {
    if (typeof content === 'string') {
      return content.trim();
    }

    return content
      .filter((part): part is { type: 'text'; text: string } => (
        typeof part === 'object'
        && part !== null
        && part.type === 'text'
        && typeof (part as { text?: unknown }).text === 'string'
      ))
      .map((part) => part.text)
      .join('\n')
      .trim();
  }

  private buildSummary(turns: ConversationTurn[]): SkillGenerationSummary {
    const userTurns = turns.filter((turn) => turn.role === 'user');
    const assistantTurns = turns.length - userTurns.length;
    const userTexts = userTurns.map((turn) => this.normalizeText(turn.text)).filter(Boolean);
    const repeatedIntents = this.collectRepeatedIntents(userTexts);
    const constraints = this.collectConstraints(userTurns.map((turn) => turn.text));
    const preferredOutputs = this.collectPreferredOutputs(turns.map((turn) => turn.text));

    return {
      conversationTurns: turns.length,
      userTurns: userTurns.length,
      assistantTurns,
      repeatedIntents,
      constraints,
      preferredOutputs,
    };
  }

  private collectRepeatedIntents(normalizedUserTexts: string[]): string[] {
    const counts = new Map<string, number>();
    for (const text of normalizedUserTexts) {
      if (!text) continue;
      const compact = text.slice(0, 120);
      counts.set(compact, (counts.get(compact) || 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([text]) => text);
  }

  private collectConstraints(texts: string[]): string[] {
    const patterns = [
      /\bmust\b/i,
      /\bshould\b/i,
      /\bwithout\b/i,
      /\bdo not\b/i,
      /\bno\b/i,
      /\bcritical\b/i,
      /\bstrict\b/i,
    ];
    const constraints = new Set<string>();

    for (const text of texts) {
      const sentences = text.split(/[.!?]\s+/);
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;
        if (patterns.some((pattern) => pattern.test(trimmed))) {
          constraints.add(trimmed.slice(0, 200));
        }
      }
    }

    return Array.from(constraints).slice(0, 8);
  }

  private collectPreferredOutputs(texts: string[]): string[] {
    const outputPatterns: Array<{ label: string; pattern: RegExp }> = [
      { label: 'summary', pattern: /\bsummary\b/i },
      { label: 'report', pattern: /\breport\b/i },
      { label: 'json', pattern: /\bjson\b/i },
      { label: 'markdown', pattern: /\bmarkdown\b/i },
      { label: 'table', pattern: /\btable\b/i },
      { label: 'checklist', pattern: /\bchecklist\b/i },
    ];
    const outputs = new Set<string>();

    for (const text of texts) {
      for (const outputPattern of outputPatterns) {
        if (outputPattern.pattern.test(text)) {
          outputs.add(outputPattern.label);
        }
      }
    }

    return Array.from(outputs);
  }

  private resolveGoal(
    goal: string | undefined,
    turns: ConversationTurn[],
    purpose: SkillGenerationRequest['purpose'],
  ): string {
    const trimmedGoal = goal?.trim();
    if (trimmedGoal) return trimmedGoal;

    const latestUser = [...turns].reverse().find((turn) => turn.role === 'user');
    if (latestUser && latestUser.text.trim()) {
      return latestUser.text.trim();
    }

    if (purpose === 'scheduled_task') {
      return 'Execute the recurring scheduled workflow reliably and consistently.';
    }
    return 'Create a reusable specialist skill based on this conversation.';
  }

  private deriveTopics(
    goal: string,
    turns: ConversationTurn[],
    maxSkills: number,
  ): string[] {
    const topicSet = new Set<string>();
    for (const segment of this.segmentTopic(goal)) {
      topicSet.add(segment);
    }

    const latestUserTurns = turns
      .filter((turn) => turn.role === 'user')
      .slice(-6)
      .map((turn) => turn.text.trim())
      .filter(Boolean);
    for (const text of latestUserTurns) {
      if (topicSet.size >= maxSkills) break;
      const segments = this.segmentTopic(text);
      for (const segment of segments) {
        if (topicSet.size >= maxSkills) break;
        topicSet.add(segment);
      }
    }

    if (topicSet.size === 0) {
      topicSet.add(goal);
    }

    return Array.from(topicSet).slice(0, maxSkills);
  }

  private segmentTopic(text: string): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    const fragments = normalized
      .split(/\b(?:and then|then|also|and)\b|[;]+/i)
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length >= 18);

    if (fragments.length === 0) {
      return [normalized];
    }

    return fragments.slice(0, 3);
  }

  private pickSourceSignals(turns: ConversationTurn[], topic: string, limit: number): string[] {
    const lowered = topic.toLowerCase();
    const matches: string[] = [];

    for (const turn of turns) {
      if (matches.length >= limit) break;
      if (!turn.text.toLowerCase().includes(lowered.split(' ')[0] || lowered)) {
        continue;
      }
      matches.push(turn.text.slice(0, 220));
    }

    return matches;
  }

  private generateSkillName(topic: string, index: number): string {
    const tokens = topic
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
      .slice(0, 8);
    const base = tokens.length > 0 ? tokens.join('-') : `conversation-skill-${index + 1}`;
    const compact = base.replace(/-+/g, '-').replace(/^-|-$/g, '');
    const trimmed = compact.slice(0, 56).replace(/-$/g, '');
    return trimmed || `conversation-skill-${index + 1}`;
  }

  private generateDescription(
    topic: string,
    purpose: SkillGenerationRequest['purpose'],
    turns: ConversationTurn[],
  ): string {
    const origin = purpose === 'scheduled_task'
      ? 'scheduled task executions'
      : 'conversation-driven specialist tasks';
    const shortTopic = topic.replace(/\s+/g, ' ').trim().slice(0, 180);
    const signal = turns
      .filter((turn) => turn.role === 'user')
      .slice(-1)
      .map((turn) => turn.text.slice(0, 90))
      .join('');

    const composed = `Use when handling ${shortTopic} for ${origin}. Trigger when requests match the same workflow pattern. ${signal}`.trim();
    return composed.replace(/\s+/g, ' ').slice(0, 1000);
  }

  private generateSkillBody(params: {
    topic: string;
    goal: string;
    purpose: SkillGenerationRequest['purpose'];
    summary: SkillGenerationSummary;
    sourceSignals: string[];
  }): string {
    const outputContract = params.summary.preferredOutputs.length > 0
      ? params.summary.preferredOutputs.join(', ')
      : 'concise actionable summary';
    const constraints = params.summary.constraints.length > 0
      ? params.summary.constraints.map((constraint) => `- ${constraint}`).join('\n')
      : '- Follow explicit user constraints exactly.\n- Ask only when critical details are missing.';
    const signalList = params.sourceSignals.length > 0
      ? params.sourceSignals.map((signal) => `- ${signal}`).join('\n')
      : '- Use current-session conversation history as context for this workflow.';

    return [
      `# ${this.toTitleCase(params.topic)}`,
      '',
      '## Purpose',
      `Execute this workflow consistently when requests are about: ${params.topic}.`,
      `Primary objective: ${params.goal}`,
      '',
      '## When To Use',
      '- Use for requests that repeat this workflow pattern.',
      '- Use when the user asks for the same outcome on a schedule or with strict consistency.',
      '',
      '## When Not To Use',
      '- Do not use for unrelated ad-hoc questions.',
      '- Do not use when user asks to ignore prior workflow constraints.',
      '',
      '## Workflow',
      '1. Review conversation-derived constraints and expected output shape before taking action.',
      '2. Select only tools needed for this exact workflow; avoid unnecessary steps.',
      '3. Execute deterministically with clear checkpoints and concise progress reporting.',
      '4. Validate final output against required format and explicit constraints.',
      '5. End with a short "Skill used: <skill-name>" marker for traceability.',
      '',
      '## Output Contract',
      `- Preferred output style: ${outputContract}.`,
      '- Include concrete results and next actions.',
      '- Use exact dates/times when time-sensitive.',
      '',
      '## Constraints',
      constraints,
      '',
      '## Conversation Signals',
      signalList,
      '',
      '## Failure Handling',
      '- If a required tool or dependency is unavailable, report the blocker clearly.',
      '- Provide a minimal fallback plan and explicitly list what could not be completed.',
      '',
      '## Notes',
      `- Generated for purpose: ${params.purpose}.`,
      '- This skill should remain concise and evolve based on successful runs.',
    ].join('\n');
  }

  private buildSkillMarkdown(name: string, description: string, content: string): string {
    const escapedDescription = description.replace(/"/g, '\\"');
    return [
      '---',
      `name: ${name}`,
      `description: "${escapedDescription}"`,
      'license: MIT',
      'metadata:',
      '  author: cowork-auto',
      '  version: "1.0.0"',
      '  emoji: "🛠️"',
      '  category: automation',
      '  lifecycle: draft',
      '  trustLevel: unverified',
      '  verificationNotes: "Auto-generated from current session conversation. Validate before broad reuse."',
      '---',
      '',
      content.trim(),
    ].join('\n');
  }

  private validateCandidate(skillMarkdown: string): void {
    const parsed = parseSkillMarkdown(skillMarkdown);
    if (!parsed) {
      throw new Error('Generated skill markdown is invalid (frontmatter parse failed).');
    }

    const validation = validateSkillSchema(parsed.frontmatter);
    if (!validation.valid) {
      throw new Error(`Generated skill metadata is invalid: ${validation.errors.join('; ')}`);
    }

    if (parsed.body.trim().length < 120) {
      throw new Error('Generated skill body is too short to be useful.');
    }
  }

  private async reserveSkillName(baseName: string): Promise<string | null> {
    const normalizedBase = baseName.trim().replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!normalizedBase) return null;

    let candidate = normalizedBase.slice(0, 64);
    if (!(await skillService.isInstalled(candidate))) {
      return candidate;
    }

    for (let suffix = 2; suffix <= 99; suffix++) {
      const versioned = this.appendVersionSuffix(normalizedBase, suffix);
      if (!(await skillService.isInstalled(versioned))) {
        return versioned;
      }
    }

    return null;
  }

  private appendVersionSuffix(baseName: string, version: number): string {
    const suffix = `-v${version}`;
    const maxBaseLength = Math.max(1, 64 - suffix.length);
    const trimmedBase = baseName.slice(0, maxBaseLength).replace(/-$/g, '');
    return `${trimmedBase}${suffix}`;
  }

  private normalizeText(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private toTitleCase(value: string): string {
    return value
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((token) => token[0]?.toUpperCase() + token.slice(1).toLowerCase())
      .join(' ');
  }
}
