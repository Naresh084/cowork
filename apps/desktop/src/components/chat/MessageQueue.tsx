// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useState, useCallback } from 'react';
import { X, Send, Pencil, Clock, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useChatStore } from '../../stores/chat-store';

interface MessageQueueProps {
  sessionId: string;
}

const EMPTY_QUEUE: Array<{ id: string; content: string; queuedAt: number }> = [];

export function MessageQueue({ sessionId }: MessageQueueProps) {
  const queue = useChatStore((state) => {
    const session = state.sessions[sessionId];
    return session?.messageQueue ?? EMPTY_QUEUE;
  });
  const removeFromQueue = useChatStore((state) => state.removeFromQueue);
  const sendQueuedImmediately = useChatStore(
    (state) => state.sendQueuedImmediately
  );
  const editQueuedMessage = useChatStore((state) => state.editQueuedMessage);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleStartEdit = useCallback((id: string, content: string) => {
    setEditingId(id);
    setEditValue(content);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editValue.trim()) return;
    await editQueuedMessage(sessionId, editingId, editValue.trim());
    setEditingId(null);
    setEditValue('');
  }, [sessionId, editingId, editValue, editQueuedMessage]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue('');
  }, []);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  if (queue.length === 0) return null;

  return (
    <div className="px-4 pb-2">
      <div className="flex items-center gap-1.5 text-[11px] text-white/40 mb-1.5">
        <Clock className="w-3 h-3" />
        <span>
          {queue.length} message{queue.length > 1 ? 's' : ''} queued
        </span>
      </div>

      <AnimatePresence mode="popLayout">
        {queue.map((msg, i) => (
          <motion.div
            key={msg.id}
            layout
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, x: -20, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mb-1"
          >
            <div
              className={cn(
                'flex items-center gap-2 py-1.5 px-3',
                'bg-white/[0.03] rounded-lg',
                'border border-white/[0.06]',
                'group'
              )}
            >
              {/* Queue position number */}
              <span className="text-[10px] text-white/25 font-mono w-4 text-center shrink-0">
                {i + 1}
              </span>

              {/* Content or edit input */}
              {editingId === msg.id ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    autoFocus
                    className={cn(
                      'flex-1 min-w-0 bg-white/[0.04] rounded px-2 py-0.5',
                      'text-[12px] text-white/80 border border-white/[0.1]',
                      'focus:outline-none focus:border-[#1D4ED8]/50'
                    )}
                  />
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleSaveEdit}
                    className="p-0.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                    title="Save edit"
                  >
                    <Check className="w-3 h-3" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleCancelEdit}
                    className="p-0.5 text-white/30 hover:text-white/60 transition-colors"
                    title="Cancel edit"
                  >
                    <X className="w-3 h-3" />
                  </motion.button>
                </div>
              ) : (
                <>
                  <span className="text-[12px] text-white/60 truncate flex-1 min-w-0">
                    {msg.content.length > 80
                      ? `${msg.content.slice(0, 80)}...`
                      : msg.content}
                  </span>

                  {/* Action buttons - visible on hover */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleStartEdit(msg.id, msg.content)}
                      className="p-1 text-white/30 hover:text-white/70 hover:bg-white/[0.06] rounded transition-colors"
                      title="Edit message"
                    >
                      <Pencil className="w-3 h-3" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => sendQueuedImmediately(sessionId, msg.id)}
                      className="p-1 text-white/30 hover:text-[#93C5FD] hover:bg-[#1D4ED8]/10 rounded transition-colors"
                      title="Send immediately"
                    >
                      <Send className="w-3 h-3" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => removeFromQueue(sessionId, msg.id)}
                      className="p-1 text-white/30 hover:text-[#FF5449] hover:bg-[#FF5449]/10 rounded transition-colors"
                      title="Remove from queue"
                    >
                      <X className="w-3 h-3" />
                    </motion.button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
