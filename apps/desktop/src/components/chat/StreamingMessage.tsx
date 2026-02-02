import { Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ToolExecution } from '../../stores/chat-store';
import { motion } from 'framer-motion';

interface StreamingMessageProps {
  content: string;
  currentTool: ToolExecution | null;
}

export function StreamingMessage({ content, currentTool }: StreamingMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex gap-3"
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-[#6B6EF0] to-[#8A62C2] flex items-center justify-center">
        <Sparkles className="w-4 h-4 text-white" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'inline-block max-w-full rounded-2xl px-4 py-3',
            'bg-[#1A1A1E] border border-white/[0.08]'
          )}
        >
          {/* Text content */}
          {content && (
            <div className="prose prose-sm prose-invert max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm text-white/80">
                {content}
              </pre>
            </div>
          )}

          {/* Tool execution indicator */}
          {currentTool && (
            <div
              className={cn(
                'flex items-center gap-2 mt-2 px-3 py-2 rounded-lg',
                'bg-[#6B6EF0]/10',
                'text-sm text-white/70'
              )}
            >
              <div className="animate-spin h-4 w-4 border-2 border-[#6B6EF0] border-t-transparent rounded-full" />
              <span>
                {currentTool.status === 'running'
                  ? `Running ${currentTool.name}...`
                  : `Executed ${currentTool.name}`}
              </span>
            </div>
          )}

          {/* Typing indicator when no content yet */}
          {!content && !currentTool && (
            <div className="flex items-center gap-1">
              <motion.span
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                className="w-2 h-2 rounded-full bg-[#6B6EF0]"
              />
              <motion.span
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
                className="w-2 h-2 rounded-full bg-[#8A62C2]"
              />
              <motion.span
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
                className="w-2 h-2 rounded-full bg-[#008585]"
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
