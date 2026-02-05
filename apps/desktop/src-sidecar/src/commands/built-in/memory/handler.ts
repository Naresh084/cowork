/**
 * /memory Command Handler
 *
 * Manages long-term memories in .cowork/memories/
 */

import type { CommandHandler, CommandResult } from '../../types.js';

export const handler: CommandHandler = async (ctx): Promise<CommandResult> => {
  const { args, memoryService } = ctx;
  const positional = (args._positional as string[]) || [];
  const action = (positional[0] || args.action) as string;
  const query = (positional.slice(1).join(' ') || args.query) as string;
  const group = args.group as string | undefined;

  // Ensure memory service is initialized
  if (!memoryService.isInitialized()) {
    await memoryService.initialize();
  }

  switch (action) {
    case 'list':
    case 'ls':
      return await listMemories(memoryService, group);

    case 'add':
    case 'create':
      return await addMemory(ctx, query, group);

    case 'remove':
    case 'delete':
    case 'rm':
      return await removeMemory(memoryService, query);

    case 'search':
    case 'find':
      return await searchMemories(memoryService, query, group);

    case 'groups':
      return await listGroups(memoryService);

    case 'show':
    case 'get':
      return await showMemory(memoryService, query);

    default:
      // If no action, show help
      if (!action) {
        return {
          success: true,
          message: `
**Memory Commands**

- \`/memory list\` - List all memories
- \`/memory list --group preferences\` - List memories in a group
- \`/memory add <title>\` - Add a new memory (interactive)
- \`/memory search <query>\` - Search memories
- \`/memory remove <id>\` - Remove a memory
- \`/memory groups\` - List all groups
- \`/memory show <id>\` - Show memory details

**Memory Groups:**
- preferences - Your coding style and tool preferences
- learnings - Patterns and insights learned
- context - Project architecture and decisions
- instructions - Custom agent guidelines
`.trim(),
        };
      }

      return {
        success: false,
        error: {
          code: 'UNKNOWN_ACTION',
          message: `Unknown action: ${action}`,
          suggestion: 'Use /memory list, add, remove, search, or groups',
        },
      };
  }
};

async function listMemories(
  memoryService: any,
  group?: string
): Promise<CommandResult> {
  const memories = group
    ? await memoryService.getMemoriesByGroup(group)
    : await memoryService.getAll();

  if (memories.length === 0) {
    return {
      success: true,
      message: group
        ? `No memories in group "${group}".`
        : 'No memories stored yet. Use `/memory add` to create one.',
    };
  }

  // Group memories by group
  const byGroup: Record<string, typeof memories> = {};
  for (const memory of memories) {
    if (!byGroup[memory.group]) {
      byGroup[memory.group] = [];
    }
    byGroup[memory.group].push(memory);
  }

  let output = `**${memories.length} memories found:**\n\n`;

  for (const [groupName, groupMemories] of Object.entries(byGroup)) {
    output += `### ${groupName}/\n`;
    for (const m of groupMemories) {
      const source = m.source === 'auto' ? '(auto)' : '';
      output += `- **${m.title}** ${source}\n`;
      output += `  ID: \`${m.id.slice(0, 8)}\` | Tags: ${m.tags.join(', ') || 'none'}\n`;
    }
    output += '\n';
  }

  return {
    success: true,
    message: output.trim(),
    data: {
      count: memories.length,
      memories: memories.map((m: { id: string; title: string; group: string }) => ({
        id: m.id,
        title: m.title,
        group: m.group,
      })),
    },
  };
}

async function addMemory(
  ctx: any,
  title: string,
  group?: string
): Promise<CommandResult> {
  if (!title) {
    return {
      success: false,
      error: {
        code: 'MISSING_TITLE',
        message: 'Memory title is required',
        suggestion: 'Usage: /memory add "Your memory title"',
      },
    };
  }

  // For now, create with placeholder content
  // In full implementation, this would open an editor
  const memory = await ctx.memoryService.create({
    title,
    content: `[Add content for: ${title}]`,
    group: group || 'context',
    tags: [],
    source: 'manual' as const,
  });

  return {
    success: true,
    message: `Memory created: **${memory.title}**\n\nID: \`${memory.id.slice(0, 8)}\`\nGroup: ${memory.group}\n\nEdit the memory file at:\n\`.cowork/memories/${memory.group}/${memory.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md\``,
    data: {
      id: memory.id,
      title: memory.title,
      group: memory.group,
    },
    artifacts: [
      {
        type: 'memory',
        path: memory.id,
        description: `Memory: ${memory.title}`,
      },
    ],
  };
}

