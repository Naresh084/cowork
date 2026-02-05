/**
 * /help Command Handler
 *
 * Shows available commands and their usage
 */

import type { CommandHandler, CommandResult } from '../../types.js';

// Import will be resolved at runtime through the service
// This handler receives the command service through context

export const handler: CommandHandler = async (ctx): Promise<CommandResult> => {
  const { args } = ctx;
  const specificCommand = (args._positional as string[])?.[0] || args.command as string;

  // Get all commands from the registry (passed via emit/context)
  // For now, return a static help message
  // In production, this would query the command service

  if (specificCommand) {
    // Show help for specific command
    return {
      success: true,
      message: `Help for /${specificCommand}:\n\nUse "/${specificCommand}" to execute the command.\nRun "/help" to see all available commands.`,
      data: {
        command: specificCommand,
      },
    };
  }

  // Show all commands
  const helpText = `
# Available Commands

## Setup
- **/init** - Generate AGENTS.md with project context
  - \`--force\` - Overwrite existing file

## Memory
- **/memory** - Manage long-term memories
  - \`/memory list\` - List all memories
  - \`/memory add <title>\` - Add a new memory
  - \`/memory search <query>\` - Search memories
  - \`/memory remove <id>\` - Remove a memory

## Utility
- **/help** - Show this help message
  - \`/help <command>\` - Show help for specific command
- **/clear** - Clear conversation (preserves memories)

## Tips
- Type \`/\` to see command suggestions
- Commands can be aliased (e.g., \`/?\` = \`/help\`)
- Custom commands can be added in \`.cowork/commands/\`
`.trim();

  return {
    success: true,
    message: helpText,
    data: {
      categories: ['setup', 'memory', 'utility'],
      commandCount: 4,
    },
  };
};

export default handler;
