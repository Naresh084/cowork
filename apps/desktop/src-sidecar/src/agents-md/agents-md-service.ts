// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * AgentsMdService - AGENTS.md Parser and Generator
 *
 * Handles parsing, validation, and generation of AGENTS.md project context files
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  AgentsMdConfig,
  AgentsMdValidation,
  TechStack,
  ProjectCommand,
  CodingConventions,
  AgentInstructions,
  ImportantFile,
} from './types.js';

/**
 * Section markers
 */
const SECTIONS = {
  PROJECT_OVERVIEW: '## Project Overview',
  TECH_STACK: '## Tech Stack',
  DIRECTORY_STRUCTURE: '## Directory Structure',
  COMMANDS: '## Available Commands',
  CONVENTIONS: '## Coding Conventions',
  INSTRUCTIONS: '## Agent Instructions',
  IMPORTANT_FILES: '## Important Files',
  ENVIRONMENT: '## Environment Setup',
  ADDITIONAL: '## Additional Context',
} as const;

/**
 * Required sections for a valid AGENTS.md
 */
const REQUIRED = [SECTIONS.PROJECT_OVERVIEW, SECTIONS.TECH_STACK];

/**
 * AgentsMdService class
 */
export class AgentsMdService {
  /**
   * Parse an existing AGENTS.md file
   */
  async parse(workingDir: string): Promise<AgentsMdConfig | null> {
    const filePath = join(workingDir, 'AGENTS.md');

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      return this.parseContent(content, filePath);
    } catch {
      return null;
    }
  }

  /**
   * Parse AGENTS.md content
   */
  parseContent(content: string, filePath?: string): AgentsMdConfig {
    const lines = content.split('\n');
    const sections = this.extractSections(lines);

    // Extract project name from title
    const titleMatch = content.match(/^#\s+(?:AGENTS\.md\s+-\s+)?(.+?)$/m);
    const projectName = titleMatch ? titleMatch[1].trim() : 'Unknown Project';

    // Parse tech stack table
    const techStack = this.parseTechStackTable(sections[SECTIONS.TECH_STACK] || '');

    // Parse commands table
    const commands = this.parseCommandsTable(sections[SECTIONS.COMMANDS] || '');

    // Parse conventions
    const conventions = this.parseConventions(sections[SECTIONS.CONVENTIONS] || '');

    // Parse instructions
    const instructions = this.parseInstructions(sections[SECTIONS.INSTRUCTIONS] || '');

    // Parse important files
    const importantFiles = this.parseImportantFiles(sections[SECTIONS.IMPORTANT_FILES] || '');

    // Parse environment variables
    const environmentVars = this.parseEnvironmentVars(sections[SECTIONS.ENVIRONMENT] || '');

    return {
      projectName,
      overview: sections[SECTIONS.PROJECT_OVERVIEW]?.trim() || '',
      techStack,
      directoryStructure: sections[SECTIONS.DIRECTORY_STRUCTURE]?.trim() || '',
      commands,
      conventions,
      instructions,
      importantFiles,
      environmentVars,
      additionalContext: sections[SECTIONS.ADDITIONAL]?.trim() || '',
      rawContent: content,
      filePath,
      lastModified: new Date().toISOString(),
    };
  }

  /**
   * Extract sections from AGENTS.md content
   */
  private extractSections(lines: string[]): Record<string, string> {
    const sections: Record<string, string> = {};
    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      // Check if this is a section header (## heading)
      if (line.startsWith('## ')) {
        // Save previous section
        if (currentSection) {
          sections[currentSection] = currentContent.join('\n');
        }
        currentSection = line.trim();
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentSection) {
      sections[currentSection] = currentContent.join('\n');
    }

    return sections;
  }

  /**
   * Parse tech stack table
   */
  private parseTechStackTable(content: string): TechStack {
    const techStack: TechStack = { language: 'Unknown' };

    const rows = content.match(/\|\s*(\w+)\s*\|\s*([^|]+)\s*\|/g);
    if (!rows) return techStack;

    for (const row of rows) {
      const match = row.match(/\|\s*(\w+)\s*\|\s*([^|]+)\s*\|/);
      if (!match) continue;

      const key = match[1].toLowerCase();
      const value = match[2].trim();

      switch (key) {
        case 'language':
          techStack.language = value;
          break;
        case 'framework':
          techStack.framework = value;
          break;
        case 'build':
        case 'buildtool':
          techStack.buildTool = value;
          break;
        case 'package':
        case 'packagemanager':
          techStack.packageManager = value;
          break;
        case 'test':
        case 'testframework':
          techStack.testFramework = value;
          break;
        default:
          if (!techStack.additional) techStack.additional = {};
          techStack.additional[key] = value;
      }
    }

    return techStack;
  }

  /**
   * Parse commands table
   */
  private parseCommandsTable(content: string): ProjectCommand[] {
    const commands: ProjectCommand[] = [];

    const rows = content.match(/\|\s*`([^`]+)`\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g);
    if (!rows) return commands;

    for (const row of rows) {
      const match = row.match(/\|\s*`([^`]+)`\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
      if (!match) continue;

      commands.push({
        command: match[1].trim(),
        description: match[2].trim(),
        usage: match[3].trim(),
      });
    }

    return commands;
  }

  /**
   * Parse coding conventions
   */
  private parseConventions(content: string): CodingConventions {
    const conventions: CodingConventions = {
      styleGuide: [],
      naming: {},
      patterns: [],
    };

    // Extract style guide items
    const styleSection = content.match(/### Style Guide\n([\s\S]*?)(?=###|$)/);
    if (styleSection) {
      const items = styleSection[1].match(/^-\s+(.+)$/gm);
      if (items) {
        conventions.styleGuide = items.map(item => item.replace(/^-\s+/, '').trim());
      }
    }

    // Extract naming conventions
    const namingSection = content.match(/### Naming Conventions\n([\s\S]*?)(?=###|$)/);
    if (namingSection) {
      const items = namingSection[1].match(/^-\s+(\w+):\s+(.+)$/gm);
      if (items) {
        for (const item of items) {
          const match = item.match(/^-\s+(\w+):\s+(.+)$/);
          if (match) {
            const key = match[1].toLowerCase();
            conventions.naming[key as keyof typeof conventions.naming] = match[2].trim();
          }
        }
      }
    }

    // Extract patterns
    const patternsSection = content.match(/### Patterns\n([\s\S]*?)(?=###|$)/);
    if (patternsSection) {
      const items = patternsSection[1].match(/^-\s+(.+)$/gm);
      if (items) {
        conventions.patterns = items.map(item => item.replace(/^-\s+/, '').trim());
      }
    }

    return conventions;
  }

  /**
   * Parse agent instructions
   */
  private parseInstructions(content: string): AgentInstructions {
    const instructions: AgentInstructions = {
      do: [],
      dont: [],
    };

    // Extract "Do" items
    const doSection = content.match(/### Do\n([\s\S]*?)(?=###|$)/);
    if (doSection) {
      const items = doSection[1].match(/^-\s+(.+)$/gm);
      if (items) {
        instructions.do = items.map(item => item.replace(/^-\s+/, '').trim());
      }
    }

    // Extract "Don't" items
    const dontSection = content.match(/### Don't\n([\s\S]*?)(?=###|$)/);
    if (dontSection) {
      const items = dontSection[1].match(/^-\s+(.+)$/gm);
      if (items) {
        instructions.dont = items.map(item => item.replace(/^-\s+/, '').trim());
      }
    }

    return instructions;
  }

  /**
   * Parse important files
   */
  private parseImportantFiles(content: string): ImportantFile[] {
    const files: ImportantFile[] = [];

    const items = content.match(/^-\s+`([^`]+)`\s+-\s+(.+)$/gm);
    if (!items) return files;

    for (const item of items) {
      const match = item.match(/^-\s+`([^`]+)`\s+-\s+(.+)$/);
      if (match) {
        files.push({
          path: match[1].trim(),
          description: match[2].trim(),
        });
      }
    }

    return files;
  }

  /**
   * Parse environment variables
   */
  private parseEnvironmentVars(content: string): string[] {
    const vars: string[] = [];

    // Match environment variable declarations
    const codeBlock = content.match(/```(?:bash|sh|env)?\n([\s\S]*?)```/);
    if (codeBlock) {
      const lines = codeBlock[1].split('\n');
      for (const line of lines) {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
        if (match) {
          vars.push(match[1]);
        }
      }
    }

    return vars;
  }

  /**
   * Validate AGENTS.md content
   */
  validate(content: string): AgentsMdValidation {
    const lines = content.split('\n');
    const sections = this.extractSections(lines);
    const sectionsFound = Object.keys(sections);

    const errors: AgentsMdValidation['errors'] = [];
    const warnings: AgentsMdValidation['warnings'] = [];

    // Check required sections
    for (const required of REQUIRED) {
      if (!sectionsFound.includes(required)) {
        errors.push({
          section: required,
          message: `Required section "${required}" is missing`,
        });
      }
    }

    // Check recommended sections
    const recommended = [
      SECTIONS.COMMANDS,
      SECTIONS.CONVENTIONS,
      SECTIONS.INSTRUCTIONS,
    ];
    const missingSections: string[] = [];

    for (const rec of recommended) {
      if (!sectionsFound.includes(rec)) {
        missingSections.push(rec);
        warnings.push({
          section: rec,
          message: `Recommended section "${rec}" is missing`,
          suggestion: `Add a ${rec} section to improve agent understanding`,
        });
      }
    }

    // Check for empty sections
    for (const [section, sectionContent] of Object.entries(sections)) {
      if (sectionContent.trim().length === 0) {
        warnings.push({
          section,
          message: `Section "${section}" is empty`,
          suggestion: 'Add content or remove the section',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sectionsFound,
      missingSections,
    };
  }

  /**
   * Convert config to system prompt addition
   */
  toSystemPrompt(config: AgentsMdConfig): string {
    const parts: string[] = [
      '## Project Context (from AGENTS.md)',
      '',
    ];

    // Project overview
    if (config.overview) {
      parts.push('### Project Overview');
      parts.push(config.overview);
      parts.push('');
    }

    // Tech stack
    if (config.techStack.language !== 'Unknown') {
      parts.push('### Tech Stack');
      parts.push(`- Language: ${config.techStack.language}`);
      if (config.techStack.framework) {
        parts.push(`- Framework: ${config.techStack.framework}`);
      }
      if (config.techStack.buildTool) {
        parts.push(`- Build Tool: ${config.techStack.buildTool}`);
      }
      if (config.techStack.packageManager) {
        parts.push(`- Package Manager: ${config.techStack.packageManager}`);
      }
      parts.push('');
    }

    // Available commands
    if (config.commands.length > 0) {
      parts.push('### Available Commands');
      for (const cmd of config.commands) {
        parts.push(`- \`${cmd.command}\`: ${cmd.description}`);
      }
      parts.push('');
    }

    // Coding conventions
    if (config.conventions.styleGuide.length > 0 || config.conventions.patterns.length > 0) {
      parts.push('### Coding Conventions');
      for (const style of config.conventions.styleGuide) {
        parts.push(`- ${style}`);
      }
      for (const pattern of config.conventions.patterns) {
        parts.push(`- ${pattern}`);
      }
      parts.push('');
    }

    // Agent instructions
    if (config.instructions.do.length > 0 || config.instructions.dont.length > 0) {
      parts.push('### Instructions');
      if (config.instructions.do.length > 0) {
        parts.push('**Do:**');
        for (const item of config.instructions.do) {
          parts.push(`- ${item}`);
        }
      }
      if (config.instructions.dont.length > 0) {
        parts.push('**Don\'t:**');
        for (const item of config.instructions.dont) {
          parts.push(`- ${item}`);
        }
      }
      parts.push('');
    }

    // Important files
    if (config.importantFiles.length > 0) {
      parts.push('### Important Files');
      for (const file of config.importantFiles) {
        parts.push(`- \`${file.path}\`: ${file.description}`);
      }
      parts.push('');
    }

    // Additional context
    if (config.additionalContext) {
      parts.push('### Additional Context');
      parts.push(config.additionalContext);
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Update a specific section in AGENTS.md
   */
  async updateSection(
    workingDir: string,
    section: string,
    newContent: string
  ): Promise<void> {
    const filePath = join(workingDir, 'AGENTS.md');

    if (!existsSync(filePath)) {
      throw new Error('AGENTS.md does not exist');
    }

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const result: string[] = [];

    let inSection = false;
    let sectionFound = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('## ')) {
        if (inSection) {
          // End of target section, add new content
          result.push(newContent);
          result.push('');
          inSection = false;
        }

        if (line === section) {
          sectionFound = true;
          inSection = true;
          result.push(line);
          continue;
        }
      }

      if (!inSection) {
        result.push(line);
      }
    }

    // Handle section at end of file
    if (inSection) {
      result.push(newContent);
    }

    // Add section if not found
    if (!sectionFound) {
      result.push('');
      result.push(section);
      result.push(newContent);
    }

    writeFileSync(filePath, result.join('\n'), 'utf-8');
  }

  /**
   * Generate AGENTS.md content from project scan
   */
  async generate(workingDir: string): Promise<string> {
    // Dynamic import to avoid circular dependency
    const { createProjectScanner } = await import('./project-scanner.js');
    const { generateAgentsMd } = await import('./templates.js');

    const scanner = createProjectScanner(workingDir);
    const projectInfo = await scanner.scan();
    return generateAgentsMd(projectInfo);
  }

  /**
   * Check if AGENTS.md exists in working directory
   */
  exists(workingDir: string): boolean {
    return existsSync(join(workingDir, 'AGENTS.md'));
  }

  /**
   * Get AGENTS.md file path
   */
  getFilePath(workingDir: string): string {
    return join(workingDir, 'AGENTS.md');
  }
}

/**
 * Create a new AgentsMdService instance
 */
export function createAgentsMdService(): AgentsMdService {
  return new AgentsMdService();
}
