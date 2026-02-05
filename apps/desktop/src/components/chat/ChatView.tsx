import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MessageList } from './MessageList';
import { SessionHeader } from './SessionHeader';
import { WelcomeScreen, type QuickAction } from './WelcomeScreen';
import { InputArea } from './InputArea';
import { DropZone } from './AttachmentPreview';
import { useChatStore, type Attachment } from '../../stores/chat-store';
import { useSessionStore } from '../../stores/session-store';
import { useAgentEvents } from '../../hooks/useAgentEvents';
import { useSettingsStore } from '../../stores/settings-store';
import { toast } from '../ui/Toast';

export function ChatView() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | undefined>(undefined);

  // Store state
  const { sendMessage, stopGeneration, ensureSession } = useChatStore();
  const { activeSessionId, createSession, updateSessionTitle, sessions } = useSessionStore();
  const { defaultWorkingDirectory, selectedModel, availableModels, modelsLoading } = useSettingsStore();
  // Use direct selector to ensure Zustand properly tracks state changes
  const sessionState = useChatStore((state) => {
    if (!activeSessionId) return null;
    return state.sessions[activeSessionId] ?? null;
  });
  const messages = sessionState?.messages ?? [];
  const isStreaming = sessionState?.isStreaming ?? false;

  // Debug: log messages on every render
  console.log('[ChatView] Render with:', {
    activeSessionId,
    messageCount: messages.length,
    hasLoaded: sessionState?.hasLoaded,
    isStreaming,
    hasSessionState: !!sessionState,
  });

  // Subscribe to agent events
  useAgentEvents(activeSessionId);

  // Reset chat and load messages when session changes
  // Use a ref to track the current session and abort stale loads
  const currentSessionRef = useRef<string | null>(null);

  // CRITICAL: Track if we're currently sending a message to prevent race condition
  // When creating a new session during send, activeSessionId changes which triggers
  // the useEffect below - without this guard, it would reset() and wipe the user's message
  const isSendingRef = useRef(false);

  useEffect(() => {
    const chatStore = useChatStore.getState();
    const sessionStore = useSessionStore.getState();
    const sessionToLoad = activeSessionId;

    // Prevent races while a send is in-flight
    if (isSendingRef.current) {
      currentSessionRef.current = sessionToLoad;
      return;
    }

    currentSessionRef.current = sessionToLoad;

    if (!sessionToLoad) return;

    chatStore.ensureSession(sessionToLoad);
    const sessionState = chatStore.getSessionState(sessionToLoad);
    console.log('[ChatView] Session state check:', {
      sessionId: sessionToLoad,
      hasLoaded: sessionState.hasLoaded,
      isLoadingMessages: sessionState.isLoadingMessages,
      messageCount: sessionState.messages.length,
    });
    if (sessionState.hasLoaded || sessionState.isLoadingMessages) {
      console.log('[ChatView] Skipping loadMessages - already loaded or loading');
      return;
    }

    console.log('[ChatView] Calling loadMessages for session:', sessionToLoad);
    chatStore.loadMessages(sessionToLoad)
      .then(() => {
        if (currentSessionRef.current !== sessionToLoad) return;
      })
      .catch((error) => {
        if (currentSessionRef.current !== sessionToLoad) return;
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.toLowerCase().includes('session not found')) {
          console.warn('[ChatView] Stale session detected, clearing:', sessionToLoad);
          sessionStore.setActiveSession(null);
          return;
        }

        toast.error('Failed to load messages', errorMessage);
      });

    return () => {
      currentSessionRef.current = null;
    };
  }, [activeSessionId]);

  const hasMessages = messages.length > 0;

  const deriveTitle = (text: string) => {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    if (!trimmed) return null;
    const words = trimmed.split(' ').slice(0, 8).join(' ');
    const date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${words} — ${date}`;
  };

  // Handle send message
  const handleSend = useCallback(async (message: string, messageAttachments?: Attachment[]) => {
    if ((!message.trim() && (!messageAttachments || messageAttachments.length === 0)) || isStreaming) return;

    // CRITICAL: Set flag to prevent race condition in useEffect
    // This prevents reset() from wiping the optimistic message when activeSessionId changes
    isSendingRef.current = true;

    let sessionId = activeSessionId;
    let createdNew = false;

    try {
      // Create session if none active
      if (!sessionId) {
        try {
          const workingDir = defaultWorkingDirectory || '/';
          // Ensure model is a valid non-empty string, fall back to default if not
          const selectedIsValid = selectedModel && availableModels.some((m) => m.id === selectedModel);
          const modelToUse = selectedIsValid
            ? selectedModel
            : availableModels[0]?.id;

          if (!modelToUse) {
            const message = modelsLoading
              ? 'Models are still loading. Try again in a moment.'
              : 'No models available. Check your API key and model access.';
            toast.error('No model available', message);
            return;
          }
          sessionId = await createSession(workingDir, modelToUse);
          createdNew = true;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          toast.error('Failed to create session', errorMessage);
          return;
        }
      }

      ensureSession(sessionId);

      // Send message
      await sendMessage(sessionId, message, messageAttachments);
      setAttachments([]);

      // Set title immediately for new sessions - don't check existing title
      // because the sessions closure might be stale
      if (createdNew) {
        const derivedTitle = deriveTitle(message) ?? `New conversation — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        console.log('[ChatView] Setting title for new session:', sessionId, 'title:', derivedTitle);
        updateSessionTitle(sessionId, derivedTitle).catch((error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('[ChatView] Failed to update session title:', errorMessage);
          toast.error('Failed to update session title', errorMessage);
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to send message', errorMessage);
    } finally {
      // CRITICAL: Clear the flag after send completes (success or failure)
      isSendingRef.current = false;
    }
  }, [
    isStreaming,
    activeSessionId,
    defaultWorkingDirectory,
    selectedModel,
    availableModels,
    modelsLoading,
    createSession,
    sendMessage,
    ensureSession,
    updateSessionTitle,
    sessions,
  ]);

  // Handle stop generation
  const handleStop = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      await stopGeneration(activeSessionId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to stop generation', errorMessage);
    }
  }, [activeSessionId, stopGeneration]);

  // Handle quick action from welcome screen
  const handleQuickAction = useCallback((action: QuickAction) => {
    // Pre-fill input with action prompt
    if (action.prompt) {
      setInitialMessage(action.prompt);
    }
  }, []);

  // Clear initial message after it's been consumed
  const handleInitialMessageConsumed = useCallback(() => {
    setInitialMessage(undefined);
  }, []);

  // File handling
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;

    const maxTextSize = 200 * 1024; // 200KB
    const maxMediaSize = 25 * 1024 * 1024; // 25MB
    const isTextFile = (file: File) => {
      if (file.type.startsWith('text/')) return true;
      return /\.(md|txt|json|js|ts|tsx|jsx|py|go|rs|java|c|cpp|h|css|html)$/i.test(file.name);
    };

    Array.from(files).forEach(async (file) => {
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');
      const isVideo = file.type.startsWith('video/');
      const isText = isTextFile(file);
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

      const attachment: Attachment = {
        type: isImage ? 'image' : isAudio ? 'audio' : isVideo ? 'video' : isPdf ? 'pdf' : isText ? 'text' : 'file',
        name: file.name,
        mimeType: file.type,
        size: file.size,
      };

      if (isImage) {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          setAttachments((prev) => [
            ...prev,
            { ...attachment, data: base64 },
          ]);
        };
        reader.readAsDataURL(file);
        return;
      }

      if (isAudio || isVideo || isPdf) {
        if (file.size > maxMediaSize) {
          toast.error('File too large', `${file.name} exceeds 25MB and will not be sent to the model.`);
          setAttachments((prev) => [...prev, { ...attachment, type: 'file' }]);
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          setAttachments((prev) => [
            ...prev,
            { ...attachment, data: base64 },
          ]);
        };
        reader.readAsDataURL(file);
        return;
      }

      if (isText) {
        if (file.size > maxTextSize) {
          toast.error('File too large', `${file.name} exceeds 200KB and will not be sent to the model.`);
          setAttachments((prev) => [...prev, { ...attachment, type: 'file' }]);
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          setAttachments((prev) => [
            ...prev,
            { ...attachment, data: text, mimeType: attachment.mimeType || 'text/plain' },
          ]);
        };
        reader.readAsText(file);
        return;
      }

      setAttachments((prev) => [...prev, attachment]);
    });
  }, []);

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAttachmentCreate = useCallback((attachment: Attachment) => {
    setAttachments((prev) => [...prev, attachment]);
  }, []);

  // Drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isStreaming) {
        handleStop();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isStreaming, handleStop]);

  return (
    <div
      className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      <DropZone isDragging={isDragging} />

      {/* Session Header */}
      <SessionHeader />

      {/* Messages or Welcome Screen */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {hasMessages ? (
          <MessageList />
        ) : (
          <WelcomeScreen onQuickAction={handleQuickAction} />
        )}
      </div>

      {/* Input Area */}
      <InputArea
        onSend={handleSend}
        onStop={handleStop}
        hasMessages={hasMessages}
        isStreaming={isStreaming}
        attachments={attachments}
        onAttachmentAdd={handleFileSelect}
        onAttachmentCreate={handleAttachmentCreate}
        onAttachmentRemove={handleRemoveAttachment}
        initialMessage={initialMessage}
        onInitialMessageConsumed={handleInitialMessageConsumed}
      />

    </div>
  );
}
