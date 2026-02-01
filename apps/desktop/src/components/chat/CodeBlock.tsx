import { useState, useEffect, useMemo } from 'react';
import { Copy, Check, FileCode, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { createHighlighter, type Highlighter, type BundledLanguage } from 'shiki';

// Language display names
const LANGUAGE_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  csharp: 'C#',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  xml: 'XML',
  markdown: 'Markdown',
  sql: 'SQL',
  bash: 'Bash',
  shell: 'Shell',
  powershell: 'PowerShell',
  dockerfile: 'Dockerfile',
  graphql: 'GraphQL',
  tsx: 'TSX',
  jsx: 'JSX',
  vue: 'Vue',
  svelte: 'Svelte',
  toml: 'TOML',
  ini: 'INI',
  diff: 'Diff',
};

// Common language aliases
const LANGUAGE_ALIASES: Record<string, BundledLanguage> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  rs: 'rust',
  kt: 'kotlin',
  ps1: 'powershell',
  psm1: 'powershell',
};

// Singleton highlighter instance
let highlighterPromise: Promise<Highlighter> | null = null;

function getOrCreateHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: [
        'javascript',
        'typescript',
        'python',
        'rust',
        'go',
        'java',
        'cpp',
        'c',
        'csharp',
        'ruby',
        'php',
        'swift',
        'kotlin',
        'html',
        'css',
        'scss',
        'json',
        'yaml',
        'xml',
        'markdown',
        'sql',
        'bash',
        'shell',
        'powershell',
        'dockerfile',
        'graphql',
        'tsx',
        'jsx',
        'vue',
        'svelte',
        'toml',
        'ini',
        'diff',
      ],
    });
  }
  return highlighterPromise;
}

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  collapsible?: boolean;
  maxHeight?: number;
  className?: string;
}

