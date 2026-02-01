import React, { useEffect, useRef, useState, Suspense } from 'react';
import { cn } from '../../lib/utils';
import { Bot, User, Copy, Check, ChevronDown, Sparkles, Code } from 'lucide-react';
import { useChatStore } from '../../stores/chat-store';
import { StreamingMessage } from './StreamingMessage';
import { ToolExecutionCard } from './ToolExecutionCard';
import { CodeBlock } from './CodeBlock';
import { AskUserQuestion } from './AskUserQuestion';
import type { Message, MessageContentPart } from '@gemini-cowork/shared';

// Lazy load react-markdown for better bundle splitting
const ReactMarkdown = React.lazy(() => import('react-markdown'));

export function MessageList() {
  const messages = useChatStore((state) => state.messages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const streamingContent = useChatStore((state) => state.streamingContent);
  const currentTool = useChatStore((state) => state.currentTool);
  const isLoadingMessages = useChatStore((state) => state.isLoadingMessages);
  const pendingQuestions = useChatStore((state) => state.pendingQuestions);
  const { respondToQuestion } = useChatStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll when new messages arrive or streaming
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent, autoScroll]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

    setAutoScroll(isNearBottom);
    setShowScrollButton(!isNearBottom);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setAutoScroll(true);
    setShowScrollButton(false);
  };

  // Show loading state
  if (isLoadingMessages) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading messages...</div>
      </div>
    );
  }

  // Show empty state when no messages and no active session
  if (messages.length === 0 && !isStreaming) {
    return <EmptyState />;
  }

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto"
        onScroll={handleScroll}
      >
        <div className="max-w-3xl mx-auto py-4 px-4 space-y-6">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {/* Streaming message */}
          {isStreaming && (
            <StreamingMessage
              content={streamingContent}
              currentTool={currentTool}
            />
          )}

          {/* Pending questions from agent */}
          {pendingQuestions.map((question) => (
            <AskUserQuestion
              key={question.id}
              question={question}
              onAnswer={(questionId, answer) => {
                respondToQuestion(question.sessionId, questionId, answer);
              }}
            />
          ))}

          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className={cn(
            'absolute bottom-4 left-1/2 -translate-x-1/2',
            'flex items-center gap-2 px-3 py-2 rounded-full',
            'bg-gray-800 border border-gray-700',
            'text-sm text-gray-300 hover:text-white',
            'shadow-lg transition-all duration-200',
            'hover:bg-gray-700'
          )}
        >
          <ChevronDown className="w-4 h-4" />
          <span>Scroll to bottom</span>
        </button>
      )}
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
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
        <Bot className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Welcome to Gemini Cowork
      </h2>
      <p className="text-gray-400 max-w-md mb-8">
        I'm your AI coding assistant. I can help you write code, debug issues,
        explain concepts, and much more.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl',
              'bg-gray-800/50 border border-gray-700',
              'text-left text-sm text-gray-300',
              'hover:bg-gray-700/50 hover:border-gray-600',
              'transition-all duration-200'
            )}
          >
            <suggestion.icon className="w-5 h-5 text-gray-400" />
            <span>{suggestion.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

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
  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="px-4 py-2 rounded-lg bg-gray-800/30 border border-gray-700/50 text-xs text-gray-400 max-w-lg text-center">
          {typeof message.content === 'string' ? message.content : 'System message'}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-blue-600'
            : 'bg-gradient-to-br from-gray-700 to-gray-900'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1 min-w-0', isUser && 'flex justify-end')}>
        <div
          className={cn(
            'inline-block max-w-full rounded-2xl',
            isUser
              ? 'bg-blue-600 text-white px-4 py-3'
              : 'bg-gray-800/50 text-white'
          )}
        >
          {typeof message.content === 'string' ? (
            isUser ? (
              <div className="whitespace-pre-wrap text-sm">{message.content}</div>
            ) : (
              <MarkdownContent content={message.content} />
            )
          ) : (
            <div className="space-y-3">
              {message.content.map((part, index) => (
                <ContentPartRenderer key={index} part={part} isUser={isUser} />
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {!isUser && (
          <div className="flex items-center gap-2 mt-2 pl-1">
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-gray-700/50 transition-colors"
              title="Copy message"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-gray-400" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Markdown content renderer for assistant messages
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="px-4 py-3 prose prose-sm prose-invert max-w-none">
      <Suspense fallback={<div className="text-sm">{content}</div>}>
        <ReactMarkdown
          components={{
            // Custom code block rendering with syntax highlighting
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match && !String(children).includes('\n');

              if (isInline) {
                return (
                  <code
                    className="px-1.5 py-0.5 bg-gray-700/50 rounded text-pink-400 text-[0.9em]"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }

              const codeString = String(children).replace(/\n$/, '');
              const language = match?.[1] || detectLanguage(codeString);

              return (
                <div className="my-3 -mx-4">
                  <CodeBlock
                    code={codeString}
                    language={language}
                    showLineNumbers={codeString.split('\n').length > 3}
                  />
                </div>
              );
            },
            // Style other elements
            p({ children }) {
              return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
            },
            ul({ children }) {
              return <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>;
            },
            ol({ children }) {
              return <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>;
            },
            li({ children }) {
              return <li className="text-gray-200">{children}</li>;
            },
            h1({ children }) {
              return <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0">{children}</h1>;
            },
            h2({ children }) {
              return <h2 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h2>;
            },
            h3({ children }) {
              return <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h3>;
            },
            blockquote({ children }) {
              return (
                <blockquote className="border-l-4 border-blue-500/50 pl-4 my-3 text-gray-300 italic">
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
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  {children}
                </a>
              );
            },
            hr() {
              return <hr className="border-gray-700 my-4" />;
            },
            table({ children }) {
              return (
                <div className="overflow-x-auto my-3">
                  <table className="min-w-full border border-gray-700 rounded-lg overflow-hidden">
                    {children}
                  </table>
                </div>
              );
            },
            th({ children }) {
              return (
                <th className="px-3 py-2 bg-gray-800 text-left text-sm font-medium text-gray-300 border-b border-gray-700">
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td className="px-3 py-2 text-sm text-gray-300 border-b border-gray-700/50">
                  {children}
                </td>
              );
            },
          }}
        >
          {content}
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
          <div className="px-4 py-3 whitespace-pre-wrap text-sm">
            {part.text}
          </div>
        );
      }
      return <MarkdownContent content={part.text} />;

    case 'image':
      return (
        <div className="mt-2 px-4">
          <img
            src={`data:${part.mimeType};base64,${part.data}`}
            alt="Attached image"
            className="max-w-full rounded-lg max-h-80 object-contain"
          />
        </div>
      );

    case 'tool_call':
      return (
        <div className="px-4 py-2">
          <ToolExecutionCard
            execution={{
              id: part.toolCallId || `tool-${Date.now()}`,
              name: part.toolName,
              args: part.args as Record<string, unknown>,
              status: 'success', // Tool calls in messages are already completed
              startedAt: Date.now(),
            }}
          />
        </div>
      );

    case 'tool_result':
      return (
        <div className="px-4 py-2">
          <ToolExecutionCard
            execution={{
              id: part.toolCallId || `result-${Date.now()}`,
              name: 'Tool Result',
              args: {},
              status: part.isError ? 'error' : 'success',
              result: part.result,
              error: part.isError ? String(part.result) : undefined,
              startedAt: Date.now(),
              completedAt: Date.now(),
            }}
          />
        </div>
      );

    default:
      return null;
  }
}
