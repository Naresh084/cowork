#!/usr/bin/env npx tsx

/**
 * OpenClaw Skills Conversion Script
 *
 * Converts skills from the OpenClaw format to the Agent Skills Standard format
 * used by Geminicowork. This script:
 * 1. Reads all skills from the OpenClaw skills directory
 * 2. Parses each SKILL.md file
 * 3. Converts the frontmatter from OpenClaw format to standard format
 * 4. Copies the converted skills to the geminicowork skills directory
 */

import { readdir, readFile, writeFile, mkdir, cp, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Source and target directories
const SOURCE_DIR = '/Users/naresh/Work/Personal/openclaw/skills';
const TARGET_DIR = join(__dirname, '..', 'skills');

// Category mapping based on skill name
const CATEGORY_MAP: Record<string, string> = {
  // Development
  github: 'development',
  'coding-agent': 'development',
  tmux: 'development',
  gog: 'development',
  bird: 'development',
  canvas: 'development',

  // DevOps
  mcporter: 'devops',
  'model-usage': 'devops',

  // Productivity
  '1password': 'productivity',
  obsidian: 'productivity',
  notion: 'productivity',
  slack: 'productivity',
  trello: 'productivity',
  'bear-notes': 'productivity',
  'things-mac': 'productivity',
  'apple-notes': 'productivity',
  'apple-reminders': 'productivity',
  himalaya: 'productivity',
  discord: 'productivity',
  imsg: 'productivity',
  bluebubbles: 'productivity',

  // Research
  blogwatcher: 'research',
  gifgrep: 'research',

  // Creative
  peekaboo: 'creative',
  camsnap: 'creative',
  'openai-whisper': 'creative',

  // Automation
  openhue: 'automation',
  'food-order': 'automation',
  'spotify-player': 'automation',
  'nano-banana-pro': 'automation',
  eightctl: 'automation',
  blucli: 'automation',

  // Custom (default)
};

interface OpenClawInstallOption {
  id?: string;
  kind: string;
  formula?: string;
  tap?: string;
  package?: string;
  module?: string;
  url?: string;
  instructions?: string;
  bins?: string[];
  label?: string;
}

interface OpenClawMetadata {
  openclaw?: {
    emoji?: string;
    requires?: {
      bins?: string[];
      anyBins?: string[];
      env?: string[];
      os?: string[];
    };
    install?: OpenClawInstallOption[];
  };
}

interface ParsedFrontmatter {
  name: string;
  description: string;
  homepage?: string;
  license?: string;
  metadata?: OpenClawMetadata;
}

/**
 * Extract YAML frontmatter from markdown content
 */
function extractFrontmatter(content: string): { yaml: string; body: string } | null {
  const lines = content.split('\n');

  if (lines[0]?.trim() !== '---') {
    return null;
  }

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

  const yaml = lines.slice(1, endIndex).join('\n');
  const body = lines.slice(endIndex + 1).join('\n').trim();

  return { yaml, body };
}

/**
 * Simple YAML parser for skill frontmatter
 */
function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');

  let jsonBlock = '';
  let inJsonBlock = false;
  let jsonBraceCount = 0;
  let currentKey: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

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

    const keyMatch = trimmed.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1];
      let value = keyMatch[2];

      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

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

      if (value) {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Convert OpenClaw format to Agent Skills Standard format
 */
function convertToStandardFormat(parsed: ParsedFrontmatter): string {
  const openclaw = parsed.metadata?.openclaw;
  const category = CATEGORY_MAP[parsed.name] || 'custom';

  // Build standard metadata
  const metadata: Record<string, unknown> = {
    author: 'geminicowork',
    version: '1.0.0',
  };

  if (openclaw?.emoji) {
    metadata.emoji = openclaw.emoji;
  }

  metadata.category = category;

  if (openclaw?.requires) {
    metadata.requires = openclaw.requires;
  }

  if (openclaw?.install) {
    metadata.install = openclaw.install.map((opt) => {
      const standardOpt: Record<string, unknown> = {
        kind: opt.kind,
      };
      if (opt.formula) standardOpt.formula = opt.formula;
      if (opt.tap) standardOpt.tap = opt.tap;
      if (opt.package) standardOpt.package = opt.package;
      if (opt.module) standardOpt.module = opt.module;
      if (opt.url) standardOpt.url = opt.url;
      if (opt.instructions) standardOpt.instructions = opt.instructions;
      if (opt.bins) standardOpt.bins = opt.bins;
      if (opt.label) standardOpt.label = opt.label;
      return standardOpt;
    });
  }

  // Build YAML frontmatter
  const lines: string[] = [
    '---',
    `name: ${parsed.name}`,
    `description: "${parsed.description.replace(/"/g, '\\"')}"`,
  ];

  if (parsed.homepage) {
    lines.push(`homepage: ${parsed.homepage}`);
  }

  if (parsed.license) {
    lines.push(`license: ${parsed.license}`);
  } else {
    lines.push('license: MIT');
  }

  // Add metadata as JSON (simpler than trying to format as YAML)
  lines.push(`metadata: ${JSON.stringify(metadata, null, 2).split('\n').join('\n  ')}`);

  lines.push('---');

  return lines.join('\n');
}

/**
 * Convert a single skill
 */
async function convertSkill(skillName: string): Promise<boolean> {
  const sourcePath = join(SOURCE_DIR, skillName, 'SKILL.md');
  const targetDir = join(TARGET_DIR, skillName);
  const targetPath = join(targetDir, 'SKILL.md');

  try {
    // Read source SKILL.md
    const content = await readFile(sourcePath, 'utf-8');

    // Extract frontmatter
    const extracted = extractFrontmatter(content);
    if (!extracted) {
      console.warn(`  [WARN] No frontmatter found in ${skillName}/SKILL.md`);
      return false;
    }

    // Parse frontmatter
    const parsed = parseYaml(extracted.yaml) as ParsedFrontmatter;

    if (!parsed.name || !parsed.description) {
      console.warn(`  [WARN] Missing name or description in ${skillName}/SKILL.md`);
      return false;
    }

    // Convert to standard format
    const newFrontmatter = convertToStandardFormat(parsed);

    // Combine new frontmatter with body
    const newContent = `${newFrontmatter}\n\n${extracted.body}`;

    // Create target directory
    await mkdir(targetDir, { recursive: true });

    // Write converted SKILL.md
    await writeFile(targetPath, newContent, 'utf-8');

    // Copy references/ if exists
    const refsSource = join(SOURCE_DIR, skillName, 'references');
    if (existsSync(refsSource)) {
      await cp(refsSource, join(targetDir, 'references'), { recursive: true });
    }

    // Copy scripts/ if exists
    const scriptsSource = join(SOURCE_DIR, skillName, 'scripts');
    if (existsSync(scriptsSource)) {
      await cp(scriptsSource, join(targetDir, 'scripts'), { recursive: true });
    }

    // Copy assets/ if exists
    const assetsSource = join(SOURCE_DIR, skillName, 'assets');
    if (existsSync(assetsSource)) {
      await cp(assetsSource, join(targetDir, 'assets'), { recursive: true });
    }

    return true;
  } catch (error) {
    console.error(`  [ERROR] Failed to convert ${skillName}:`, error);
    return false;
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('OpenClaw Skills Conversion Script');
  console.log('==================================');
  console.log(`Source: ${SOURCE_DIR}`);
  console.log(`Target: ${TARGET_DIR}`);
  console.log('');

  // Check source exists
  if (!existsSync(SOURCE_DIR)) {
    console.error(`ERROR: Source directory not found: ${SOURCE_DIR}`);
    process.exit(1);
  }

  // Create target directory
  await mkdir(TARGET_DIR, { recursive: true });

  // Get all skill directories
  const entries = await readdir(SOURCE_DIR, { withFileTypes: true });
  const skills = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);

  console.log(`Found ${skills.length} skills to convert`);
  console.log('');

  let converted = 0;
  let failed = 0;

  for (const skill of skills) {
    process.stdout.write(`Converting ${skill}... `);
    const success = await convertSkill(skill);
    if (success) {
      console.log('OK');
      converted++;
    } else {
      console.log('FAILED');
      failed++;
    }
  }

  console.log('');
  console.log('==================================');
  console.log(`Converted: ${converted}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${skills.length}`);
}

main().catch(console.error);
