import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  Plus,
  Mic,
  Square,
  Folder,
  FolderOpen,
  ChevronDown,
  StopCircle,
  Search,
} from 'lucide-react';
import { BrandMark } from '../icons/BrandMark';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '../../stores/settings-store';
import { useSessionStore } from '../../stores/session-store';
import { useCommandStore, type SlashCommand } from '../../stores/command-store';
import { useChatStore, type Attachment } from '../../stores/chat-store';
import { motion, AnimatePresence } from 'framer-motion';
import { open } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';
import { toast } from '../ui/Toast';
import { CommandPalette } from './CommandPalette';
import { AttachmentPreview } from './AttachmentPreview';

interface InputAreaProps {
  onSend: (message: string, attachments?: Attachment[]) => void;
  onStop: () => void;
  hasMessages: boolean;
  isStreaming: boolean;
  attachments: Attachment[];
  onAttachmentAdd: (files: FileList | null) => void;
  onAttachmentCreate: (attachment: Attachment) => void;
  onAttachmentRemove: (index: number) => void;
  initialMessage?: string;
  onInitialMessageConsumed?: () => void;
}

export function InputArea({
  onSend,
  onStop,
  hasMessages,
  isStreaming,
  attachments,
  onAttachmentAdd,
  onAttachmentCreate,
  onAttachmentRemove,
  initialMessage,
  onInitialMessageConsumed,
}: InputAreaProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  // Command palette state
  const {
    isPaletteOpen,
    openPalette,
    closePalette,
    setPaletteQuery,
    getCommandByAlias,
    expandCommand,
  } = useCommandStore();

  // Chat store for clearing session
  const resetSession = useChatStore((state) => state.resetSession);

  // Handle initial message from quick actions
  useEffect(() => {
    if (initialMessage && initialMessage.trim()) {
      setMessage(initialMessage);
      onInitialMessageConsumed?.();
      // Focus the textarea after setting initial message
      textareaRef.current?.focus();
    }
  }, [initialMessage, onInitialMessageConsumed]);

  const {
    selectedModel,
    availableModels,
    modelsLoading,
    activeProvider,
    setSelectedModelForProvider,
    addCustomModelForProvider,
    defaultWorkingDirectory,
    updateSetting: updateSettings,
  } = useSettingsStore();
  const { activeSessionId, sessions, updateSessionWorkingDirectory } = useSessionStore();

  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const modelSearchRef = useRef<HTMLInputElement>(null);
  const [folderSelectorOpen, setFolderSelectorOpen] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [userHomeDir, setUserHomeDir] = useState<string | null>(null);
  const modelListRef = useRef<HTMLDivElement | null>(null);
  const modelBtnRef = useRef<HTMLButtonElement | null>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Get user home directory dynamically
  useEffect(() => {
    homeDir()
      .then(setUserHomeDir)
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast.error('Failed to get home directory', errorMessage);
      });
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

  const formatTokenLimit = (tokens?: number) => {
    if (!tokens || tokens <= 0) return '–';
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
    if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
    return `${tokens}`;
  };

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      setFolderError('Failed to select folder. Please try again.');
      toast.error('Failed to select folder', errorMessage);
    }
  }, [workingDirectory, userHomeDir, activeSessionId, updateSessionWorkingDirectory, updateSettings, isPathSecure]);

  const displayModels = availableModels
    .slice()
    .sort((a, b) => {
      const nameA = (a.name || a.id).toLowerCase();
      const nameB = (b.name || b.id).toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const filteredModels = displayModels.filter((model) => {
    if (!modelSearch.trim()) return true;
    const q = modelSearch.toLowerCase();
    return model.name.toLowerCase().includes(q) || model.id.toLowerCase().includes(q);
  });

  const currentModel =
    displayModels.find((m) => m.id === selectedModel) ||
    (selectedModel
      ? {
          id: selectedModel,
          name: selectedModel,
          description: 'Custom model',
          inputTokenLimit: 0,
          outputTokenLimit: 0,
        }
      : displayModels[0]);

  useEffect(() => {
    if (!modelSelectorOpen) {
      setModelSearch('');
      return;
    }
    // Focus search input when dropdown opens
    requestAnimationFrame(() => modelSearchRef.current?.focus());
    if (modelListRef.current) {
      modelListRef.current.scrollTop = modelListRef.current.scrollHeight;
    }
  }, [modelSelectorOpen]);

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
    }
  }, [message]);

  useEffect(() => {
    if (!isRecording) {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      return;
    }

    recordingTimerRef.current = window.setInterval(() => {
      setRecordingTime((time) => time + 1);
    }, 1000);

    return () => {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, [isRecording]);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed && attachments.length === 0) return;

    // Check for slash command
    if (trimmed.startsWith('/')) {
      const spaceIndex = trimmed.indexOf(' ');
      const cmdName = spaceIndex > 0 ? trimmed.slice(1, spaceIndex) : trimmed.slice(1);
      const userAddition = spaceIndex > 0 ? trimmed.slice(spaceIndex + 1) : '';

      const command = getCommandByAlias(cmdName);

      if (command) {
        // Action-only command (e.g., /clear)
        if (command.frontmatter.action === 'clear_chat') {
          if (activeSessionId) {
            resetSession(activeSessionId);
          }
          setMessage('');
          closePalette();
          toast.success('Conversation cleared');
          return;
        }

        // Prompt command - expand and send as normal message
        const expanded = expandCommand(cmdName, userAddition);
        if (expanded) {
          onSend(expanded, attachments.length > 0 ? attachments : undefined);
          setMessage('');
          closePalette();
          return;
        }
      }

      // Unknown command - send as-is (let AI handle it)
    }

    // Normal message
    onSend(message, attachments.length > 0 ? attachments : undefined);
    setMessage('');
    closePalette();
  }, [message, attachments, isStreaming, onSend, closePalette, getCommandByAlias, expandCommand, activeSessionId, resetSession]);

  // Handle "/" detection for command palette
  const handleInputChange = useCallback((value: string) => {
    setMessage(value);

    // Check if user is typing a command (starts with "/" at the beginning)
    if (value.startsWith('/')) {
      if (!isPaletteOpen) {
        openPalette();
      }
      // Update palette query (remove the leading "/")
      setPaletteQuery(value.slice(1));
    } else if (isPaletteOpen) {
      // Close palette if "/" was removed
      closePalette();
    }
  }, [isPaletteOpen, openPalette, closePalette, setPaletteQuery]);

  // Handle command selection from palette
  // Simply inserts the command into the input - user presses Enter to execute
  const handleCommandSelect = useCallback((command: SlashCommand) => {
    // Insert command into input, user can add more text and press Enter
    setMessage(`/${command.name} `);
    closePalette();
    // Focus textarea so user can continue typing
    textareaRef.current?.focus();
  }, [closePalette]);

  // Handle closing command palette
  const handlePaletteClose = useCallback(() => {
    closePalette();
    // Clear the "/" if user presses Escape
    if (message === '/') {
      setMessage('');
    }
  }, [closePalette, message]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle paste: extract images/files from clipboard
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Skip text items — let the browser handle those normally
      if (item.kind === 'string') continue;
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length === 0) return;

    // Prevent the default paste (which would insert weird text for images)
    e.preventDefault();

    // Use DataTransfer to build a proper FileList from extracted files
    const dt = new DataTransfer();
    for (const file of files) {
      // For clipboard images that have no name, give them a useful one
      if (file.name === 'image.png' || !file.name) {
        const named = new File([file], `clipboard-${Date.now()}.${file.type.split('/')[1] || 'png'}`, {
          type: file.type,
        });
        dt.items.add(named);
      } else {
        dt.items.add(file);
      }
    }
    onAttachmentAdd(dt.files);
  }, [onAttachmentAdd]);

  const handleAttachmentClick = () => {
    fileInputRef.current?.click();
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    if (isRecording) return;
    setRecordingError(null);

    try {
      if (typeof window === 'undefined' || !navigator.mediaDevices) {
        throw new Error('Microphone access requires a secure context. Please check app permissions.');
      }
      if (!window.MediaRecorder) {
        throw new Error('MediaRecorder API is not available in this browser.');
      }

      // Request microphone permission - this triggers the macOS permission dialog
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (permErr: unknown) {
        const name = permErr instanceof DOMException ? permErr.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          throw new Error('Microphone permission denied. Please allow microphone access in System Settings > Privacy & Security > Microphone.');
        }
        if (name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        }
        throw permErr;
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        const objectUrl = URL.createObjectURL(blob);
        const duration = recordingTime;

        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          onAttachmentCreate({
            type: 'audio',
            name: `voice-note-${Date.now()}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`,
            mimeType: blob.type || 'audio/webm',
            size: blob.size,
            data: base64,
            objectUrl,
            duration,
          });
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRecordingError(message || 'Unable to access microphone');
      toast.error('Microphone access failed', message);
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current) return;
    recorderRef.current.stop();
    recorderRef.current = null;
    setIsRecording(false);
  };

  const formatPath = (path: string): string => {
    // Use dynamically fetched home directory
    if (userHomeDir && path.startsWith(userHomeDir)) {
      return '~' + path.slice(userHomeDir.length);
    }
    if (path.length > 30) {
      return '...' + path.slice(-27);
    }
    return path;
  };

  return (
    <div className="px-4 pb-3 pt-1">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,audio/*,video/*,.pdf,.txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.c,.cpp,.h,.css,.html"
        className="hidden"
        onChange={(e) => onAttachmentAdd(e.target.files)}
      />

      <div className="mx-10">
        {/* Attachments Preview */}
        <AnimatePresence>
          {(attachments.length > 0 || isRecording || recordingError) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-3"
            >
              {isRecording && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FF5449]/10 border border-[#FF5449]/20 mb-2 w-fit">
                  <span className="w-2 h-2 rounded-full bg-[#FF5449] animate-pulse" />
                  <span className="text-sm text-white/80">
                    Recording {formatRecordingTime(recordingTime)}
                  </span>
                  <button
                    onClick={stopRecording}
                    className="text-xs text-[#FF5449] hover:text-white transition-colors"
                  >
                    Stop
                  </button>
                </div>
              )}

              {recordingError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FF5449]/10 border border-[#FF5449]/20 text-xs text-[#FF5449] mb-2 w-fit">
                  {recordingError}
                </div>
              )}

              <AttachmentPreview
                attachments={attachments}
                onRemove={onAttachmentRemove}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Card with Command Palette */}
        <div className="relative">
          {/* Command Palette - positioned above input */}
          <CommandPalette
            onSelect={handleCommandSelect}
            onClose={handlePaletteClose}
          />

          <motion.div
            whileFocus={{ boxShadow: '0 0 0 1px rgba(76, 113, 255, 0.45)' }}
            className={cn(
              'rounded-[20px] overflow-visible',
              'bg-[#0F1014]/90 border border-white/[0.08] backdrop-blur',
              'focus-within:border-[#1D4ED8]/45',
              'transition-colors duration-200 shadow-lg shadow-black/40'
            )}
          >
          {/* Textarea Row */}
          <div className="flex items-end gap-2 px-3 py-2">
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={handleAttachmentClick}
              className={cn(
                'p-2 rounded-xl self-center',
                'text-white/40 hover:text-white hover:bg-white/[0.06]',
                'transition-colors'
              )}
              title="Add attachment"
            >
              <Plus className="w-6 h-6" />
            </motion.button>

            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={hasMessages ? 'Reply...' : 'Ask Cowork anything... (type / for commands)'}
              rows={1}
              className={cn(
                'flex-1 min-h-[32px]',
                'bg-transparent text-white/90',
                'placeholder:text-white/30',
                'resize-none focus:outline-none',
                'max-h-24 text-[12.5px] leading-snug',
              )}
            />

            <div className="flex items-center gap-1 pb-0.5">
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  'p-1.5 rounded-lg',
                  isRecording
                    ? 'text-[#FF5449] bg-[#FF5449]/10'
                    : 'text-white/40 hover:text-white hover:bg-white/[0.06]',
                  'transition-colors'
                )}
                title={isRecording ? 'Stop recording' : 'Record voice'}
              >
                {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </motion.button>

              {/* Single Send/Stop Button - show send when there's input content even during streaming */}
              <AnimatePresence mode="wait">
                {isStreaming && !message.trim() && attachments.length === 0 ? (
                  <motion.button
                    key="stop"
                    initial={{ opacity: 0, scale: 0.8, rotate: -90 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.8, rotate: 90 }}
                    transition={{ duration: 0.2 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onStop}
                    className={cn(
                      'p-2 rounded-full',
                      'bg-[#FF5449]/20 text-[#FF5449] border border-[#FF5449]/30',
                      'hover:bg-[#FF5449]/30',
                      'transition-colors'
                    )}
                    title="Stop generation (Enter to queue message)"
                  >
                    <StopCircle className="w-4 h-4" />
                  </motion.button>
                ) : (
                  <motion.button
                    key="send"
                    initial={{ opacity: 0, scale: 0.8, rotate: 90 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.8, rotate: -90 }}
                    transition={{ duration: 0.2 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSend}
                    disabled={!message.trim() && attachments.length === 0}
                    className={cn(
                      'p-2 rounded-full',
                      'transition-all duration-200',
                      message.trim() || attachments.length > 0
                        ? 'bg-gradient-to-r from-[#1E3A8A] to-[#1D4ED8] text-white shadow-lg shadow-[#1D4ED8]/25 hover:shadow-xl hover:shadow-[#1D4ED8]/35'
                        : 'bg-white/[0.06] text-white/30 cursor-not-allowed'
                    )}
                    title="Send"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Meta Row */}
          <div className="flex items-center gap-1.5 px-3 pb-2 pt-0.5">
              {/* Folder Selector */}
              <div className="relative">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setFolderSelectorOpen(!folderSelectorOpen);
                    setFolderError(null);
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-0.5 rounded-full',
                    'bg-white/[0.04] border border-white/[0.08]',
                    'text-white/60 hover:text-white/90 hover:bg-white/[0.08]',
                    'text-[10px] transition-colors'
                  )}
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span className="max-w-[140px] truncate">
                    {workingDirectory ? formatPath(workingDirectory) : 'Select folder'}
                  </span>
                  <ChevronDown className="w-3 h-3" />
                </motion.button>

                {/* Folder Selector Modal */}
                {folderSelectorOpen && createPortal(
                  <AnimatePresence>
                    {folderSelectorOpen && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                        onClick={(e) => { if (e.target === e.currentTarget) setFolderSelectorOpen(false); }}
                      >
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 20 }}
                          transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
                          className={cn(
                            'w-[420px] rounded-2xl overflow-hidden',
                            'bg-[#1C1C20] border border-white/[0.10]',
                            'shadow-2xl shadow-black/60'
                          )}
                        >
                          {/* Header */}
                          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-[#1D4ED8]/20 flex items-center justify-center">
                                <Folder className="w-5 h-5 text-[#93C5FD]" />
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
                                <FolderOpen className="w-5 h-5 text-[#1D4ED8] flex-shrink-0" />
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
                                'bg-gradient-to-r from-[#1E3A8A] to-[#1D4ED8]',
                                'text-white font-medium',
                                'shadow-lg shadow-[#1D4ED8]/25',
                                'hover:shadow-xl hover:shadow-[#1D4ED8]/35',
                                'transition-shadow duration-200'
                              )}
                            >
                              <FolderOpen className="w-5 h-5" />
                              {workingDirectory ? 'Change Folder' : 'Select Folder'}
                            </motion.button>

                            {/* Security Note */}
                            <div className="mt-4 flex items-start gap-2 px-1">
                              <div className="w-4 h-4 rounded-full bg-[#1D4ED8]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-[10px] text-[#93C5FD]">i</span>
                              </div>
                              <p className="text-xs text-white/40 leading-relaxed">
                                For security, only folders within your home directory (~) are accessible.
                                This protects system files and other sensitive areas.
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>,
                  document.body
                )}
              </div>

              {/* Model Selector */}
              <div className="relative">
                <motion.button
                  ref={modelBtnRef}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setModelSelectorOpen(!modelSelectorOpen)}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-0.5 rounded-full',
                    'bg-white/[0.04] border border-white/[0.08]',
                    'text-white/60 hover:text-white/90 hover:bg-white/[0.08]',
                    'text-[10px] transition-colors'
                  )}
                  disabled={modelsLoading && displayModels.length === 0}
                >
                  <BrandMark className="w-3.5 h-3.5" />
                  <span>
                    {currentModel?.name || (modelsLoading ? 'Loading…' : 'No models')}
                  </span>
                  {currentModel && (
                    <span className="text-[10px] text-white/35">
                      {formatTokenLimit(currentModel.inputTokenLimit)} ctx
                    </span>
                  )}
                  <ChevronDown className="w-3 h-3" />
                </motion.button>

                {modelSelectorOpen && createPortal(
                  <AnimatePresence>
                    {modelSelectorOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-[90]"
                          onClick={() => setModelSelectorOpen(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 5, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 5, scale: 0.95 }}
                          className={cn(
                            'fixed z-[95] w-72 rounded-xl overflow-hidden',
                            'bg-[#1A1A1E] border border-white/[0.08]',
                            'shadow-2xl shadow-black/40'
                          )}
                          style={(() => {
                            const rect = modelBtnRef.current?.getBoundingClientRect();
                            if (!rect) return {};
                            return {
                              bottom: window.innerHeight - rect.top + 8,
                              right: window.innerWidth - rect.right,
                            };
                          })()}
                        >
                          {/* Search Input */}
                          <div className="px-2 pt-2 pb-1">
                            <div className="relative">
                              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                              <input
                                ref={modelSearchRef}
                                type="text"
                                value={modelSearch}
                                onChange={(e) => setModelSearch(e.target.value)}
                                placeholder="Search models..."
                                className={cn(
                                  'w-full rounded-lg py-1.5 pl-8 pr-3 text-xs',
                                  'bg-white/[0.04] border border-white/[0.08] text-white/90',
                                  'placeholder:text-white/30',
                                  'focus:outline-none focus:border-[#1D4ED8]/40'
                                )}
                                onKeyDown={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>

                          <div ref={modelListRef} className="max-h-72 overflow-y-auto px-1.5 pb-1.5">
                            {modelsLoading && (
                              <div className="px-3 py-2 text-xs text-white/50">Loading models…</div>
                            )}
                            {!modelsLoading && displayModels.length === 0 && (
                              <div className="px-3 py-2 text-xs text-white/50">
                                No models available. Check your API key.
                              </div>
                            )}
                            {filteredModels.map((model) => (
                              <button
                                key={model.id}
                                onClick={() => {
                                  setSelectedModelForProvider(activeProvider, model.id);
                                  setModelSelectorOpen(false);
                                }}
                                className={cn(
                                  'w-full flex flex-col items-start gap-1 px-3 py-2 rounded-lg text-sm',
                                  'transition-colors',
                                  selectedModel === model.id
                                    ? 'bg-[#1D4ED8]/20 text-[#93C5FD]'
                                    : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                                )}
                              >
                                <div className="w-full flex items-center gap-2">
                                  <span className="flex-1 text-left">{model.name}</span>
                                  {selectedModel === model.id && (
                                    <span className="w-2 h-2 rounded-full bg-[#1D4ED8]" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-white/40">
                                  <span>{formatTokenLimit(model.inputTokenLimit)} ctx</span>
                                  <span>•</span>
                                  <span>{formatTokenLimit(model.outputTokenLimit)} out</span>
                                </div>
                              </button>
                            ))}
                            {!modelsLoading && displayModels.length > 0 && modelSearch.trim() && filteredModels.length === 0 && (
                              <div className="space-y-2 px-2 py-2">
                                <div className="px-1 text-xs text-white/40">No models match "{modelSearch}"</div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const custom = modelSearch.trim();
                                    if (!custom) return;
                                    addCustomModelForProvider(activeProvider, custom);
                                    setSelectedModelForProvider(activeProvider, custom);
                                    setModelSelectorOpen(false);
                                  }}
                                  className="w-full rounded-lg border border-[#1D4ED8]/35 bg-[#1D4ED8]/10 px-3 py-2 text-left text-xs text-[#93C5FD] hover:bg-[#1D4ED8]/20 transition-colors"
                                >
                                  Use custom model ID: {modelSearch.trim()}
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>,
                  document.body
                )}
              </div>
          </div>
        </motion.div>
        </div>
      </div>
    </div>
  );
}
