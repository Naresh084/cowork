import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/stores/app-store';
import type { CreateWorkflowDraftInput, WorkflowDefinition, WorkflowSchedule } from '@gemini-cowork/shared';

interface ScheduleSuggestionCardProps {
  taskName: string;
  taskDescription: string;
  prompt: string;
  schedule: {
    type: 'once' | 'daily' | 'weekly';
    time?: string;
    date?: string;
    dayOfWeek?: string;
  };
  workingDirectory: string;
  onAccept?: () => void;
  onDecline?: () => void;
}

export function ScheduleSuggestionCard({
  taskName,
  taskDescription,
  prompt,
  schedule,
  workingDirectory,
  onAccept,
  onDecline,
}: ScheduleSuggestionCardProps) {
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreated, setIsCreated] = useState(false);

  // Convert simple schedule to workflow schedule
  const toWorkflowSchedule = (): WorkflowSchedule => {
    switch (schedule.type) {
      case 'once': {
        const datePart = schedule.date || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const dateTime = new Date(`${datePart}T${schedule.time || '09:00'}`);
        return { type: 'at', timestamp: dateTime.getTime() };
      }
      case 'daily': {
        const [hours, mins] = (schedule.time || '09:00').split(':').map(Number);
        return { type: 'cron', expression: `${mins} ${hours} * * *` };
      }
      case 'weekly': {
        const [hours, mins] = (schedule.time || '09:00').split(':').map(Number);
        const dayNum = [
          'sunday',
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
        ].indexOf(schedule.dayOfWeek?.toLowerCase() || 'monday');
        return {
          type: 'cron',
          expression: `${mins} ${hours} * * ${dayNum >= 0 ? dayNum : 1}`,
        };
      }
    }
  };

  const formatScheduleDisplay = () => {
    switch (schedule.type) {
      case 'once':
        return `${schedule.date} at ${schedule.time || '09:00'}`;
      case 'daily':
        return `Every day at ${schedule.time || '09:00'}`;
      case 'weekly':
        return `Every ${schedule.dayOfWeek || 'Monday'} at ${schedule.time || '09:00'}`;
    }
  };

  const handleAccept = async () => {
    setIsCreating(true);
    try {
      const input: CreateWorkflowDraftInput = {
        name: taskName,
        description: taskDescription || 'Created from schedule suggestion card',
        triggers: [
          {
            id: `schedule_${Date.now()}`,
            type: 'schedule',
            enabled: true,
            schedule: toWorkflowSchedule(),
          },
        ],
        nodes: [
          { id: 'start', type: 'start', name: 'Start', config: {} },
          {
            id: 'agent_step_1',
            type: 'agent_step',
            name: 'Suggested Task',
            config: {
              promptTemplate: prompt,
              workingDirectory,
            },
          },
          { id: 'end', type: 'end', name: 'End', config: {} },
        ],
        edges: [
          { id: 'edge_start_to_step', from: 'start', to: 'agent_step_1', condition: 'always' },
          { id: 'edge_step_to_end', from: 'agent_step_1', to: 'end', condition: 'always' },
        ],
      };

      const draft = await invoke<WorkflowDefinition>('workflow_create_draft', { input });
      await invoke<WorkflowDefinition>('workflow_publish', { workflowId: draft.id });
      setIsCreated(true);
      onAccept?.();
    } catch (error) {
      console.error('Failed to create workflow automation:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCustomize = () => {
    setCurrentView('workflows');
  };

  if (isCreated) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'my-4 p-4 rounded-xl',
          'bg-[#50956A]/10 border border-[#50956A]/20'
        )}
      >
        <div className="flex items-center gap-2 text-[#8FDCA9]">
          <Check className="w-5 h-5" />
          <span className="font-medium">Workflow automation created!</span>
        </div>
        <p className="text-sm text-white/60 mt-1">
          "{taskName}" will run {formatScheduleDisplay().toLowerCase()}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'my-4 p-4 rounded-xl',
        'bg-gradient-to-r from-[#1D4ED8]/10 to-[#1E3A8A]/10',
        'border border-[#1D4ED8]/20'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#1D4ED8]/15 flex items-center justify-center flex-shrink-0">
          <Calendar className="w-5 h-5 text-[#60A5FA]" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white/90 mb-1">
            Schedule this as a recurring task?
          </h4>

          <div className="space-y-1.5 text-sm text-white/70 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-white/50">Task:</span>
              <span className="font-medium text-white/90">{taskName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/50">Schedule:</span>
              <span className="font-medium text-[#60A5FA]">
                {formatScheduleDisplay()}
              </span>
            </div>
            {taskDescription && (
              <p className="text-white/50 text-xs line-clamp-2">
                {taskDescription}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAccept}
              disabled={isCreating}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium',
                'bg-[#1D4ED8] text-white',
                'hover:bg-[#3B82F6] transition-colors',
                isCreating && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Workflow
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCustomize}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium',
                'bg-white/[0.06] text-white/70',
                'hover:bg-white/[0.10] transition-colors'
              )}
            >
              Customize
            </motion.button>

            <button
              onClick={onDecline}
              className="px-3 py-1.5 text-sm text-white/40 hover:text-white/60"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
