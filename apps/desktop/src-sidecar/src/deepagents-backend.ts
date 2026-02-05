import { readdir, readFile, writeFile, stat, realpath, mkdir } from 'fs/promises';
import { join, normalize, isAbsolute, resolve, dirname, sep, extname } from 'path';
import micromatch from 'micromatch';
import { CommandExecutor } from '@gemini-cowork/sandbox';
import type {
  SandboxBackendProtocol,
  FileInfo,
  FileData,
  WriteResult,
  EditResult,
  GrepMatch,
  ExecuteResponse,
} from 'deepagents';

const LINE_NUMBER_WIDTH = 6;
const BLOCKED_PATHS = ['/etc', '/System', '/usr', '/var', '/bin', '/sbin', '/private', '/Library'];
const ABSOLUTE_PREFIXES = [
  '/Users',
  '/home',
  '/var',
  '/etc',
  '/System',
  '/usr',
  '/private',
  '/Library',
  '/Applications',
  '/Volumes',
  '/opt',
  '/tmp',
];

function formatContentWithLineNumbers(lines: string[], startLine = 1): string {
  return lines
    .map((line, index) => {
      const lineNumber = startLine + index;
      return `${lineNumber.toString().padStart(LINE_NUMBER_WIDTH)}\t${line}`;
    })
    .join('\n');
}

function splitLines(content: string): string[] {
  if (!content) return [];
  const lines = content.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    return lines.slice(0, -1);
  }
  return lines;
}

function isLikelyBinary(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 8000);
  if (sampleSize === 0) return false;
  let nonPrintable = 0;
  for (let i = 0; i < sampleSize; i++) {
    const byte = buffer[i];
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32) || byte === 127) {
      nonPrintable++;
    }
  }
  return nonPrintable / sampleSize > 0.3;
}

function detectMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function chunkBase64(base64: string, width = 120): string[] {
  if (!base64) return [];
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += width) {
    lines.push(base64.slice(i, i + width));
  }
  return lines;
}

