import { useState } from 'react';
import {
  HelpCircle,
  Check,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useChatStore, type UserQuestion, type QuestionOption } from '../../stores/chat-store';

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
      console.error('Failed to submit answer:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    (selectedOptions.size > 0 || (showCustomInput && customInput.trim())) &&
    !isSubmitting;

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden',
        'bg-gradient-to-br from-blue-500/5 to-purple-500/5',
        'border-blue-500/20',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-300'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-500/10 border-b border-blue-500/20">
        <div className="p-1.5 rounded-lg bg-blue-500/20">
          <HelpCircle className="w-4 h-4 text-blue-400" />
        </div>
        {question.header && (
          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-xs font-medium text-blue-400">
            {question.header}
          </span>
        )}
        <span className="text-sm font-medium text-white">
          {question.multiSelect ? 'Select one or more' : 'Select an option'}
        </span>
      </div>

      {/* Question */}
      <div className="px-4 py-3">
        <p className="text-sm text-white">{question.question}</p>
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
                'w-full flex items-start gap-3 p-3 rounded-lg',
                'text-left transition-all duration-200',
                'border',
                isSelected
                  ? 'bg-blue-500/10 border-blue-500/40'
                  : 'bg-gray-800/30 border-gray-700/50 hover:bg-gray-700/30 hover:border-gray-600/50'
              )}
            >
              {/* Checkbox/Radio indicator */}
              <div
                className={cn(
                  'flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center',
                  'border-2 transition-all duration-200',
                  question.multiSelect ? 'rounded' : 'rounded-full',
                  isSelected
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-gray-500'
                )}
              >
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </div>

              {/* Option content */}
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    'text-sm font-medium',
                    isSelected ? 'text-white' : 'text-gray-300'
                  )}
                >
                  {option.label}
                </span>
                {option.description && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {option.description}
                  </p>
                )}
              </div>

              {/* Arrow indicator */}
              {!question.multiSelect && isSelected && (
                <ChevronRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
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
                'w-full flex items-start gap-3 p-3 rounded-lg',
                'text-left transition-all duration-200',
                'border',
                showCustomInput
                  ? 'bg-blue-500/10 border-blue-500/40'
                  : 'bg-gray-800/30 border-gray-700/50 hover:bg-gray-700/30 hover:border-gray-600/50'
              )}
            >
              <div
                className={cn(
                  'flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center',
                  'border-2 transition-all duration-200',
                  question.multiSelect ? 'rounded' : 'rounded-full',
                  showCustomInput
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-gray-500'
                )}
              >
                {showCustomInput && <Check className="w-3 h-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    'text-sm font-medium',
                    showCustomInput ? 'text-white' : 'text-gray-300'
                  )}
                >
                  Other
                </span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Provide a custom response
                </p>
              </div>
              <MessageSquare className="w-4 h-4 text-gray-500 flex-shrink-0" />
            </button>

            {/* Custom input field */}
            {showCustomInput && (
              <div className="ml-8">
                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Type your response..."
                  rows={2}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-sm',
                    'bg-gray-900/50 border border-gray-700',
                    'text-white placeholder:text-gray-500',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500',
                    'resize-none'
                  )}
                  autoFocus
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Submit button */}
      <div className="px-4 pb-4">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
            'text-sm font-medium transition-all duration-200',
            canSubmit
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
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
    </div>
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
      console.error('Failed to respond to question:', error);
    }
  };

  return (
    <div className="my-4">
      <AskUserQuestion question={question} onAnswer={handleAnswer} />
    </div>
  );
}
