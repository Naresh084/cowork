import React, { useEffect, useRef, useState, useMemo, useCallback, Suspense } from 'react';
import { cn } from '../../lib/utils';
import { Copy, Check, ChevronDown, ChevronRight, Sparkles, Code, Shield, ShieldAlert, CheckCircle2, XCircle, Circle, Loader2, Mic, ArrowDown, Search } from 'lucide-react';
import { useChatStore, deriveMessagesFromItems, deriveToolMapFromItems, deriveTurnActivitiesFromItems, type ExtendedPermissionRequest, type ToolExecution, type MediaActivityItem, type ReportActivityItem, type DesignActivityItem, type UserQuestion } from '../../stores/chat-store';
import { useSessionStore } from '../../stores/session-store';
import { useAgentStore, type Artifact } from '../../stores/agent-store';
import { useSettingsStore } from '../../stores/settings-store';
import { CodeBlock } from './CodeBlock';
import { AskUserQuestion } from './AskUserQuestion';
import { SourcesCitation } from './SourcesCitation';
import { motion, AnimatePresence } from 'framer-motion';
import type { Message, MessageContentPart, ChatItem } from '@gemini-cowork/shared';
import { BrandMark } from '../icons/BrandMark';
import { getToolMeta } from './tool-metadata';
import { TaskToolCard } from './TaskToolCard';
import { ToolExecutionCard } from './ToolExecutionCard';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import remarkGfm from 'remark-gfm';
import { fixNestedCodeFences } from '../../lib/fix-markdown';

// Lazy load react-markdown for better bundle splitting
const ReactMarkdown = React.lazy(() => import('react-markdown'));

type ErrorMessageMetadata = {
  kind: 'error';
  code?: string;
  details?: {
    retryAfterSeconds?: number;
    quotaMetric?: string;
    model?: string;
    docsUrl?: string;
  };
  raw?: string;
};

// Default empty session state for when no session is active
const EMPTY_SESSION_STATE = {
  chatItems: [] as ChatItem[],
  isStreaming: false,
  isThinking: false,
  thinkingContent: '',
  streamingContent: '',
  isLoadingMessages: false,
  pendingQuestions: [] as UserQuestion[],
  pendingPermissions: [] as ExtendedPermissionRequest[],
  activeTurnId: undefined as string | undefined,
  hasLoaded: false,
  hasMoreHistory: false,
  oldestLoadedSequence: null,
  error: null as string | null,
  lastUpdatedAt: 0,
};

interface OptimisticFirstMessage {
  content: string;
  createdAt: number;
}

interface MessageListProps {
  optimisticFirstMessage?: OptimisticFirstMessage | null;
}

function messageContentToSearchText(content: Message['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      if (part.type === 'text' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      if (part.type === 'tool_result') {
        const resultPart = part as { result?: unknown; toolName?: string };
        const rendered =
          typeof resultPart.result === 'string'
            ? resultPart.result
            : resultPart.result !== undefined
              ? JSON.stringify(resultPart.result)
              : '';
        return `${resultPart.toolName || 'tool_result'} ${rendered}`.trim();
      }
      if (part.type === 'tool_call') {
        const callPart = part as { toolName?: string; args?: unknown };
        const args =
          callPart.args !== undefined
            ? (typeof callPart.args === 'string' ? callPart.args : JSON.stringify(callPart.args))
            : '';
        return `${callPart.toolName || 'tool_call'} ${args}`.trim();
      }
      return '';
    })
    .join('\n')
    .trim();
}

