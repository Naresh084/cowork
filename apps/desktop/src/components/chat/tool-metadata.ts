import {
  Terminal,
  FileEdit,
  FileSearch,
  FolderOpen,
  Globe,
  Image,
  FileVideo,
  Search,
  Palette,
  Wrench,
  ListTodo,
  Zap,
  Sparkles,
  Calendar,
} from 'lucide-react';

const TOOL_ICONS: Record<string, typeof Terminal> = {
  bash: Terminal,
  shell: Terminal,
  execute_command: Terminal,
  execute: Terminal,
  read_file: FileSearch,
  write_file: FileEdit,
  edit_file: FileEdit,
  list_directory: FolderOpen,
  ls: FolderOpen,
  search_files: FileSearch,
  glob: FileSearch,
  grep: FileSearch,
  fetch: Globe,
  http: Globe,
  generate_image: Image,
  edit_image: Image,
  generate_video: FileVideo,
  analyze_video: FileVideo,
  deep_research: Search,
  web_search: Globe,
  web_fetch: Globe,
  google_grounded_search: Globe,
  computer_use: Globe,
  stitch: Palette,
  schedule_task: Calendar,
  manage_scheduled_task: Calendar,
  start_codex_cli_run: Terminal,
  start_claude_cli_run: Sparkles,
  external_cli_get_progress: Zap,
  external_cli_respond: Sparkles,
  external_cli_cancel_run: Wrench,
  create_workflow: Zap,
  update_workflow: Zap,
  publish_workflow: Zap,
  run_workflow: Zap,
  manage_workflow: Zap,
  get_workflow_runs: Zap,
  create_workflow_from_chat: Zap,
  write_todos: ListTodo,
  task: Zap,
  spawn_task: Zap,
  subagent: Zap,
  default: Wrench,
};

const TOOL_NAMES: Record<string, string> = {
  bash: 'Shell Command',
  shell: 'Shell Command',
  execute_command: 'Execute Command',
  execute: 'Execute Command',
  read_file: 'Read File',
  write_file: 'Write File',
  edit_file: 'Edit File',
  list_directory: 'List Directory',
  ls: 'List Directory',
  search_files: 'Search Files',
  glob: 'Find Files',
  grep: 'Search Content',
  fetch: 'HTTP Request',
  http: 'HTTP Request',
  generate_image: 'Generate Image',
  edit_image: 'Edit Image',
  generate_video: 'Generate Video',
  analyze_video: 'Analyze Video',
  deep_research: 'Deep Research',
  web_search: 'Web Search',
  web_fetch: 'Web Fetch',
  google_grounded_search: 'Web Search',
  computer_use: 'Browser Control',
  stitch: 'Stitch Design',
  schedule_task: 'Schedule Task',
  manage_scheduled_task: 'Manage Schedule',
  start_codex_cli_run: 'Launch Codex CLI',
  start_claude_cli_run: 'Launch Claude CLI',
  external_cli_get_progress: 'Monitor CLI Progress',
  external_cli_respond: 'Respond to CLI Prompt',
  external_cli_cancel_run: 'Cancel CLI Run',
  create_workflow: 'Create Workflow',
  update_workflow: 'Update Workflow',
  publish_workflow: 'Publish Workflow',
  run_workflow: 'Run Workflow',
  manage_workflow: 'Manage Workflow',
  get_workflow_runs: 'Workflow Runs',
  create_workflow_from_chat: 'Build Workflow',
  write_todos: 'Task Progress',
  task: 'Task',
  spawn_task: 'Task',
  subagent: 'Task',
};

const TOOL_CATEGORIES: Record<string, string> = {
  bash: 'Command',
  shell: 'Command',
  execute_command: 'Command',
  execute: 'Command',
  read_file: 'File System',
  write_file: 'File System',
  edit_file: 'File System',
  list_directory: 'File System',
  ls: 'File System',
  search_files: 'File System',
  glob: 'File System',
  grep: 'File System',
  fetch: 'Network',
  http: 'Network',
  generate_image: 'Image',
  edit_image: 'Image',
  generate_video: 'Video',
  analyze_video: 'Video',
  deep_research: 'Research',
  web_search: 'Search',
  web_fetch: 'Network',
  google_grounded_search: 'Search',
  computer_use: 'Browser',
  stitch: 'Design',
  schedule_task: 'Automation',
  manage_scheduled_task: 'Automation',
  start_codex_cli_run: 'External CLI',
  start_claude_cli_run: 'External CLI',
  external_cli_get_progress: 'External CLI',
  external_cli_respond: 'External CLI',
  external_cli_cancel_run: 'External CLI',
  create_workflow: 'Workflow',
  update_workflow: 'Workflow',
  publish_workflow: 'Workflow',
  run_workflow: 'Workflow',
  manage_workflow: 'Workflow',
  get_workflow_runs: 'Workflow',
  create_workflow_from_chat: 'Workflow',
  write_todos: 'Progress',
  task: 'Agent',
  spawn_task: 'Agent',
  subagent: 'Agent',
};

