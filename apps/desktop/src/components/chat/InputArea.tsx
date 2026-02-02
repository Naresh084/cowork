import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  ArrowUp,
  Plus,
  Folder,
  FolderOpen,
  ChevronDown,
  StopCircle,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '../../stores/settings-store';
import { useSessionStore } from '../../stores/session-store';
import { motion, AnimatePresence } from 'framer-motion';
import { type Attachment } from '../../stores/chat-store';
import { open } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';

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

  const { selectedModel, availableModels, updateSetting, defaultWorkingDirectory, updateSetting: updateSettings } = useSettingsStore();
  const { activeSessionId, sessions, updateSessionWorkingDirectory } = useSessionStore();

  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [folderSelectorOpen, setFolderSelectorOpen] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [userHomeDir, setUserHomeDir] = useState<string | null>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Get user home directory dynamically
  useEffect(() => {
    homeDir().then(setUserHomeDir).catch(console.error);
  }, []);

  // Only show working directory if it's set and valid, otherwise show placeholder
  const workingDirectory = activeSession?.workingDirectory || defaultWorkingDirectory || null;

  // Security: Validate that path is within user's home directory
  const isPathSecure = useCallback((path: string): boolean => {
    if (!userHomeDir) return false;

    // Normalize path and check if it's within user home directory
    const normalizedPath = path.replace(/\/+/g, '/').replace(/\/$/, '');
    const normalizedHome = userHomeDir.replace(/\/+/g, '/').replace(/\/$/, '');

    // Must start with user's home directory
    if (!normalizedPath.startsWith(normalizedHome)) {
      return false;
    }

    // Check for path traversal attempts
    if (normalizedPath.includes('/../') || normalizedPath.endsWith('/..')) {
      return false;
    }

    return true;
  }, [userHomeDir]);

  // Handle folder selection via Tauri dialog
  const handleSelectFolder = useCallback(async () => {
    if (!userHomeDir) {
      setFolderError('Unable to determine home directory. Please try again.');
      return;
    }

    setFolderError(null);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: workingDirectory || userHomeDir,
        title: 'Select Working Directory',
      });

      if (selected && typeof selected === 'string') {
        // Security check: Only allow folders within user's home directory
        if (!isPathSecure(selected)) {
          setFolderError('For security, only folders within your home directory are allowed.');
          return;
        }

        // Update session if active
        if (activeSessionId) {
          updateSessionWorkingDirectory(activeSessionId, selected);
        }
        // Also update default working directory in settings
        updateSettings('defaultWorkingDirectory', selected);
        setFolderSelectorOpen(false);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
      setFolderError('Failed to select folder. Please try again.');
    }
  }, [workingDirectory, userHomeDir, activeSessionId, updateSessionWorkingDirectory, updateSettings, isPathSecure]);

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
    <div className="p-4 bg-[#0D0D0F]">
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
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-wrap gap-2 mb-3"
            >
              {attachments.map((attachment, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/[0.08]"
                >
                  <span className="text-sm text-white/70 truncate max-w-[150px]">
                    {attachment.name}
                  </span>
                  <button
                    onClick={() => onAttachmentRemove(index)}
                    className="text-white/40 hover:text-[#FF5449] transition-colors"
                  >
                    ×
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Card */}
        <motion.div
          whileFocus={{ boxShadow: '0 0 0 1px rgba(107, 110, 240, 0.5)' }}
          className={cn(
            'rounded-2xl overflow-hidden',
            'bg-[#151518] border border-white/[0.08]',
            'focus-within:border-[#6B6EF0]/50',
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
              placeholder={hasMessages ? 'Reply...' : 'Ask Gemini anything...'}
              disabled={isStreaming}
              rows={1}
              className={cn(
                'w-full px-4 py-3 pr-12',
                'bg-transparent text-white/90',
                'placeholder:text-white/30',
                'resize-none focus:outline-none',
                'max-h-32 text-[15px] leading-relaxed',
                isStreaming && 'opacity-50'
              )}
            />

            {/* Add attachment button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleAttachmentClick}
              className={cn(
                'absolute right-3 top-3 p-1.5 rounded-lg',
                'text-white/40 hover:text-white hover:bg-white/[0.06]',
                'transition-colors'
              )}
              title="Add attachment"
            >
              <Plus className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Bottom Row */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-white/[0.06]">
            {/* Left - Folder Selector */}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setFolderSelectorOpen(!folderSelectorOpen);
                  setFolderError(null);
                }}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-xl',
                  'text-white/50 hover:text-white/80 hover:bg-white/[0.06]',
                  'text-sm transition-colors'
                )}
              >
                <Folder className="w-4 h-4" />
                <span className="max-w-[150px] truncate">
                  {workingDirectory ? formatPath(workingDirectory) : 'Select folder...'}
                </span>
                <ChevronDown className="w-3 h-3" />
              </motion.button>

              {/* Folder Selector Modal */}
              <AnimatePresence>
                {folderSelectorOpen && (
                  <>
                    {/* Backdrop */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                      onClick={() => setFolderSelectorOpen(false)}
                    />

                    {/* Modal */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
                      className={cn(
                        'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
                        'w-[420px] rounded-2xl overflow-hidden',
                        'bg-[#1C1C20] border border-white/[0.10]',
                        'shadow-2xl shadow-black/60'
                      )}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#6B6EF0]/20 flex items-center justify-center">
                            <Folder className="w-5 h-5 text-[#8B8EFF]" />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold text-white">Working Directory</h3>
                            <p className="text-xs text-white/40">Select your project folder</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setFolderSelectorOpen(false)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
                        >
                          ×
                        </button>
                      </div>

                      {/* Content */}
                      <div className="p-5">
                        {/* Current Path Display */}
                        <div className="mb-4">
                          <label className="text-xs font-medium text-white/50 mb-2 block">
                            Current Path
                          </label>
                          <div className={cn(
                            'flex items-center gap-3 px-4 py-3 rounded-xl',
                            'bg-[#0D0D0F] border border-white/[0.06]'
                          )}>
                            <FolderOpen className="w-5 h-5 text-[#6B6EF0] flex-shrink-0" />
                            {workingDirectory ? (
                              <span className="text-sm text-white/80 font-mono truncate">
                                {workingDirectory}
                              </span>
                            ) : (
                              <span className="text-sm text-white/30 italic">
                                No folder selected yet
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Error Message */}
                        <AnimatePresence>
                          {folderError && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mb-4 px-4 py-3 rounded-xl bg-[#FF5449]/10 border border-[#FF5449]/20"
                            >
                              <p className="text-sm text-[#FF5449]">{folderError}</p>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Select Button */}
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={handleSelectFolder}
                          className={cn(
                            'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl',
                            'bg-gradient-to-r from-[#4F52D9] to-[#6B6EF0]',
                            'text-white font-medium',
                            'shadow-lg shadow-[#6B6EF0]/25',
                            'hover:shadow-xl hover:shadow-[#6B6EF0]/35',
                            'transition-shadow duration-200'
                          )}
                        >
                          <FolderOpen className="w-5 h-5" />
                          {workingDirectory ? 'Change Folder' : 'Select Folder'}
                        </motion.button>

                        {/* Security Note */}
                        <div className="mt-4 flex items-start gap-2 px-1">
                          <div className="w-4 h-4 rounded-full bg-[#6B6EF0]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-[10px] text-[#8B8EFF]">i</span>
                          </div>
                          <p className="text-xs text-white/40 leading-relaxed">
                            For security, only folders within your home directory (~) are accessible.
                            This protects system files and other sensitive areas.
                          </p>
                        </div>
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
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setModelSelectorOpen(!modelSelectorOpen)}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-xl',
                    'text-white/50 hover:text-white/80 hover:bg-white/[0.06]',
                    'text-sm transition-colors'
                  )}
                >
                  <Sparkles className="w-4 h-4 text-[#8A62C2]" />
                  <span>{currentModel?.name || 'Select Model'}</span>
                  <ChevronDown className="w-3 h-3" />
                </motion.button>

                <AnimatePresence>
                  {modelSelectorOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setModelSelectorOpen(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 5, scale: 0.95 }}
                        className={cn(
                          'absolute bottom-full right-0 mb-2 z-20',
                          'w-56 p-1.5 rounded-xl',
                          'bg-[#1A1A1E] border border-white/[0.08]',
                          'shadow-2xl shadow-black/40'
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
                                ? 'bg-[#6B6EF0]/20 text-[#8B8EFF]'
                                : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                            )}
                          >
                            <span className="flex-1 text-left">{model.name}</span>
                            {selectedModel === model.id && (
                              <span className="w-2 h-2 rounded-full bg-[#6B6EF0]" />
                            )}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Send/Stop Button */}
              <AnimatePresence mode="wait">
                {isStreaming ? (
                  <motion.button
                    key="stop"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onStop}
                    className={cn(
                      'flex items-center gap-2 px-4 py-1.5 rounded-xl',
                      'bg-[#FF5449]/20 text-[#FF5449] border border-[#FF5449]/30',
                      'hover:bg-[#FF5449]/30',
                      'text-sm font-medium transition-colors'
                    )}
                  >
                    <StopCircle className="w-4 h-4" />
                  </motion.button>
                ) : (
                  <motion.button
                    key="send"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSend}
                    disabled={!message.trim() && attachments.length === 0}
                    className={cn(
                      'flex items-center gap-2 px-4 py-1.5 rounded-xl',
                      'text-sm font-medium transition-all duration-200',
                      message.trim() || attachments.length > 0
                        ? 'bg-gradient-to-r from-[#4F52D9] to-[#6B6EF0] text-white shadow-lg shadow-[#6B6EF0]/25 hover:shadow-xl hover:shadow-[#6B6EF0]/35'
                        : 'bg-white/[0.06] text-white/30 cursor-not-allowed'
                    )}
                  >
                    {hasMessages ? (
                      <ArrowUp className="w-4 h-4" />
                    ) : (
                      <>
                        <span>Send</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
