import {
  Mail,
  MessageSquare,
  Database,
  Search,
  Github,
  FileText,
  CheckSquare,
  Bug,
  Brain,
  Globe,
  HardDrive,
  Users,
  Calendar,
  Cloud,
  Terminal,
  Plug,
  type LucideIcon,
} from 'lucide-react';

// Map connector icon names to Lucide icons
const iconMap: Record<string, LucideIcon> = {
  // Google/Microsoft email icons
  Mail: Mail,
  // Communication
  MessageSquare: MessageSquare,
  // Databases
  Database: Database,
  // Search engines
  Search: Search,
  // Developer tools
  Github: Github,
  GitBranch: Github,
  // Documentation/productivity
  FileText: FileText,
  FileCode: FileText,
  // Task management
  CheckSquare: CheckSquare,
  CheckCircle: CheckSquare,
  // Bug tracking
  Bug: Bug,
  AlertCircle: Bug,
  // AI/ML
  Brain: Brain,
  Sparkles: Brain,
  // Web/Network
  Globe: Globe,
  Network: Globe,
  // Storage
  HardDrive: HardDrive,
  Server: HardDrive,
  // Teams/Users
  Users: Users,
  // Calendar
  Calendar: Calendar,
  // Cloud services
  Cloud: Cloud,
  // Terminal/CLI
  Terminal: Terminal,
  Code: Terminal,
};

export function getConnectorIcon(iconName: string): LucideIcon {
  return iconMap[iconName] || Plug;
}
