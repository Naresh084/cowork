import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sidecarDir = path.resolve(__dirname, '..');
const templatesDir = path.join(sidecarDir, 'src', 'prompts', 'templates');
const outFile = path.join(sidecarDir, 'src', 'prompts', 'generated', 'templates.ts');

async function listMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listMarkdownFiles(fullPath);
      files.push(...nested);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function toPosixRelative(filePath) {
  return path.relative(templatesDir, filePath).split(path.sep).join('/');
}

async function generate() {
  const markdownFiles = (await listMarkdownFiles(templatesDir)).sort();
  const entries = [];

  for (const filePath of markdownFiles) {
    const key = toPosixRelative(filePath);
    const content = await fs.readFile(filePath, 'utf8');
    entries.push([key, content]);
  }

  const lines = [];
  lines.push('// AUTO-GENERATED FILE. DO NOT EDIT.');
  lines.push('// Source: src/prompts/templates/**/*.md');
  lines.push('');
  lines.push('export const PROMPT_TEMPLATES = {');

  for (const [key, content] of entries) {
    lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(content)},`);
  }

  lines.push('} as const;');
  lines.push('');
  lines.push('export type PromptTemplateKey = keyof typeof PROMPT_TEMPLATES;');
  lines.push('');
  lines.push('export function listPromptTemplateKeys(): PromptTemplateKey[] {');
  lines.push('  return Object.keys(PROMPT_TEMPLATES) as PromptTemplateKey[];');
  lines.push('}');
  lines.push('');

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8');
}

generate().catch((error) => {
  console.error('[prompts:generate] failed:', error);
  process.exitCode = 1;
});
