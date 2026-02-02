import React, { useState, useCallback, useEffect } from 'react';
import { MessageList } from './MessageList';
import { SessionHeader } from './SessionHeader';
import { WelcomeScreen, type QuickAction } from './WelcomeScreen';
import { InputArea } from './InputArea';
import { DropZone } from './AttachmentPreview';
import { useChatStore, type Attachment } from '../../stores/chat-store';
import { useSessionStore } from '../../stores/session-store';
import { useAgentEvents } from '../../hooks/useAgentEvents';
import { useSettingsStore } from '../../stores/settings-store';

export function ChatView() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Store state
  const { messages, isStreaming, sendMessage, stopGeneration } = useChatStore();
  const { activeSessionId, createSession } = useSessionStore();
  const { defaultWorkingDirectory, selectedModel } = useSettingsStore();

  // Subscribe to agent events
  useAgentEvents(activeSessionId);

  const hasMessages = messages.length > 0;

  // Handle send message
  const handleSend = useCallback(async (message: string, messageAttachments?: Attachment[]) => {
    if ((!message.trim() && (!messageAttachments || messageAttachments.length === 0)) || isStreaming) return;

    let sessionId = activeSessionId;

    // Create session if none active
    if (!sessionId) {
      try {
        const workingDir = defaultWorkingDirectory || '/';
        sessionId = await createSession(workingDir, selectedModel);
      } catch (error) {
        console.error('Failed to create session:', error);
        return;
      }
    }

    // Send message
    try {
      await sendMessage(sessionId, message, messageAttachments);
      setAttachments([]);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, [isStreaming, activeSessionId, defaultWorkingDirectory, selectedModel, createSession, sendMessage]);

  // Handle stop generation
  const handleStop = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      await stopGeneration(activeSessionId);
    } catch (error) {
      console.error('Failed to stop generation:', error);
    }
  }, [activeSessionId, stopGeneration]);

  // Handle quick action from welcome screen
  const handleQuickAction = useCallback((action: QuickAction) => {
    if (action.id === 'plugins') {
      // Navigate to connectors - this would need to be passed from parent
      // For now, just log
      console.log('Navigate to plugins');
      return;
    }

    // Quick action selected - could pre-fill input or trigger action
    if (action.prompt) {
      // TODO: Pre-fill input with action prompt
      console.log('Quick action:', action.prompt);
    }
  }, []);

  // File handling
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;

    Array.from(files).forEach(async (file) => {
      const attachment: Attachment = {
        type: file.type.startsWith('image/') ? 'image' : 'file',
        name: file.name,
        mimeType: file.type,
        size: file.size,
      };

      // Read file as base64 for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          setAttachments((prev) => [
            ...prev,
            { ...attachment, data: base64 },
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        setAttachments((prev) => [...prev, attachment]);
      }
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
      />
    </div>
  );
}
