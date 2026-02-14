// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * Suggestion Detector - Detects scheduling intent in user messages
 *
 * This module analyzes user messages to detect scheduling patterns and
 * generates structured suggestions for the UI to render.
 */

// Pattern definitions with associated schedule types
interface PatternDef {
  pattern: RegExp;
  type: 'once' | 'daily' | 'weekly' | 'interval' | 'cron';
  weight: number; // Higher weight = stronger signal
}

const SCHEDULING_PATTERNS: PatternDef[] = [
  // Explicit scheduling keywords (high weight)
  { pattern: /\b(schedule|scheduled|automate|automation)\b/i, type: 'daily', weight: 0.3 },
  { pattern: /\b(recurring|regularly|periodically|routine)\b/i, type: 'daily', weight: 0.25 },

  // Reminder patterns (once)
  { pattern: /\b(remind\s+me|don't\s+forget|reminder)\b/i, type: 'once', weight: 0.3 },

  // Daily patterns
  { pattern: /\bevery\s+(day|morning|evening|night)\b/i, type: 'daily', weight: 0.35 },
  { pattern: /\b(daily|each\s+day)\b/i, type: 'daily', weight: 0.35 },

  // Weekly patterns
  { pattern: /\b(every\s+)?(week|weekly)\b/i, type: 'weekly', weight: 0.35 },
  { pattern: /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, type: 'weekly', weight: 0.35 },

  // Interval patterns
  { pattern: /\bevery\s+\d+\s*(minute|hour|min|hr)s?\b/i, type: 'interval', weight: 0.35 },

  // Monthly/cron patterns
  { pattern: /\b(monthly|every\s+month)\b/i, type: 'cron', weight: 0.3 },

  // Future time patterns (once)
  { pattern: /\b(tomorrow|next\s+week)\b/i, type: 'once', weight: 0.2 },
  { pattern: /\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, type: 'once', weight: 0.2 },
  { pattern: /\bat\s+\d{1,2}(:\d{2})?\s*(am|pm)\b/i, type: 'once', weight: 0.15 },
  { pattern: /\bin\s+\d+\s+(hour|day|week|minute)s?\b/i, type: 'once', weight: 0.2 },

  // Task-specific patterns
  { pattern: /\b(standup|stand-up|status\s+report|progress\s+report)\b/i, type: 'daily', weight: 0.25 },
  { pattern: /\b(backup|sync|monitor|watch)\b.*\b(regularly|daily|weekly|hourly)\b/i, type: 'daily', weight: 0.3 },
  { pattern: /\b(check|review|analyze)\b.*\b(every|daily|weekly)\b/i, type: 'daily', weight: 0.3 },
];

// Time extraction patterns
const TIME_PATTERNS = [
  /\bat\s+(\d{1,2})(:\d{2})?\s*(am|pm)\b/i,
  /\b(\d{1,2})(:\d{2})?\s*(am|pm)\b/i,
  /\b(\d{1,2}):(\d{2})\b/,
];

// Day extraction patterns
const DAY_PATTERNS = [
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b(mon|tue|wed|thu|fri|sat|sun)\b/i,
];

// Interval extraction pattern
const INTERVAL_PATTERN = /\bevery\s+(\d+)\s*(minute|hour|min|hr)s?\b/i;

// Negative patterns - reduce confidence
const NEGATIVE_PATTERNS = [
  /\b(can\s+you|how\s+do|what\s+is|how\s+to)\b.*\bschedule/i, // Questions about scheduling
  /\bdon't\s+schedule\b/i,
  /\bno\s+(schedule|scheduling|reminder)\b/i,
  /\bcancel\b.*\bschedule/i,
];

export interface SchedulingDetectionResult {
  shouldSuggest: boolean;
  scheduleType: 'once' | 'daily' | 'weekly' | 'interval' | 'cron' | null;
  extractedTime: string | null;
  extractedDay: string | null;
  extractedInterval: number | null;
  confidence: number; // 0-1
  matchedPatterns: string[];
}

export function detectSchedulingIntent(message: string): SchedulingDetectionResult {
  const normalizedMessage = message.toLowerCase().trim();
  const matchedPatterns: string[] = [];
  let totalWeight = 0;
  let scheduleType: SchedulingDetectionResult['scheduleType'] = null;
  let highestWeight = 0;

  // Check for negative patterns first
  let negativeModifier = 0;
  for (const pattern of NEGATIVE_PATTERNS) {
    if (pattern.test(normalizedMessage)) {
      negativeModifier += 0.4;
    }
  }

  // Check each scheduling pattern
  for (const { pattern, type, weight } of SCHEDULING_PATTERNS) {
    const match = pattern.exec(normalizedMessage);
    if (match) {
      matchedPatterns.push(match[0]);
      totalWeight += weight;

      // Track the highest-weight type
      if (weight > highestWeight) {
        highestWeight = weight;
        scheduleType = type;
      }
    }
  }

  // Calculate confidence
  let confidence = Math.min(1, totalWeight);

  // Boost for action verbs + time combination
  if (/\b(do|run|check|review|send|create|generate|analyze)\b/i.test(normalizedMessage)) {
    confidence += 0.1;
  }

  // Boost for specific times
  if (TIME_PATTERNS.some(p => p.test(message))) {
    confidence += 0.1;
  }

  // Apply negative modifier
  confidence = Math.max(0, confidence - negativeModifier);

  // Clamp
  confidence = Math.min(1, Math.max(0, confidence));

  // Extract time, day, interval
  const extractedTime = extractTime(message);
  const extractedDay = extractDay(message);
  const extractedInterval = extractInterval(message);

  // Determine if we should suggest (threshold: 0.4)
  const shouldSuggest = confidence >= 0.4;

  return {
    shouldSuggest,
    scheduleType,
    extractedTime,
    extractedDay,
    extractedInterval,
    confidence,
    matchedPatterns,
  };
}

function extractTime(message: string): string | null {
  for (const pattern of TIME_PATTERNS) {
    const match = pattern.exec(message);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? match[2].replace(':', '') : '00';
      const period = match[3]?.toLowerCase();

      if (period === 'pm' && hours < 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      return `${hours.toString().padStart(2, '0')}:${minutes.padStart(2, '0')}`;
    }
  }
  return null;
}

function extractDay(message: string): string | null {
  for (const pattern of DAY_PATTERNS) {
    const match = pattern.exec(message);
    if (match) {
      const day = match[1].toLowerCase();
      // Normalize short forms
      const dayMap: Record<string, string> = {
        mon: 'monday',
        tue: 'tuesday',
        wed: 'wednesday',
        thu: 'thursday',
        fri: 'friday',
        sat: 'saturday',
        sun: 'sunday',
      };
      return dayMap[day] || day;
    }
  }
  return null;
}

function extractInterval(message: string): number | null {
  const match = INTERVAL_PATTERN.exec(message);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    // Convert to minutes
    if (unit.startsWith('hour') || unit === 'hr') {
      return amount * 60;
    }
    return amount; // Already in minutes
  }
  return null;
}

/**
 * Structured suggestion for the UI to render
 */
export interface ScheduleSuggestion {
  taskName: string;
  taskDescription: string;
  prompt: string;
  schedule: {
    type: 'once' | 'daily' | 'weekly';
    time?: string;
    date?: string;
    dayOfWeek?: string;
    intervalMinutes?: number;
  };
}

/**
 * Generate a structured suggestion based on detection results
 */
export function generateSuggestion(
  detection: SchedulingDetectionResult,
  userMessage: string,
  proposedTaskDescription: string
): ScheduleSuggestion | null {
  if (!detection.shouldSuggest) return null;

  // Generate a task name from the message
  const taskName = generateTaskName(userMessage);

  // Build schedule based on detection
  let schedule: ScheduleSuggestion['schedule'];

  switch (detection.scheduleType) {
    case 'once':
      schedule = {
        type: 'once',
        date: detection.extractedDay ? getNextDayDate(detection.extractedDay) : getTomorrowDate(),
        time: detection.extractedTime || '09:00',
      };
      break;

    case 'weekly':
      schedule = {
        type: 'weekly',
        dayOfWeek: detection.extractedDay || 'monday',
        time: detection.extractedTime || '09:00',
      };
      break;

    case 'interval':
      schedule = {
        type: 'daily',
        time: detection.extractedTime || '09:00',
        intervalMinutes: detection.extractedInterval || 60,
      };
      break;

    case 'daily':
    case 'cron':
    default:
      schedule = {
        type: 'daily',
        time: detection.extractedTime || '09:00',
      };
      break;
  }

  return {
    taskName,
    taskDescription: proposedTaskDescription,
    prompt: proposedTaskDescription,
    schedule,
  };
}

function generateTaskName(message: string): string {
  // Extract key action + object patterns
  const actionPatterns = [
    /\b(review|check|analyze|generate|send|create|backup|sync|monitor|watch|update)\s+(\w+(?:\s+\w+)?)/i,
    /\b(remind|notify|alert)\s+(?:me\s+)?(?:to\s+)?(\w+(?:\s+\w+)?)/i,
  ];

  for (const pattern of actionPatterns) {
    const match = message.match(pattern);
    if (match) {
      const action = match[1];
      const object = match[2];
      return (
        action.charAt(0).toUpperCase() +
        action.slice(1).toLowerCase() +
        ' ' +
        object
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ')
      );
    }
  }

  // Fallback: capitalize first few meaningful words
  const words = message
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4);

  if (words.length > 0) {
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  return 'Scheduled Task';
}

function getTomorrowDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

function getNextDayDate(day: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDay = days.indexOf(day.toLowerCase());
  if (targetDay === -1) return getTomorrowDate();

  const today = new Date();
  const currentDay = today.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;

  const nextDay = new Date(today);
  nextDay.setDate(today.getDate() + daysUntil);
  return nextDay.toISOString().split('T')[0];
}

/**
 * Format a schedule for display
 */
export function formatScheduleForDisplay(schedule: ScheduleSuggestion['schedule']): string {
  switch (schedule.type) {
    case 'once':
      if (schedule.date && schedule.time) {
        const date = new Date(schedule.date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        return `One-time on ${dayName} at ${formatTime12h(schedule.time)}`;
      }
      return 'One-time';

    case 'daily':
      if (schedule.intervalMinutes) {
        const hours = Math.floor(schedule.intervalMinutes / 60);
        const mins = schedule.intervalMinutes % 60;
        if (hours > 0 && mins > 0) {
          return `Every ${hours}h ${mins}m`;
        } else if (hours > 0) {
          return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
        } else {
          return `Every ${mins} minute${mins > 1 ? 's' : ''}`;
        }
      }
      return `Daily at ${formatTime12h(schedule.time || '09:00')}`;

    case 'weekly':
      const day = schedule.dayOfWeek
        ? schedule.dayOfWeek.charAt(0).toUpperCase() + schedule.dayOfWeek.slice(1)
        : 'Monday';
      return `Every ${day} at ${formatTime12h(schedule.time || '09:00')}`;

    default:
      return 'Scheduled';
  }
}

function formatTime12h(time24: string): string {
  const [hourStr, minStr] = time24.split(':');
  let hour = parseInt(hourStr, 10);
  const min = minStr || '00';
  const period = hour >= 12 ? 'PM' : 'AM';

  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;

  return `${hour}:${min} ${period}`;
}
