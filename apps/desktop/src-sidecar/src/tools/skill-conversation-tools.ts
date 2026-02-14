// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';
import type { ToolHandler, ToolContext, ToolResult } from '@cowork/core';
import type {
  SkillGenerationDraft,
  SkillGenerationResult,
  SkillGenerationPurpose,
} from '@cowork/shared';

export type DraftSkillFromConversation = (input: {
  sessionId: string;
  goal?: string;
  purpose: SkillGenerationPurpose;
  maxSkills?: number;
}) => Promise<SkillGenerationDraft>;

export type CreateSkillFromConversation = (input: {
  sessionId: string;
  goal?: string;
  purpose: SkillGenerationPurpose;
  maxSkills?: number;
}) => Promise<SkillGenerationResult>;

export function createConversationSkillTools(params: {
  draftFromConversation: DraftSkillFromConversation;
  createFromConversation: CreateSkillFromConversation;
}): ToolHandler[] {
  const commonSchema = z.object({
    goal: z
      .string()
      .optional()
      .describe('Optional goal statement. When omitted, the tool infers intent from current conversation.'),
    purpose: z
      .enum(['manual_skill', 'scheduled_task'])
      .default('manual_skill')
      .describe('Why this skill is being created.'),
    maxSkills: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe('Maximum number of skill candidates to derive from the conversation.'),
  });

  const draftTool: ToolHandler = {
    name: 'draft_skill_from_conversation',
    description: `Analyze the current session conversation and generate a skill draft preview.

Use this before creating a skill, especially for scheduled automations, so you can show the user the draft and ask for confirmation.`,
    parameters: commonSchema,
    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const parsed = commonSchema.parse(args);
      const draft = await params.draftFromConversation({
        sessionId: context.sessionId,
        goal: parsed.goal,
        purpose: parsed.purpose,
        maxSkills: parsed.maxSkills,
      });

      return {
        success: true,
        data: {
          message: 'Skill draft generated from conversation.',
          generatedAt: draft.generatedAt,
          summary: draft.summary,
          skills: draft.skills.map((skill) => ({
            name: skill.name,
            description: skill.description,
            sourceSignals: skill.sourceSignals,
            skillMarkdown: skill.skillMarkdown,
          })),
        },
      };
    },
  };

  const createTool: ToolHandler = {
    name: 'create_skill_from_conversation',
    description: `Create one or more managed skills from the current conversation.

Call this after user confirmation. Created skills are installed in the managed skill directory and can be reused in future sessions.`,
    parameters: commonSchema,
    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const parsed = commonSchema.parse(args);
      const result = await params.createFromConversation({
        sessionId: context.sessionId,
        goal: parsed.goal,
        purpose: parsed.purpose,
        maxSkills: parsed.maxSkills,
      });

      return {
        success: true,
        data: {
          message: 'Skill(s) created from conversation.',
          createdSkills: result.createdSkills,
          skippedSkills: result.skippedSkills,
          draftSummary: result.draft.summary,
        },
      };
    },
  };

  return [draftTool, createTool];
}
