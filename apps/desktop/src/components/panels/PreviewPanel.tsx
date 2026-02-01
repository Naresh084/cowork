import React, { useState, useEffect, Suspense } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  FileVideo,
  FileAudio,
  FileSpreadsheet,
  FileCode,
  File,
  Eye,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { CodeBlock } from '../chat/CodeBlock';

// Lazy load heavy components
const ReactMarkdown = React.lazy(() => import('react-markdown'));

// PDF imports with lazy loading
const PDFDocument = React.lazy(() =>
  import('react-pdf').then((mod) => ({ default: mod.Document }))
);
const PDFPage = React.lazy(() =>
  import('react-pdf').then((mod) => ({ default: mod.Page }))
);

// Initialize PDF.js worker
import { pdfjs } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// File type detection
type FileType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'spreadsheet'
  | 'document'
  | 'markdown'
  | 'code'
  | 'text'
  | 'a2ui'
  | 'html'
  | 'unknown';

interface PreviewFile {
  id: string;
  name: string;
  path?: string;
  url?: string;
  content?: string;
  mimeType?: string;
  size?: number;
}

interface PreviewPanelProps {
  file: PreviewFile | null;
  onClose: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

// Detect file type from name/mime
function detectFileType(file: PreviewFile): FileType {
  const name = file.name.toLowerCase();
  const mime = file.mimeType?.toLowerCase() || '';

  // Image types
  if (
    mime.startsWith('image/') ||
    /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|avif)$/.test(name)
  ) {
    return 'image';
  }

  // Video types
  if (
    mime.startsWith('video/') ||
    /\.(mp4|webm|mov|avi|mkv|m4v|ogv)$/.test(name)
  ) {
    return 'video';
  }

  // Audio types
  if (
    mime.startsWith('audio/') ||
    /\.(mp3|wav|ogg|flac|aac|m4a|wma)$/.test(name)
  ) {
    return 'audio';
  }

  // PDF
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf';
  }

  // Spreadsheet types
  if (
    /\.(xlsx|xls|csv|tsv|ods)$/.test(name) ||
    mime.includes('spreadsheet') ||
    mime.includes('excel')
  ) {
    return 'spreadsheet';
  }

  // Document types (Word, etc.)
  if (
    /\.(docx|doc|odt|rtf)$/.test(name) ||
    mime.includes('document') ||
    mime.includes('msword')
  ) {
    return 'document';
  }

  // Markdown
  if (/\.(md|markdown|mdx)$/.test(name)) {
    return 'markdown';
  }

  // HTML
  if (/\.(html|htm)$/.test(name) || mime === 'text/html') {
    return 'html';
  }

  // A2UI JSON
  if (name.includes('a2ui') || (file.content && file.content.includes('"a2ui"'))) {
    return 'a2ui';
  }

  // Code files
  if (
    /\.(js|jsx|ts|tsx|py|rb|rs|go|java|kt|swift|cpp|c|h|hpp|cs|php|json|yaml|yml|xml|sql|sh|bash|toml|ini|vue|svelte)$/.test(
      name
    )
  ) {
    return 'code';
  }

  // Plain text
  if (mime.startsWith('text/') || /\.(txt|log)$/.test(name)) {
    return 'text';
  }

  return 'unknown';
}

// Get file icon based on type
function getFileIcon(type: FileType) {
  const iconMap: Record<FileType, typeof File> = {
    image: ImageIcon,
    video: FileVideo,
    audio: FileAudio,
    pdf: FileText,
    spreadsheet: FileSpreadsheet,
    document: FileText,
    markdown: FileText,
    code: FileCode,
    text: FileText,
    a2ui: Eye,
    html: FileCode,
    unknown: File,
  };
  return iconMap[type];
}

// Language detection for code files
function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    toml: 'toml',
    ini: 'ini',
    vue: 'vue',
    svelte: 'svelte',
  };
  return langMap[ext] || 'text';
}

export function PreviewPanel({
  file,
  onClose,
  isFullscreen = false,
  onToggleFullscreen,
}: PreviewPanelProps) {
  const fileType = file ? detectFileType(file) : 'unknown';
  const FileIcon = getFileIcon(fileType);

  if (!file) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4 bg-gray-900/50">
        <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mb-4">
          <Eye className="w-8 h-8 text-gray-500" />
        </div>
        <p className="text-sm font-medium text-gray-400 mb-1">No file selected</p>
        <p className="text-xs text-gray-500">Select a file to preview its contents</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'h-full flex flex-col bg-gray-900',
        isFullscreen && 'fixed inset-0 z-50'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50 bg-gray-800/50">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm font-medium text-white truncate">{file.name}</span>
          <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-gray-700/50 rounded">
            {fileType}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
            title="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<PreviewLoading />}>
          <PreviewContent file={file} fileType={fileType} />
        </Suspense>
      </div>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Loading preview...</p>
      </div>
    </div>
  );
}

interface PreviewContentProps {
  file: PreviewFile;
  fileType: FileType;
}

