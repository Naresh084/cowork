#!/usr/bin/env node
// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.


import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

async function loadYaml() {
  try {
    const mod = await import('yaml');
    return mod;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = {
    fix: false,
    dirs: [],
  };

  for (const raw of argv.slice(2)) {
    if (raw === '--fix') {
      args.fix = true;
      continue;
    }
    args.dirs.push(raw);
  }

  if (args.dirs.length === 0) {
    args.dirs.push('skills');
  }

  return args;
}

function normalizeNewlines(input) {
  return input.replace(/\r\n/g, '\n');
}

function maybeStripLineNumbers(content) {
  const lines = content.split('\n');
  if (lines.length === 0) return content;
  const numberedCount = lines.filter((line) => /^\s*\d+\t/.test(line)).length;
  if (numberedCount / lines.length < 0.6) return content;
  return lines.map((line) => line.replace(/^\s*\d+\t/, '')).join('\n');
}

function inferDescription(body, fallbackName) {
  const lines = body
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .filter((line) => line.length > 0);

  if (lines.length > 0) {
    return lines[0].slice(0, 300);
  }
  return `Use this skill for ${fallbackName} related tasks.`;
}

function escapeDoubleQuotes(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildMinimalSkillMarkdown(name, description, body) {
  const desc = escapeDoubleQuotes(description);
  const cleanedBody = body.trimStart();
  return `---\nname: ${name}\ndescription: "${desc}"\n---\n\n${cleanedBody}\n`;
}

async function validateAndMaybeFixSkill(skillDir, yaml, fix) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  const dirName = path.basename(skillDir);

  if (!fs.existsSync(skillFile)) {
    return {
      skill: dirName,
      status: 'invalid',
      reason: 'missing SKILL.md',
      fixed: false,
    };
  }

  let raw = await fsp.readFile(skillFile, 'utf-8');
  raw = maybeStripLineNumbers(normalizeNewlines(raw));

  const frontmatterMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const body = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw;

  let parsed = null;
  let parseError = null;

  if (frontmatterMatch && yaml) {
    try {
      parsed = yaml.parse(frontmatterMatch[1]);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  } else if (!frontmatterMatch) {
    parseError = 'no YAML frontmatter block';
  } else {
    parseError = 'yaml parser unavailable';
  }

  const validObject = parsed && typeof parsed === 'object';
  const name = validObject && typeof parsed.name === 'string' ? parsed.name.trim() : '';
  const description = validObject && typeof parsed.description === 'string' ? parsed.description.trim() : '';
  const isValid = Boolean(frontmatterMatch && validObject && name && description);
  const nameMatchesDir = isValid ? name === dirName : false;

  if (isValid && nameMatchesDir) {
    return {
      skill: dirName,
      status: 'valid',
      reason: '',
      fixed: false,
    };
  }

  if (!fix) {
    const reason = !isValid
      ? parseError || 'invalid frontmatter'
      : `frontmatter name "${name}" does not match directory "${dirName}"`;
    return {
      skill: dirName,
      status: 'invalid',
      reason,
      fixed: false,
    };
  }

  let rewritten = raw;
  if (validObject) {
    const normalized = { ...parsed };
    normalized.name = dirName;
    normalized.description = description || inferDescription(body, dirName);

    if (yaml) {
      const yamlBlock = yaml.stringify(normalized).trimEnd();
      rewritten = `---\n${yamlBlock}\n---\n\n${body.trimStart()}\n`;
    } else {
      rewritten = buildMinimalSkillMarkdown(
        dirName,
        typeof normalized.description === 'string'
          ? normalized.description
          : inferDescription(body, dirName),
        body,
      );
    }
  } else {
    rewritten = buildMinimalSkillMarkdown(dirName, inferDescription(body, dirName), body);
  }

  await fsp.writeFile(skillFile, rewritten, 'utf-8');

  return {
    skill: dirName,
    status: 'repaired',
    reason: parseError || 'rewritten to canonical skill frontmatter',
    fixed: true,
  };
}

async function listSkillDirs(baseDir) {
  if (!fs.existsSync(baseDir)) return [];
  const entries = await fsp.readdir(baseDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => path.join(baseDir, entry.name));
}

async function run() {
  const { fix, dirs } = parseArgs(process.argv);
  const yaml = await loadYaml();

  const targets = [];
  for (const dir of dirs) {
    const resolved = path.resolve(process.cwd(), dir);
    const skillDirs = await listSkillDirs(resolved);
    targets.push(...skillDirs);
  }

  let valid = 0;
  let invalid = 0;
  let repaired = 0;

  for (const skillDir of targets) {
    const result = await validateAndMaybeFixSkill(skillDir, yaml, fix);
    if (result.status === 'valid') {
      valid += 1;
      continue;
    }
    if (result.status === 'repaired') {
      repaired += 1;
      continue;
    }
    invalid += 1;
    process.stderr.write(`[skills-healthcheck] ${result.skill}: ${result.reason}\n`);
  }

  const summary = {
    scanned: targets.length,
    valid,
    repaired,
    invalid,
    fixApplied: fix,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (invalid > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  process.stderr.write(
    `[skills-healthcheck] fatal: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exit(1);
});
