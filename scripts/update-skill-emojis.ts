#!/usr/bin/env npx tsx

/**
 * Update Skill Emojis Script
 *
 * Adds appropriate emojis to all skills based on their name/category
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SKILLS_DIR = join(__dirname, '..', 'skills');

// Comprehensive emoji mapping for all skills
const EMOJI_MAP: Record<string, string> = {
  // Development
  'github': '🐙',
  'coding-agent': '🤖',
  'tmux': '🖥️',
  'gog': '🎮',
  'bird': '🐦',
  'canvas': '🎨',

  // DevOps
  'mcporter': '🚢',
  'model-usage': '📊',

  // Productivity
  '1password': '🔐',
  'obsidian': '💎',
  'notion': '📝',
  'slack': '💬',
  'trello': '📋',
  'bear-notes': '🐻',
  'things-mac': '✅',
  'apple-notes': '🍎',
  'apple-reminders': '⏰',
  'himalaya': '📧',
  'discord': '🎮',
  'imsg': '💬',
  'bluebubbles': '🫧',

  // Research
  'blogwatcher': '📰',
  'gifgrep': '🎞️',

  // Creative
  'peekaboo': '👀',
  'camsnap': '📷',
  'openai-whisper': '🎤',
  'openai-whisper-api': '🎙️',
  'openai-image-gen': '🖼️',
  'video-frames': '🎬',

  // Automation
  'openhue': '💡',
  'food-order': '🍔',
  'spotify-player': '🎵',
  'nano-banana-pro': '🍌',
  'eightctl': '😴',
  'blucli': '🦷',
  'wacli': '📱',
  'ordercli': '🛒',

  // Weather & Location
  'weather': '🌤️',
  'goplaces': '📍',
  'local-places': '🗺️',

  // Voice & Audio
  'voice-call': '📞',
  'sherpa-onnx-tts': '🔊',
  'songsee': '🎶',
  'sonoscli': '🔈',

  // AI & Tools
  'gemini': '✨',
  'sag': '🔍',
  'summarize': '📄',
  'oracle': '🔮',
  'skill-creator': '🛠️',
  'clawhub': '🦞',
  'session-logs': '📜',
  'nano-pdf': '📑',
};

// Default emojis by category
const CATEGORY_EMOJI: Record<string, string> = {
  'development': '💻',
  'devops': '⚙️',
  'productivity': '📌',
  'research': '🔬',
  'creative': '🎨',
  'automation': '🤖',
  'custom': '📦',
};

async function updateSkillEmoji(skillName: string): Promise<boolean> {
  const skillPath = join(SKILLS_DIR, skillName, 'SKILL.md');

  try {
    let content = await readFile(skillPath, 'utf-8');

    // Get emoji for this skill
    const emoji = EMOJI_MAP[skillName];
    if (!emoji) {
      console.log(`  [SKIP] No emoji defined for ${skillName}`);
      return false;
    }

    // Check if emoji already exists in metadata
    if (content.includes(`"emoji":`)) {
      // Update existing emoji
      content = content.replace(/"emoji":\s*"[^"]*"/, `"emoji": "${emoji}"`);
    } else {
      // Add emoji to metadata
      // Find the metadata JSON and add emoji after author
      content = content.replace(
        /("author":\s*"[^"]*")/,
        `$1,\n    "emoji": "${emoji}"`
      );
    }

    await writeFile(skillPath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error(`  [ERROR] Failed to update ${skillName}:`, error);
    return false;
  }
}

async function main(): Promise<void> {
  console.log('Updating Skill Emojis');
  console.log('====================');
  console.log('');

  // Get all skill directories
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skills = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);

  console.log(`Found ${skills.length} skills`);
  console.log('');

  let updated = 0;
  let skipped = 0;

  for (const skill of skills) {
    process.stdout.write(`Updating ${skill}... `);
    const success = await updateSkillEmoji(skill);
    if (success) {
      console.log(`${EMOJI_MAP[skill]} OK`);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log('');
  console.log('====================');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total: ${skills.length}`);
}

main().catch(console.error);
