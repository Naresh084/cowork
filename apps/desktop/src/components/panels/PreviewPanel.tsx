import React, { useState, useEffect, Suspense, useCallback, useMemo, useRef } from 'react';
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
import { toast } from '../ui/Toast';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';

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

const VIRTUALIZED_CONTENT_LINE_THRESHOLD = 1200;
const VIRTUALIZED_CONTENT_CHAR_THRESHOLD = 200_000;

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
      <div className="h-full flex flex-col items-center justify-center text-center px-4 bg-[#0D0D0F]/50">
        <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center mb-4">
          <Eye className="w-8 h-8 text-white/30" />
        </div>
        <p className="text-sm font-medium text-white/50 mb-1">No file selected</p>
        <p className="text-xs text-white/30">Select a file to preview its contents</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'h-full flex flex-col bg-[#0D0D0F]',
        isFullscreen && 'fixed inset-0 z-50'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08] bg-[#151518]/50">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileIcon className="w-4 h-4 text-white/50 flex-shrink-0" />
          <span className="text-sm font-medium text-white/90 truncate">{file.name}</span>
          <span className="text-xs text-white/40 px-1.5 py-0.5 bg-white/[0.06] rounded">
            {fileType}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
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
            className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
            title="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <PreviewErrorBoundary fileKey={file.id}>
          <Suspense fallback={<PreviewLoading />}>
            <PreviewContent file={file} fileType={fileType} />
          </Suspense>
        </PreviewErrorBoundary>
      </div>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#1D4ED8] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-white/40">Loading preview...</p>
      </div>
    </div>
  );
}

interface PreviewErrorBoundaryProps {
  fileKey: string;
  children: React.ReactNode;
}

interface PreviewErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

class PreviewErrorBoundary extends React.Component<
  PreviewErrorBoundaryProps,
  PreviewErrorBoundaryState
