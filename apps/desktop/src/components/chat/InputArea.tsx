import { useState, useRef, useEffect } from 'react';
import {
  ArrowRight,
  ArrowUp,
  Plus,
  Folder,
  ChevronDown,
  StopCircle,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '../../stores/settings-store';
import { useSessionStore } from '../../stores/session-store';
import { motion, AnimatePresence } from 'framer-motion';
import { type Attachment } from '../../stores/chat-store';

interface InputAreaProps {
  onSend: (message: string, attachments?: Attachment[]) => void;
  onStop: () => void;
  hasMessages: boolean;
  isStreaming: boolean;
  attachments: Attachment[];
  onAttachmentAdd: (files: FileList | null) => void;
  onAttachmentRemove: (index: number) => void;
}

export function InputArea({
  onSend,
  onStop,
  hasMessages,
  isStreaming,
  attachments,
  onAttachmentAdd,
  onAttachmentRemove,
}: InputAreaProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { selectedModel, availableModels, updateSetting } = useSettingsStore();
  const { activeSessionId, sessions } = useSessionStore();

  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [folderSelectorOpen, setFolderSelectorOpen] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workingDirectory = activeSession?.workingDirectory || '/';

  // Get display models (Gemini 3.0 only)
  const displayModels = availableModels.length > 0
    ? availableModels.filter((m) => m.id.includes('gemini-3') || m.id.includes('3.0'))
    : [
        { id: 'gemini-3.0-flash-preview', name: 'Gemini 3.0 Flash', description: 'Fast', inputTokenLimit: 1000000, outputTokenLimit: 65536 },
        { id: 'gemini-3.0-pro-preview', name: 'Gemini 3.0 Pro', description: 'Advanced', inputTokenLimit: 1000000, outputTokenLimit: 65536 },
      ];

  const currentModel = displayModels.find((m) => m.id === selectedModel) || displayModels[0];

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
    }
  }, [message]);

  const handleSend = () => {
    if ((!message.trim() && attachments.length === 0) || isStreaming) return;
    onSend(message, attachments.length > 0 ? attachments : undefined);
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAttachmentClick = () => {
    fileInputRef.current?.click();
  };

  const formatPath = (path: string): string => {
    const home = '/Users/naresh';
    if (path.startsWith(home)) {
      return '~' + path.slice(home.length);
    }
    if (path.length > 30) {
      return '...' + path.slice(-27);
    }
    return path;
  };

  return (
    <div className="p-4 bg-stone-950">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.c,.cpp,.h,.css,.html"
        className="hidden"
        onChange={(e) => onAttachmentAdd(e.target.files)}
      />

      <div className="max-w-3xl mx-auto">
        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachments.map((attachment, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-800 border border-stone-700"
              >
                <span className="text-sm text-stone-300 truncate max-w-[150px]">
                  {attachment.name}
                </span>
                <button
                  onClick={() => onAttachmentRemove(index)}
                  className="text-stone-500 hover:text-stone-300"
                >
                  ×
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Input Card */}
        <div
          className={cn(
            'rounded-2xl overflow-hidden',
            'bg-stone-800/50 border border-stone-700',
            'focus-within:border-orange-500/50',
            'transition-colors duration-200'
          )}
        >
          {/* Textarea Row */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasMessages ? 'Reply...' : 'Type / for commands'}
              disabled={isStreaming}
              rows={1}
              className={cn(
                'w-full px-4 py-3 pr-12',
                'bg-transparent text-stone-200',
                'placeholder:text-stone-500',
                'resize-none focus:outline-none',
                'max-h-32 text-sm',
                isStreaming && 'opacity-50'
              )}
            />

            {/* Add attachment button */}
            <button
              onClick={handleAttachmentClick}
              className={cn(
                'absolute right-3 top-3 p-1.5 rounded-lg',
                'text-stone-500 hover:text-stone-300 hover:bg-stone-700/50',
                'transition-colors'
              )}
              title="Add attachment"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Bottom Row */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-stone-700/50">
            {/* Left - Folder Selector */}
            <div className="relative">
              <button
                onClick={() => setFolderSelectorOpen(!folderSelectorOpen)}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-lg',
                  'text-stone-400 hover:text-stone-200 hover:bg-stone-700/50',
                  'text-sm transition-colors'
                )}
              >
                <Folder className="w-4 h-4" />
                <span className="max-w-[150px] truncate">{formatPath(workingDirectory)}</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              <AnimatePresence>
                {folderSelectorOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setFolderSelectorOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className={cn(
                        'absolute bottom-full left-0 mb-2 z-20',
                        'w-64 p-2 rounded-xl',
                        'bg-stone-900 border border-stone-800',
                        'shadow-xl shadow-black/30'
                      )}
                    >
                      <p className="text-xs text-stone-500 px-2 py-1">
                        Working directory
                      </p>
                      <div className="px-2 py-2 text-sm text-stone-300 font-mono truncate">
                        {workingDirectory}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Right - Model Selector + Send */}
            <div className="flex items-center gap-2">
              {/* Model Selector */}
              <div className="relative">
                <button
                  onClick={() => setModelSelectorOpen(!modelSelectorOpen)}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-lg',
                    'text-stone-400 hover:text-stone-200 hover:bg-stone-700/50',
                    'text-sm transition-colors'
                  )}
                >
                  <Sparkles className="w-4 h-4 text-orange-400" />
                  <span>{currentModel?.name || 'Select Model'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                <AnimatePresence>
                  {modelSelectorOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setModelSelectorOpen(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className={cn(
                          'absolute bottom-full right-0 mb-2 z-20',
                          'w-56 p-1 rounded-xl',
                          'bg-stone-900 border border-stone-800',
                          'shadow-xl shadow-black/30'
                        )}
                      >
                        {displayModels.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => {
                              updateSetting('selectedModel', model.id);
                              setModelSelectorOpen(false);
                            }}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                              'transition-colors',
                              selectedModel === model.id
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'text-stone-300 hover:bg-stone-800'
                            )}
                          >
                            <span className="flex-1 text-left">{model.name}</span>
                            {selectedModel === model.id && (
                              <span className="w-2 h-2 rounded-full bg-orange-500" />
                            )}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Send/Stop Button */}
              {isStreaming ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onStop}
                  className={cn(
                    'flex items-center gap-2 px-4 py-1.5 rounded-lg',
                    'bg-red-600 hover:bg-red-500 text-white',
                    'text-sm font-medium transition-colors'
                  )}
                >
                  <StopCircle className="w-4 h-4" />
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSend}
                  disabled={!message.trim() && attachments.length === 0}
                  className={cn(
                    'flex items-center gap-2 px-4 py-1.5 rounded-lg',
                    'text-sm font-medium transition-all duration-200',
                    message.trim() || attachments.length > 0
                      ? 'bg-orange-600 hover:bg-orange-500 text-white'
                      : 'bg-stone-700 text-stone-500 cursor-not-allowed'
                  )}
                >
                  {hasMessages ? (
                    <ArrowUp className="w-4 h-4" />
                  ) : (
                    <>
                      Let's go
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
