import {
  Layers,
  Plug,
  FileText,
  Search,
  Globe,
  Terminal,
  Database,
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore, type MCPServerConfig } from '../../stores/settings-store';
import { CollapsibleSection } from './CollapsibleSection';

/**
 * ContextSection - Displays MCP connectors and skills from settings-store
 *
 * This component uses the deepagents MCP system:
 * - Data source: useSettingsStore((state) => state.mcpServers)
 * - Shows enabled MCP servers as connectors
 * - Derives skills from server capabilities
 * - Real connection status display
 */
export function ContextSection() {
  const mcpServers = useSettingsStore((state) => state.mcpServers);
  const enabledServers = mcpServers.filter((s) => s.enabled);

  // Derive skills from enabled MCP servers
  const skills = deriveSkillsFromServers(enabledServers);

  return (
    <CollapsibleSection id="context" title="Context" icon={Layers}>
      <div className="space-y-4">
        {/* Connectors Subsection */}
        <div>
          <h4 className="text-xs font-medium text-white/40 mb-2">Connectors</h4>
          {enabledServers.length === 0 ? (
            <p className="text-xs text-white/25 py-2">No connectors enabled</p>
          ) : (
            <div className="space-y-1">
              {enabledServers.map((server) => (
                <ConnectorItem key={server.id} server={server} />
              ))}
            </div>
          )}
        </div>

        {/* Skills Subsection */}
        <div>
          <h4 className="text-xs font-medium text-white/40 mb-2">Skills</h4>
          {skills.length === 0 ? (
            <p className="text-xs text-white/25 py-2">No skills available</p>
          ) : (
            <div className="space-y-1">
              {skills.map((skill) => (
                <SkillItem key={skill.id} skill={skill} />
              ))}
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}

interface ConnectorItemProps {
  server: MCPServerConfig;
}

function ConnectorItem({ server }: ConnectorItemProps) {
  const statusConfig = getStatusConfig(server.status);

  return (
    <div className="flex items-center gap-2 py-1.5 px-1">
      <Plug
        className={cn(
          'w-3.5 h-3.5 flex-shrink-0',
          server.status === 'connected' ? 'text-[#50956A]' : 'text-white/40'
        )}
      />
      <span className="text-sm text-white/50 flex-1 truncate">
        {server.name}
      </span>
      <span title={statusConfig.label}>
        <statusConfig.icon
          className={cn('w-3 h-3 flex-shrink-0', statusConfig.color)}
        />
      </span>
    </div>
  );
}

interface Skill {
  id: string;
  name: string;
  icon: typeof FileText;
  description?: string;
}

interface SkillItemProps {
  skill: Skill;
}

function SkillItem({ skill }: SkillItemProps) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-1">
      <skill.icon className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
      <span className="text-sm text-white/50">{skill.name}</span>
    </div>
  );
}

function getStatusConfig(status: MCPServerConfig['status'] | undefined) {
  switch (status) {
    case 'connected':
      return {
        icon: CheckCircle2,
        color: 'text-[#50956A]',
        label: 'Connected',
      };
    case 'error':
      return {
        icon: XCircle,
        color: 'text-[#FF5449]',
        label: 'Error',
      };
    case 'disconnected':
    default:
      return {
        icon: AlertCircle,
        color: 'text-white/40',
        label: 'Disconnected',
      };
  }
}

/**
 * Derive skills from enabled MCP servers based on their capabilities
 */
function deriveSkillsFromServers(servers: MCPServerConfig[]): Skill[] {
  const skills: Skill[] = [];
  const addedSkills = new Set<string>();

  servers.forEach((server) => {
    const serverName = server.name.toLowerCase();
    const command = server.command.toLowerCase();

    // Detect skills based on server name/command patterns
    if (serverName.includes('filesystem') || command.includes('filesystem')) {
      if (!addedSkills.has('file_operations')) {
        skills.push({
          id: 'file_operations',
          name: 'File operations',
          icon: FileText,
        });
        addedSkills.add('file_operations');
      }
    }

    if (serverName.includes('search') || command.includes('search') || serverName.includes('brave')) {
      if (!addedSkills.has('web_search')) {
        skills.push({
          id: 'web_search',
          name: 'Web search',
          icon: Search,
        });
        addedSkills.add('web_search');
      }
    }

    if (serverName.includes('browser') || command.includes('playwright') || command.includes('puppeteer')) {
      if (!addedSkills.has('web_browse')) {
        skills.push({
          id: 'web_browse',
          name: 'Web browsing',
          icon: Globe,
        });
        addedSkills.add('web_browse');
      }
    }

    if (serverName.includes('shell') || command.includes('shell') || serverName.includes('terminal')) {
      if (!addedSkills.has('shell_commands')) {
        skills.push({
          id: 'shell_commands',
          name: 'Shell commands',
          icon: Terminal,
        });
        addedSkills.add('shell_commands');
      }
    }

    if (serverName.includes('database') || serverName.includes('sql') || command.includes('postgres') || command.includes('mysql')) {
      if (!addedSkills.has('database')) {
        skills.push({
          id: 'database',
          name: 'Database queries',
          icon: Database,
        });
        addedSkills.add('database');
      }
    }

    // Generic capability for any server
    if (!addedSkills.has(server.id)) {
      // Only add if we haven't matched any specific patterns
      if (skills.filter((s) => !['file_operations', 'web_search', 'web_browse', 'shell_commands', 'database'].includes(s.id)).length === 0) {
        skills.push({
          id: server.id,
          name: server.name,
          icon: Zap,
        });
        addedSkills.add(server.id);
      }
    }
  });

  // Always show some default skills if we have any connectors
  if (servers.length > 0 && skills.length === 0) {
    skills.push({
      id: 'custom_tools',
      name: 'Custom tools',
      icon: Zap,
    });
  }

  return skills;
}
