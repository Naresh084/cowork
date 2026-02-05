/**
 * /init Command Handler
 *
 * Generates an AGENTS.md file with smart project detection
 */

import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
// Import from sidecar (commands are at project root, sidecar is at apps/desktop/src-sidecar/src/)
import type { CommandHandler, CommandResult } from '../../apps/desktop/src-sidecar/src/commands/types.js';
import { createProjectScanner } from '../../apps/desktop/src-sidecar/src/agents-md/project-scanner.js';
import { generateAgentsMd } from '../../apps/desktop/src-sidecar/src/agents-md/templates.js';

export const handler: CommandHandler = async (ctx): Promise<CommandResult> => {
  const { workingDirectory, args } = ctx;
  const force = args.force === true;

  // Check if AGENTS.md already exists
  const agentsMdPath = join(workingDirectory, 'AGENTS.md');
  if (existsSync(agentsMdPath) && !force) {
    return {
      success: false,
      message: 'AGENTS.md already exists. Use `/init --force` to overwrite.',
      error: {
        code: 'FILE_EXISTS',
        message: 'AGENTS.md already exists in this directory',
        suggestion: 'Use --force flag to overwrite the existing file',
      },
    };
  }

  ctx.log('Scanning project structure...');

  try {
    // Scan the project
    const scanner = createProjectScanner(workingDirectory);
    const projectInfo = await scanner.scan();

    ctx.log(`Detected: ${projectInfo.techStack.language} project (${projectInfo.techStack.framework || 'no framework'})`);

    // Generate AGENTS.md content
    const content = generateAgentsMd(projectInfo);

    // Write the file
    writeFileSync(agentsMdPath, content, 'utf-8');

    const patternsFound = projectInfo.detectedPatterns.length;
    const commandsFound = projectInfo.commands.length;
    const filesFound = projectInfo.importantFiles.length;

    return {
      success: true,
      message: `Created AGENTS.md successfully!\n\nDetected:\n- Language: ${projectInfo.techStack.language}\n- Framework: ${projectInfo.techStack.framework || 'none'}\n- ${patternsFound} architecture patterns\n- ${commandsFound} commands\n- ${filesFound} important files`,
      data: {
        path: agentsMdPath,
        projectInfo: {
          name: projectInfo.name,
          techStack: projectInfo.techStack,
          patterns: projectInfo.detectedPatterns,
          commands: projectInfo.commands.length,
          importantFiles: projectInfo.importantFiles.length,
        },
      },
      artifacts: [
        {
          type: 'file',
          path: agentsMdPath,
          description: 'Project context file for AI agent',
        },
      ],
      actions: [
        {
          type: 'open_file',
          payload: agentsMdPath,
        },
      ],
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'SCAN_FAILED',
        message: `Failed to scan project: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
};

export default handler;
