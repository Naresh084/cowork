// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import {
  FileText,
  BarChart3,
  Palette,
  FolderTree,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { BrandMark } from '../icons/BrandMark';

export interface QuickAction {
  id: string;
  icon: typeof FileText;
  label: string;
  prompt?: string;
}

const quickActions: QuickAction[] = [
  {
    id: 'create_file',
    icon: FileText,
    label: 'Create a file',
    prompt: 'Help me create a new file. What type of file would you like to create?',
  },
  {
    id: 'analyze_data',
    icon: BarChart3,
    label: 'Crunch data',
    prompt: 'I can help you analyze and process data. What data would you like to work with?',
  },
  {
    id: 'prototype',
    icon: Palette,
    label: 'Make a prototype',
    prompt: 'Let\'s create a prototype. What are you looking to build?',
  },
  {
    id: 'organize',
    icon: FolderTree,
    label: 'Organize files',
    prompt: 'I can help organize your files. What folder would you like me to help organize?',
  },
  {
    id: 'meeting_prep',
    icon: Calendar,
    label: 'Prep for a meeting',
    prompt: 'I can help you prepare for a meeting. What\'s the meeting about?',
  },
  {
    id: 'plan_first',
    icon: FileText,
    label: 'Plan first',
    prompt: 'Switch this session to plan mode, analyze the task, and return one detailed <proposed_plan> block before implementation.',
  },
];

interface WelcomeScreenProps {
  onQuickAction: (action: QuickAction) => void;
}

export function WelcomeScreen({ onQuickAction }: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
      {/* Animated Icon */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative mb-6"
      >
        <div className="relative w-16 h-16 flex items-center justify-center">
          <BrandMark className="w-12 h-12" />
        </div>
      </motion.div>

      {/* Heading */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-2xl font-semibold text-white/90 mb-8 text-center"
      >
        Let's knock something off your list
      </motion.h1>

      {/* Quick Action Cards */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full max-w-2xl"
      >
        {quickActions.map((action, index) => (
          <motion.button
            key={action.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              delay: 0.3 + index * 0.05,
              ease: [0.16, 1, 0.3, 1],
            }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onQuickAction(action)}
            className={cn(
              'flex items-center gap-3 p-4 rounded-xl',
              'bg-[#111218] hover:bg-white/[0.06]',
              'border border-white/[0.08] hover:border-white/[0.12]',
              'text-left transition-all duration-200',
              'group'
            )}
          >
            <div
              className={cn(
                'p-2 rounded-xl',
                'bg-white/[0.04] group-hover:bg-[#1D4ED8]/20',
                'transition-colors duration-200'
              )}
            >
              <action.icon
                className={cn(
                  'w-5 h-5 text-white/50 group-hover:text-[#93C5FD]',
                  'transition-colors duration-200'
                )}
              />
            </div>
            <span className="text-sm text-white/70 group-hover:text-white/90">
              {action.label}
            </span>
          </motion.button>
        ))}
      </motion.div>

      {/* Keyboard hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="mt-8 text-xs text-white/30"
      >
        Type <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50">/</kbd> for commands
      </motion.p>
    </div>
  );
}