export function MessageList({ optimisticFirstMessage = null }: MessageListProps) {
  const { activeSessionId } = useSessionStore();
  // Use direct selector to ensure Zustand properly tracks state changes
  const sessionState = useChatStore((state) => {
    if (!activeSessionId) return EMPTY_SESSION_STATE;
    return state.sessions[activeSessionId] ?? EMPTY_SESSION_STATE;
  });
  const agentState = useAgentStore((state) => state.getSessionState(activeSessionId));
  const setPreviewArtifact = useAgentStore((state) => state.setPreviewArtifact);
  const {
    chatItems,
    isStreaming,
    isThinking,
    thinkingContent,
    isLoadingMessages,
    pendingQuestions,
    pendingPermissions,
    activeTurnId,
    hasLoaded,
    hasMoreHistory,
    error: sessionError,
  } = sessionState;

  // V2: Derive rendering data from chatItems (single source of truth)
  const messages = useMemo(() => deriveMessagesFromItems(chatItems), [chatItems]);
  const toolMap = useMemo(() => deriveToolMapFromItems(chatItems), [chatItems]);
  const turnActivities = useMemo(
    () => deriveTurnActivitiesFromItems(chatItems, pendingPermissions, pendingQuestions),
    [chatItems, pendingPermissions, pendingQuestions]
  );
  const finalAssistantMessageIds = useMemo(() => {
    const compareByTimelineOrder = (a: ChatItem, b: ChatItem): number => {
      const aSeq = typeof a.sequence === 'number' ? a.sequence : Number.POSITIVE_INFINITY;
      const bSeq = typeof b.sequence === 'number' ? b.sequence : Number.POSITIVE_INFINITY;
      if (aSeq !== bSeq) return aSeq - bSeq;
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return a.id.localeCompare(b.id);
    };

    const latestAssistantByTurn = new Map<string, ChatItem>();
    for (const item of chatItems) {
      if (item.kind !== 'assistant_message' || !item.turnId) continue;
      const existing = latestAssistantByTurn.get(item.turnId);
      if (!existing || compareByTimelineOrder(existing, item) < 0) {
        latestAssistantByTurn.set(item.turnId, item);
      }
    }

    return new Set(Array.from(latestAssistantByTurn.values(), (item) => item.id));
  }, [chatItems]);
  const artifacts = agentState.artifacts;
  const { respondToQuestion, respondToPermission, loadOlderMessages } = useChatStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasManualScroll, setHasManualScroll] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [activeSearchResultIndex, setActiveSearchResultIndex] = useState(0);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const onScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const nearBottom = distanceFromBottom <= 96;
      setIsNearBottom(nearBottom);
      setHasManualScroll((prev) => (nearBottom ? false : prev || true));
    };

    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-scroll only when user is near the bottom to avoid jumpy/flickery scroll behavior.
  useEffect(() => {
    if (!isNearBottom) return;
    scrollToBottom('auto');
  }, [
    chatItems.length,
    messages.length,
    isStreaming,
    pendingPermissions.length,
    pendingQuestions.length,
    sessionState.lastUpdatedAt,
    isNearBottom,
  ]);

  useEffect(() => {
    setMessageSearchQuery('');
    setActiveSearchResultIndex(0);
  }, [activeSessionId]);

  const registerMessageRef = useCallback((messageId: string, node: HTMLDivElement | null) => {
    if (node) {
      messageRefMap.current.set(messageId, node);
      return;
    }
    messageRefMap.current.delete(messageId);
  }, []);

  const normalizedSearchQuery = messageSearchQuery.trim().toLowerCase();
  const matchingMessageIds = useMemo(() => {
    if (!normalizedSearchQuery) return [] as string[];
    return messages
      .filter((message) => messageContentToSearchText(message.content).toLowerCase().includes(normalizedSearchQuery))
      .map((message) => message.id);
  }, [messages, normalizedSearchQuery]);
  const matchingMessageIdSet = useMemo(() => new Set(matchingMessageIds), [matchingMessageIds]);
  const activeSearchMessageId =
    matchingMessageIds.length > 0
      ? matchingMessageIds[
          Math.min(
            Math.max(activeSearchResultIndex, 0),
            Math.max(0, matchingMessageIds.length - 1)
          )
        ]
      : null;

  useEffect(() => {
    setActiveSearchResultIndex(0);
  }, [normalizedSearchQuery, matchingMessageIds.length]);

  useEffect(() => {
    if (!activeSearchMessageId) return;
    const node = messageRefMap.current.get(activeSearchMessageId);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeSearchMessageId]);

  // Show loading while persistence is in-flight or session bootstrap has not completed yet.
  const isInitialSessionLoad =
    Boolean(activeSessionId) &&
    !hasLoaded &&
    !sessionError &&
    !isStreaming &&
    !activeTurnId;

  if (messages.length === 0 && optimisticFirstMessage) {
    const optimisticMessage: Message = {
      id: `optimistic-first-${optimisticFirstMessage.createdAt}`,
      role: 'user',
      content: optimisticFirstMessage.content || 'Working on your request...',
      createdAt: optimisticFirstMessage.createdAt,
    };

    return (
      <div className="relative h-full min-h-0">
        <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="mx-3 md:mx-8 lg:mx-10 py-3 px-0 space-y-2">
            <div className="message-turn-container">
              <MessageBubble message={optimisticMessage} showCopyAction={false} />
              <div className="mt-2 flex items-center justify-end gap-1.5 pr-8 text-[11px] text-white/55">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#93C5FD]" />
                <span>Starting session…</span>
              </div>
            </div>
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    );
  }

  if ((isLoadingMessages || isInitialSessionLoad) && messages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <BrandMark className="w-10 h-10 animate-pulse" />
          <p className="text-sm text-white/50">Loading conversation…</p>
        </div>
      </div>
    );
  }

  // Show empty state when no messages and no active session
  if (messages.length === 0 && !isStreaming && !isLoadingMessages) {
    return <EmptyState />;
  }

  const messageById = new Map(messages.map((message) => [message.id, message]));

  const assistantMessageIds = new Set<string>();
  Object.values(turnActivities || {}).forEach((activities) => {
    activities.forEach((activity) => {
      if (activity.type === 'assistant' && activity.messageId) {
        assistantMessageIds.add(activity.messageId);
      }
    });
  });

  const renderTurnActivities = (turnId: string) => {
    const activities = turnActivities?.[turnId] ?? [];
    const hasRunningTool = [...toolMap.values()].some((t) => t.status === 'running');
    const hasAssistantInTurn = activities.some((activity) => activity.type === 'assistant');
    const showThinking =
      isStreaming && activeTurnId === turnId && (thinkingContent || (!hasAssistantInTurn && !hasRunningTool));
    if (activities.length === 0 && !showThinking) {
      return null;
    }

    return (
      <div className="mt-2 flex items-start gap-2 assistant-turn-block">
        <motion.div
          initial={{ scale: 0.84, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="assistant-turn-avatar mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-[#111218] border border-white/[0.08] flex items-center justify-center"
        >
          <BrandMark className="w-[18px] h-[18px]" />
        </motion.div>

        <div className="assistant-turn-content flex-1 min-w-0 space-y-2 turn-activities">
          {activities.map((activity) => {
            if (activity.type === 'thinking') {
              // Don't render thinking from activities - we'll render it dynamically at the end
              return null;
            }

            if (activity.type === 'tool') {
              if (!activity.toolId) return null;
              const tool = toolMap.get(activity.toolId);
              if (!tool) return null;
              return <ToolActivityRow key={activity.id} tool={tool} isActive={tool.status === 'running'} />;
            }

            if (activity.type === 'media') {
              if (!activity.mediaItems || activity.mediaItems.length === 0) return null;
              return (
                <MediaActivityRow
                  key={activity.id}
                  items={activity.mediaItems}
                  onOpen={(artifact) => setPreviewArtifact(artifact)}
                />
              );
            }

            if (activity.type === 'report') {
              if (!activity.report) return null;
              return (
                <ReportActivityRow
                  key={activity.id}
                  report={activity.report}
                  artifacts={artifacts}
                  onOpen={(artifact) => setPreviewArtifact(artifact)}
                />
              );
            }

            if (activity.type === 'design') {
              if (!activity.design) return null;
              return (
                <DesignActivityRow
                  key={activity.id}
                  design={activity.design}
                  onOpen={(artifact) => setPreviewArtifact(artifact)}
                />
              );
            }

            if (activity.type === 'permission') {
              const permission = pendingPermissions.find((p) => p.id === activity.permissionId);
              if (!permission) return null;
              return (
                <PermissionInlineCard
                  key={activity.id}
                  request={permission}
                  onDecision={(decision) => {
                    respondToPermission(permission.sessionId, permission.id, decision);
                  }}
                />
              );
            }

            if (activity.type === 'question') {
              const question = pendingQuestions.find((q) => q.id === activity.questionId);
              if (!question) return null;
              return (
                <AskUserQuestion
                  key={activity.id}
                  question={question}
                  onAnswer={(questionId, answer) => {
                    respondToQuestion(question.sessionId, questionId, answer);
                  }}
                />
              );
            }

            if (activity.type === 'assistant') {
              if (!activity.messageId) return null;
              const message = messageById.get(activity.messageId);
              if (!message) return null;
              return (
                <div
                  key={activity.id}
                  ref={(node) => registerMessageRef(message.id, node)}
                  className={cn(
                    'rounded-xl transition-colors',
                    matchingMessageIdSet.has(message.id) && 'ring-1 ring-[#1D4ED8]/40 bg-[#1D4ED8]/[0.04]',
                    activeSearchMessageId === message.id && 'ring-2 ring-[#1D4ED8]/70 bg-[#1D4ED8]/[0.09]'
                  )}
                >
                  <MessageBubble
                    message={message}
                    showAvatar={false}
                    showCopyAction={finalAssistantMessageIds.has(message.id)}
                  />
                </div>
              );
            }

            return null;
          })}

          {/* Show thinking block when there's thinking content or when waiting for the first assistant item */}
          {showThinking && (
            <ThinkingBlock content={thinkingContent} isActive={isThinking || (!hasAssistantInTurn && !hasRunningTool)} />
          )}
        </div>

      </div>
    );
  };

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollRef}
        className="h-full min-h-0 overflow-y-auto overflow-x-hidden scroll-smooth"
      >
        <div className="mx-3 md:mx-8 lg:mx-10 py-3 px-0 space-y-2">
          <div className="sticky top-0 z-20 pb-1">
            <div className="rounded-xl border border-white/[0.08] bg-[#0E1017]/85 backdrop-blur-sm px-2.5 py-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35 pointer-events-none" />
                  <input
                    type="text"
                    value={messageSearchQuery}
                    onChange={(event) => setMessageSearchQuery(event.target.value)}
                    placeholder="Search loaded messages..."
                    className={cn(
                      'w-full h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] pl-8 pr-2 text-xs text-white/85',
                      'placeholder:text-white/35',
                      'focus:outline-none focus:border-white/[0.18] focus:bg-white/[0.05]'
                    )}
                  />
                </div>
                {normalizedSearchQuery && (
                  <>
                    <span className="text-[11px] text-white/55 tabular-nums min-w-[60px] text-right">
                      {matchingMessageIds.length === 0
                        ? '0 matches'
                        : `${Math.min(activeSearchResultIndex + 1, matchingMessageIds.length)}/${matchingMessageIds.length}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveSearchResultIndex((current) =>
                          matchingMessageIds.length === 0
                            ? 0
                            : (current - 1 + matchingMessageIds.length) % matchingMessageIds.length
                        )
                      }
                      disabled={matchingMessageIds.length === 0}
                      className="h-8 px-2 rounded-lg border border-white/[0.10] text-xs text-white/70 hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveSearchResultIndex((current) =>
                          matchingMessageIds.length === 0 ? 0 : (current + 1) % matchingMessageIds.length
                        )
                      }
                      disabled={matchingMessageIds.length === 0}
                      className="h-8 px-2 rounded-lg border border-white/[0.10] text-xs text-white/70 hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {hasMoreHistory && (
            <div className="flex items-center justify-center">
              <button
                type="button"
                disabled={isLoadingMessages || !activeSessionId}
                onClick={() => {
                  if (!activeSessionId) return;
                  void loadOlderMessages(activeSessionId, 200);
                }}
                className={cn(
                  'h-8 px-3 rounded-full border border-white/[0.12] bg-white/[0.03] text-xs text-white/75 transition-colors',
                  'hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isLoadingMessages ? 'Loading older messages…' : 'Load older messages'}
              </button>
            </div>
          )}

          {messages.map((message, index) => {
            // Assistant messages with turn activities are rendered inside the activity block.
            if (message.role === 'assistant' && assistantMessageIds.has(message.id)) {
              return null;
            }

            const messageKey = message.role === 'user'
              ? `user-turn-${message.createdAt}-${index}`
              : message.id;

            return (
              <div
                key={messageKey}
                ref={(node) => registerMessageRef(message.id, node)}
                className={cn(
                  'message-turn-container rounded-xl transition-colors',
                  matchingMessageIdSet.has(message.id) && 'ring-1 ring-[#1D4ED8]/40 bg-[#1D4ED8]/[0.04]',
                  activeSearchMessageId === message.id && 'ring-2 ring-[#1D4ED8]/70 bg-[#1D4ED8]/[0.09]'
                )}
              >
                <MessageBubble
                  message={message}
                  showCopyAction={
                    message.role !== 'assistant'
                    || !assistantMessageIds.has(message.id)
                    || finalAssistantMessageIds.has(message.id)
                  }
                />
                {message.role === 'user' && renderTurnActivities(message.id)}
              </div>
            );
          })}
          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Scroll fade overlays */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[#0B0C10] to-transparent z-10" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#0B0C10] to-transparent z-10" />

      <AnimatePresence initial={false}>
        {hasManualScroll && (
          <motion.button
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.92 }}
            transition={{ duration: 0.18 }}
            onClick={() => {
              scrollToBottom('smooth');
              setHasManualScroll(false);
            }}
            className="scroll-to-bottom-fab absolute left-1/2 -translate-x-1/2 bottom-5 z-20 h-10 w-10 rounded-full flex items-center justify-center text-white/90"
            aria-label="Scroll to latest message"
            title="Scroll to latest message"
          >
            <ArrowDown className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyState() {
  const suggestions = [
    { icon: Code, text: 'Help me refactor this function' },
    { icon: Sparkles, text: 'Explain this error message' },
    { icon: Code, text: 'Write unit tests for my code' },
    { icon: Sparkles, text: 'Review my pull request' },
  ];

  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        <div className="relative w-16 h-16 rounded-2xl bg-[#111218] flex items-center justify-center border border-white/[0.08]">
          <BrandMark className="w-10 h-10" />
        </div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="text-xl font-semibold text-white/90 mb-2 mt-6"
      >
        Welcome to Cowork
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="text-white/50 max-w-md mb-8"
      >
        I'm your AI coding assistant. I can help you write code, debug issues,
        explain concepts, and much more.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md"
      >
        {suggestions.map((suggestion, index) => (
          <motion.button
            key={index}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl',
              'bg-white/[0.04] border border-white/[0.08]',
              'text-left text-sm text-white/70',
              'hover:bg-white/[0.08] hover:border-white/[0.12]',
              'transition-all duration-200'
            )}
          >
            <div className="w-8 h-8 rounded-lg bg-[#1D4ED8]/10 flex items-center justify-center">
              <suggestion.icon className="w-4 h-4 text-[#93C5FD]" />
            </div>
            <span>{suggestion.text}</span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  showCopyAction?: boolean;
  showAvatar?: boolean;
}

interface PermissionInlineCardProps {
  request: ExtendedPermissionRequest;
  onDecision: (decision: 'allow' | 'deny' | 'allow_once' | 'allow_session') => void;
}

function PermissionInlineCard({ request, onDecision }: PermissionInlineCardProps) {
  const { rightPanelPinned, rightPanelCollapsed, toggleRightPanelPinned, toggleRightPanel } = useSettingsStore();
  const riskLevel = request.riskLevel || 'medium';
  const riskIcon = riskLevel === 'high' ? ShieldAlert : Shield;
  const RiskIcon = riskIcon;
  const toolMeta = request.toolName ? getToolMeta(request.toolName) : null;

  const typeLabel = request.type.startsWith('file_')
    ? 'File access'
    : request.type === 'shell_execute'
      ? 'Command execution'
      : request.type === 'network_request'
        ? 'Network request'
        : 'Permission request';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('rounded-xl border p-3', 'bg-[#111218] border-white/[0.08]')}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'p-2 rounded-lg',
            riskLevel === 'high' ? 'bg-[#FF5449]/10' : 'bg-[#1D4ED8]/10'
          )}
        >
          <RiskIcon
            className={cn(
              'w-4 h-4',
              riskLevel === 'high' ? 'text-[#FF5449]' : 'text-[#93C5FD]'
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {toolMeta ? (
              <>
                <span className="text-[11px] uppercase tracking-wide text-white/40">
                  {toolMeta.category}
                </span>
                <span className="text-white/20">•</span>
                <span className="text-sm font-medium text-white/90">{toolMeta.title}</span>
              </>
            ) : (
              <span className="text-sm font-medium text-white/90">{typeLabel}</span>
            )}
            <span
              className={cn(
                'text-[11px] px-2 py-0.5 rounded-full',
                riskLevel === 'high'
                  ? 'bg-[#FF5449]/15 text-[#FF5449]'
                  : 'bg-white/[0.06] text-white/50'
              )}
            >
              {riskLevel === 'high' ? 'High risk' : riskLevel === 'low' ? 'Low risk' : 'Review'}
            </span>
          </div>
          <button
            onClick={() => {
              if (!rightPanelPinned) toggleRightPanelPinned();
              if (rightPanelCollapsed) toggleRightPanel();
            }}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white/80"
          >
            Details
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <div className="mt-2 text-xs text-white/40">Resource</div>
          <div className="mt-1 text-xs text-white/80 font-mono break-all bg-[#0B0C10] border border-white/[0.06] rounded-lg px-2 py-1">
            {request.resource}
          </div>

          {request.reason && (
            <div className="mt-2 text-xs text-white/50">{request.reason}</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={() => onDecision('deny')}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[#FF5449] bg-[#FF5449]/10 border border-[#FF5449]/20 hover:bg-[#FF5449]/20"
        >
          <XCircle className="w-3.5 h-3.5" />
          Deny
        </button>
        <button
          onClick={() => onDecision('allow_once')}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-white/80 bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.10]"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Allow once
        </button>
        <button
          onClick={() => onDecision('allow_session')}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-white bg-[#1D4ED8] hover:bg-[#1E40AF]"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Allow session
        </button>
      </div>
    </motion.div>
  );
}

function formatObject(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateText(text: string, max = 2000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function extractFileEntries(result: unknown): Array<{ name: string; path?: string; isDir?: boolean; size?: number }> {
  if (!result) return [];
  if (Array.isArray(result)) {
    const entries: Array<{ name: string; path?: string; isDir?: boolean; size?: number }> = [];
    for (const entry of result) {
      if (typeof entry === 'string') {
        entries.push({ name: entry, path: entry });
        continue;
      }
      if (entry && typeof entry === 'object') {
        const entryAny = entry as {
          name?: string;
          path?: string;
          is_dir?: boolean;
          isDir?: boolean;
          size?: number;
        };
        entries.push({
          name: entryAny.name || entryAny.path || 'item',
          path: entryAny.path,
          isDir: entryAny.is_dir ?? entryAny.isDir,
          size: entryAny.size,
        });
      }
    }
    return entries;
  }

  if (typeof result === 'object') {
    const resultAny = result as {
      files?: unknown;
      entries?: unknown;
      items?: unknown;
    };
    const list = resultAny.files ?? resultAny.entries ?? resultAny.items;
    if (Array.isArray(list)) {
      return extractFileEntries(list);
    }
  }

  if (typeof result === 'string') {
    return result
      .split('\n')
      .filter(Boolean)
      .map((line) => ({ name: line.trim(), path: line.trim() }));
  }

  return [];
}

function extractSearchMatches(result: unknown): Array<{ path: string; line?: number; text?: string }> {
  if (!result) return [];
  if (Array.isArray(result)) {
    const matches: Array<{ path: string; line?: number; text?: string }> = [];
    for (const entry of result) {
      if (!entry || typeof entry !== 'object') continue;
      const entryAny = entry as { path?: string; file?: string; line?: number; text?: string; match?: string };
      const path = entryAny.path || entryAny.file;
      if (!path) continue;
      matches.push({
        path,
        line: entryAny.line,
        text: entryAny.text || entryAny.match,
      });
    }
    return matches;
  }

  if (typeof result === 'object') {
    const resultAny = result as { matches?: unknown; results?: unknown; items?: unknown };
    const list = resultAny.matches ?? resultAny.results ?? resultAny.items;
    if (Array.isArray(list)) {
      return extractSearchMatches(list);
    }
  }

  return [];
}

function extractHttpPayload(result: unknown): { status?: string; body?: string } {
  if (!result) return {};
  if (typeof result === 'string') {
    return { body: result };
  }
  if (typeof result === 'object') {
    const resultAny = result as Record<string, unknown>;
    const status =
      (typeof resultAny.status === 'string' ? resultAny.status : undefined) ??
      (typeof resultAny.statusCode === 'number' ? `HTTP ${resultAny.statusCode}` : undefined) ??
      (typeof resultAny.code === 'number' ? `HTTP ${resultAny.code}` : undefined) ??
      (typeof resultAny.ok === 'boolean' ? (resultAny.ok ? 'OK' : 'Error') : undefined);
    const body =
      (typeof resultAny.body === 'string' ? resultAny.body : undefined) ??
      (typeof resultAny.text === 'string' ? resultAny.text : undefined) ??
      (typeof resultAny.data === 'string' ? resultAny.data : undefined) ??
      (typeof resultAny.response === 'string' ? resultAny.response : undefined);
    return { status, body };
  }
  return {};
}

function getToolKind(
  name: string
): 'command' | 'file_edit' | 'file_write' | 'file_read' | 'file_list' | 'file_search' | 'web_search' | 'http' | 'media' | 'research' | 'design' | 'todos' | 'task' | 'other' {
  const lower = name.toLowerCase();
  // Task/subagent detection - check first
  if (lower === 'task' || lower.includes('spawn_task') || lower.includes('subagent')) {
    return 'task';
  }
  if (lower.includes('write_todos') || lower.includes('todo')) {
    return 'todos';
  }
  if (lower.includes('google_grounded_search') || lower.includes('grounded')) {
    return 'web_search';
  }
  if (lower.includes('generate_image') || lower.includes('edit_image') || lower.includes('generate_video')) {
    return 'media';
  }
  if (lower.includes('deep_research')) {
    return 'research';
  }
  if (lower.includes('stitch') || lower.startsWith('mcp_')) {
    return 'design';
  }
  if (lower.includes('execute') || lower.includes('bash') || lower.includes('shell') || lower.includes('command')) {
    return 'command';
  }
  if (lower.includes('edit_file')) return 'file_edit';
  if (lower.includes('write_file')) return 'file_write';
  if (lower.includes('read_file') || lower === 'read') return 'file_read';
  if (lower.includes('list_directory') || lower === 'ls') return 'file_list';
  if (lower.includes('glob') || lower.includes('grep') || lower.includes('search_files')) return 'file_search';
  if (lower.includes('fetch') || lower.includes('http')) return 'http';
  return 'other';
}

function normalizeTodoStatus(value: unknown): 'pending' | 'in_progress' | 'completed' {
  const normalized = String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') return 'completed';
  if (normalized === 'in_progress') return 'in_progress';
  return 'pending';
}

function extractTodosFromArgs(args: Record<string, unknown>): Array<{ content: string; status: 'pending' | 'in_progress' | 'completed' }> | null {
  const raw = args.todos ?? args.todo ?? args.tasks;
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw
      .filter((todo): todo is { content: string; status?: string } => !!todo && typeof (todo as { content?: unknown }).content === 'string')
      .map((todo) => ({
        content: String((todo as { content: string }).content),
        status: normalizeTodoStatus((todo as { status?: string }).status),
      }));
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
          return parsed
            .filter((todo): todo is { content: string; status?: string } => !!todo && typeof (todo as { content?: unknown }).content === 'string')
            .map((todo) => ({
              content: String((todo as { content: string }).content),
              status: normalizeTodoStatus((todo as { status?: string }).status),
            }));
        }
    } catch {
      return null;
    }
  }

  return null;
}

function getArgValue(args: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!args) return null;
  for (const key of keys) {
    const value = args[key];
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
  }
  return null;
}

function isExternalCliToolName(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return (
    lower === 'start_codex_cli_run'
    || lower === 'start_claude_cli_run'
    || lower === 'external_cli_get_progress'
    || lower === 'external_cli_respond'
    || lower === 'external_cli_cancel_run'
  );
}

function extractToolErrorMessage(tool: ToolExecution): string | null {
  if (tool.error && tool.error.trim().length > 0) {
    return tool.error.trim();
  }

  if (!tool.result || typeof tool.result !== 'object') {
    return null;
  }

  const resultAny = tool.result as {
    error?: unknown;
    message?: unknown;
    errorMessage?: unknown;
    run?: { errorMessage?: unknown };
    summary?: { errorMessage?: unknown };
  };

  const direct =
    (typeof resultAny.error === 'string' && resultAny.error)
    || (typeof resultAny.errorMessage === 'string' && resultAny.errorMessage)
    || (typeof resultAny.message === 'string' && resultAny.message);
  if (direct && direct.trim().length > 0) return direct.trim();

  const nested =
    (typeof resultAny.run?.errorMessage === 'string' && resultAny.run.errorMessage)
    || (typeof resultAny.summary?.errorMessage === 'string' && resultAny.summary.errorMessage);
  if (nested && nested.trim().length > 0) return nested.trim();

  return null;
}

function countLines(input: string): number {
  if (!input) return 0;
  return input.split('\n').length;
}

function prefixLines(input: string, prefix: string): string[] {
  if (!input) return [];
  return input.split('\n').map((line) => `${prefix}${line}`);
}

function buildDiffFromEditArgs(args: Record<string, unknown>): string | null {
  const oldString = typeof args.old_string === 'string'
    ? args.old_string
    : typeof args.oldString === 'string'
      ? args.oldString
      : '';
  const newString = typeof args.new_string === 'string'
    ? args.new_string
    : typeof args.newString === 'string'
      ? args.newString
      : '';
  if (!oldString && !newString) return null;
  const lines = [
    ...prefixLines(oldString, '- '),
    ...prefixLines(newString, '+ '),
  ];
  return lines.join('\n');
}

function buildDiffFromWriteArgs(args: Record<string, unknown>): string | null {
  const content = typeof args.content === 'string' ? args.content : '';
  if (!content) return null;
  return prefixLines(content, '+ ').join('\n');
}

function getEditCounts(tool: ToolExecution): { added: number; removed: number } | null {
  const args = tool.args || {};
  const oldString = String(args.old_string ?? args.oldString ?? '');
  const newString = String(args.new_string ?? args.newString ?? '');
  if (!oldString && !newString) return null;

  const resultAny = tool.result as { occurrences?: number } | undefined;
  const occurrences = resultAny?.occurrences && Number.isFinite(Number(resultAny.occurrences))
    ? Number(resultAny.occurrences)
    : 1;

  const removed = countLines(oldString) * occurrences;
  const added = countLines(newString) * occurrences;
  return { added, removed };
}

function buildToolSummary(tool: ToolExecution, isActive?: boolean): React.ReactNode {
  const kind = getToolKind(tool.name);
  const args = tool.args || {};

  if (kind === 'command') {
    const command = getArgValue(args, ['command', 'cmd']) || 'command';
    return (
      <>
        <span className="text-[11px] text-white/55 flex-shrink-0">{tool.status === 'running' ? 'Running' : 'Ran'}</span>
        <span className={cn('ml-2 text-[11px] font-mono text-white/70', isActive && 'codex-shimmer-text')}>
          {command}
        </span>
      </>
    );
  }

  if (kind === 'file_edit') {
    const path = getArgValue(args, ['file_path', 'path']) || 'file';
    const counts = getEditCounts(tool);
    return (
      <>
        <span className="text-[11px] text-white/55">Edited</span>
        <span className={cn('ml-2 text-[11px] font-mono text-white/70 truncate max-w-[320px]', isActive && 'codex-shimmer-text')}>
          {path}
        </span>
        {counts && (
          <span className="ml-2 text-[10px] text-white/40">
            (+{counts.added} -{counts.removed})
          </span>
        )}
      </>
    );
  }

  if (kind === 'file_write') {
    const path = getArgValue(args, ['file_path', 'path']) || 'file';
    const content = String(args.content ?? '');
    const added = countLines(content);
    return (
      <>
        <span className="text-[11px] text-white/55">Created</span>
        <span className={cn('ml-2 text-[11px] font-mono text-white/70 truncate max-w-[320px]', isActive && 'codex-shimmer-text')}>
          {path}
        </span>
        {added > 0 && <span className="ml-2 text-[10px] text-white/40">(+{added})</span>}
      </>
    );
  }

  if (kind === 'file_read') {
    const path = getArgValue(args, ['file_path', 'path']) || 'file';
    return (
      <>
        <span className="text-[11px] text-white/55">Read</span>
        <span className={cn('ml-2 text-[11px] font-mono text-white/70 truncate max-w-[340px]', isActive && 'codex-shimmer-text')}>
          {path}
        </span>
      </>
    );
  }

  if (kind === 'file_list') {
    const path = getArgValue(args, ['path', 'directory', 'dir']) || '.';
    const entries = extractFileEntries(tool.result);
    return (
      <>
        <span className="text-[11px] text-white/55">Listed</span>
        <span className={cn('ml-2 text-[11px] font-mono text-white/70 truncate max-w-[340px]', isActive && 'codex-shimmer-text')}>
          {path}
        </span>
        {entries.length > 0 && (
          <span className="ml-2 text-[10px] text-white/40">{entries.length} items</span>
        )}
      </>
    );
  }

  if (kind === 'file_search') {
    const pattern = getArgValue(args, ['pattern', 'query', 'search']) || 'pattern';
    const path = getArgValue(args, ['path']) || '';
    const matches = extractSearchMatches(tool.result);
    return (
      <>
        <span className="text-[11px] text-white/55">Searched files</span>
        <span className={cn('ml-2 text-[11px] font-mono text-white/70 truncate max-w-[260px]', isActive && 'codex-shimmer-text')}>
          {pattern}
        </span>
        {path && <span className="ml-2 text-[10px] text-white/40">in {path}</span>}
        {matches.length > 0 && (
          <span className="ml-2 text-[10px] text-white/40">{matches.length} matches</span>
        )}
      </>
    );
  }

  if (kind === 'web_search') {
    const query = getArgValue(args, ['query']) || 'query';
    const resultAny = tool.result as {
      sources?: Array<{ title?: string; url?: string }>;
      results?: Array<{ title?: string; url?: string }>;
      items?: Array<{ title?: string; url?: string }>;
    } | undefined;
    const resultCount =
      resultAny?.sources?.length ??
      resultAny?.results?.length ??
      resultAny?.items?.length ??
      0;
    return (
      <>
        <span className="text-[11px] text-white/55">Searched the web —</span>
        <span className={cn('ml-2 text-[11px] text-white/70 truncate max-w-[340px]', isActive && 'codex-shimmer-text')}>
          {query}
        </span>
        {resultCount > 0 && (
          <span className="ml-2 text-[10px] text-white/40">{resultCount} results</span>
        )}
      </>
    );
  }

  if (kind === 'media') {
    const prompt = getArgValue(args, ['prompt']) || 'prompt';
    const label = tool.name.toLowerCase().includes('video') ? 'Generated video' : 'Generated image';
    return (
      <>
        <span className="text-[11px] text-white/55 flex-shrink-0">{label}</span>
        <span
          className={cn(
            'ml-2 text-[11px] text-white/70 truncate inline-block max-w-[280px] align-bottom',
            isActive && 'codex-shimmer-text'
          )}
          title={prompt}
        >
          {prompt}
        </span>
      </>
    );
  }

  if (kind === 'research') {
    const query = getArgValue(args, ['query', 'topic']) || 'topic';
    return (
      <>
        <span className="text-[11px] text-white/55 flex-shrink-0">Researched</span>
        <span
          className={cn(
            'ml-2 text-[11px] text-white/70 truncate inline-block max-w-[280px] align-bottom',
            isActive && 'codex-shimmer-text'
          )}
          title={query}
        >
          {query}
        </span>
      </>
    );
  }

  if (kind === 'design') {
    const prompt = getArgValue(args, ['prompt', 'query', 'title', 'name']) || tool.name;
    return (
      <>
        <span className="text-[11px] text-white/55 flex-shrink-0">Designed</span>
        <span
          className={cn(
            'ml-2 text-[11px] text-white/70 truncate inline-block max-w-[280px] align-bottom',
            isActive && 'codex-shimmer-text'
          )}
          title={prompt}
        >
          {prompt}
        </span>
      </>
    );
  }

  if (kind === 'todos') {
    const todos = extractTodosFromArgs(args) || [];
    const completed = todos.filter((t) => t.status === 'completed').length;
    const label = todos.length > 0
      ? `Updated todos (${completed}/${todos.length})`
      : 'Updated todos';
    return (
      <>
        <span className="text-[11px] text-white/55">{label}</span>
      </>
    );
  }

  if (kind === 'http') {
    const url = getArgValue(args, ['url', 'endpoint']) || 'url';
    return (
      <>
        <span className="text-[11px] text-white/55">Fetched</span>
        <span className={cn('ml-2 text-[11px] font-mono text-white/70 truncate max-w-[340px]', isActive && 'codex-shimmer-text')}>
          {url}
        </span>
      </>
    );
  }

  const primary = getArgValue(args, ['path', 'command', 'query', 'url', 'file', 'pattern']);
  return (
    <>
      <span className="text-[11px] text-white/55">{tool.name}</span>
      {primary && (
        <span className={cn('ml-2 text-[11px] font-mono text-white/70 truncate max-w-[340px]', isActive && 'codex-shimmer-text')}>
          {primary}
        </span>
      )}
    </>
  );
}

function buildToolDetailSections(tool: ToolExecution): Array<{ title: string; content: React.ReactNode }> {
  const kind = getToolKind(tool.name);
  const args = tool.args || {};
  const sections: Array<{ title: string; content: React.ReactNode }> = [];
  const renderCode = (code: string, language: string, maxHeight = 220) => (
    <CodeBlock
      code={code}
      language={language}
      showLineNumbers={false}
      collapsible={false}
      showHeader={false}
      maxHeight={maxHeight}
      className="rounded-md border border-white/[0.06] bg-[#0A0B0F]"
    />
  );

  if (kind === 'command') {
    const command = getArgValue(args, ['command', 'cmd']) || '';
    if (command) {
      sections.push({
        title: 'Command',
        content: renderCode(command, 'bash'),
      });
    }
    const resultAny = tool.result as { output?: string; exitCode?: number | null } | undefined;
    const output = resultAny?.output ?? (typeof tool.result === 'string' ? tool.result : '');
    if (output) {
      sections.push({
        title: 'Output',
        content: renderCode(String(output), 'bash'),
      });
    }
    if (resultAny?.exitCode !== undefined && resultAny?.exitCode !== null) {
      sections.push({
        title: 'Exit Code',
        content: <div className="text-[11px] text-white/60">Exit {resultAny.exitCode}</div>,
      });
    }
    return sections;
  }

  if (kind === 'file_read') {
    const path = getArgValue(args, ['file_path', 'path']) || '';
    if (path) {
      sections.push({
        title: 'File',
        content: <div className="text-[11px] font-mono text-white/70 break-all">{path}</div>,
      });
    }
    const preview = typeof tool.result === 'string' ? tool.result : formatObject(tool.result);
    if (preview) {
      sections.push({
        title: 'Preview',
        content: renderCode(truncateText(preview, 2400), 'text'),
      });
    }
    return sections;
  }

  if (kind === 'file_write') {
    const path = getArgValue(args, ['file_path', 'path']) || '';
    if (path) {
      sections.push({
        title: 'File',
        content: <div className="text-[11px] font-mono text-white/70 break-all">{path}</div>,
      });
    }
    const diff = buildDiffFromWriteArgs(args);
    if (diff) {
      sections.push({
        title: 'Changes',
        content: renderCode(truncateText(diff, 2400), 'diff'),
      });
    }
    return sections;
  }

  if (kind === 'file_edit') {
    const path = getArgValue(args, ['file_path', 'path']) || '';
    const counts = getEditCounts(tool);
    if (path) {
      sections.push({
        title: 'File',
        content: <div className="text-[11px] font-mono text-white/70 break-all">{path}</div>,
      });
    }
    if (counts) {
      sections.push({
        title: 'Changes',
        content: (
          <div className="text-[11px] text-white/60">
            +{counts.added} −{counts.removed}
          </div>
        ),
      });
    }
    const diff = buildDiffFromEditArgs(args);
    if (diff) {
      sections.push({
        title: 'Diff',
        content: renderCode(truncateText(diff, 2400), 'diff'),
      });
    }
    return sections;
  }

  if (kind === 'file_list') {
    const path = getArgValue(args, ['path', 'directory', 'dir']) || '.';
    const entries = extractFileEntries(tool.result);
    sections.push({
      title: 'Directory',
      content: <div className="text-[11px] font-mono text-white/70 break-all">{path}</div>,
    });
    if (entries.length) {
      const shown = entries.slice(0, 24);
      const listText = shown.map((entry) => entry.name).join('\n');
      sections.push({
        title: `Items (${entries.length})`,
        content: renderCode(listText, 'text'),
      });
    }
    return sections;
  }

  if (kind === 'file_search') {
    const pattern = getArgValue(args, ['pattern', 'query', 'search']) || 'pattern';
    const path = getArgValue(args, ['path']) || '';
    const matches = extractSearchMatches(tool.result);
    sections.push({
      title: 'Query',
      content: (
        <div className="text-[11px] text-white/70">
          <span className="font-mono">{pattern}</span>
          {path && <span className="ml-2 text-white/40">in {path}</span>}
        </div>
      ),
    });
    if (matches.length) {
      const shown = matches.slice(0, 20);
      const matchText = shown
        .map((match) => `${match.path}${match.line ? `:${match.line}` : ''}${match.text ? `\n  ${match.text}` : ''}`)
        .join('\n');
      sections.push({
        title: `Matches (${matches.length})`,
        content: renderCode(matchText, 'text'),
      });
    }
    return sections;
  }

  if (kind === 'web_search') {
    const resultAny = tool.result as {
      summary?: string;
      sources?: Array<{ title?: string; url?: string; snippet?: string }>;
      results?: Array<{ title?: string; url?: string; snippet?: string }>;
      items?: Array<{ title?: string; url?: string; snippet?: string }>;
      searchQueries?: string[];
    } | undefined;
    const results =
      resultAny?.sources ??
      resultAny?.results ??
      resultAny?.items ??
      [];
    if (results.length) {
      sections.push({
        title: 'Results',
        content: (
          <ul className="space-y-1">
            {results.map((source, index) => {
              const url = source.url || '';
              const title = source.title || url;
              const snippet = source.snippet;
              return (
                <li key={`${url}-${index}`} className="text-[11px]">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#93C5FD] hover:text-[#DBEAFE] underline"
                    >
                      {title}
                    </a>
                  ) : (
                    <span className="text-white/70">{title}</span>
                  )}
                  {url && (
                    <div className="text-[10px] text-white/35 truncate">{url}</div>
                  )}
                  {snippet && (
                    <div className="text-[10px] text-white/55 mt-0.5 line-clamp-2">
                      {snippet}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ),
      });
    }
    return sections;
  }

  if (kind === 'http') {
    const url = getArgValue(args, ['url', 'endpoint']) || '';
    const payload = extractHttpPayload(tool.result);
    if (url) {
      sections.push({
        title: 'Request',
        content: <div className="text-[11px] font-mono text-white/70 break-all">{url}</div>,
      });
    }
    if (payload.status) {
      sections.push({
        title: 'Status',
        content: <div className="text-[11px] text-white/60">{payload.status}</div>,
      });
    }
    if (payload.body) {
      sections.push({
        title: 'Body',
        content: renderCode(truncateText(payload.body, 2400), 'text'),
      });
    }
    return sections;
  }

  if (kind === 'media') {
    const prompt = getArgValue(args, ['prompt']);
    if (prompt) {
      sections.push({
        title: 'Prompt',
        content: <div className="text-[12px] text-white/70 leading-snug whitespace-pre-wrap">{prompt}</div>,
      });
    }
    const model = getArgValue(args, ['model']);
    if (model) {
      sections.push({
        title: 'Model',
        content: <div className="text-[11px] text-white/60">{model}</div>,
      });
    }
    return sections;
  }

  if (kind === 'todos') {
    const todos = extractTodosFromArgs(args);
    if (todos && todos.length > 0) {
      sections.push({
        title: 'Todos',
        content: (
          <div className="space-y-1">
            {todos.map((todo, index) => {
              const status = todo.status;
              const Icon = status === 'completed' ? CheckCircle2 : status === 'in_progress' ? Loader2 : Circle;
              return (
                <div key={`${todo.content}-${index}`} className="flex items-start gap-2 text-[11px]">
                  <Icon
                    className={cn(
                      'w-3.5 h-3.5 mt-[2px]',
                      status === 'completed'
                        ? 'text-[#7FD29A]'
                        : status === 'in_progress'
                          ? 'text-[#93C5FD] animate-spin'
                          : 'text-white/30'
                    )}
                  />
                  <span
                    className={cn(
                      'text-white/70',
                      status === 'completed' && 'line-through text-white/40'
                    )}
                  >
                    {todo.content}
                  </span>
                </div>
              );
            })}
          </div>
        ),
      });
    }
    return sections;
  }

  if (kind === 'research') {
    const resultAny = tool.result as {
      report?: string;
      citations?: Array<{ title?: string; url?: string }>;
      searchQueries?: string[];
      reportPath?: string;
    } | undefined;
    if (resultAny?.reportPath) {
      sections.push({
        title: 'Report',
        content: <div className="text-[11px] font-mono text-white/60 break-all">{resultAny.reportPath}</div>,
      });
    }
    return sections;
  }

  if (kind === 'design') {
    const previewUrl = (tool.result as { previewUrl?: string } | undefined)?.previewUrl;
    if (previewUrl) {
      sections.push({
        title: 'Preview',
        content: (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[#93C5FD] hover:text-[#DBEAFE] underline text-[11px]"
          >
            {previewUrl}
          </a>
        ),
      });
    }
    const formattedArgs = formatObject(args);
    if (formattedArgs && formattedArgs !== '{}') {
      sections.push({
        title: 'Arguments',
        content: renderCode(formattedArgs, 'json'),
      });
    }
    return sections;
  }

  if (kind === 'other') {
    const formattedArgs = formatObject(args);
    if (formattedArgs && formattedArgs !== '{}') {
      sections.push({
        title: 'Arguments',
        content: renderCode(formattedArgs, 'json'),
      });
    }
    if (tool.result !== undefined) {
      sections.push({
        title: 'Result',
        content: renderCode(formatObject(tool.result), 'json'),
      });
    }
  }

  return sections;
}

function ToolActivityRow({
  tool,
  isActive,
}: {
  tool: ToolExecution;
  isActive?: boolean;
}) {
  if (isExternalCliToolName(tool.name)) {
    return (
      <ToolExecutionCard
        execution={tool}
        isActive={isActive}
        className="tool-activity-card"
      />
    );
  }

  const [expanded, setExpanded] = useState(false);
  const meta = getToolMeta(tool.name);
  const kind = getToolKind(tool.name);
  const ToolIcon = meta?.icon;
  const errorMessage = extractToolErrorMessage(tool);

  // Use TaskToolCard for task/subagent tools
  if (kind === 'task') {
    return <TaskToolCard execution={tool} isActive={isActive} />;
  }

  const statusLabel =
    tool.status === 'running'
      ? 'Running'
      : tool.status === 'pending'
        ? 'Queued'
        : tool.status === 'error'
          ? 'Error'
          : 'Success';

  const sections = buildToolDetailSections(tool);
  const hasDetails = sections.length > 0;

  return (
    <div className="space-y-1 tool-selectable">
      <button
        onClick={() => hasDetails && setExpanded((prev) => !prev)}
        className={cn(
          'w-full flex items-center gap-2 text-left',
          'codex-tool-row border-b border-white/[0.05]',
          'transition-colors',
          isActive ? 'text-white/90' : 'text-white/70 hover:text-white/85'
        )}
      >
        <span className="flex-shrink-0 w-5 h-5 rounded-md border border-white/[0.1] bg-white/[0.04] flex items-center justify-center">
          {tool.status === 'running' ? (
            <Loader2 className="w-3 h-3 text-[#93C5FD] animate-spin" />
          ) : ToolIcon ? (
            <ToolIcon
              className={cn(
                'w-3 h-3',
                tool.status === 'error'
                  ? 'text-[#FCA5A5]'
                  : tool.status === 'success'
                    ? 'text-[#86EFAC]'
                    : 'text-white/55'
              )}
            />
          ) : (
            <Code className="w-3 h-3 text-white/55" />
          )}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-white/35">
          {meta?.category ?? 'Tool'}
        </span>
        <span className="text-white/20">•</span>
        <span className="text-[12px] font-medium text-white/80">
          {meta?.title ?? tool.name}
        </span>
        <span className="text-white/20">•</span>
        <span className="flex-1 min-w-0 overflow-hidden truncate">{buildToolSummary(tool, isActive)}</span>
        <span className="flex-shrink-0 ml-auto text-[10px] text-white/45">
          {statusLabel}
        </span>
        {hasDetails && (
          <ChevronDown
            className={cn(
              'w-4 h-4 text-white/40 transition-transform',
              expanded && 'rotate-180'
            )}
          />
        )}
      </button>

      {tool.status === 'error' && errorMessage && (
        <div className="mx-1 rounded-lg border border-[#FF5449]/25 bg-[#FF5449]/10 px-2.5 py-1.5 text-[11px] text-[#FECACA] break-words">
          {errorMessage}
        </div>
      )}

      <AnimatePresence initial={false}>
        {expanded && sections.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="pl-3 py-1 border-l border-white/[0.08]"
          >
            {sections.map((section, index) => (
              <div key={`${section.title}-${index}`} className={index > 0 ? 'mt-2' : ''}>
                <div className="text-[10px] uppercase tracking-wide text-white/35">{section.title}</div>
                <div className="mt-1">{section.content}</div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getExtensionFromMime(mimeType?: string, fallback = 'bin') {
  if (!mimeType) return fallback;
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mov')) return 'mov';
  return fallback;
}

function buildMediaArtifact(item: MediaActivityItem, index: number): Artifact {
  const extension = getExtensionFromMime(item.mimeType, item.kind === 'image' ? 'png' : 'mp4');
  const fallbackName = `media-${index}.${extension}`;
  const path = item.path || fallbackName;
  return {
    id: `media-${Date.now()}-${index}`,
    path,
    url: item.url,
    type: 'created',
    timestamp: Date.now(),
  };
}

function MediaActivityRow({
  items,
  onOpen,
}: {
  items: MediaActivityItem[];
  onOpen: (artifact: Artifact) => void;
}) {
  const getSrc = (item: MediaActivityItem) => {
    // For images: prefer base64 data (most reliable), then URL, then file path
    // For videos: prefer file path/URL (base64 would be too large)
    if (item.kind === 'image') {
      if (item.data) {
        const mime = item.mimeType || 'image/png';
        return `data:${mime};base64,${item.data}`;
      }
      if (item.url) return item.url;
      if (item.path) return convertFileSrc(item.path);
    } else {
      // Videos - don't use base64
      if (item.path) return convertFileSrc(item.path);
      if (item.url) return item.url;
    }
    return '';
  };

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {items.map((item, index) => {
          const src = getSrc(item);
          if (!src) return null;

          if (item.kind === 'video') {
            return (
              <div key={`${src}-${index}`} className="relative">
                <video
                  src={src}
                  controls
                  className="w-full rounded-md bg-black"
                />
                <button
                  onClick={() => onOpen(buildMediaArtifact(item, index))}
                  className="absolute top-2 right-2 px-2 py-1 rounded-md text-[11px] bg-black/70 text-white/80 hover:bg-black/90"
                >
                  Open
                </button>
              </div>
            );
          }

          return (
            <button
              key={`${src}-${index}`}
              onClick={() => onOpen(buildMediaArtifact(item, index))}
              className="group relative rounded-md overflow-hidden bg-black/20"
            >
              <img src={src} alt="Generated" className="w-full h-auto object-contain" />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20" />
              <div className="absolute top-2 right-2 px-2 py-1 rounded-md text-[11px] bg-black/70 text-white/80 border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity">
                Open
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReportActivityRow({
  report,
  artifacts,
  onOpen,
}: {
  report: ReportActivityItem;
  artifacts: Artifact[];
  onOpen: (artifact: Artifact) => void;
}) {
  const handleOpen = async () => {
    if (!report.path) return;
    const existing = artifacts.find((artifact) => artifact.path === report.path);
    if (existing) {
      onOpen(existing);
      return;
    }

    try {
      const content = await invoke<string>('read_file', { path: report.path });
      onOpen({
        id: `report-${Date.now()}`,
        path: report.path,
        content,
        type: 'created',
        timestamp: Date.now(),
      });
    } catch {
      // fallback: open empty preview if read fails
      onOpen({
        id: `report-${Date.now()}`,
        path: report.path,
        content: report.snippet || '',
        type: 'created',
        timestamp: Date.now(),
      });
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-1">
        <div className="min-w-0">
          <div className="text-[12px] text-white/80 font-medium">{report.title || 'Deep research report'}</div>
        </div>
        <button
          onClick={handleOpen}
          className="px-2.5 py-1 rounded-md text-[11px] bg-white/[0.06] text-white/70 hover:bg-white/[0.10]"
        >
          Open
        </button>
    </div>
  );
}

function DesignActivityRow({
  design,
  onOpen,
}: {
  design: DesignActivityItem;
  onOpen: (artifact: Artifact) => void;
}) {
  const handleOpen = () => {
    const preview = design.preview;
    if (!preview) return;
    const name = preview.name || preview.path || 'design-preview.html';
    onOpen({
      id: `design-${Date.now()}`,
      path: name,
      content: preview.content,
      url: preview.url,
      type: 'created',
      timestamp: Date.now(),
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 py-1">
        <div className="text-[12px] text-white/80 font-medium">
          {design.title || 'Design preview'}
        </div>
        <button
          onClick={handleOpen}
          disabled={!design.preview}
          className={cn(
            'px-2.5 py-1 rounded-md text-[11px]',
            design.preview
              ? 'bg-white/[0.06] text-white/70 hover:bg-white/[0.10]'
              : 'bg-white/[0.03] text-white/30 cursor-not-allowed'
          )}
        >
          Open
        </button>
    </div>
  );
}

function MessageBubble({ message, showCopyAction = true, showAvatar = true }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const userName = useSettingsStore((state) => state.userName);
  const userInitial = (userName?.trim().charAt(0) || 'U').toUpperCase();
  const metadata = message.metadata as {
    sources?: Array<{ title?: string; url: string }>;
    searchQueries?: string[];
  } | undefined;
  const errorMetadata = message.metadata as ErrorMessageMetadata | undefined;

  const handleCopy = async () => {
    const textContent = typeof message.content === 'string'
      ? message.content
      : message.content
          .filter((p): p is Extract<MessageContentPart, { type: 'text' }> => p.type === 'text')
          .map((p) => p.text)
          .join('\n');

    await navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // System messages are rendered differently
  if (isSystem && errorMetadata?.kind === 'error') {
    return <ErrorMessageCard metadata={errorMetadata} />;
  }

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-white/40 max-w-lg text-center">
          {typeof message.content === 'string' ? message.content : 'System message'}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-2',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {showAvatar && (
        <div
          className={cn(
            'flex-shrink-0 flex items-center justify-center select-none',
            isUser
              ? 'w-6 h-6 rounded-full bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] border border-[#60A5FA]/35 text-[10px] font-bold text-white shadow-[0_6px_16px_rgba(29,78,216,0.35)]'
              : 'w-8 h-8 rounded-lg bg-[#111218] border border-white/[0.08]'
          )}
        >
          {isUser ? userInitial : <BrandMark className="w-[18px] h-[18px]" />}
        </div>
      )}

      {/* Content */}
      <div className={cn('flex-1 min-w-0', isUser && 'flex justify-end')}>
        <div
          className={cn(
            'rounded-xl message-content',
            isUser
              ? 'message-bubble-user inline-block max-w-[92%] bg-gradient-to-br from-[#1D4ED8]/22 via-[#1E40AF]/14 to-[#0B1228]/70 border border-[#60A5FA]/35 shadow-[0_10px_24px_rgba(30,64,175,0.25)] text-white/95'
              : 'message-bubble-assistant w-full max-w-full bg-transparent text-white/90'
          )}
        >
          {typeof message.content === 'string' ? (
            isUser ? (
              <div className="px-3 py-2 whitespace-pre-wrap text-[13px] leading-snug break-words select-text font-medium">{message.content}</div>
            ) : (
              <MarkdownContent content={message.content} />
            )
          ) : (
            <div className="space-y-2">
              {message.content.map((part, index) => (
                <ContentPartRenderer key={index} part={part} isUser={isUser} />
              ))}
            </div>
          )}
        </div>

        {!isUser && metadata?.sources?.length ? (
          <SourcesCitation
            sources={metadata.sources}
            searchQueries={metadata.searchQueries}
          />
        ) : null}

        {/* Actions */}
        {!isUser && showCopyAction && (
          <div className="flex items-center gap-2 mt-2 pl-1 select-none">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
              title="Copy message"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-[#50956A]" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-white/30" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorMessageCard({ metadata }: { metadata: ErrorMessageMetadata }) {
  const { activeSessionId } = useSessionStore();
  const sendMessage = useChatStore((state) => state.sendMessage);
  const lastUserMessage = useChatStore((state) => state.getSessionState(activeSessionId).lastUserMessage);
  const [remaining, setRemaining] = useState<number | null>(
    metadata.details?.retryAfterSeconds ? Math.ceil(metadata.details.retryAfterSeconds) : null
  );
  const isRateLimit = metadata.code === 'RATE_LIMIT';

  useEffect(() => {
    if (remaining === null || remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  const canRetry = !!lastUserMessage && (!remaining || remaining <= 0);
  const title = isRateLimit ? 'Rate limit exceeded' : 'Agent error';
  const description = isRateLimit
    ? `You hit the API request limit${metadata.details?.model ? ` for ${metadata.details.model}` : ''}.`
    : 'Something went wrong while generating a response.';
  const docsUrl = metadata.details?.docsUrl || (isRateLimit ? 'https://ai.google.dev/gemini-api/docs/rate-limits' : undefined);

  const handleRetry = () => {
    if (!activeSessionId || !lastUserMessage || !canRetry) return;
    sendMessage(activeSessionId, lastUserMessage.content, lastUserMessage.attachments);
  };

  return (
    <div className="rounded-xl border border-[#FF5449]/20 bg-[#FF5449]/10 px-4 py-3 text-white/90">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#FF7A72]">{title}</div>
          <div className="text-xs text-white/70 mt-1">{description}</div>
          {isRateLimit && remaining !== null && (
            <div className="text-xs text-white/60 mt-2">
              Retry in {Math.max(0, remaining)}s
            </div>
          )}
        </div>
        <button
          onClick={handleRetry}
          disabled={!canRetry}
          className={cn(
            'px-3 py-1.5 text-xs rounded-lg border',
            canRetry
              ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
              : 'bg-white/10 text-white/40 border-white/10 cursor-not-allowed'
          )}
        >
          Retry
        </button>
      </div>

      {docsUrl && (
        <div className="mt-2">
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#93C5FD] underline"
          >
            View API rate-limit docs
          </a>
        </div>
      )}

      {metadata.raw && (
        <details className="mt-2 text-xs text-white/60">
          <summary className="cursor-pointer text-white/50">Show raw error</summary>
          <pre className="whitespace-pre-wrap mt-2 text-[11px]">{metadata.raw}</pre>
        </details>
      )}
    </div>
  );
}

// Markdown content renderer for assistant messages
function MarkdownContent({ content }: { content: string }) {
  const fixedContent = fixNestedCodeFences(content);
  return (
    <div className="px-3 py-2 text-[13px]">
      <Suspense fallback={<div className="text-sm text-white/70">{fixedContent}</div>}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Custom code block rendering with syntax highlighting
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match && !String(children).includes('\n');

              if (isInline) {
                return (
                  <code
                    className="px-1 py-0.5 bg-[#1D4ED8]/10 rounded text-[#93C5FD] text-[0.9em] border border-[#1D4ED8]/20 select-text"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }

              const codeString = String(children).replace(/\n$/, '');
              const language = match?.[1] || detectLanguage(codeString);

              return (
                <div className="my-2 -mx-3">
                  <CodeBlock
                    code={codeString}
                    language={language}
                    showLineNumbers={codeString.split('\n').length > 3}
                  />
                </div>
              );
            },
            // Style elements with inline-block to constrain selection to text width
            p({ children }) {
              return (
                <p className="mb-2 last:mb-0 leading-snug text-white/80 w-fit max-w-full select-text">
                  {children}
                </p>
              );
            },
            ul({ children }) {
              return <ul className="list-disc list-inside mb-2 space-y-0.5 text-white/80 w-fit max-w-full select-text">{children}</ul>;
            },
            ol({ children }) {
              return <ol className="list-decimal list-inside mb-2 space-y-0.5 text-white/80 w-fit max-w-full select-text">{children}</ol>;
            },
            li({ children }) {
              return <li className="text-white/70 select-text">{children}</li>;
            },
            h1({ children }) {
              return <h1 className="text-base font-semibold mb-2 mt-3 first:mt-0 text-white/90 w-fit max-w-full select-text">{children}</h1>;
            },
            h2({ children }) {
              return <h2 className="text-sm font-semibold mb-1.5 mt-3 first:mt-0 text-white/90 w-fit max-w-full select-text">{children}</h2>;
            },
            h3({ children }) {
              return <h3 className="text-xs font-semibold mb-1.5 mt-2 first:mt-0 text-white/90 w-fit max-w-full select-text">{children}</h3>;
            },
            blockquote({ children }) {
              return (
                <blockquote className="border-l-3 border-[#1D4ED8]/50 pl-3 my-2 text-white/60 italic bg-white/[0.02] py-1.5 pr-2 rounded-r-lg w-fit max-w-full select-text">
                  {children}
                </blockquote>
              );
            },
            a({ href, children }) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#93C5FD] hover:text-[#DBEAFE] underline select-text"
                >
                  {children}
                </a>
              );
            },
            hr() {
              return <hr className="border-white/[0.08] my-3" />;
            },
            table({ children }) {
              return (
                <div className="overflow-x-auto my-2 select-text">
                  <table className="min-w-full border border-white/[0.08] rounded-lg overflow-hidden text-xs">
                    {children}
                  </table>
                </div>
              );
            },
            th({ children }) {
              return (
                <th className="px-2 py-1.5 bg-white/[0.04] text-left text-xs font-medium text-white/80 border-b border-white/[0.08] select-text">
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td className="px-2 py-1.5 text-xs text-white/70 border-b border-white/[0.06] select-text">
                  {children}
                </td>
              );
            },
          }}
        >
          {fixedContent}
        </ReactMarkdown>
      </Suspense>
    </div>
  );
}

// Simple language detection for code blocks without language specified
function detectLanguage(code: string): string {
  // Check for common patterns
  if (code.includes('import ') && (code.includes(' from ') || code.includes('React'))) {
    return 'typescript';
  }
  if (code.includes('function ') || code.includes('const ') || code.includes('let ')) {
    return 'javascript';
  }
  if (code.includes('def ') || code.includes('import ') && code.includes(':')) {
    return 'python';
  }
  if (code.includes('fn ') || code.includes('let mut ') || code.includes('impl ')) {
    return 'rust';
  }
  if (code.includes('func ') || code.includes('package ')) {
    return 'go';
  }
  if (code.startsWith('{') || code.startsWith('[')) {
    return 'json';
  }
  if (code.includes('<') && code.includes('>') && code.includes('</')) {
    return 'html';
  }
  return 'text';
}

interface ContentPartRendererProps {
  part: MessageContentPart;
  isUser: boolean;
}

function ContentPartRenderer({ part, isUser }: ContentPartRendererProps) {
  switch (part.type) {
    case 'text':
      if (isUser) {
        return (
          <div className="px-3 py-2 whitespace-pre-wrap text-[13px] leading-snug select-text break-words">
            {part.text}
          </div>
        );
      }
      return <MarkdownContent content={part.text} />;

    case 'image': {
      const p = part as any;
      const imgSrc = p.filePath
        ? convertFileSrc(p.filePath)
        : p.objectUrl
          ? p.objectUrl
          : p.data
            ? `data:${part.mimeType};base64,${p.data}`
            : '';
      if (!imgSrc) return null;
      return (
        <div className="mt-2 px-4">
          <img
            src={imgSrc}
            alt="Attached image"
            className="max-w-full rounded-xl max-h-80 object-contain border border-white/[0.08]"
          />
        </div>
      );
    }

    case 'audio': {
      const p = part as any;
      const audioSrc = p.filePath
        ? convertFileSrc(p.filePath)
        : p.objectUrl
          ? p.objectUrl
          : p.data
            ? `data:${part.mimeType};base64,${p.data}`
            : '';
      if (!audioSrc) return null;
      return (
        <div className="mt-2 px-4">
          <div className={cn(
            'flex items-center gap-2.5 px-3 py-2.5 rounded-xl',
            'bg-[#8B5CF6]/[0.06] border border-[#8B5CF6]/[0.12]'
          )}>
            <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 flex items-center justify-center flex-shrink-0">
              <Mic className="w-4 h-4 text-[#8B5CF6]" />
            </div>
            <audio controls src={audioSrc} className="h-8 flex-1" />
          </div>
        </div>
      );
    }

    case 'video': {
      const p = part as any;
      const videoSrc = p.filePath
        ? convertFileSrc(p.filePath)
        : p.objectUrl
          ? p.objectUrl
          : p.data
            ? `data:${part.mimeType};base64,${p.data}`
            : '';
      if (!videoSrc) return null;
      return (
        <div className="mt-2 px-4">
          <video
            controls
            src={videoSrc}
            className="max-w-full rounded-xl max-h-80 object-contain border border-white/[0.08]"
          />
        </div>
      );
    }

    case 'file':
      return (
        <div className="mt-2 px-4">
          <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white/70">
            {part.name}
          </div>
        </div>
      );

    case 'tool_call':
    case 'tool_result':
      // Tool UI is rendered only in the ToolActivitySection.
      return null;

    default:
      return null;
  }
}

/**
 * Thinking block component - displays agent's internal reasoning
 * Shows "Thinking..." with sliding glow effect and optional dropdown for details
 */
function ThinkingBlock({ content, isActive }: { content: string; isActive: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasContent = content && content.trim().length > 0;

  return (
    <div className="space-y-2">
      {/* Main thinking indicator with glow effect */}
      <div className="flex items-center gap-2 py-1">
        <Sparkles className={cn(
          'w-3 h-3 flex-shrink-0',
          isActive ? 'text-[#93C5FD] animate-pulse' : 'text-white/30'
        )} />
        <span className={cn(
          'text-[12px]',
          isActive ? 'codex-thinking' : 'text-white/40'
        )}>
          Thinking...
        </span>

        {/* Expand button - only show when there's thinking content */}
        {hasContent && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ml-2',
              'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
            )}
          >
            <ChevronDown className={cn(
              'w-3 h-3 transition-transform',
              isExpanded && 'rotate-180'
            )} />
            {isExpanded ? 'Hide' : 'Show'}
          </button>
        )}
      </div>

      {/* Expanded thinking content dropdown */}
      <AnimatePresence>
        {isExpanded && hasContent && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-lg bg-[#12131A]/80 border border-white/[0.06] overflow-hidden">
              <div className="px-3 py-2 border-b border-white/[0.05] flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-[#93C5FD]/50" />
                <span className="text-[10px] text-white/40 uppercase tracking-wide">Agent Reasoning</span>
              </div>
              <div className="p-3 max-h-[300px] overflow-y-auto">
                <pre className="text-[11px] text-white/40 whitespace-pre-wrap font-mono leading-relaxed">
                  {content}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