async function removeMemory(
  memoryService: any,
  idOrTitle: string
): Promise<CommandResult> {
  if (!idOrTitle) {
    return {
      success: false,
      error: {
        code: 'MISSING_ID',
        message: 'Memory ID or title is required',
        suggestion: 'Usage: /memory remove <id>',
      },
    };
  }

  // Try to find by ID first (partial match)
  const allMemories = await memoryService.getAll();
  const memory = allMemories.find(
    (m: any) =>
      m.id.startsWith(idOrTitle) ||
      m.id === idOrTitle ||
      m.title.toLowerCase() === idOrTitle.toLowerCase()
  );

  if (!memory) {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Memory not found: ${idOrTitle}`,
        suggestion: 'Use /memory list to see all memories',
      },
    };
  }

  const deleted = await memoryService.delete(memory.id);
  if (!deleted) {
    return {
      success: false,
      error: {
        code: 'DELETE_FAILED',
        message: `Failed to delete memory: ${memory.title}`,
      },
    };
  }

  return {
    success: true,
    message: `Memory deleted: **${memory.title}**`,
    data: {
      id: memory.id,
      title: memory.title,
    },
  };
}

async function searchMemories(
  memoryService: any,
  query: string,
  group?: string
): Promise<CommandResult> {
  if (!query) {
    return {
      success: false,
      error: {
        code: 'MISSING_QUERY',
        message: 'Search query is required',
        suggestion: 'Usage: /memory search <query>',
      },
    };
  }

  const memories = await memoryService.search({
    query,
    groups: group ? [group] : undefined,
    limit: 10,
  });

  if (memories.length === 0) {
    return {
      success: true,
      message: `No memories found for "${query}".`,
    };
  }

  let output = `**${memories.length} memories found for "${query}":**\n\n`;
  for (const m of memories) {
    output += `- **${m.title}** (${m.group})\n`;
    output += `  ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}\n\n`;
  }

  return {
    success: true,
    message: output.trim(),
    data: {
      query,
      count: memories.length,
      memories: memories.map((m: any) => ({
        id: m.id,
        title: m.title,
        group: m.group,
      })),
    },
  };
}

async function listGroups(memoryService: any): Promise<CommandResult> {
  const groups = await memoryService.listGroups();

  let output = '**Memory Groups:**\n\n';
  for (const group of groups) {
    const memories = await memoryService.getMemoriesByGroup(group);
    output += `- **${group}/** (${memories.length} memories)\n`;
  }

  return {
    success: true,
    message: output.trim(),
    data: {
      groups,
    },
  };
}

async function showMemory(
  memoryService: any,
  idOrTitle: string
): Promise<CommandResult> {
  if (!idOrTitle) {
    return {
      success: false,
      error: {
        code: 'MISSING_ID',
        message: 'Memory ID or title is required',
        suggestion: 'Usage: /memory show <id>',
      },
    };
  }

  // Find memory
  const allMemories = await memoryService.getAll();
  const memory = allMemories.find(
    (m: any) =>
      m.id.startsWith(idOrTitle) ||
      m.id === idOrTitle ||
      m.title.toLowerCase() === idOrTitle.toLowerCase()
  );

  if (!memory) {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Memory not found: ${idOrTitle}`,
      },
    };
  }

  return {
    success: true,
    message: `
**${memory.title}**

- Group: ${memory.group}
- Tags: ${memory.tags.join(', ') || 'none'}
- Source: ${memory.source}
- Confidence: ${(memory.confidence * 100).toFixed(0)}%
- Access Count: ${memory.accessCount}
- Created: ${new Date(memory.createdAt).toLocaleDateString()}

---

${memory.content}
`.trim(),
    data: memory,
  };
}

export default handler;
