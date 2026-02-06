import { useMemo } from 'react';
import { Wrench } from 'lucide-react';
import { useChatStore, type ToolExecution } from '../../stores/chat-store';
import { useSessionStore } from '../../stores/session-store';
import { CollapsibleSection } from './CollapsibleSection';
import { getToolMeta } from '../chat/tool-metadata';

// Non-default tools that should be displayed
const NON_DEFAULT_TOOLS = new Set([
  'deep_research',
  'computer_use',
  'google_grounded_search',
  'generate_image',
  'edit_image',
  'generate_video',
  'analyze_video',
]);

function isNonDefaultTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  if (NON_DEFAULT_TOOLS.has(lower)) return true;
  if (lower.includes('stitch')) return true;
  if (lower.startsWith('mcp_')) return true;
  return false;
}

function formatToolName(toolName: string): string {
  // Handle MCP tools: mcp_serverId_toolName -> "ServerId: Tool Name"
  if (toolName.toLowerCase().startsWith('mcp_')) {
    const parts = toolName.slice(4).split('_');
    if (parts.length >= 2) {
      const serverId = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      const toolPart = parts.slice(1)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return `${serverId}: ${toolPart}`;
    }
  }
  // Use getToolMeta for standard tools
  return getToolMeta(toolName).title;
}

function ToolItem({ tool }: { tool: ToolExecution }) {
  const { icon: Icon, category } = getToolMeta(tool.name, tool.args);
  const displayName = formatToolName(tool.name);

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-white/50" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white/80 block truncate">{displayName}</span>
        <span className="text-xs text-white/40">{category}</span>
      </div>
    </div>
  );
}

export function ToolsUsedSection() {
  const { activeSessionId } = useSessionStore();
  const chatItems = useChatStore(
    (state) => state.getSessionState(activeSessionId).chatItems
  );

  // V2: Derive tool list from chatItems tool_start items
  const nonDefaultTools = useMemo(() => {
    const seen = new Set<string>();
    const toolItems = chatItems.filter(
      (ci): ci is import('@gemini-cowork/shared').ToolStartItem => ci.kind === 'tool_start'
    );
    const asToolExecutions: ToolExecution[] = toolItems
      .filter(item => isNonDefaultTool(item.name))
      .filter(item => {
        const key = item.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(item => ({
        id: item.toolId,
        name: item.name,
        args: item.args as Record<string, unknown>,
        status: item.status === 'running' ? 'running' as const : item.status === 'error' ? 'error' as const : 'success' as const,
        startedAt: item.timestamp,
        parentToolId: item.parentToolId,
      }));
    return asToolExecutions.sort((a, b) => a.startedAt - b.startedAt);
  }, [chatItems]);

  const badge = nonDefaultTools.length > 0 ? nonDefaultTools.length : undefined;

  return (
    <CollapsibleSection id="toolsUsed" title="Tools & Skills" icon={Wrench} badge={badge}>
      {nonDefaultTools.length === 0 ? (
        <div className="text-sm text-white/30 py-2">No specialized tools used yet</div>
      ) : (
        <div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 space-y-0.5">
          {nonDefaultTools.map((tool) => (
            <ToolItem key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