> {
  state: PreviewErrorBoundaryState = {
    hasError: false,
    message: null,
  };

  static getDerivedStateFromError(error: unknown): PreviewErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Preview rendering failed.',
    };
  }

  componentDidCatch(error: unknown): void {
    console.error('[PreviewPanel] Preview render crashed', error);
  }

  componentDidUpdate(prevProps: PreviewErrorBoundaryProps): void {
    if (prevProps.fileKey !== this.props.fileKey && this.state.hasError) {
      this.setState({
        hasError: false,
        message: null,
      });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      message: null,
    });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="max-w-md rounded-xl border border-[#FF5449]/30 bg-[#FF5449]/10 p-4 text-center">
          <p className="text-sm font-medium text-[#FECACA]">Preview failed to render</p>
          <p className="mt-1 text-xs text-white/70 break-words">
            {this.state.message || 'Unexpected rendering error.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-3 h-8 rounded-md border border-white/[0.15] bg-white/[0.06] px-3 text-xs text-white/85 hover:bg-white/[0.1]"
          >
            Retry preview
          </button>
        </div>
      </div>
    );
  }
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
  const src =
    file.url ||
    (file.path ? convertFileSrc(file.path) : '') ||
    (file.content ? `data:image/*;base64,${file.content}` : '');

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
      <div className="flex items-center justify-center gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
        <button
          onClick={handleZoomOut}
          className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-white/40 min-w-[4rem] text-center">{zoom}%</span>
        <button
          onClick={handleZoomIn}
          className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-white/[0.08] mx-1" />
        <button
          onClick={handleRotate}
          className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
          title="Rotate"
        >
          <RotateCw className="w-4 h-4" />
        </button>
        <button
          onClick={handleReset}
          className="px-2 py-1 rounded text-xs text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Image container */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#0a0a0a]">
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
  const videoSrc = file.url || (file.path ? convertFileSrc(file.path) : '');

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
  const audioSrc = file.url || (file.path ? convertFileSrc(file.path) : '');

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 bg-gradient-to-b from-[#1A1A1E] to-[#0D0D0F]">
      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] flex items-center justify-center mb-6 shadow-lg shadow-[#1D4ED8]/20">
        <FileAudio className="w-16 h-16 text-white" />
      </div>
      <p className="text-lg font-medium text-white/90 mb-6">{file.name}</p>
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
      <div className="flex items-center justify-center gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
        <button
          onClick={goToPrevPage}
          disabled={currentPage <= 1}
          className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs text-white/40 min-w-[6rem] text-center">
          Page {currentPage} of {numPages}
        </span>
        <button
          onClick={goToNextPage}
          disabled={currentPage >= numPages}
          className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-white/[0.08] mx-1" />
        <button
          onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
          className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-white/40 min-w-[3rem] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.min(3, s + 0.25))}
          className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* PDF container */}
      <div className="flex-1 overflow-auto flex justify-center p-4 bg-[#1A1A1E]">
        <Suspense fallback={<PreviewLoading />}>
          <PDFDocument
            file={src}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<PreviewLoading />}
            error={
              <div className="text-[#FF5449] text-sm">Failed to load PDF</div>
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
function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.includes(',') ? base64.split(',')[1] || '' : base64;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseDelimitedContent(content: string, delimiter: string): string[][] {
  const text = content.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = index + 1 < text.length ? text[index + 1] : '';

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function SpreadsheetPreview({ file }: { file: PreviewFile }) {
  const [data, setData] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSpreadsheet = async () => {
      try {
        setLoading(true);
        const extension = file.name.split('.').pop()?.toLowerCase() || '';

        if (extension === 'csv' || extension === 'tsv') {
          let textContent = file.content || '';
          if (!textContent && (file.url || file.path)) {
            const response = await fetch(file.url || file.path || '');
            if (!response.ok) {
              throw new Error(`Failed to fetch spreadsheet: ${response.status}`);
            }
            textContent = await response.text();
          }
          if (!textContent) {
            throw new Error('No content to display');
          }

          const delimiter = extension === 'tsv' ? '\t' : ',';
          setData(parseDelimitedContent(textContent, delimiter));
          setError(null);
          return;
        }

        if (extension === 'xlsx') {
          const readXlsxModule = await import('read-excel-file');
          const readXlsxFile = readXlsxModule.default;

          let blob: Blob;
          if (file.content) {
            const bytes = base64ToBytes(file.content);
            const arrayBuffer = Uint8Array.from(bytes).buffer as ArrayBuffer;
            blob = new Blob([arrayBuffer], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
          } else if (file.url || file.path) {
            const response = await fetch(file.url || file.path || '');
            if (!response.ok) {
              throw new Error(`Failed to fetch spreadsheet: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            blob = new Blob([arrayBuffer], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
          } else {
            throw new Error('No content to display');
          }

          const rows = await readXlsxFile(blob);
          setData(rows.map((row) => row.map((cell) => (cell == null ? '' : String(cell)))));
          setError(null);
          return;
        }

        throw new Error(
          'Spreadsheet preview currently supports .csv, .tsv, and .xlsx files.',
        );
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
        <div className="text-[#FF5449] text-sm">{error}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-white/40 text-sm">No data to display</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-white/40 border-b border-white/[0.08] bg-[#1A1A1E]/95">
              #
            </th>
            {data[0]?.map((header, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left text-xs font-medium text-white/70 border-b border-white/[0.08] bg-[#1A1A1E]/95"
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
              className="hover:bg-white/[0.02] transition-colors"
            >
              <td className="px-3 py-2 text-xs text-white/30 border-b border-white/[0.04]">
                {rowIndex + 1}
              </td>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-3 py-2 text-sm text-white/70 border-b border-white/[0.04]"
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
                      className="px-1.5 py-0.5 bg-white/[0.06] rounded text-[#EC4899]"
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
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
        <button
          onClick={() => setViewMode('preview')}
          className={cn(
            'px-3 py-1 rounded text-xs font-medium transition-colors',
            viewMode === 'preview'
              ? 'bg-[#1D4ED8] text-white'
              : 'text-white/40 hover:text-white/80 hover:bg-white/[0.06]'
          )}
        >
          Preview
        </button>
        <button
          onClick={() => setViewMode('source')}
          className={cn(
            'px-3 py-1 rounded text-xs font-medium transition-colors',
            viewMode === 'source'
              ? 'bg-[#1D4ED8] text-white'
              : 'text-white/40 hover:text-white/80 hover:bg-white/[0.06]'
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
  const lines = useMemo(() => content.split('\n'), [content]);
  const useVirtualizedView =
    lines.length >= VIRTUALIZED_CONTENT_LINE_THRESHOLD ||
    content.length >= VIRTUALIZED_CONTENT_CHAR_THRESHOLD;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error('Failed to copy to clipboard', message);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
        <span className="text-xs text-white/40">{language}</span>
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
            copied
              ? 'text-[#50956A]'
              : 'text-white/40 hover:text-white/80 hover:bg-white/[0.06]'
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
        {useVirtualizedView ? (
          <div className="h-full flex flex-col">
            <div className="px-3 py-1.5 border-b border-white/[0.06] bg-[#111218] text-[11px] text-white/55">
              Large file mode enabled. Rendering a virtualized text view.
            </div>
            <VirtualizedTextViewer lines={lines} showLineNumbers />
          </div>
        ) : (
          <CodeBlock code={content} language={language} showLineNumbers />
        )}
      </div>
    </div>
  );
}

// ============================================
// TEXT PREVIEW
// ============================================
function TextPreview({ file }: { file: PreviewFile }) {
  const content = file.content || '';
  const lines = useMemo(() => content.split('\n'), [content]);
  const useVirtualizedView =
    lines.length >= VIRTUALIZED_CONTENT_LINE_THRESHOLD ||
    content.length >= VIRTUALIZED_CONTENT_CHAR_THRESHOLD;

  if (useVirtualizedView) {
    return <VirtualizedTextViewer lines={lines} showLineNumbers={false} />;
  }

  return (
    <div className="h-full overflow-auto p-4">
      <pre className="text-sm text-white/70 whitespace-pre-wrap font-mono">
        {content}
      </pre>
    </div>
  );
}

interface VirtualizedTextViewerProps {
  lines: string[];
  showLineNumbers?: boolean;
}

function VirtualizedTextViewer({
  lines,
  showLineNumbers = true,
}: VirtualizedTextViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const lineHeight = 20;
  const overscan = 10;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const visibleLineCount = Math.max(1, Math.ceil(containerHeight / lineHeight));
  const startLine = Math.max(0, Math.floor(scrollTop / lineHeight) - overscan);
  const endLine = Math.min(lines.length, startLine + visibleLineCount + overscan * 2);
  const visibleLines = lines.slice(startLine, endLine);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto bg-[#0D0D0F] font-mono text-[12px] text-white/75"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: `${lines.length * lineHeight}px`, position: 'relative' }}>
        <div style={{ transform: `translateY(${startLine * lineHeight}px)` }}>
          {visibleLines.map((line, index) => {
            const lineNumber = startLine + index + 1;
            return (
              <div
                key={`line-${lineNumber}`}
                className="flex min-w-max items-start border-b border-white/[0.02] leading-5"
                style={{ height: `${lineHeight}px` }}
              >
                {showLineNumbers ? (
                  <span className="w-14 shrink-0 select-none border-r border-white/[0.06] px-2 text-right text-[10px] text-white/35">
                    {lineNumber}
                  </span>
                ) : null}
                <span className="px-3 whitespace-pre">{line || ' '}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================
// A2UI PREVIEW (Agent-to-User Interface)
// ============================================
function A2UIPreview({ file }: { file: PreviewFile }) {
  const [a2uiData, setA2uiData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (file.content) {
        const parsed = JSON.parse(file.content);
        setA2uiData(parsed);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Invalid A2UI JSON: ${message}`);
    }
  }, [file.content]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[#FF5449] text-sm">{error}</div>
      </div>
    );
  }

  if (!a2uiData) {
    return <PreviewLoading />;
  }

  const handleAction = useCallback(async (action: A2UIAction) => {
    try {
      setActionStatus('Running action...');
      const result = await invoke('agent_mcp_call_tool', {
        serverId: action.serverId,
        toolName: action.toolName,
        args: action.args || {},
      });
      setActionStatus('Action completed');
      toast.success('Action completed', JSON.stringify(result).slice(0, 200));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionStatus('Action failed');
      toast.error('Action failed', message);
    } finally {
      setTimeout(() => setActionStatus(null), 2000);
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-[#1D4ED8]" />
          <span className="text-xs text-white/40">A2UI Component Preview</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {actionStatus && (
          <div className="mb-3 text-xs text-white/50">{actionStatus}</div>
        )}
        <div className="space-y-3">
          {renderA2UINode(a2uiData, handleAction)}
        </div>
      </div>
    </div>
  );
}

type A2UIAction = {
  serverId: string;
  toolName: string;
  args?: Record<string, unknown>;
};

type A2UINode =
  | string
  | number
  | boolean
  | null
  | undefined
  | A2UIObject
  | A2UINode[];

interface A2UIObject {
  type?: string;
  component?: string;
  kind?: string;
  tag?: string;
  text?: string;
  title?: string;
  label?: string;
  content?: string;
  src?: string;
  href?: string;
  props?: Record<string, unknown>;
  children?: A2UINode;
  action?: Partial<A2UIAction> & { tool?: string; toolName?: string; server?: string };
}

function normalizeA2UIAction(action?: A2UIObject['action']): A2UIAction | null {
  if (!action) return null;
  const toolName = action.toolName || action.tool;
  const serverId = action.serverId || action.server;
  if (!toolName || !serverId) return null;
  return {
    toolName,
    serverId,
    args: action.args || {},
  };
}

function renderA2UINode(node: A2UINode, onAction: (action: A2UIAction) => void): React.ReactNode {
  if (node === null || node === undefined || typeof node === 'boolean') return null;
  if (typeof node === 'string' || typeof node === 'number') {
    return <p className="text-sm text-white/80">{String(node)}</p>;
  }
  if (Array.isArray(node)) {
    return node.map((child, idx) => (
      <div key={`a2ui-${idx}`}>{renderA2UINode(child, onAction)}</div>
    ));
  }

  const type =
    node.type ||
    node.component ||
    node.kind ||
    node.tag ||
    node.props?.type;

  const children = (node.children ?? node.props?.children) as A2UINode | undefined;
  const label =
    node.label ||
    node.title ||
    node.text ||
    node.content ||
    (node.props?.label as string) ||
    (node.props?.text as string);

  const action = normalizeA2UIAction(node.action);

  switch (String(type).toLowerCase()) {
    case 'row':
    case 'inline':
      return (
        <div className="flex items-center gap-2 flex-wrap">
          {renderA2UINode(children, onAction)}
        </div>
      );
    case 'stack':
    case 'column':
    case 'container':
    case 'section':
    case 'card':
      return (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
          {label && <div className="text-xs text-white/40">{label}</div>}
          {renderA2UINode(children, onAction)}
        </div>
      );
    case 'heading':
    case 'title':
      return <h3 className="text-base font-semibold text-white/90">{label}</h3>;
    case 'text':
    case 'paragraph':
    case 'label':
      return <p className="text-sm text-white/80">{label}</p>;
    case 'code':
      return (
        <pre className="text-xs text-white/70 bg-black/40 p-3 rounded-lg overflow-x-auto">
          {label}
        </pre>
      );
    case 'image': {
      const src =
        node.src ||
        (node.props?.src as string) ||
        (node.props?.url as string) ||
        '';
      if (!src) return null;
      return (
        <img
          src={src}
          alt={label || 'image'}
          className="max-w-full rounded-lg border border-white/[0.08]"
        />
      );
    }
    case 'link': {
      const href = node.href || (node.props?.href as string) || '#';
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#93C5FD] underline"
        >
          {label || href}
        </a>
      );
    }
    case 'button':
    case 'action': {
      return (
        <button
          onClick={() => action && onAction(action)}
          className="px-3 py-2 rounded-lg bg-[#1D4ED8]/20 text-[#93C5FD] hover:bg-[#1D4ED8]/30 transition-colors"
        >
          {label || 'Run action'}
        </button>
      );
    }
    case 'input':
      return (
        <input
          className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white/80"
          placeholder={label || 'Input'}
          disabled
        />
      );
    default:
      return (
        <div className="space-y-2">
          {label && <p className="text-sm text-white/80">{label}</p>}
          {children && renderA2UINode(children, onAction)}
        </div>
      );
  }
}

// ============================================
// UNKNOWN FILE TYPE
// ============================================
function UnknownPreview({ file }: { file: PreviewFile }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="w-20 h-20 rounded-full bg-white/[0.04] flex items-center justify-center mb-4">
        <File className="w-10 h-10 text-white/30" />
      </div>
      <p className="text-lg font-medium text-white/90 mb-2">{file.name}</p>
      <p className="text-sm text-white/50 mb-6">
        This file type cannot be previewed
      </p>
      {(file.url || file.path) && (
        <a
          href={file.url || file.path}
          download={file.name}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-sm font-medium hover:bg-[#93C5FD] transition-colors"
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
          'bg-[#0D0D0F] rounded-xl shadow-2xl overflow-hidden',
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
