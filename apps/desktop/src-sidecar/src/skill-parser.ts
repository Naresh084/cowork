/**
 * Skill Parser Service
 *
 * Parses SKILL.md files following the Agent Skills Standard format,
 * with backwards compatibility for OpenClaw format.
 */

import type {
  SkillFrontmatter,
  SkillMetadata,
  SkillRequirements,
  InstallOption,
  OpenClawFrontmatter,
  OpenClawMetadata,
} from '@gemini-cowork/shared';

// Simple YAML frontmatter parser (avoiding external dependency)
// Handles basic YAML structure with nested objects

/**
 * Extract frontmatter from markdown content
 */
export function extractFrontmatter(content: string): { data: Record<string, unknown>; body: string } | null {
  const lines = content.split('\n');

  // Check for opening ---
  if (lines[0]?.trim() !== '---') {
    return null;
  }

  // Find closing ---
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return null;
  }

  const yamlContent = lines.slice(1, endIndex).join('\n');
  const body = lines.slice(endIndex + 1).join('\n').trim();

  try {
    const data = parseYaml(yamlContent);
    return { data, body };
  } catch {
    return null;
  }
}

/**
 * Simple YAML parser for skill frontmatter
 * Handles basic structures needed for skill files
 */
function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');

  let currentKey: string | null = null;
  let jsonBlock = '';
  let inJsonBlock = false;
  let jsonBraceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Handle JSON block (metadata often uses JSON in OpenClaw format)
    if (inJsonBlock) {
      jsonBlock += line + '\n';
      jsonBraceCount += (line.match(/{/g) || []).length;
      jsonBraceCount -= (line.match(/}/g) || []).length;

      if (jsonBraceCount === 0) {
        inJsonBlock = false;
        if (currentKey) {
          try {
            result[currentKey] = JSON.parse(jsonBlock.trim());
          } catch {
            result[currentKey] = jsonBlock.trim();
          }
        }
        jsonBlock = '';
        currentKey = null;
      }
      continue;
    }

    // Check for key: value pairs
    const keyMatch = trimmed.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1];
      let value = keyMatch[2];

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Check if value starts a JSON block
      if (value.trim().startsWith('{')) {
        inJsonBlock = true;
        currentKey = key;
        jsonBlock = value + '\n';
        jsonBraceCount = (value.match(/{/g) || []).length;
        jsonBraceCount -= (value.match(/}/g) || []).length;

        if (jsonBraceCount === 0) {
          inJsonBlock = false;
          try {
            result[key] = JSON.parse(jsonBlock.trim());
          } catch {
            result[key] = jsonBlock.trim();
          }
          jsonBlock = '';
          currentKey = null;
        }
        continue;
      }

      // Simple value - with type coercion
      if (value) {
        // Try to parse as number
        if (/^-?\d+$/.test(value)) {
          result[key] = parseInt(value, 10);
        } else if (/^-?\d+\.\d+$/.test(value)) {
          result[key] = parseFloat(value);
        } else if (value === 'true') {
          result[key] = true;
        } else if (value === 'false') {
          result[key] = false;
        } else if (value === 'null') {
          result[key] = null;
        } else {
          result[key] = value;
        }
      } else {
        // Multiline value or nested object - store key for now
        currentKey = key;
      }
    }
  }

  return result;
}

/**
 * Detect if frontmatter is in OpenClaw format
 */
function isOpenClawFormat(data: Record<string, unknown>): boolean {
  const metadata = data.metadata as OpenClawMetadata | undefined;
  return metadata?.openclaw !== undefined;
}

/**
 * Normalize OpenClaw format to Agent Skills Standard
 */
export function normalizeOpenClawFormat(data: OpenClawFrontmatter): SkillFrontmatter {
  const openclaw = data.metadata?.openclaw;

  const metadata: SkillMetadata = {
    emoji: openclaw?.emoji,
    requires: openclaw?.requires,
    install: openclaw?.install?.map((opt) => ({
      kind: opt.kind,
      formula: opt.formula,
      tap: opt.tap,
      package: opt.package,
      module: opt.module,
      url: opt.url,
      instructions: opt.instructions,
      label: opt.label,
      bins: opt.bins,
    })),
  };

  return {
    name: data.name,
    description: data.description,
    homepage: data.homepage,
    license: data.license,
    metadata,
  };
}

/**
 * Parse SKILL.md content and extract frontmatter
 */
export function parseFrontmatter(content: string): SkillFrontmatter | null {
  const extracted = extractFrontmatter(content);
  if (!extracted) {
    return null;
  }

  const { data } = extracted;

  // Check for required fields
  if (!data.name || typeof data.name !== 'string') {
    return null;
  }

  if (!data.description || typeof data.description !== 'string') {
    return null;
  }

  // Normalize OpenClaw format if detected
  if (isOpenClawFormat(data)) {
    return normalizeOpenClawFormat(data as unknown as OpenClawFrontmatter);
  }

  // Standard format
  const metadata = data.metadata as SkillMetadata | undefined;

  return {
    name: data.name as string,
    description: data.description as string,
    license: data.license as string | undefined,
    compatibility: data.compatibility as string | undefined,
    homepage: data.homepage as string | undefined,
    'allowed-tools': data['allowed-tools'] as string | undefined,
    metadata,
  };
}

/**
 * Validate skill frontmatter against schema
 */
export function validateSkillSchema(frontmatter: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!frontmatter || typeof frontmatter !== 'object') {
    return { valid: false, errors: ['Frontmatter must be an object'] };
  }

  const fm = frontmatter as Record<string, unknown>;

  // Required: name (1-64 chars)
  if (!fm.name || typeof fm.name !== 'string') {
    errors.push('name is required and must be a string');
  } else if (fm.name.length < 1 || fm.name.length > 64) {
    errors.push('name must be 1-64 characters');
  }

  // Required: description (1-1024 chars)
  if (!fm.description || typeof fm.description !== 'string') {
    errors.push('description is required and must be a string');
  } else if (fm.description.length < 1 || fm.description.length > 1024) {
    errors.push('description must be 1-1024 characters');
  }

  // Optional: metadata validation
  if (fm.metadata !== undefined && typeof fm.metadata !== 'object') {
    errors.push('metadata must be an object if provided');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Extract metadata from frontmatter
 */
export function extractMetadata(frontmatter: SkillFrontmatter): SkillMetadata {
  return frontmatter.metadata || {};
}

/**
 * Parse full skill markdown file
 */
export function parseSkillMarkdown(content: string): { frontmatter: SkillFrontmatter; body: string } | null {
  const extracted = extractFrontmatter(content);
  if (!extracted) {
    return null;
  }

  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    return null;
  }

  return {
    frontmatter,
    body: extracted.body,
  };
}

/**
 * Get requirements from skill frontmatter
 */
export function getRequirements(frontmatter: SkillFrontmatter): SkillRequirements {
  return frontmatter.metadata?.requires || {};
}

/**
 * Get install options from skill frontmatter
 */
export function getInstallOptions(frontmatter: SkillFrontmatter): InstallOption[] {
  return frontmatter.metadata?.install || [];
}