function PreviewContent({ file, fileType }: PreviewContentProps) {
  switch (fileType) {
    case 'image':
      return <ImagePreview file={file} />;
    case 'video':
      return <VideoPreview file={file} />;
    case 'audio':
      return <AudioPreview file={file} />;
    case 'pdf':
      return <PDFPreview file={file} />;
    case 'spreadsheet':
      return <SpreadsheetPreview file={file} />;
    case 'markdown':
      return <MarkdownPreview file={file} />;
    case 'html':
      return <HTMLPreview file={file} />;
    case 'code':
      return <CodePreview file={file} />;
    case 'text':
      return <TextPreview file={file} />;
    case 'a2ui':
      return <A2UIPreview file={file} />;
    default:
      return <UnknownPreview file={file} />;
  }
}

// ============================================
// IMAGE PREVIEW
// ============================================
function ImagePreview({ file }: { file: PreviewFile }) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const src = file.url || (file.content ? `data:image/*;base64,${file.content}` : '');

  const handleZoomIn = () => setZoom((z) => Math.min(z + 25, 400));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 25, 25));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleReset = () => {
    setZoom(100);
    setRotation(0);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-2 px-3 py-2 border-b border-gray-700/30 bg-gray-800/30">
        <button
          onClick={handleZoomOut}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-400 min-w-[4rem] text-center">{zoom}%</span>
        <button
          onClick={handleZoomIn}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-gray-700 mx-1" />
        <button
          onClick={handleRotate}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
          title="Rotate"
        >
          <RotateCw className="w-4 h-4" />
        </button>
        <button
          onClick={handleReset}
          className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Image container */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#1a1a1a]">
        <img
          src={src}
          alt={file.name}
          className="max-w-none transition-transform duration-200"
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}

// ============================================
// VIDEO PREVIEW
// ============================================
function VideoPreview({ file }: { file: PreviewFile }) {
  const videoSrc = file.url || file.path || '';

  return (
    <div className="h-full flex flex-col bg-black">
      <div className="flex-1 flex items-center justify-center">
        <video
          src={videoSrc}
          controls
          className="max-w-full max-h-full"
          style={{ maxHeight: '100%' }}
        />
      </div>
    </div>
  );
}

// ============================================
// AUDIO PREVIEW
// ============================================
function AudioPreview({ file }: { file: PreviewFile }) {
  const audioSrc = file.url || file.path || '';

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 bg-gradient-to-b from-gray-800 to-gray-900">
      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-6 shadow-lg shadow-purple-500/20">
        <FileAudio className="w-16 h-16 text-white" />
      </div>
      <p className="text-lg font-medium text-white mb-6">{file.name}</p>
      <audio
        src={audioSrc}
        controls
        className="w-full max-w-md"
      />
    </div>
  );
}

// ============================================
// PDF PREVIEW
// ============================================
function PDFPreview({ file }: { file: PreviewFile }) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const src = file.url || file.path;

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const goToPrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(numPages, p + 1));

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-2 px-3 py-2 border-b border-gray-700/30 bg-gray-800/30">
        <button
          onClick={goToPrevPage}
          disabled={currentPage <= 1}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-400 min-w-[6rem] text-center">
          Page {currentPage} of {numPages}
        </span>
        <button
          onClick={goToNextPage}
          disabled={currentPage >= numPages}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-gray-700 mx-1" />
        <button
          onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-400 min-w-[3rem] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.min(3, s + 0.25))}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* PDF container */}
      <div className="flex-1 overflow-auto flex justify-center p-4 bg-gray-800">
        <Suspense fallback={<PreviewLoading />}>
          <PDFDocument
            file={src}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<PreviewLoading />}
            error={
              <div className="text-red-400 text-sm">Failed to load PDF</div>
            }
          >
            <PDFPage
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </PDFDocument>
        </Suspense>
      </div>
    </div>
  );
}