export function CodeBlock({
  code,
  language = 'text',
  filename,
  showLineNumbers = true,
  collapsible = false,
  maxHeight,
  className,
}: CodeBlockProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(collapsible);

  // Normalize language
  const normalizedLang = useMemo(() => {
    const lower = language.toLowerCase();
    return LANGUAGE_ALIASES[lower] || lower;
  }, [language]);

  // Get display name
  const displayName = LANGUAGE_NAMES[normalizedLang] || normalizedLang.toUpperCase();

  // Highlight code
  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      setIsLoading(true);
      try {
        const highlighter = await getOrCreateHighlighter();

        // Check if language is supported
        const loadedLangs = highlighter.getLoadedLanguages();
        const langToUse = loadedLangs.includes(normalizedLang as BundledLanguage)
          ? normalizedLang
          : 'text';

        const html = highlighter.codeToHtml(code, {
          lang: langToUse as BundledLanguage,
          theme: 'github-dark',
        });

        if (!cancelled) {
          setHighlightedHtml(html);
        }
      } catch (error) {
        console.error('Failed to highlight code:', error);
        // Fallback to plain text
        if (!cancelled) {
          setHighlightedHtml(`<pre><code>${escapeHtml(code)}</code></pre>`);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    highlight();

    return () => {
      cancelled = true;
    };
  }, [code, normalizedLang]);

  // Copy handler
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  const lineCount = code.split('\n').length;

  return (
    <div
      className={cn(
        'rounded-xl overflow-hidden border',
        'bg-[#0d1117] border-gray-700/50',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2',
          'bg-gray-800/50 border-b border-gray-700/50'
        )}
      >
        <div className="flex items-center gap-2">
          {collapsible && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-0.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          )}

          <FileCode className="w-4 h-4 text-gray-500" />

          {filename ? (
            <span className="text-sm text-gray-300 font-mono">{filename}</span>
          ) : (
            <span className="text-xs text-gray-500">{displayName}</span>
          )}

          {showLineNumbers && (
            <span className="text-xs text-gray-600 ml-2">
              {lineCount} line{lineCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
            'transition-all duration-200',
            copied
              ? 'bg-green-500/20 text-green-400'
              : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
          )}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      {!isCollapsed && (
        <div
          className={cn(
            'overflow-auto',
            showLineNumbers && 'code-block-with-lines'
          )}
          style={{ maxHeight: maxHeight ? `${maxHeight}px` : undefined }}
        >
          {isLoading ? (
            <div className="p-4 flex items-center gap-2 text-gray-500">
              <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : (
            <div
              className={cn(
                'shiki-code-block p-4 text-sm',
                showLineNumbers && 'show-line-numbers'
              )}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Inline code component for short snippets
interface InlineCodeProps {
  children: string;
  className?: string;
}

export function InlineCode({ children, className }: InlineCodeProps) {
  return (
    <code
      className={cn(
        'px-1.5 py-0.5 rounded-md',
        'bg-gray-800 text-pink-400',
        'font-mono text-sm',
        className
      )}
    >
      {children}
    </code>
  );
}

// Diff viewer component
interface DiffBlockProps {
  oldCode: string;
  newCode: string;
  oldFilename?: string;
  newFilename?: string;
  className?: string;
}

export function DiffBlock({
  oldCode,
  newCode,
  oldFilename,
  newFilename,
  className,
}: DiffBlockProps) {
  // Simple line-by-line diff
  const oldLines = oldCode.split('\n');
  const newLines = newCode.split('\n');

  // Build diff
  const diffLines: Array<{ type: 'same' | 'add' | 'remove'; content: string }> = [];

  // Simple diff algorithm (not optimal, but works for basic cases)
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx >= oldLines.length) {
      diffLines.push({ type: 'add', content: newLines[newIdx] });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      diffLines.push({ type: 'remove', content: oldLines[oldIdx] });
      oldIdx++;
    } else if (oldLines[oldIdx] === newLines[newIdx]) {
      diffLines.push({ type: 'same', content: oldLines[oldIdx] });
      oldIdx++;
      newIdx++;
    } else {
      // Look ahead to find matching lines
      let foundMatch = false;
      for (let i = 1; i <= 3 && oldIdx + i < oldLines.length; i++) {
        if (oldLines[oldIdx + i] === newLines[newIdx]) {
          for (let j = 0; j < i; j++) {
            diffLines.push({ type: 'remove', content: oldLines[oldIdx + j] });
          }
          oldIdx += i;
          foundMatch = true;
          break;
        }
      }
      if (!foundMatch) {
        for (let i = 1; i <= 3 && newIdx + i < newLines.length; i++) {
          if (newLines[newIdx + i] === oldLines[oldIdx]) {
            for (let j = 0; j < i; j++) {
              diffLines.push({ type: 'add', content: newLines[newIdx + j] });
            }
            newIdx += i;
            foundMatch = true;
            break;
          }
        }
      }
      if (!foundMatch) {
        diffLines.push({ type: 'remove', content: oldLines[oldIdx] });
        diffLines.push({ type: 'add', content: newLines[newIdx] });
        oldIdx++;
        newIdx++;
      }
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl overflow-hidden border',
        'bg-[#0d1117] border-gray-700/50',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-4 px-3 py-2 bg-gray-800/50 border-b border-gray-700/50">
        {oldFilename && (
          <span className="text-xs text-red-400 font-mono">- {oldFilename}</span>
        )}
        {newFilename && (
          <span className="text-xs text-green-400 font-mono">+ {newFilename}</span>
        )}
      </div>

      {/* Diff content */}
      <div className="overflow-auto p-2">
        <pre className="font-mono text-sm">
          {diffLines.map((line, index) => (
            <div
              key={index}
              className={cn(
                'px-2 -mx-2',
                line.type === 'add' && 'bg-green-500/10 text-green-300',
                line.type === 'remove' && 'bg-red-500/10 text-red-300',
                line.type === 'same' && 'text-gray-400'
              )}
            >
              <span className="select-none mr-2 text-gray-600">
                {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
              </span>
              {line.content || ' '}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

// Helper function to escape HTML
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
