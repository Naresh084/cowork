import {
  Sparkles,
  FileText,
  BarChart3,
  Palette,
  FolderTree,
  Calendar,
  Puzzle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

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
    id: 'plugins',
    icon: Puzzle,
    label: 'Customize with plugins',
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
        <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-xl animate-pulse" />
        <div className="relative w-16 h-16 flex items-center justify-center">
          <Sparkles className="w-12 h-12 text-orange-500" />
        </div>
      </motion.div>

      {/* Heading */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-2xl font-semibold text-stone-200 mb-8 text-center"
      >
        Let's knock something off your list
      </motion.h1>

      {/* Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="w-full max-w-2xl mb-8 p-4 rounded-xl bg-stone-800/30 border border-stone-700/50"
      >
        <p className="text-sm text-stone-400 text-center">
          Cowork is an early research preview. New improvements ship frequently.
        </p>
      </motion.div>

      {/* Quick Action Cards */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
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
              'bg-stone-800/40 hover:bg-stone-800/60',
              'border border-stone-700/50 hover:border-stone-600/50',
              'text-left transition-all duration-200',
              'group'
            )}
          >
            <div
              className={cn(
                'p-2 rounded-lg',
                'bg-stone-700/50 group-hover:bg-orange-500/20',
                'transition-colors duration-200'
              )}
            >
              <action.icon
                className={cn(
                  'w-5 h-5 text-stone-400 group-hover:text-orange-400',
                  'transition-colors duration-200'
                )}
              />
            </div>
            <span className="text-sm text-stone-300 group-hover:text-stone-200">
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
        className="mt-8 text-xs text-stone-600"
      >
        Type <kbd className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">/</kbd> for commands
      </motion.p>
    </div>
  );
}
