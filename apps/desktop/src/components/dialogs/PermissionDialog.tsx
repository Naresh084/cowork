import { useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  FileEdit,
  FolderOpen,
  Globe,
  Wrench,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from '../ui/Dialog';
import { useChatStore, type ExtendedPermissionRequest } from '../../stores/chat-store';

interface PermissionDialogProps {
  request: ExtendedPermissionRequest;
  onClose?: () => void;
}

const PERMISSION_TYPE_CONFIG = {
  file: {
    icon: FileEdit,
    label: 'File Access',
    description: 'Read or modify files',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  shell: {
    icon: Terminal,
    label: 'Shell Command',
    description: 'Execute a terminal command',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  network: {
    icon: Globe,
    label: 'Network Access',
    description: 'Make network requests',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
  mcp: {
    icon: Wrench,
    label: 'MCP Tool',
    description: 'Use an external tool',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  directory: {
    icon: FolderOpen,
    label: 'Directory Access',
    description: 'Access a directory',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
  },
} as const;

const RISK_LEVEL_CONFIG = {
  low: {
    icon: ShieldCheck,
    label: 'Low Risk',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    description: 'This action is generally safe',
  },
  medium: {
    icon: Shield,
    label: 'Medium Risk',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    description: 'Review before allowing',
  },
  high: {
    icon: ShieldAlert,
    label: 'High Risk',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    description: 'This action could be destructive',
  },
};

export function PermissionDialog({ request, onClose }: PermissionDialogProps) {
  const { respondToPermission, removePermissionRequest } = useChatStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);

  const permissionType = getPermissionType(request);
  const typeConfig = PERMISSION_TYPE_CONFIG[permissionType];
  const riskConfig = RISK_LEVEL_CONFIG[request.riskLevel || 'medium'];

  const handleAllow = async () => {
    setIsProcessing(true);
    try {
      await respondToPermission(
        request.sessionId,
        request.id,
        rememberChoice ? 'always_allow' : 'allow'
      );
      removePermissionRequest(request.id);
      onClose?.();
    } catch (error) {
      console.error('Failed to respond to permission:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeny = async () => {
    setIsProcessing(true);
    try {
      await respondToPermission(request.sessionId, request.id, 'deny');
      removePermissionRequest(request.id);
      onClose?.();
    } catch (error) {
      console.error('Failed to respond to permission:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog
      open={true}
      onClose={handleDeny}
      className="max-w-md"
    >
      <DialogHeader>
        <DialogTitle>Permission Request</DialogTitle>
      </DialogHeader>

      <DialogContent className="space-y-4">
        {/* Permission Type Header */}
        <div
          className={cn(
            'flex items-center gap-3 p-3 rounded-xl border',
            typeConfig.bgColor,
            typeConfig.borderColor
          )}
        >
          <div className={cn('p-2 rounded-lg', typeConfig.bgColor)}>
            <typeConfig.icon className={cn('w-6 h-6', typeConfig.color)} />
          </div>
          <div>
            <h3 className="font-semibold text-white">{typeConfig.label}</h3>
            <p className="text-sm text-gray-400">{typeConfig.description}</p>
          </div>
        </div>

        {/* Tool/Resource Details */}
        <div className="p-3 rounded-xl bg-gray-800/50 border border-gray-700/50">
          {request.toolName && (
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Tool
              </span>
              <p className="text-sm text-white font-mono mt-0.5">{request.toolName}</p>
            </div>
          )}

          {request.resource && (
            <div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Resource
              </span>
              <pre className="text-sm text-white font-mono mt-0.5 whitespace-pre-wrap break-all bg-gray-900/50 p-2 rounded-lg">
                {request.resource}
              </pre>
            </div>
          )}

          {request.reason && (
            <div className="mt-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Reason
              </span>
              <p className="text-sm text-white mt-0.5">{request.reason}</p>
            </div>
          )}
        </div>

        {/* Risk Level */}
        <div
          className={cn(
            'flex items-center gap-2 p-2.5 rounded-lg border',
            riskConfig.bgColor,
            request.riskLevel === 'high'
              ? 'border-red-500/30'
              : request.riskLevel === 'low'
                ? 'border-green-500/30'
                : 'border-amber-500/30'
          )}
        >
          <riskConfig.icon className={cn('w-5 h-5', riskConfig.color)} />
          <div>
            <span className={cn('text-sm font-medium', riskConfig.color)}>
              {riskConfig.label}
            </span>
            <span className="text-sm text-gray-400 ml-2">
              {riskConfig.description}
            </span>
          </div>
        </div>

        {/* Remember Choice Checkbox */}
        <label className="flex items-center gap-2 cursor-pointer group">
          <div
            className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
              rememberChoice
                ? 'bg-blue-600 border-blue-600'
                : 'border-gray-600 group-hover:border-gray-500'
            )}
            onClick={() => setRememberChoice(!rememberChoice)}
          >
            {rememberChoice && <CheckCircle2 className="w-4 h-4 text-white" />}
          </div>
          <span className="text-sm text-gray-300 select-none">
            Remember this choice for this session
          </span>
        </label>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={handleDeny}
            disabled={isProcessing}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl',
              'bg-gray-700 hover:bg-gray-600 text-white',
              'transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <XCircle className="w-4 h-4" />
            Deny
          </button>
          <button
            onClick={handleAllow}
            disabled={isProcessing}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl',
              'bg-blue-600 hover:bg-blue-700 text-white',
              'transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <CheckCircle2 className="w-4 h-4" />
            Allow
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getPermissionType(
  request: ExtendedPermissionRequest
): keyof typeof PERMISSION_TYPE_CONFIG {
  // Determine type based on request properties
  if (request.type) {
    const typeMap: Record<string, keyof typeof PERMISSION_TYPE_CONFIG> = {
      file_read: 'file',
      file_write: 'file',
      file_delete: 'file',
      shell_execute: 'shell',
      network_request: 'network',
      clipboard_read: 'file',
      clipboard_write: 'file',
    };
    return typeMap[request.type] || 'shell';
  }

  // Fallback based on toolName
  if (request.toolName) {
    if (request.toolName.includes('file') || request.toolName.includes('File')) {
      return 'file';
    }
    if (request.toolName.includes('shell') || request.toolName.includes('bash')) {
      return 'shell';
    }
    if (request.toolName.includes('http') || request.toolName.includes('fetch')) {
      return 'network';
    }
    if (request.toolName.includes('mcp_')) {
      return 'mcp';
    }
  }

  return 'shell';
}

// Container that shows all pending permission dialogs
export function PermissionDialogContainer() {
  const pendingPermissions = useChatStore((state) => state.pendingPermissions);

  // Show the first pending permission
  const currentRequest = pendingPermissions[0];

  if (!currentRequest) {
    return null;
  }

  return <PermissionDialog request={currentRequest} />;
}
