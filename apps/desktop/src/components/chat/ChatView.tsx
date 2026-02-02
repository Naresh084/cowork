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
  const { messages, isStreaming, sendMessage, stopGeneration } = useChatStore();
  const { activeSessionId, createSession } = useSessionStore();
  const { defaultWorkingDirectory, selectedModel } = useSettingsStore();

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

    // CRITICAL: Don't reset if we're in the middle of sending a message
    // This prevents the race condition where:
    // T0: User sends message → optimistic message added to state
    // T1: createSession() called (no session exists)
    // T2: activeSessionId changes to new session ID
    // T3: This useEffect triggers → WITHOUT this guard, reset() WIPES ALL MESSAGES
    // T4: loadMessages() loads empty session from backend
    // T5: User's message is gone
    if (isSendingRef.current) {
      // Update the ref but don't reset - the message send is in progress
      currentSessionRef.current = sessionToLoad;
      return;
    }

    // Track which session we're loading
    currentSessionRef.current = sessionToLoad;

    // Reset chat state for new session
    chatStore.reset();

    // Load messages if session exists
    if (sessionToLoad) {
      chatStore.loadMessages(sessionToLoad)
        .then(() => {
          // Verify this is still the active session before accepting results
          // If user switched sessions during load, ignore stale data
          if (currentSessionRef.current !== sessionToLoad) {
            // Session changed during load - data already handled by new session
            return;
          }
        })
        .catch((error) => {
          // Only show error if this is still the active session
          if (currentSessionRef.current !== sessionToLoad) {
            return; // Ignore errors from stale loads
          }
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Handle stale session - clear activeSessionId so user can start fresh
          if (errorMessage.toLowerCase().includes('session not found')) {
            console.warn('[ChatView] Stale session detected, clearing:', sessionToLoad);
            sessionStore.setActiveSession(null);
            return;
          }

          toast.error('Failed to load messages', errorMessage);
        });
    }

    // Cleanup: mark session as stale when effect runs again
    return () => {
      currentSessionRef.current = null;
    };
  }, [activeSessionId]);

  const hasMessages = messages.length > 0;

  // Handle send message
  const handleSend = useCallback(async (message: string, messageAttachments?: Attachment[]) => {
    if ((!message.trim() && (!messageAttachments || messageAttachments.length === 0)) || isStreaming) return;

    // CRITICAL: Set flag to prevent race condition in useEffect
    // This prevents reset() from wiping the optimistic message when activeSessionId changes
    isSendingRef.current = true;

    let sessionId = activeSessionId;

    try {
      // Create session if none active
      if (!sessionId) {
        try {
          const workingDir = defaultWorkingDirectory || '/';
          // Ensure model is a valid non-empty string, fall back to default if not
          const modelToUse = selectedModel && typeof selectedModel === 'string' && selectedModel.trim()
            ? selectedModel
            : 'gemini-3.0-flash-preview';
          sessionId = await createSession(workingDir, modelToUse);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          toast.error('Failed to create session', errorMessage);
          return;
        }
      }

      // Send message
      await sendMessage(sessionId, message, messageAttachments);
      setAttachments([]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to send message', errorMessage);
    } finally {
      // CRITICAL: Clear the flag after send completes (success or failure)
      isSendingRef.current = false;
    }
  }, [isStreaming, activeSessionId, defaultWorkingDirectory, selectedModel, createSession, sendMessage]);

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
    if (action.id === 'plugins') {
      // Navigate to connectors - handled by MainLayout via props
      // For now, show toast informing user
      toast.info('Plugins', 'Navigate to Settings > Connectors to manage plugins');
      return;
    }

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
    const isTextFile = (file: File) => {
      if (file.type.startsWith('text/')) return true;
      return /\.(md|txt|json|js|ts|tsx|jsx|py|go|rs|java|c|cpp|h|css|html)$/i.test(file.name);
    };

    Array.from(files).forEach(async (file) => {
      const isImage = file.type.startsWith('image/');
      const isText = isTextFile(file);

      const attachment: Attachment = {
        type: isImage ? 'image' : isText ? 'text' : 'file',
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
      className="flex-1 flex flex-col min-w-0 bg-[#0D0D0F] relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      <DropZone isDragging={isDragging} />

      {/* Session Header */}
      <SessionHeader />

      {/* Messages or Welcome Screen */}
      <div className="flex-1 overflow-hidden">
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
        onAttachmentRemove={handleRemoveAttachment}
        initialMessage={initialMessage}
        onInitialMessageConsumed={handleInitialMessageConsumed}
      />
    </div>
  );
}