function resolveToolPath(args?: Record<string, unknown>): string | null {
  if (!args) return null;

  const rawPath = (args.path || args.file_path || args.filePath || args.file) as string | undefined;
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null;

  // Normalize separators so both Unix and Windows paths are supported.
  return rawPath.replace(/\\/g, '/');
}

/**
 * Extract skill name from a tool path if it points to a SKILL.md file.
 */
export function extractSkillNameFromArgs(args?: Record<string, unknown>): string | null {
  const path = resolveToolPath(args);
  if (!path) return null;

  // Preferred pattern for managed/bundled skills.
  const managedMatch = path.match(/\/skills\/([^/]+)\/SKILL\.md$/i);
  if (managedMatch) return managedMatch[1];

  // Fallback for custom skill directories.
  const genericMatch = path.match(/\/([^/]+)\/SKILL\.md$/i);
  if (genericMatch) return genericMatch[1];

  return null;
}

/**
 * Check if a file path is a skill file read
 */
function isSkillPath(args?: Record<string, unknown>): { isSkill: boolean; skillName: string | null } {
  const skillName = extractSkillNameFromArgs(args);
  return { isSkill: Boolean(skillName), skillName };
}

export function getToolMeta(name: string, args?: Record<string, unknown>) {
  const lower = name.toLowerCase();

  // Check if this is a skill read
  const { isSkill, skillName } = isSkillPath(args);
  if (isSkill && (lower === 'read_file' || lower.includes('read'))) {
    return {
      icon: Sparkles,
      title: skillName ? `Using ${skillName}` : 'Using Skill',
      category: 'Skill',
    };
  }

  const icon =
    TOOL_ICONS[lower] ||
    (lower.includes('stitch') ? Palette : TOOL_ICONS.default);
  const title =
    TOOL_NAMES[lower] ||
    (lower.includes('stitch') ? 'Stitch Design' : name);
  const category =
    TOOL_CATEGORIES[lower] ||
    (lower.includes('file') || lower.includes('read') || lower.includes('write')
      ? 'File System'
      : lower.includes('search')
        ? 'Search'
        : 'Tool');

  return { icon, title, category };
}

export function getPrimaryArg(toolName: string, args: Record<string, unknown>): string | null {
  const lowerName = toolName.toLowerCase();

  if (lowerName === 'start_codex_cli_run' || lowerName === 'start_claude_cli_run') {
    return (args.working_directory || args.workingDirectory) as string || null;
  }

  if (lowerName === 'external_cli_get_progress') {
    return (args.run_id || args.runId || args.provider) as string || null;
  }

  if (lowerName === 'external_cli_respond') {
    return (args.response_text || args.responseText || args.run_id || args.runId) as string || null;
  }

  if (lowerName === 'external_cli_cancel_run') {
    return (args.run_id || args.runId || args.provider) as string || null;
  }

  if (lowerName === 'schedule_task') {
    return (args.name || args.taskName) as string || null;
  }

  if (lowerName === 'manage_scheduled_task') {
    const action = (args.action || '') as string;
    const taskId = (args.taskId || args.task_id || '') as string;
    if (action && taskId) return `${action}: ${taskId}`;
    return action || taskId || null;
  }

  // Check for skill reads - show skill name instead of full path
  if (lowerName.includes('file') || lowerName.includes('read') || lowerName.includes('write')) {
    if (extractSkillNameFromArgs(args)) {
      return `Loading skill instructions...`;
    }
    return resolveToolPath(args);
  }

  if (lowerName.includes('bash') || lowerName.includes('shell') || lowerName.includes('command')) {
    return (args.command || args.cmd) as string || null;
  }

  if (lowerName.includes('directory') || lowerName.includes('list')) {
    return (args.path || args.directory || args.dir) as string || null;
  }

  if (lowerName.includes('search') || lowerName.includes('grep')) {
    return (args.pattern || args.query || args.search) as string || null;
  }

  if (lowerName.includes('glob')) {
    return (args.pattern || args.glob) as string || null;
  }

  if (lowerName.includes('http') || lowerName.includes('fetch')) {
    return (args.url || args.endpoint) as string || null;
  }

  // Media generation tools - show prompt (truncated)
  if (lowerName.includes('generate_image') || lowerName.includes('edit_image') || lowerName.includes('generate_video')) {
    const prompt = (args.prompt) as string || null;
    if (prompt && prompt.length > 60) {
      return prompt.slice(0, 57) + '...';
    }
    return prompt;
  }

  return null;
}
