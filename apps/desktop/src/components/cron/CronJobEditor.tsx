import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Folder,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCronStore } from '@/stores/cron-store';
import { useSettingsStore } from '@/stores/settings-store';
import type {
  CronSchedule,
  CronSessionTarget,
  CronWakeMode,
  CreateCronJobInput,
} from '@gemini-cowork/shared';

type ScheduleType = 'once' | 'daily' | 'weekly' | 'interval' | 'cron';

interface FormState {
  name: string;
  prompt: string;
  scheduleType: ScheduleType;
  // Once
  onceDate: string;
  onceTime: string;
  // Daily
  dailyTime: string;
  // Weekly
  weeklyDay: string;
  weeklyTime: string;
  // Interval
  intervalValue: number;
  intervalUnit: 'minutes' | 'hours' | 'days';
  // Cron
  cronExpression: string;
  // Common
  timezone: string;
  workingDirectory: string;
  sessionTarget: CronSessionTarget;
  model: string;
  deleteAfterRun: boolean;
  postSummary: boolean;
}

const WEEKDAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

function getDefaultDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0];
}

function getDefaultTime(): string {
  return '09:00';
}

function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function CronJobEditor() {
  const { editorMode, selectedJobId, getJob, createJob, updateJob, closeEditor, isLoading, error, clearError } =
    useCronStore();
  const { defaultWorkingDirectory } = useSettingsStore();

  const editingJob = editorMode === 'edit' && selectedJobId ? getJob(selectedJobId) : null;

  const [form, setForm] = useState<FormState>({
    name: '',
    prompt: '',
    scheduleType: 'daily',
    onceDate: getDefaultDate(),
    onceTime: getDefaultTime(),
    dailyTime: getDefaultTime(),
    weeklyDay: '1',
    weeklyTime: getDefaultTime(),
    intervalValue: 1,
    intervalUnit: 'hours',
    cronExpression: '0 9 * * MON-FRI',
    timezone: getUserTimezone(),
    workingDirectory: defaultWorkingDirectory || '',
    sessionTarget: 'isolated',
    model: '',
    deleteAfterRun: false,
    postSummary: false,
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load existing job data when editing
  useEffect(() => {
    if (editingJob) {
      const schedule = editingJob.schedule;
      let scheduleType: ScheduleType = 'daily';
      let onceDate = getDefaultDate();
      let onceTime = getDefaultTime();
      let dailyTime = getDefaultTime();
      let weeklyDay = '1';
      let weeklyTime = getDefaultTime();
      let intervalValue = 1;
      let intervalUnit: 'minutes' | 'hours' | 'days' = 'hours';
      let cronExpression = '0 9 * * MON-FRI';
      let timezone = getUserTimezone();

      if (schedule.type === 'at') {
        scheduleType = 'once';
        const date = new Date(schedule.timestamp);
        onceDate = date.toISOString().split('T')[0];
        onceTime = date.toTimeString().slice(0, 5);
      } else if (schedule.type === 'every') {
        scheduleType = 'interval';
        const ms = schedule.intervalMs;
        if (ms < 3600000) {
          intervalValue = ms / 60000;
          intervalUnit = 'minutes';
        } else if (ms < 86400000) {
          intervalValue = ms / 3600000;
          intervalUnit = 'hours';
        } else {
          intervalValue = ms / 86400000;
          intervalUnit = 'days';
        }
      } else if (schedule.type === 'cron') {
        // Try to parse simple cron patterns
        const parts = schedule.expression.split(' ');
        if (parts.length === 5) {
          const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
          if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            scheduleType = 'daily';
            dailyTime = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
          } else if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
            scheduleType = 'weekly';
            weeklyDay = dayOfWeek;
            weeklyTime = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
          } else {
            scheduleType = 'cron';
            cronExpression = schedule.expression;
          }
        } else {
          scheduleType = 'cron';
          cronExpression = schedule.expression;
        }
        timezone = schedule.timezone || getUserTimezone();
      }

      setForm({
        name: editingJob.name,
        prompt: editingJob.prompt,
        scheduleType,
        onceDate,
        onceTime,
        dailyTime,
        weeklyDay,
        weeklyTime,
        intervalValue,
        intervalUnit,
        cronExpression,
        timezone,
        workingDirectory: editingJob.workingDirectory,
        sessionTarget: editingJob.sessionTarget,
        model: editingJob.model || '',
        deleteAfterRun: editingJob.deleteAfterRun || false,
        postSummary: false,
      });
    }
  }, [editingJob]);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setValidationError(null);
    clearError();
  };

  const buildSchedule = (): CronSchedule => {
    switch (form.scheduleType) {
      case 'once': {
        const dateTime = new Date(`${form.onceDate}T${form.onceTime}`);
        return { type: 'at', timestamp: dateTime.getTime() };
      }
      case 'daily': {
        const [hour, minute] = form.dailyTime.split(':').map(Number);
        return {
          type: 'cron',
          expression: `${minute} ${hour} * * *`,
          timezone: form.timezone,
        };
      }
      case 'weekly': {
        const [hour, minute] = form.weeklyTime.split(':').map(Number);
        return {
          type: 'cron',
          expression: `${minute} ${hour} * * ${form.weeklyDay}`,
          timezone: form.timezone,
        };
      }
      case 'interval': {
        let intervalMs = form.intervalValue;
        switch (form.intervalUnit) {
          case 'minutes':
            intervalMs *= 60000;
            break;
          case 'hours':
            intervalMs *= 3600000;
            break;
          case 'days':
            intervalMs *= 86400000;
            break;
        }
        return { type: 'every', intervalMs };
      }
      case 'cron':
        return {
          type: 'cron',
          expression: form.cronExpression,
          timezone: form.timezone,
        };
    }
  };

  const validate = (): boolean => {
    if (!form.name.trim()) {
      setValidationError('Name is required');
      return false;
    }
    if (!form.prompt.trim()) {
      setValidationError('Prompt is required');
      return false;
    }
    if (!form.workingDirectory.trim()) {
      setValidationError('Working directory is required');
      return false;
    }
    if (form.scheduleType === 'cron' && !form.cronExpression.trim()) {
      setValidationError('Cron expression is required');
      return false;
    }
    if (form.scheduleType === 'interval' && form.intervalValue < 1) {
      setValidationError('Interval must be at least 1');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const schedule = buildSchedule();
    const wakeMode: CronWakeMode = form.sessionTarget === 'main' ? 'next-heartbeat' : 'now';

    const input: CreateCronJobInput = {
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      schedule,
      sessionTarget: form.sessionTarget,
      wakeMode,
      workingDirectory: form.workingDirectory.trim(),
      model: form.model.trim() || undefined,
      deleteAfterRun: form.scheduleType === 'once' && form.deleteAfterRun,
    };

    try {
      if (editorMode === 'edit' && selectedJobId) {
        await updateJob(selectedJobId, input);
      } else {
        await createJob(input);
      }
      closeEditor();
    } catch {
      // Error is set in store
    }
  };

  const displayError = validationError || error;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.08]">
        <button
          onClick={closeEditor}
          className="p-2 -ml-2 rounded-lg hover:bg-white/[0.06] text-white/60 hover:text-white/90 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-white/90">
          {editorMode === 'edit' ? 'Edit Automation' : 'New Automation'}
        </h2>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">
            Name *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Daily Code Review"
            className={cn(
              'w-full px-4 py-2.5 rounded-lg text-sm',
              'bg-white/[0.04] border border-white/[0.08]',
              'text-white/90 placeholder:text-white/30',
              'focus:outline-none focus:border-[#4C71FF]/50'
            )}
          />
        </div>

        {/* Prompt */}
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">
            What should the agent do? *
          </label>
          <textarea
            value={form.prompt}
            onChange={(e) => updateField('prompt', e.target.value)}
            placeholder="Review yesterday's commits and summarize changes. Focus on code quality, missing tests, and security issues."
            rows={4}
            className={cn(
              'w-full px-4 py-2.5 rounded-lg text-sm resize-none',
              'bg-white/[0.04] border border-white/[0.08]',
              'text-white/90 placeholder:text-white/30',
              'focus:outline-none focus:border-[#4C71FF]/50'
            )}
          />
          <p className="mt-1.5 text-xs text-white/40 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Tip: Be specific about what you want the agent to check or do
          </p>
        </div>

        {/* Schedule Type */}
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">
            Schedule
          </label>
          <div className="flex flex-wrap gap-2 mb-4">
            {(['once', 'daily', 'weekly', 'interval', 'cron'] as ScheduleType[]).map(
              (type) => (
                <button
                  key={type}
                  onClick={() => updateField('scheduleType', type)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    form.scheduleType === type
                      ? 'bg-[#4C71FF] text-white'
                      : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08]'
                  )}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              )
            )}
          </div>

          {/* Schedule-specific inputs */}
          <div className="space-y-3">
            {form.scheduleType === 'once' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-white/50 mb-1">Date</label>
                  <input
                    type="date"
                    value={form.onceDate}
                    onChange={(e) => updateField('onceDate', e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg text-sm',
                      'bg-white/[0.04] border border-white/[0.08]',
                      'text-white/90',
                      'focus:outline-none focus:border-[#4C71FF]/50'
                    )}
                  />
                </div>
                <div className="w-32">
                  <label className="block text-xs text-white/50 mb-1">Time</label>
                  <input
                    type="time"
                    value={form.onceTime}
                    onChange={(e) => updateField('onceTime', e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg text-sm',
                      'bg-white/[0.04] border border-white/[0.08]',
                      'text-white/90',
                      'focus:outline-none focus:border-[#4C71FF]/50'
                    )}
                  />
                </div>
              </div>
            )}

            {form.scheduleType === 'daily' && (
              <div className="w-32">
                <label className="block text-xs text-white/50 mb-1">Time</label>
                <input
                  type="time"
                  value={form.dailyTime}
                  onChange={(e) => updateField('dailyTime', e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-sm',
                    'bg-white/[0.04] border border-white/[0.08]',
                    'text-white/90',
                    'focus:outline-none focus:border-[#4C71FF]/50'
                  )}
                />
              </div>
            )}

            {form.scheduleType === 'weekly' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-white/50 mb-1">Day</label>
                  <select
                    value={form.weeklyDay}
                    onChange={(e) => updateField('weeklyDay', e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg text-sm',
                      'bg-white/[0.04] border border-white/[0.08]',
                      'text-white/90',
                      'focus:outline-none focus:border-[#4C71FF]/50'
                    )}
                  >
                    {WEEKDAYS.map((day) => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-32">
                  <label className="block text-xs text-white/50 mb-1">Time</label>
                  <input
                    type="time"
                    value={form.weeklyTime}
                    onChange={(e) => updateField('weeklyTime', e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg text-sm',
                      'bg-white/[0.04] border border-white/[0.08]',
                      'text-white/90',
                      'focus:outline-none focus:border-[#4C71FF]/50'
                    )}
                  />
                </div>
              </div>
            )}

            {form.scheduleType === 'interval' && (
              <div className="flex gap-3 items-end">
                <div className="w-24">
                  <label className="block text-xs text-white/50 mb-1">Every</label>
                  <input
                    type="number"
                    min="1"
                    value={form.intervalValue}
                    onChange={(e) =>
                      updateField('intervalValue', parseInt(e.target.value) || 1)
                    }
                    className={cn(
                      'w-full px-3 py-2 rounded-lg text-sm',
                      'bg-white/[0.04] border border-white/[0.08]',
                      'text-white/90',
                      'focus:outline-none focus:border-[#4C71FF]/50'
                    )}
                  />
                </div>
                <select
                  value={form.intervalUnit}
                  onChange={(e) =>
                    updateField(
                      'intervalUnit',
                      e.target.value as 'minutes' | 'hours' | 'days'
                    )
                  }
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm',
                    'bg-white/[0.04] border border-white/[0.08]',
                    'text-white/90',
                    'focus:outline-none focus:border-[#4C71FF]/50'
                  )}
                >
                  <option value="minutes">Minute(s)</option>
                  <option value="hours">Hour(s)</option>
                  <option value="days">Day(s)</option>
                </select>
              </div>
            )}

            {form.scheduleType === 'cron' && (
              <div>
                <label className="block text-xs text-white/50 mb-1">
                  Cron Expression
                </label>
                <input
                  type="text"
                  value={form.cronExpression}
                  onChange={(e) => updateField('cronExpression', e.target.value)}
                  placeholder="0 9 * * MON-FRI"
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-sm font-mono',
                    'bg-white/[0.04] border border-white/[0.08]',
                    'text-white/90 placeholder:text-white/30',
                    'focus:outline-none focus:border-[#4C71FF]/50'
                  )}
                />
                <p className="mt-1 text-xs text-white/40">
                  Format: minute hour day-of-month month day-of-week
                </p>
              </div>
            )}

            {/* Timezone (for cron, daily, weekly) */}
            {['cron', 'daily', 'weekly'].includes(form.scheduleType) && (
              <div>
                <label className="block text-xs text-white/50 mb-1">Timezone</label>
                <input
                  type="text"
                  value={form.timezone}
                  onChange={(e) => updateField('timezone', e.target.value)}
                  placeholder={getUserTimezone()}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-sm',
                    'bg-white/[0.04] border border-white/[0.08]',
                    'text-white/90 placeholder:text-white/30',
                    'focus:outline-none focus:border-[#4C71FF]/50'
                  )}
                />
              </div>
            )}
          </div>
        </div>

        {/* Advanced Options */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-white/50 hover:text-white/70 transition-colors"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 p-4 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              {/* Working Directory */}
              <div>
                <label className="block text-xs text-white/50 mb-1 flex items-center gap-1">
                  <Folder className="w-3 h-3" />
                  Working Directory
                </label>
                <input
                  type="text"
                  value={form.workingDirectory}
                  onChange={(e) => updateField('workingDirectory', e.target.value)}
                  placeholder="/Users/you/project"
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-sm',
                    'bg-white/[0.04] border border-white/[0.08]',
                    'text-white/90 placeholder:text-white/30',
                    'focus:outline-none focus:border-[#4C71FF]/50'
                  )}
                />
              </div>

              {/* Session Target */}
              <div>
                <label className="block text-xs text-white/50 mb-2">
                  Execution Mode
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04]">
                    <input
                      type="radio"
                      name="sessionTarget"
                      checked={form.sessionTarget === 'isolated'}
                      onChange={() => updateField('sessionTarget', 'isolated')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm text-white/80">
                        Isolated session (recommended)
                      </div>
                      <div className="text-xs text-white/40">
                        Fresh context each run. Best for background tasks.
                      </div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04]">
                    <input
                      type="radio"
                      name="sessionTarget"
                      checked={form.sessionTarget === 'main'}
                      onChange={() => updateField('sessionTarget', 'main')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm text-white/80">Main session</div>
                      <div className="text-xs text-white/40">
                        Uses current conversation context.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Model Override */}
              <div>
                <label className="block text-xs text-white/50 mb-1">
                  Model Override (optional)
                </label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => updateField('model', e.target.value)}
                  placeholder="gemini-2.0-flash (uses session default)"
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-sm',
                    'bg-white/[0.04] border border-white/[0.08]',
                    'text-white/90 placeholder:text-white/30',
                    'focus:outline-none focus:border-[#4C71FF]/50'
                  )}
                />
              </div>

              {/* Delete after run (for one-time) */}
              {form.scheduleType === 'once' && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.deleteAfterRun}
                    onChange={(e) => updateField('deleteAfterRun', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-white/70">
                    Delete task after successful completion
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Error Display */}
        {displayError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <p className="text-sm text-red-400">{displayError}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.08]">
        <button
          onClick={closeEditor}
          className="px-4 py-2 rounded-lg text-sm bg-white/[0.06] text-white/70 hover:bg-white/[0.10] transition-colors"
        >
          Cancel
        </button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSubmit}
          disabled={isLoading}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium',
            'bg-[#4C71FF] text-white hover:bg-[#5B7FFF]',
            'transition-colors',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isLoading
            ? 'Saving...'
            : editorMode === 'edit'
            ? 'Save Changes'
            : 'Create Task'}
        </motion.button>
      </div>
    </motion.div>
  );
}