function ensureLeadingSlash(value: string): string {
  if (!value.startsWith('/')) {
    return `/${value}`;
  }
  return value;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

/**
 * Result from reading a file for visual/multimodal analysis.
 */
export interface MultimodalReadResult {
  type: 'text' | 'multimodal';
  mimeType: string;
  path: string;
  // For text files
  content?: string;
  lineCount?: number;
  // For multimodal files (images, video, audio, pdf)
  base64?: string;
  size?: number;
}

export class CoworkBackend implements SandboxBackendProtocol {
  readonly id: string;
  private workingDirectory: string;
  private executor: CommandExecutor;
  private allowedPathProvider: () => string[];
  private skillsDir: string | null;

  constructor(
    workingDirectory: string,
    id: string,
    allowedPathProvider?: () => string[],
    skillsDir?: string
  ) {
    this.workingDirectory = resolve(workingDirectory);
    this.id = id;
    this.executor = new CommandExecutor();
    this.allowedPathProvider = allowedPathProvider || (() => []);
    this.skillsDir = skillsDir || null;
  }

  async lsInfo(path: string): Promise<FileInfo[]> {
    // Handle /skills/ virtual path - list managed skills directory
    if ((path === '/skills/' || path === '/skills') && this.skillsDir) {
      return this.lsSkillsDir();
    }

    const { absolutePath, virtualPath, error } = await this.resolvePath(path);
    if (error) return [];

    try {
      const entries = await readdir(absolutePath, { withFileTypes: true });
      const infos: FileInfo[] = [];
      for (const entry of entries) {
        const entryPath = join(absolutePath, entry.name);
        let size = 0;
        let modifiedAt = '';
        try {
          const entryStats = await stat(entryPath);
          size = entryStats.size;
          modifiedAt = entryStats.mtime.toISOString();
        } catch {
          // ignore stat failures
        }

        infos.push({
          path: entry.isDirectory()
            ? `${virtualPath}/${entry.name}/`.replace(/\/{2,}/g, '/')
            : `${virtualPath}/${entry.name}`.replace(/\/{2,}/g, '/'),
          is_dir: entry.isDirectory(),
          size: entry.isDirectory() ? 0 : size,
          modified_at: modifiedAt,
        });
      }
      return infos;
    } catch {
      return [];
    }
  }

  /**
   * List the managed skills directory.
   * Returns FileInfo for each skill subdirectory.
   */
  private async lsSkillsDir(): Promise<FileInfo[]> {
    if (!this.skillsDir) {
      return [];
    }

    try {
      const entries = await readdir(this.skillsDir, { withFileTypes: true });
      const infos: FileInfo[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

        const entryPath = join(this.skillsDir, entry.name);
        let modifiedAt = '';
        try {
          const entryStats = await stat(entryPath);
          modifiedAt = entryStats.mtime.toISOString();
        } catch {
          // ignore stat failures
        }

        // Return as virtual path /skills/skillname/
        infos.push({
          path: `/skills/${entry.name}/`,
          is_dir: true,
          size: 0,
          modified_at: modifiedAt,
        });
      }

      return infos;
    } catch {
      return [];
    }
  }

  async read(filePath: string, offset = 0, limit = 500): Promise<string> {
    // Handle skill virtual paths
    if (filePath.startsWith('/skills/') && this.skillsDir) {
      return this.readSkillFile(filePath, offset, limit);
    }

    const raw = await this.readRaw(filePath).catch(() => null);
    if (!raw) return `Error: File '${filePath}' not found`;

    const lines = raw.content;
    if (offset >= lines.length) {
      return `Error: Line offset ${offset} exceeds file length (${lines.length} lines)`;
    }
    const end = Math.min(offset + limit, lines.length);
    const slice = lines.slice(offset, end);
    return formatContentWithLineNumbers(slice, offset + 1);
  }

  /**
   * Read a skill file from the managed skills directory.
   * Maps virtual path /skills/name/SKILL.md to actual filesystem path.
   */
  private async readSkillFile(virtualPath: string, offset = 0, limit = 500): Promise<string> {
    if (!this.skillsDir) {
      return `Error: Skills directory not configured`;
    }

    // Map /skills/github/SKILL.md → skillsDir/github/SKILL.md
    const relativePath = virtualPath.replace('/skills/', '');
    const realPath = join(this.skillsDir, relativePath);

    try {
      const buffer = await readFile(realPath);
      const content = buffer.toString('utf-8');
      const lines = splitLines(content);

      if (offset >= lines.length) {
        return `Error: Line offset ${offset} exceeds file length (${lines.length} lines)`;
      }
      const end = Math.min(offset + limit, lines.length);
      const slice = lines.slice(offset, end);
      return formatContentWithLineNumbers(slice, offset + 1);
    } catch (error) {
      return `Error: Skill file '${virtualPath}' not found`;
    }
  }

  async readRaw(filePath: string): Promise<FileData> {
    const { absolutePath, error } = await this.resolvePath(filePath);
    if (error) {
      throw new Error(error);
    }

    const stats = await stat(absolutePath);
    const buffer = await readFile(absolutePath);
    const mimeType = detectMimeType(absolutePath);

    if (isLikelyBinary(buffer)) {
      const maxBytes = 256 * 1024;
      const truncated = buffer.length > maxBytes;
      const slice = truncated ? buffer.subarray(0, maxBytes) : buffer;
      const base64 = slice.toString('base64');
      const header = `BASE64 ${mimeType} (${slice.length}${truncated ? ` of ${buffer.length}` : ''} bytes)`;
      const lines = [header, ...chunkBase64(base64)];
      if (truncated) {
        lines.push('[truncated]');
      }
      return {
        content: lines,
        created_at: stats.birthtime.toISOString(),
        modified_at: stats.mtime.toISOString(),
      };
    }

    const content = buffer.toString('utf-8');
    return {
      content: splitLines(content),
      created_at: stats.birthtime.toISOString(),
      modified_at: stats.mtime.toISOString(),
    };
  }

  /**
   * Read a file for visual/multimodal analysis.
   * Returns multimodal content for images/media that Gemini can "see",
   * or text content for regular files.
   */
  async readForAnalysis(filePath: string): Promise<MultimodalReadResult> {
    const { absolutePath, error } = await this.resolvePath(filePath);
    if (error) {
      throw new Error(error);
    }

    const buffer = await readFile(absolutePath);
    const mimeType = detectMimeType(absolutePath);

    // Check if it's a visual/media file that Gemini can process
    const isVisualMedia =
      mimeType.startsWith('image/') ||
      mimeType.startsWith('video/') ||
      mimeType.startsWith('audio/') ||
      mimeType === 'application/pdf';

    if (isVisualMedia) {
      // Gemini has 20MB inline limit
      const maxSize = 20 * 1024 * 1024;
      if (buffer.length > maxSize) {
        throw new Error(
          `File too large for visual analysis: ${(buffer.length / (1024 * 1024)).toFixed(1)}MB (max 20MB)`
        );
      }
      return {
        type: 'multimodal',
        mimeType,
        path: absolutePath,
        base64: buffer.toString('base64'),
        size: buffer.length,
      };
    }

    // Text file - return as text
    const content = buffer.toString('utf-8');
    const lines = splitLines(content);

    return {
      type: 'text',
      mimeType: 'text/plain',
      path: absolutePath,
      content,
      lineCount: lines.length,
    };
  }

  async grepRaw(pattern: string, path = '/', glob: string | null = null): Promise<GrepMatch[] | string> {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      return `Error: Invalid regex pattern: ${pattern}`;
    }

    const { absolutePath, virtualPath, error } = await this.resolvePath(path);
    if (error) return `Error: ${error}`;

    const files = await this.walkFiles(absolutePath, virtualPath);
    const filtered = glob ? files.filter((file) => micromatch.isMatch(file.relative, glob, { dot: true })) : files;

    const matches: GrepMatch[] = [];
    for (const file of filtered) {
      let content: string;
      try {
        content = await readFile(file.absolute, 'utf-8');
      } catch {
        continue;
      }

      const lines = splitLines(content);
      lines.forEach((line, index) => {
        if (regex.test(line)) {
          matches.push({
            path: file.virtual,
            line: index + 1,
            text: line,
          });
        }
      });
    }

    return matches;
  }

  async globInfo(pattern: string, path = '/'): Promise<FileInfo[]> {
    // Handle skill glob patterns
    if ((pattern.startsWith('/skills/') || path.startsWith('/skills/')) && this.skillsDir) {
      return this.globSkillFiles(pattern);
    }

    const { absolutePath, virtualPath, error } = await this.resolvePath(path);
    if (error) return [];

    const files = await this.walkFiles(absolutePath, virtualPath);
    const matched = files.filter((file) => micromatch.isMatch(file.relative, pattern, { dot: true }));

    const infos: FileInfo[] = [];
    for (const file of matched) {
      try {
        const stats = await stat(file.absolute);
        infos.push({
          path: file.virtual,
          is_dir: false,
          size: stats.size,
          modified_at: stats.mtime.toISOString(),
        });
      } catch {
        // ignore stat failures
      }
    }

    return infos;
  }

  /**
   * Glob skill files from the managed skills directory.
   * Used by DeepAgents to discover available skills.
   */
  private async globSkillFiles(pattern: string): Promise<FileInfo[]> {
    if (!this.skillsDir) return [];

    const infos: FileInfo[] = [];
    try {
      const entries = await readdir(this.skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

        const skillMdPath = join(this.skillsDir, entry.name, 'SKILL.md');
        try {
          const stats = await stat(skillMdPath);
          const virtualPath = `/skills/${entry.name}/SKILL.md`;

          // Check if matches the glob pattern
          if (micromatch.isMatch(virtualPath, pattern, { dot: true })) {
            infos.push({
              path: virtualPath,
              is_dir: false,
              size: stats.size,
              modified_at: stats.mtime.toISOString(),
            });
          }
        } catch {
          // SKILL.md doesn't exist in this directory, skip
        }
      }
    } catch {
      // Skills directory doesn't exist
    }

    return infos;
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    const resolved = await this.resolvePath(filePath);
    if (resolved.error) return { error: resolved.error };

    try {
      await stat(resolved.absolutePath);
      return { error: `Cannot write to ${resolved.virtualPath} because it already exists. Use edit_file instead.` };
    } catch {
      // ok, file does not exist
    }

    try {
      await mkdir(dirname(resolved.absolutePath), { recursive: true });
      await writeFile(resolved.absolutePath, content, 'utf-8');
      return { path: resolved.virtualPath, filesUpdate: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  async edit(filePath: string, oldString: string, newString: string, replaceAll = false): Promise<EditResult> {
    const resolved = await this.resolvePath(filePath);
    if (resolved.error) return { error: resolved.error };

    let content: string;
    try {
      content = await readFile(resolved.absolutePath, 'utf-8');
    } catch (error) {
      return { error: `Error: File '${resolved.virtualPath}' not found` };
    }

    const occurrences = content.split(oldString).length - 1;
    if (occurrences === 0) {
      return { error: `Error: String not found in file: '${oldString}'` };
    }
    if (occurrences > 1 && !replaceAll) {
      return {
        error: `Error: String '${oldString}' appears ${occurrences} times in file. Use replace_all=true or provide a more specific string.`,
      };
    }

    const updated = replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString);
    try {
      await writeFile(resolved.absolutePath, updated, 'utf-8');
      return { path: resolved.virtualPath, filesUpdate: null, occurrences };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  async execute(command: string): Promise<ExecuteResponse> {
    try {
      const result = await this.executor.execute(command, {
        cwd: this.workingDirectory,
      });
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
      const truncated = output.includes('[Output truncated]');
      return {
        output,
        exitCode: result.exitCode ?? null,
        truncated,
      };
    } catch (error) {
      return {
        output: error instanceof Error ? error.message : String(error),
        exitCode: 1,
        truncated: false,
      };
    }
  }

  private async resolvePath(inputPath: string): Promise<{ absolutePath: string; virtualPath: string; error?: string }> {
    const raw = toPosixPath(String(inputPath || '').trim());
    if (!raw) {
      return { absolutePath: '', virtualPath: '', error: 'Invalid path' };
    }

    const normalized = normalize(raw);
    const isAbs = isAbsolute(normalized);

    let virtualPath = ensureLeadingSlash(isAbs ? normalized : `/${normalized}`);
    let absolutePath: string;
    const allowedRoots = [this.workingDirectory, ...this.allowedPathProvider().map((p) => resolve(p))];
    const isKnownAbsolute = (path: string) => {
      if (path.startsWith(this.workingDirectory)) return true;
      if (allowedRoots.some((root) => path === root || path.startsWith(`${root}${sep}`))) return true;
      return ABSOLUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
    };

    if (isAbs) {
      const resolvedAbs = resolve(normalized);
      if (isKnownAbsolute(resolvedAbs)) {
        absolutePath = resolvedAbs;
        if (absolutePath.startsWith(this.workingDirectory)) {
          virtualPath = ensureLeadingSlash(toPosixPath(absolutePath.replace(this.workingDirectory, '')));
          if (virtualPath === '') virtualPath = '/';
        } else {
          virtualPath = ensureLeadingSlash(toPosixPath(absolutePath));
        }
      } else {
        const relative = normalized.replace(/^[/\\]+/, '');
        absolutePath = join(this.workingDirectory, relative);
        virtualPath = ensureLeadingSlash(toPosixPath(relative));
      }
    } else {
      const relative = normalized.replace(/^[/\\]+/, '');
      absolutePath = join(this.workingDirectory, relative);
      virtualPath = ensureLeadingSlash(toPosixPath(relative));
    }

    absolutePath = resolve(absolutePath);
    const isAllowed = allowedRoots.some((root) => absolutePath === root || absolutePath.startsWith(`${root}${sep}`));
    if (!isAllowed) {
      return { absolutePath, virtualPath, error: 'Access denied: path must be within working directory or approved scope' };
    }

    for (const blocked of BLOCKED_PATHS) {
      if (absolutePath.startsWith(blocked)) {
        return { absolutePath, virtualPath, error: `Access denied: cannot access system directory (${blocked})` };
      }
    }

    try {
      const resolvedReal = await realpath(absolutePath);
      const isAllowedReal = allowedRoots.some((root) => resolvedReal === root || resolvedReal.startsWith(`${root}${sep}`));
      if (!isAllowedReal) {
        return { absolutePath, virtualPath, error: 'Symlink escape detected: target is outside allowed scope' };
      }
    } catch {
      // path may not exist yet; that's fine for write
    }

    return { absolutePath, virtualPath };
  }

  private async walkFiles(
    baseAbsolute: string,
    baseVirtual: string
  ): Promise<Array<{ absolute: string; virtual: string; relative: string }>> {
    const results: Array<{ absolute: string; virtual: string; relative: string }> = [];

    const walk = async (dir: string, relativeBase: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const absolute = join(dir, entry.name);
        const relative = relativeBase ? join(relativeBase, entry.name) : entry.name;
        if (entry.isDirectory()) {
          await walk(absolute, relative);
        } else if (entry.isFile()) {
          const virtual = ensureLeadingSlash(toPosixPath(join(baseVirtual, relative)));
          results.push({
            absolute,
            virtual,
            relative: toPosixPath(relative),
          });
        }
      }
    };

    await walk(baseAbsolute, '');
    return results;
  }
}
