// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useState } from 'react';
import {
  HelpCircle,
  Check,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useChatStore, type UserQuestion, type QuestionOption } from '../../stores/chat-store';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '../ui/Toast';

// Re-export types for convenience
export type { UserQuestion, QuestionOption };

interface AskUserQuestionProps {
  question: UserQuestion;
  onAnswer?: (questionId: string, answer: string | string[]) => void;
}

export function AskUserQuestion({ question, onAnswer }: AskUserQuestionProps) {
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleOptionToggle = (value: string) => {
    if (question.multiSelect) {
      setSelectedOptions((prev) => {
        const next = new Set(prev);
        if (next.has(value)) {
          next.delete(value);
        } else {
          next.add(value);
        }
        return next;
      });
    } else {
      setSelectedOptions(new Set([value]));
      setShowCustomInput(false);
    }
  };

  const handleCustomSelect = () => {
    setShowCustomInput(true);
    if (!question.multiSelect) {
      setSelectedOptions(new Set());
    }
  };

  const handleSubmit = async () => {
    if (selectedOptions.size === 0 && !showCustomInput) return;
    if (showCustomInput && !customInput.trim()) return;

    setIsSubmitting(true);

    try {
      let answer: string | string[];

      if (showCustomInput && customInput.trim()) {
        if (question.multiSelect) {
          answer = [...Array.from(selectedOptions), customInput.trim()];
        } else {
          answer = customInput.trim();
        }
      } else if (question.multiSelect) {
        answer = Array.from(selectedOptions);
      } else {
        answer = Array.from(selectedOptions)[0];
      }

      onAnswer?.(question.id, answer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to submit answer', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    (selectedOptions.size > 0 || (showCustomInput && customInput.trim())) &&
    !isSubmitting;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'rounded-xl border overflow-hidden',
        'bg-gradient-to-br from-[#1D4ED8]/5 to-[#1E3A8A]/5',
        'border-[#1D4ED8]/20'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-[#1D4ED8]/10 border-b border-[#1D4ED8]/20">
        <div className="p-1.5 rounded-lg bg-[#1D4ED8]/20">
          <HelpCircle className="w-4 h-4 text-[#93C5FD]" />
        </div>
        {question.header && (
          <span className="px-2 py-0.5 rounded-full bg-[#1D4ED8]/20 text-xs font-medium text-[#93C5FD]">
            {question.header}
          </span>
        )}
        <span className="text-sm font-medium text-white/90">
          {question.multiSelect ? 'Select one or more' : 'Select an option'}
        </span>
      </div>

      {/* Question */}
      <div className="px-4 py-3">
        <p className="text-sm text-white/80">{question.question}</p>
      </div>

      {/* Options */}
      <div className="px-4 pb-3 space-y-2">
        {question.options.map((option) => {
          const value = option.value || option.label;
          const isSelected = selectedOptions.has(value);

          return (
            <button
              key={value}
              onClick={() => handleOptionToggle(value)}
              className={cn(
                'w-full flex items-start gap-3 p-3 rounded-xl',
                'text-left transition-all duration-200',
                'border',
                isSelected
                  ? 'bg-[#1D4ED8]/10 border-[#1D4ED8]/40'
                  : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.10]'
              )}
            >
              {/* Checkbox/Radio indicator */}
              <div
                className={cn(
                  'flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center',
                  'border-2 transition-all duration-200',
                  question.multiSelect ? 'rounded' : 'rounded-full',
                  isSelected
                    ? 'bg-[#1D4ED8] border-[#1D4ED8]'
                    : 'border-white/30'
                )}
              >
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </div>

              {/* Option content */}
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    'text-sm font-medium',
                    isSelected ? 'text-white' : 'text-white/70'
                  )}
                >
                  {option.label}
                </span>
                {option.description && (
                  <p className="text-xs text-white/40 mt-0.5">
                    {option.description}
                  </p>
                )}
              </div>

              {/* Arrow indicator */}
              {!question.multiSelect && isSelected && (
                <ChevronRight className="w-4 h-4 text-[#93C5FD] flex-shrink-0" />
              )}
            </button>
          );
        })}

        {/* Custom/Other option */}
        {question.allowCustom !== false && (
          <>
            <button
              onClick={handleCustomSelect}
              className={cn(
                'w-full flex items-start gap-3 p-3 rounded-xl',
                'text-left transition-all duration-200',
                'border',
                showCustomInput
                  ? 'bg-[#1D4ED8]/10 border-[#1D4ED8]/40'
                  : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.10]'
              )}
            >
              <div
                className={cn(
                  'flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center',
                  'border-2 transition-all duration-200',
                  question.multiSelect ? 'rounded' : 'rounded-full',
                  showCustomInput
                    ? 'bg-[#1D4ED8] border-[#1D4ED8]'
                    : 'border-white/30'
                )}
              >
                {showCustomInput && <Check className="w-3 h-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    'text-sm font-medium',
                    showCustomInput ? 'text-white' : 'text-white/70'
                  )}
                >
                  Other
                </span>
                <p className="text-xs text-white/40 mt-0.5">
                  Provide a custom response
                </p>
              </div>
              <MessageSquare className="w-4 h-4 text-white/40 flex-shrink-0" />
            </button>

            {/* Custom input field */}
            <AnimatePresence>
              {showCustomInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="ml-8"
                >
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Type your response..."
                    rows={2}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg text-sm',
                      'bg-[#0D0D0F] border border-white/[0.08]',
                      'text-white/90 placeholder:text-white/30',
                      'focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/50 focus:border-[#1D4ED8]',
                      'resize-none'
                    )}
                    autoFocus
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Submit button */}
      <div className="px-4 pb-4">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl',
            'text-sm font-medium transition-all duration-200',
            canSubmit
              ? 'bg-gradient-to-r from-[#1E3A8A] to-[#1D4ED8] text-white shadow-lg shadow-[#1D4ED8]/25 hover:shadow-xl hover:shadow-[#1D4ED8]/35'
              : 'bg-white/[0.04] text-white/30 cursor-not-allowed'
          )}
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Submit Answer
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

// Inline question component for use in message list
interface InlineQuestionProps {
  question: UserQuestion;
}

export function InlineQuestion({ question }: InlineQuestionProps) {
  const { respondToQuestion } = useChatStore.getState() as unknown as {
    respondToQuestion?: (sessionId: string, questionId: string, answer: string | string[]) => Promise<void>;
  };

  const handleAnswer = async (questionId: string, answer: string | string[]) => {
    try {
      await respondToQuestion?.(question.sessionId, questionId, answer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to respond to question', errorMessage);
    }
  };

  return (
    <div className="my-4">
      <AskUserQuestion question={question} onAnswer={handleAnswer} />
    </div>
  );
}
