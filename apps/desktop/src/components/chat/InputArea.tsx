import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import {
  ArrowUp,
  Plus,
  Mic,
  Square,
  Folder,
  FolderOpen,
  ChevronDown,
  StopCircle,
} from 'lucide-react';
import { BrandMark } from '../icons/BrandMark';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '../../stores/settings-store';
import { useAgentStore } from '../../stores/agent-store';
import { useSessionStore } from '../../stores/session-store';
import { useCommandStore, type Command } from '../../stores/command-store';
import { motion, AnimatePresence } from 'framer-motion';
import { type Attachment } from '../../stores/chat-store';
import { open } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';
import { toast } from '../ui/Toast';
import { CommandPalette } from './CommandPalette';

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
    executeCommand,
  } = useCommandStore();

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
    updateSetting,
    defaultWorkingDirectory,
    updateSetting: updateSettings,
    approvalMode,
  } = useSettingsStore();
  const { activeSessionId, sessions, updateSessionWorkingDirectory } = useSessionStore();
  const contextUsage = useAgentStore((state) => state.getSessionState(activeSessionId).contextUsage);

  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [folderSelectorOpen, setFolderSelectorOpen] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [userHomeDir, setUserHomeDir] = useState<string | null>(null);
  const modelListRef = useRef<HTMLDivElement | null>(null);

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

  const rankModel = (model: { id: string; name?: string }) => {
    const id = model.id.toLowerCase();
    const name = model.name?.toLowerCase() || '';
    const source = id.includes('gemini') ? id : name;
    const match = source.match(/gemini-(\\d+)(?:\\.(\\d+))?/);
    const major = match ? Number(match[1]) : 0;
    const minor = match && match[2] ? Number(match[2]) : 0;
    const versionScore = major * 100 + minor * 10;
    const previewScore = source.includes('preview') ? 5 : 0;
    const proScore = source.includes('pro') ? 3 : 0;
    const flashScore = source.includes('flash') ? 2 : 0;
    return versionScore + previewScore + proScore + flashScore;
  };

  const extractReleaseDate = (model: { id: string; name?: string }) => {
    const source = `${model.id} ${model.name ?? ''}`;
    const dateMatch = source.match(/(20\\d{2})[-_]?([01]\\d)[-_]?([0-3]\\d)/);
    if (dateMatch) {
      const [, y, m, d] = dateMatch;
      return Number(`${y}${m}${d}`);
    }
    const monthMatch = source.match(/(20\\d{2})[-_]?([01]\\d)(?!\\d)/);
    if (monthMatch) {
      const [, y, m] = monthMatch;
      return Number(`${y}${m}01`);
    }
    return null;
  };

  const formatTokenLimit = (tokens?: number) => {
    if (!tokens || tokens <= 0) return '–';
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
    if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
    return `${tokens}`;
  };

  const contextPercent = contextUsage.total > 0
    ? Math.min(100, Math.max(0, Math.round((contextUsage.used / contextUsage.total) * 100)))
    : 0;

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
      const dateA = extractReleaseDate(a);
      const dateB = extractReleaseDate(b);
      if (dateA && dateB) return dateA - dateB;
      if (dateA && !dateB) return 1;
      if (!dateA && dateB) return -1;
      return rankModel(a) - rankModel(b);
    });

  const currentModel = displayModels.find((m) => m.id === selectedModel) || displayModels[0];

  useEffect(() => {
    if (!modelSelectorOpen || !modelListRef.current) return;
    modelListRef.current.scrollTop = modelListRef.current.scrollHeight;
  }, [modelSelectorOpen, displayModels.length]);

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

  const handleSend = () => {
    if ((!message.trim() && attachments.length === 0) || isStreaming) return;
    onSend(message, attachments.length > 0 ? attachments : undefined);
    setMessage('');
    closePalette();
  };

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
  const handleCommandSelect = useCallback(async (command: Command) => {
    // Check if command has required arguments
    const hasRequiredArgs = command.arguments.some((arg) => arg.required);

    if (!hasRequiredArgs) {
      // Execute directly if no required args
      const result = await executeCommand(command.name, {}, workingDirectory || undefined);
      if (result.success && result.message) {
        toast.success(`/${command.name}`, result.message);
      } else if (!result.success && result.message) {
        toast.error(`/${command.name} failed`, result.message);
      }
    } else {
      // For now, insert the command into the input for user to complete args
      setMessage(`/${command.name} `);
    }

    closePalette();
  }, [executeCommand, closePalette, workingDirectory]);

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
      if (typeof window === 'undefined' || !navigator.mediaDevices || !window.MediaRecorder) {
        throw new Error('Audio recording is not supported in this environment.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          onAttachmentCreate({
            type: 'audio',
            name: `voice-note-${Date.now()}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`,
            mimeType: blob.type || 'audio/webm',
            size: blob.size,
            data: base64,
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

      <div className="max-w-[720px] mx-auto">
        {/* Attachments Preview */}
        <AnimatePresence>
          {(attachments.length > 0 || isRecording || recordingError) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-wrap gap-2 mb-3"
            >
              {isRecording && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FF5449]/10 border border-[#FF5449]/20">
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
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FF5449]/10 border border-[#FF5449]/20 text-xs text-[#FF5449]">
                  {recordingError}
                </div>
              )}

              {attachments.map((attachment, index) => {
                const isAudio = attachment.type === 'audio' && attachment.data;
                const audioSrc = isAudio && attachment.data
                  ? `data:${attachment.mimeType || 'audio/webm'};base64,${attachment.data}`
                  : null;

                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-xl',
                      'bg-white/[0.04] border border-white/[0.08]'
                    )}
                  >
                    {isAudio && audioSrc ? (
                      <audio controls src={audioSrc} className="h-8" />
                    ) : (
                      <span className="text-sm text-white/70 truncate max-w-[150px]">
                        {attachment.name}
                      </span>
                    )}
                    <button
                      onClick={() => onAttachmentRemove(index)}
                      className="text-white/40 hover:text-[#FF5449] transition-colors"
                    >
                      ×
                    </button>
                  </motion.div>
                );
              })}
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
              'focus-within:border-[#4C71FF]/45',
              'transition-colors duration-200 shadow-lg shadow-black/40'
            )}
          >
          {/* Textarea Row */}
          <div className="flex items-end gap-2 px-3 py-2">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasMessages ? 'Reply...' : 'Ask Gemini anything... (type / for commands)'}
              disabled={isStreaming}
              rows={1}
              className={cn(
                'flex-1 min-h-[32px]',
                'bg-transparent text-white/90',
                'placeholder:text-white/30',
                'resize-none focus:outline-none',
                'max-h-24 text-[12.5px] leading-snug',
                isStreaming && 'opacity-50'
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
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={handleAttachmentClick}
                className={cn(
                  'p-1.5 rounded-lg',
                  'text-white/40 hover:text-white hover:bg-white/[0.06]',
                  'transition-colors'
                )}
                title="Add attachment"
              >
                <Plus className="w-4 h-4" />
              </motion.button>

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
                      'p-2 rounded-full',
                      'bg-[#FF5449]/20 text-[#FF5449] border border-[#FF5449]/30',
                      'hover:bg-[#FF5449]/30',
                      'transition-colors'
                    )}
                    title="Stop"
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
                      'p-2 rounded-full',
                      'transition-all duration-200',
                      message.trim() || attachments.length > 0
                        ? 'bg-gradient-to-r from-[#2B48BE] to-[#4C71FF] text-white shadow-lg shadow-[#4C71FF]/25 hover:shadow-xl hover:shadow-[#4C71FF]/35'
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
          <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
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
                            <div className="w-10 h-10 rounded-xl bg-[#4C71FF]/20 flex items-center justify-center">
                              <Folder className="w-5 h-5 text-[#8CA2FF]" />
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
                              <FolderOpen className="w-5 h-5 text-[#4C71FF] flex-shrink-0" />
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
                              'bg-gradient-to-r from-[#2B48BE] to-[#4C71FF]',
                              'text-white font-medium',
                              'shadow-lg shadow-[#4C71FF]/25',
                              'hover:shadow-xl hover:shadow-[#4C71FF]/35',
                              'transition-shadow duration-200'
                            )}
                          >
                            <FolderOpen className="w-5 h-5" />
                            {workingDirectory ? 'Change Folder' : 'Select Folder'}
                          </motion.button>

                          {/* Security Note */}
                          <div className="mt-4 flex items-start gap-2 px-1">
                            <div className="w-4 h-4 rounded-full bg-[#4C71FF]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-[10px] text-[#8CA2FF]">i</span>
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

              <div
                className={cn(
                  'px-2 py-0.5 rounded-full border text-[10px]',
                  approvalMode === 'full'
                    ? 'bg-[#FF5449]/15 border-[#FF5449]/30 text-[#FF5449]'
                    : approvalMode === 'read_only'
                      ? 'bg-[#F5C400]/15 border-[#F5C400]/30 text-[#F5C400]'
                      : 'bg-[#4C71FF]/15 border-[#4C71FF]/30 text-[#8CA2FF]'
                )}
              >
                {approvalMode === 'read_only' ? 'Read-only' : approvalMode === 'full' ? 'Full' : 'Auto'}
              </div>

              <div
                className="px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-[10px] text-white/60"
                title={`${contextPercent}% context used`}
              >
                ctx {contextPercent}%
              </div>

              {/* Model Selector */}
              <div className="relative">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setModelSelectorOpen(!modelSelectorOpen)}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-0.5 rounded-full',
                    'bg-white/[0.04] border border-white/[0.08]',
                    'text-white/60 hover:text-white/90 hover:bg-white/[0.08]',
                    'text-[10px] transition-colors'
                  )}
                  disabled={modelsLoading || displayModels.length === 0}
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
                          'absolute bottom-full right-0 mb-2 z-50',
                          'w-64 p-1.5 rounded-xl',
                          'bg-[#1A1A1E] border border-white/[0.08]',
                          'shadow-2xl shadow-black/40'
                        )}
                      >
                        <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-white/40">
                          Models
                        </div>
                        <div ref={modelListRef} className="h-72 max-h-72 overflow-y-auto pr-1">
                          {modelsLoading && (
                            <div className="px-3 py-2 text-xs text-white/50">Loading models…</div>
                          )}
                          {!modelsLoading && displayModels.length === 0 && (
                            <div className="px-3 py-2 text-xs text-white/50">
                              No models available. Check your API key.
                            </div>
                          )}
                          {displayModels.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => {
                                updateSetting('selectedModel', model.id);
                                setModelSelectorOpen(false);
                              }}
                              className={cn(
                                'w-full flex flex-col items-start gap-1 px-3 py-2 rounded-lg text-sm',
                                'transition-colors',
                                selectedModel === model.id
                                  ? 'bg-[#4C71FF]/20 text-[#8CA2FF]'
                                  : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                              )}
                            >
                              <div className="w-full flex items-center gap-2">
                                <span className="flex-1 text-left">{model.name}</span>
                                {selectedModel === model.id && (
                                  <span className="w-2 h-2 rounded-full bg-[#4C71FF]" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-white/40">
                                <span>{formatTokenLimit(model.inputTokenLimit)} ctx</span>
                                <span>•</span>
                                <span>{formatTokenLimit(model.outputTokenLimit)} out</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
        </div>
      </div>
    </div>
  );
}
