// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { readdir, readFile, writeFile, stat, realpath, mkdir } from 'fs/promises';
import { join, normalize, isAbsolute, resolve, dirname, sep, extname } from 'path';
import micromatch from 'micromatch';
import { CommandExecutor, type CommandSandboxSettings } from '@cowork/sandbox';
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

const DEFAULT_COMMAND_SANDBOX: CommandSandboxSettings = {
  mode: 'workspace-write',
  allowNetwork: false,
  allowProcessSpawn: true,
  allowedPaths: [],
  deniedPaths: ['/etc', '/System', '/usr'],
  trustedCommands: ['ls', 'pwd', 'git status', 'git diff'],
  maxExecutionTimeMs: 30000,
  maxOutputBytes: 1024 * 1024,
};

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
  const mimeMap: Record<string, string> = {
    // Images
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    // Video
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.3gp': 'video/3gpp',
    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.wma': 'audio/x-ms-wma',
    '.aiff': 'audio/aiff',
    // Documents
    '.pdf': 'application/pdf',
    '.csv': 'text/csv',
    '.tsv': 'text/tab-separated-values',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Archives
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
  };
  return mimeMap[ext] || 'application/octet-stream';
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
  private sandboxSettingsProvider: () => CommandSandboxSettings;
  private virtualSkillFiles: Map<string, string>;

  constructor(
    workingDirectory: string,
    id: string,
    allowedPathProvider?: () => string[],
    skillsDir?: string,
    sandboxSettingsProvider?: () => CommandSandboxSettings,
    virtualSkillFiles?: Map<string, string> | Record<string, string>,
  ) {
    this.workingDirectory = resolve(workingDirectory);
    this.id = id;
    this.allowedPathProvider = allowedPathProvider || (() => []);
    this.sandboxSettingsProvider = sandboxSettingsProvider || (() => ({ ...DEFAULT_COMMAND_SANDBOX }));
    this.executor = new CommandExecutor(this.getEffectiveSandboxSettings());
    this.skillsDir = skillsDir || null;
    this.virtualSkillFiles = new Map();
    if (virtualSkillFiles instanceof Map) {
      for (const [path, content] of virtualSkillFiles.entries()) {
        this.virtualSkillFiles.set(this.normalizeSkillVirtualPath(path), content);
      }
    } else if (virtualSkillFiles && typeof virtualSkillFiles === 'object') {
      for (const [path, content] of Object.entries(virtualSkillFiles)) {
        this.virtualSkillFiles.set(this.normalizeSkillVirtualPath(path), content);
      }
    }
  }

  private normalizeSkillVirtualPath(path: string): string {
    return ensureLeadingSlash(toPosixPath(path)).replace(/\/{2,}/g, '/');
  }

  private hasSkillSources(): boolean {
    return Boolean(this.skillsDir) || this.virtualSkillFiles.size > 0;
  }

  private getVirtualSkillContent(path: string): string | null {
    return this.virtualSkillFiles.get(this.normalizeSkillVirtualPath(path)) ?? null;
  }

  private getEffectiveSandboxSettings(): CommandSandboxSettings {
    const configured = this.sandboxSettingsProvider() || DEFAULT_COMMAND_SANDBOX;
    const allowed = new Set<string>([
      resolve(this.workingDirectory),
      ...configured.allowedPaths.map((path) => resolve(path)),
      ...this.allowedPathProvider().map((path) => resolve(path)),
    ]);

    return {
      ...DEFAULT_COMMAND_SANDBOX,
      ...configured,
      allowedPaths: Array.from(allowed),
      deniedPaths: Array.isArray(configured.deniedPaths)
        ? configured.deniedPaths
        : DEFAULT_COMMAND_SANDBOX.deniedPaths,
      trustedCommands: Array.isArray(configured.trustedCommands)
        ? configured.trustedCommands
        : DEFAULT_COMMAND_SANDBOX.trustedCommands,
    };
  }

  async lsInfo(path: string): Promise<FileInfo[]> {
    // Handle /skills/ virtual path - list skill sources.
    if ((path === '/skills/' || path === '/skills') && this.hasSkillSources()) {
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
   * List skill directories from both virtual skill map and managed skills directory.
   */
  private async lsSkillsDir(): Promise<FileInfo[]> {
    if (!this.hasSkillSources()) {
      return [];
    }

    const infosByPath = new Map<string, FileInfo>();

    for (const virtualPath of this.virtualSkillFiles.keys()) {
      const match = virtualPath.match(/^\/skills\/([^/]+)\/SKILL\.md$/);
      if (!match) continue;
      const skillName = match[1]!;
      const path = `/skills/${skillName}/`;
      infosByPath.set(path, {
        path,
        is_dir: true,
        size: 0,
        modified_at: '',
      });
    }

    if (this.skillsDir) {
      try {
        const entries = await readdir(this.skillsDir, { withFileTypes: true });
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

          const path = `/skills/${entry.name}/`;
          infosByPath.set(path, {
            path,
            is_dir: true,
            size: 0,
            modified_at: modifiedAt,
          });
        }
      } catch {
        // ignore managed directory listing failures
      }
    }

    return Array.from(infosByPath.values()).sort((a, b) => a.path.localeCompare(b.path));
  }

  async read(filePath: string, offset = 0, limit = 500): Promise<string> {
    // Handle skill virtual paths
    if (filePath.startsWith('/skills/') && this.hasSkillSources()) {
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
    const raw = await this.readSkillRaw(virtualPath);
    if (!raw) {
      return `Error: Skill file '${virtualPath}' not found`;
    }
    const lines = raw.content;
    if (offset >= lines.length) {
      return `Error: Line offset ${offset} exceeds file length (${lines.length} lines)`;
    }
    const end = Math.min(offset + limit, lines.length);
    const slice = lines.slice(offset, end);
    return formatContentWithLineNumbers(slice, offset + 1);
  }

  async readRaw(filePath: string): Promise<FileData> {
    if (filePath.startsWith('/skills/') && this.hasSkillSources()) {
      const rawSkill = await this.readSkillRaw(filePath);
      if (!rawSkill) {
        throw new Error(`Skill file '${filePath}' not found`);
      }
      return rawSkill;
    }

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

  private async readSkillRaw(virtualPath: string): Promise<FileData | null> {
    const normalizedPath = this.normalizeSkillVirtualPath(virtualPath);
    const nowIso = new Date().toISOString();

    const fromMap = this.getVirtualSkillContent(normalizedPath);
    if (fromMap !== null) {
      return {
        content: splitLines(fromMap),
        created_at: nowIso,
        modified_at: nowIso,
      };
    }

    if (!this.skillsDir) {
      return null;
    }

    const relativePath = normalizedPath.replace('/skills/', '');
    const realPath = join(this.skillsDir, relativePath);
    try {
      const [buffer, stats] = await Promise.all([readFile(realPath), stat(realPath)]);
      return {
        content: splitLines(buffer.toString('utf-8')),
        created_at: stats.birthtime.toISOString(),
        modified_at: stats.mtime.toISOString(),
      };
    } catch {
      return null;
    }
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
    if (pattern.length > 500) {
      return 'Error: Regex pattern too long (max 500 chars)';
    }
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      return `Error: Invalid regex pattern: ${pattern}`;
    }

    if (path.startsWith('/skills/') && this.hasSkillSources()) {
      const records = await this.listSkillFileRecords();
      const filteredByPath = records.filter((record) => {
        if (path === '/skills' || path === '/skills/') {
          return true;
        }
        return record.path.startsWith(this.normalizeSkillVirtualPath(path).replace(/\/$/, ''));
      });
      const filtered = glob
        ? filteredByPath.filter((record) => micromatch.isMatch(record.path, glob, { dot: true }))
        : filteredByPath;

      const matches: GrepMatch[] = [];
      for (const record of filtered) {
        const lines = splitLines(record.content);
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            matches.push({
              path: record.path,
              line: index + 1,
              text: line,
            });
          }
        });
      }
      return matches;
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
    if ((pattern.startsWith('/skills/') || path.startsWith('/skills/')) && this.hasSkillSources()) {
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
   * Glob skill files from virtual skill map and managed skills directory.
   * Used by DeepAgents to discover available skills.
   */
  private async globSkillFiles(pattern: string): Promise<FileInfo[]> {
    const records = await this.listSkillFileRecords();
    return records
      .filter((record) => micromatch.isMatch(record.path, pattern, { dot: true }))
      .map((record) => ({
        path: record.path,
        is_dir: false,
        size: record.size,
        modified_at: record.modifiedAt,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  private async listSkillFileRecords(): Promise<Array<{
    path: string;
    content: string;
    size: number;
    modifiedAt: string;
  }>> {
    const recordsByPath = new Map<string, {
      path: string;
      content: string;
      size: number;
      modifiedAt: string;
    }>();

    for (const [path, content] of this.virtualSkillFiles.entries()) {
      const normalizedPath = this.normalizeSkillVirtualPath(path);
      recordsByPath.set(normalizedPath, {
        path: normalizedPath,
        content,
        size: Buffer.byteLength(content, 'utf-8'),
        modifiedAt: '',
      });
    }

    if (this.skillsDir) {
      try {
        const entries = await readdir(this.skillsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
          const skillMdPath = join(this.skillsDir, entry.name, 'SKILL.md');
          try {
            const [buffer, stats] = await Promise.all([readFile(skillMdPath), stat(skillMdPath)]);
            const virtualPath = `/skills/${entry.name}/SKILL.md`;
            // Synced virtual skills should win over managed directory copies to keep
            // one deterministic source of truth for the active session.
            if (!recordsByPath.has(virtualPath)) {
              recordsByPath.set(virtualPath, {
                path: virtualPath,
                content: buffer.toString('utf-8'),
                size: stats.size,
                modifiedAt: stats.mtime.toISOString(),
              });
            }
          } catch {
            // SKILL.md doesn't exist or is unreadable; skip.
          }
        }
      } catch {
        // Skills directory doesn't exist; ignore.
      }
    }

    return Array.from(recordsByPath.values());
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
    const sandboxSettings = this.getEffectiveSandboxSettings();
    this.executor.updateConfig(sandboxSettings);
    const policy = this.executor.evaluatePolicy(command, this.workingDirectory);
    if (!policy.allowed) {
      return {
        output: `Command blocked by sandbox policy:\n- ${policy.violations.join('\n- ')}`,
        exitCode: 1,
        truncated: false,
      };
    }

    const mode = sandboxSettings.mode === 'danger-full-access' ? 'normal' : 'sandboxed';

    try {
      const result = await this.executor.execute(command, {
        cwd: this.workingDirectory,
        mode,
        timeout: sandboxSettings.maxExecutionTimeMs,
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
    const normalizedPosix = toPosixPath(normalized);
    const isMemoryVirtualPath =
      normalizedPosix === '/memories' || normalizedPosix.startsWith('/memories/');
    const isAbs = isAbsolute(normalized);

    let virtualPath = ensureLeadingSlash(isAbs ? normalized : `/${normalized}`);
    let absolutePath: string;
    const allowedRoots = [this.workingDirectory, ...this.allowedPathProvider().map((p) => resolve(p))];
    const isKnownAbsolute = (path: string) => {
      if (path.startsWith(this.workingDirectory)) return true;
      if (allowedRoots.some((root) => path === root || path.startsWith(`${root}${sep}`))) return true;
      return ABSOLUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
    };

    if (isMemoryVirtualPath) {
      const relative = normalizedPosix.replace(/^\/memories\/?/, '');
      absolutePath = join(this.workingDirectory, '.cowork', 'memories', relative);
      virtualPath = ensureLeadingSlash(normalizedPosix);
    } else if (isAbs) {
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
    baseVirtual: string,
    maxDepth = 20
  ): Promise<Array<{ absolute: string; virtual: string; relative: string }>> {
    const results: Array<{ absolute: string; virtual: string; relative: string }> = [];

    const walk = async (dir: string, relativeBase: string, depth: number) => {
      if (depth > maxDepth) return;
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
          await walk(absolute, relative, depth + 1);
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

    await walk(baseAbsolute, '', 0);
    return results;
  }
}
