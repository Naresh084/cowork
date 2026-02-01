import { Bot } from 'lucide-react';
import { cn } from '../../lib/utils';
import { TypingIndicator } from '../icons/StatusIndicator';
import type { ToolExecution } from '../../stores/chat-store';

interface StreamingMessageProps {
  content: string;
  currentTool: ToolExecution | null;
}

export function StreamingMessage({ content, currentTool }: StreamingMessageProps) {
  return (
    <div className="flex gap-3 animate-in fade-in-0 duration-300">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
        <Bot className="w-4 h-4 text-white" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'inline-block max-w-full rounded-2xl px-4 py-3',
            'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
          )}
        >
          {/* Text content */}
          {content && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm">
                {content}
              </pre>
            </div>
          )}

          {/* Tool execution indicator */}
          {currentTool && (
            <div
              className={cn(
                'flex items-center gap-2 mt-2 px-3 py-2 rounded-lg',
                'bg-gray-200/50 dark:bg-gray-700/50',
                'text-sm text-gray-600 dark:text-gray-300'
              )}
            >
              <div className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" />
              <span>
                {currentTool.status === 'running'
                  ? `Running ${currentTool.name}...`
                  : `Executed ${currentTool.name}`}
              </span>
            </div>
          )}

          {/* Typing indicator when no content yet */}
          {!content && !currentTool && (
            <TypingIndicator className="text-gray-400" />
          )}
        </div>
      </div>
    </div>
  );
}
