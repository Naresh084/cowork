// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { PromptBuildContext, PromptBuildResult, PromptTemplateSection } from './types.js';
import { getProviderTemplateKey } from './provider-map.js';
import { getModeTemplateKey } from './mode-map.js';
import { renderTemplate, mergePromptBlocks } from './render.js';
import { buildToolAutonomySection } from './tool-autonomy.js';
import { buildCapabilitySections } from './capability-sections.js';

const AUTONOMY_TEMPLATE = 'common/tool-autonomy-conservative.md' as const;

function toBlocks(sections: PromptTemplateSection[]): string[] {
  return sections.map((section) => section.content).filter(Boolean);
}

function normalizeSection(section: PromptTemplateSection): PromptTemplateSection {
  return {
    key: section.key,
    content: section.content.trim(),
  };
}

export class SystemPromptBuilder {
  build(context: PromptBuildContext): PromptBuildResult {
    const providerTemplateKey = getProviderTemplateKey(context.provider);
    const modeKey = getModeTemplateKey(context.sessionMode, context.executionMode);

    const baseSections: PromptTemplateSection[] = [
      { key: 'session_mode', content: renderTemplate(modeKey) },
      { key: 'provider_profile', content: renderTemplate(providerTemplateKey) },
      { key: 'autonomy_policy', content: renderTemplate(AUTONOMY_TEMPLATE) },
      buildToolAutonomySection(context.toolHandlers),
      ...buildCapabilitySections(context),
      ...context.additionalSections.map(normalizeSection),
    ];

    const prompt = mergePromptBlocks(toBlocks(baseSections));
    const restricted = context.capabilitySnapshot.toolAccess.filter((entry) => !entry.enabled).length;
    const integrations = context.capabilitySnapshot.integrationAccess.filter((entry) => entry.enabled).length;

    return {
      prompt,
      sections: baseSections,
      diagnostics: {
        provider: context.provider,
        providerTemplateKey,
        modeTemplateKey: modeKey,
        sectionKeys: baseSections.map((section) => section.key),
        toolCount: context.toolHandlers.length,
        restrictedToolCount: restricted,
        integrationCount: integrations,
        promptLength: prompt.length,
        usingLegacyFallback: false,
      },
    };
  }
}
