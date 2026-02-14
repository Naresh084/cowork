// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import {
  File,
  FileText,
  FileCode,
  FileJson,
  Image,
  Video,
  Music,
  FileArchive,
  Table,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const FILE_TYPE_ICONS: Record<string, LucideIcon> = {
  // Code files
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  py: FileCode,
  rb: FileCode,
  rs: FileCode,
  go: FileCode,
  java: FileCode,
  c: FileCode,
  cpp: FileCode,
  h: FileCode,
  cs: FileCode,
  php: FileCode,
  swift: FileCode,
  kt: FileCode,
  html: FileCode,
  css: FileCode,
  scss: FileCode,
  less: FileCode,

  // Config/Data
  json: FileJson,
  yaml: FileText,
  yml: FileText,
  toml: FileText,
  xml: FileText,
  ini: FileText,
  env: FileText,

  // Documents
  md: FileText,
  txt: FileText,
  pdf: FileText,
  doc: FileText,
  docx: FileText,

  // Spreadsheets
  csv: Table,
  xls: Table,
  xlsx: Table,

  // Images
  png: Image,
  jpg: Image,
  jpeg: Image,
  gif: Image,
  webp: Image,
  svg: Image,
  ico: Image,

  // Video
  mp4: Video,
  webm: Video,
  mov: Video,
  avi: Video,

  // Audio
  mp3: Music,
  wav: Music,
  ogg: Music,
  flac: Music,

  // Archives
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  rar: FileArchive,
  '7z': FileArchive,
};

const FILE_TYPE_COLORS: Record<string, string> = {
  // JavaScript/TypeScript - blue/yellow
  ts: 'text-blue-400',
  tsx: 'text-blue-400',
  js: 'text-yellow-400',
  jsx: 'text-yellow-400',

  // Python - green
  py: 'text-green-400',

  // Rust - orange
  rs: 'text-orange-400',

  // Go - cyan
  go: 'text-cyan-400',

  // Ruby - red
  rb: 'text-red-400',

  // Config - various
  json: 'text-yellow-300',
  yaml: 'text-purple-400',
  yml: 'text-purple-400',

  // Markdown - white
  md: 'text-white',

  // Images - pink
  png: 'text-pink-400',
  jpg: 'text-pink-400',
  jpeg: 'text-pink-400',
  svg: 'text-pink-400',
  gif: 'text-pink-400',

  // HTML/CSS
  html: 'text-orange-500',
  css: 'text-blue-500',
};

export function getFileIcon(filename: string): LucideIcon {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return FILE_TYPE_ICONS[ext] || File;
}

export function getFileTypeColor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return FILE_TYPE_COLORS[ext] || 'text-gray-400';
}

interface FileTypeIconProps {
  filename: string;
  size?: number;
  className?: string;
  showColor?: boolean;
}

export function FileTypeIcon({
  filename,
  size = 16,
  className,
  showColor = true,
}: FileTypeIconProps) {
  const IconComponent = getFileIcon(filename);
  const colorClass = showColor ? getFileTypeColor(filename) : '';

  return (
    <IconComponent
      size={size}
      className={cn(colorClass, className)}
    />
  );
}
