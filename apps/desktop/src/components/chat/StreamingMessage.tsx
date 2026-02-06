import React, { Suspense } from 'react';
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';
import { BrandMark } from '../icons/BrandMark';
import remarkGfm from 'remark-gfm';
import { fixNestedCodeFences } from '../../lib/fix-markdown';

// Lazy load react-markdown for better bundle splitting
const ReactMarkdown = React.lazy(() => import('react-markdown'));

interface StreamingMessageProps {
  content: string;
}

export function StreamingMessage({ content }: StreamingMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex gap-3 message-block-isolate"
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-[#111218] border border-white/[0.08] flex items-center justify-center">
        <BrandMark className="w-3.5 h-3.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 select-none">
        <div
          className={cn(
            'w-fit max-w-full rounded-xl px-3 py-2',
            'bg-transparent border border-transparent'
          )}
        >
          {/* Text content with markdown rendering */}
          {content && (
            <div className="w-fit max-w-full text-[13px]">
              <Suspense fallback={
                <pre className="whitespace-pre-wrap font-sans text-white/80 w-fit max-w-full select-text">
                  {fixNestedCodeFences(content)}
                </pre>
              }>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Inline code styling
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const isInline = !match && !String(children).includes('\n');

                      if (isInline) {
                        return (
                          <code
                            className="px-1 py-0.5 bg-[#4C71FF]/10 rounded text-[#8CA2FF] text-[0.9em] border border-[#4C71FF]/20 select-text"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      }

                      // Code blocks - simplified rendering during streaming (no syntax highlighting)
                      const codeString = String(children).replace(/\n$/, '');
                      return (
                        <div className="my-2 -mx-3">
                          <pre className="p-3 rounded-lg bg-[#0A0B0F] border border-white/[0.06] overflow-x-auto">
                            <code className="text-[12px] text-white/70 font-mono select-text">
                              {codeString}
                            </code>
                          </pre>
                        </div>
                      );
                    },
                    // Text elements matching MarkdownContent styling
                    p({ children }) {
                      return (
                        <p className="mb-2 last:mb-0 leading-snug text-white/80 w-fit max-w-full select-text">
                          {children}
                        </p>
                      );
                    },
                    strong({ children }) {
                      return <strong className="font-semibold text-white/90">{children}</strong>;
                    },
                    em({ children }) {
                      return <em className="italic text-white/70">{children}</em>;
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
                    a({ href, children }) {
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#8CA2FF] hover:text-[#B0BFFF] underline select-text"
                        >
                          {children}
                        </a>
                      );
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
                        <blockquote className="border-l-3 border-[#4C71FF]/50 pl-3 my-2 text-white/60 italic bg-white/[0.02] py-1.5 pr-2 rounded-r-lg w-fit max-w-full select-text">
                          {children}
                        </blockquote>
                      );
                    },
                    hr() {
                      return <hr className="border-white/[0.08] my-3" />;
                    },
                  }}
                >
                  {fixNestedCodeFences(content)}
                </ReactMarkdown>
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