// ============================================
// SPREADSHEET PREVIEW (CSV, XLSX)
// ============================================
function SpreadsheetPreview({ file }: { file: PreviewFile }) {
  const [data, setData] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSpreadsheet = async () => {
      try {
        setLoading(true);
        const XLSX = await import('xlsx');

        let workbook;
        if (file.content) {
          // Base64 or text content
          if (file.name.endsWith('.csv')) {
            workbook = XLSX.read(file.content, { type: 'string' });
          } else {
            workbook = XLSX.read(file.content, { type: 'base64' });
          }
        } else if (file.url || file.path) {
          const response = await fetch(file.url || file.path || '');
          const arrayBuffer = await response.arrayBuffer();
          workbook = XLSX.read(arrayBuffer, { type: 'array' });
        } else {
          throw new Error('No content to display');
        }

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<string[]>(firstSheet, {
          header: 1,
        });
        setData(jsonData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load spreadsheet');
      } finally {
        setLoading(false);
      }
    };

    loadSpreadsheet();
  }, [file]);

  if (loading) {
    return <PreviewLoading />;
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-400 text-sm">No data to display</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-gray-800 z-10">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 border-b border-gray-700 bg-gray-800/90">
              #
            </th>
            {data[0]?.map((header, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left text-xs font-medium text-gray-300 border-b border-gray-700 bg-gray-800/90"
              >
                {header || `Column ${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(1).map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="hover:bg-gray-800/50 transition-colors"
            >
              <td className="px-3 py-2 text-xs text-gray-500 border-b border-gray-700/50">
                {rowIndex + 1}
              </td>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-3 py-2 text-sm text-gray-300 border-b border-gray-700/50"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================
// MARKDOWN PREVIEW
// ============================================
function MarkdownPreview({ file }: { file: PreviewFile }) {
  const content = file.content || '';

  return (
    <div className="h-full overflow-auto p-6">
      <Suspense fallback={<PreviewLoading />}>
        <article className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const isInline = !match;

                if (isInline) {
                  return (
                    <code
                      className="px-1.5 py-0.5 bg-gray-800 rounded text-pink-400"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }

                return (
                  <CodeBlock
                    code={String(children).replace(/\n$/, '')}
                    language={match?.[1] || 'text'}
                    showLineNumbers
                  />
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </Suspense>
    </div>
  );
}

// ============================================
// HTML PREVIEW (sandboxed iframe)
// ============================================
function HTMLPreview({ file }: { file: PreviewFile }) {
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const content = file.content || '';

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/30 bg-gray-800/30">
        <button
          onClick={() => setViewMode('preview')}
          className={cn(
            'px-3 py-1 rounded text-xs font-medium transition-colors',
            viewMode === 'preview'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
          )}
        >
          Preview
        </button>
        <button
          onClick={() => setViewMode('source')}
          className={cn(
            'px-3 py-1 rounded text-xs font-medium transition-colors',
            viewMode === 'source'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
          )}
        >
          Source
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'preview' ? (
          <iframe
            srcDoc={content}
            className="w-full h-full bg-white"
            sandbox="allow-scripts"
            title="HTML Preview"
          />
        ) : (
          <CodeBlock code={content} language="html" showLineNumbers />
        )}
      </div>
    </div>
  );
}

// ============================================
// CODE PREVIEW
// ============================================
function CodePreview({ file }: { file: PreviewFile }) {
  const [copied, setCopied] = useState(false);
  const content = file.content || '';
  const language = getLanguage(file.name);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/30 bg-gray-800/30">
        <span className="text-xs text-gray-400">{language}</span>
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
            copied
              ? 'text-green-400'
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

      {/* Code */}
      <div className="flex-1 overflow-auto">
        <CodeBlock code={content} language={language} showLineNumbers />
      </div>
    </div>
  );
}

// ============================================
// TEXT PREVIEW
// ============================================
function TextPreview({ file }: { file: PreviewFile }) {
  const content = file.content || '';

  return (
    <div className="h-full overflow-auto p-4">
      <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
        {content}
      </pre>
    </div>
  );
}

// ============================================
// A2UI PREVIEW (Agent-to-User Interface)
// ============================================
function A2UIPreview({ file }: { file: PreviewFile }) {
  const [a2uiData, setA2uiData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (file.content) {
        const parsed = JSON.parse(file.content);
        setA2uiData(parsed);
      }
    } catch (err) {
      setError('Invalid A2UI JSON');
    }
  }, [file.content]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (!a2uiData) {
    return <PreviewLoading />;
  }

  // For now, show the JSON structure with syntax highlighting
  // In production, this would use @xpert-ai/a2ui-react to render the actual components
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-700/30 bg-gray-800/30">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-gray-400">A2UI Component Preview</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <CodeBlock
          code={JSON.stringify(a2uiData, null, 2)}
          language="json"
          showLineNumbers
        />
      </div>
    </div>
  );
}

// ============================================
// UNKNOWN FILE TYPE
// ============================================
function UnknownPreview({ file }: { file: PreviewFile }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-4">
        <File className="w-10 h-10 text-gray-500" />
      </div>
      <p className="text-lg font-medium text-white mb-2">{file.name}</p>
      <p className="text-sm text-gray-400 mb-6">
        This file type cannot be previewed
      </p>
      {(file.url || file.path) && (
        <a
          href={file.url || file.path}
          download={file.name}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download File
        </a>
      )}
    </div>
  );
}

// ============================================
// PREVIEW MODAL (for fullscreen preview from anywhere)
// ============================================
interface PreviewModalProps {
  file: PreviewFile | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PreviewModal({ file, isOpen, onClose }: PreviewModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isFullscreen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className={cn(
          'bg-gray-900 rounded-xl shadow-2xl overflow-hidden',
          isFullscreen ? 'w-full h-full' : 'w-[90vw] h-[85vh] max-w-6xl'
        )}
      >
        <PreviewPanel
          file={file}
          onClose={onClose}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        />
      </div>
    </div>
  );
}
