import { z } from 'zod';

export const SkillGenerationPurposeSchema = z.enum([
  'manual_skill',
  'scheduled_task',
]);
export type SkillGenerationPurpose = z.infer<typeof SkillGenerationPurposeSchema>;

export const SkillGenerationModeSchema = z.enum(['draft', 'create']);
export type SkillGenerationMode = z.infer<typeof SkillGenerationModeSchema>;

export const SkillGenerationRequestSchema = z.object({
  sessionId: z.string().min(1),
  purpose: SkillGenerationPurposeSchema.default('manual_skill'),
  goal: z.string().trim().min(1).optional(),
  workingDirectory: z.string().optional(),
  mode: SkillGenerationModeSchema.default('draft'),
  maxSkills: z.number().int().min(1).max(5).default(3),
});
export type SkillGenerationRequest = z.infer<typeof SkillGenerationRequestSchema>;

export const SkillGenerationSummarySchema = z.object({
  conversationTurns: z.number().int().nonnegative(),
  userTurns: z.number().int().nonnegative(),
  assistantTurns: z.number().int().nonnegative(),
  repeatedIntents: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  preferredOutputs: z.array(z.string()).default([]),
});
export type SkillGenerationSummary = z.infer<typeof SkillGenerationSummarySchema>;

export const SkillGenerationCandidateSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(1024),
  content: z.string().min(1),
  skillMarkdown: z.string().min(1),
  sourceSignals: z.array(z.string()).default([]),
});
export type SkillGenerationCandidate = z.infer<typeof SkillGenerationCandidateSchema>;

export const SkillBindingSchema = z.object({
  skillId: z.string().min(1),
  skillName: z.string().min(1),
  bindingMode: z.enum(['instruction_only']),
  createdFromSessionId: z.string().min(1).optional(),
  createdAt: z.number(),
});
export type SkillBinding = z.infer<typeof SkillBindingSchema>;

export const SkillGenerationDraftSchema = z.object({
  request: SkillGenerationRequestSchema,
  summary: SkillGenerationSummarySchema,
  skills: z.array(SkillGenerationCandidateSchema).min(1),
  generatedAt: z.number(),
});
export type SkillGenerationDraft = z.infer<typeof SkillGenerationDraftSchema>;

export const SkillGenerationResultSchema = z.object({
  draft: SkillGenerationDraftSchema,
  createdSkills: z.array(SkillBindingSchema).default([]),
  skippedSkills: z.array(z.string()).default([]),
});
export type SkillGenerationResult = z.infer<typeof SkillGenerationResultSchema>;
