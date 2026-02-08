import React, { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { useScheduleStore } from '@/stores/useScheduleStore';
import type { CronJob, WorkflowScheduledTaskSummary } from '@/types/remote';

function formatNextRun(value?: number | null): string {
  if (!value) return 'No next run';
  return new Date(value).toLocaleString();
}

function ActionButtons({
  enabled,
  onPause,
  onResume,
  onRun,
}: {
  enabled: boolean;
  onPause: () => void;
  onResume: () => void;
  onRun: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.actionRow}>
      <Pressable style={styles.actionButton} onPress={onRun}>
        <Text style={styles.actionText}>Run</Text>
      </Pressable>
      {enabled ? (
        <Pressable style={[styles.actionButton, styles.pauseButton]} onPress={onPause}>
          <Text style={styles.pauseText}>Pause</Text>
        </Pressable>
      ) : (
        <Pressable style={[styles.actionButton, styles.resumeButton]} onPress={onResume}>
          <Text style={styles.resumeText}>Resume</Text>
        </Pressable>
      )}
    </View>
  );
}

export function SchedulesScreen(): React.JSX.Element {
  const cronJobs = useScheduleStore((state) => state.cronJobs);
  const workflowTasks = useScheduleStore((state) => state.workflowTasks);
  const isLoading = useScheduleStore((state) => state.isLoading);
  const error = useScheduleStore((state) => state.error);
  const loadAll = useScheduleStore((state) => state.loadAll);
  const pauseCronJob = useScheduleStore((state) => state.pauseCronJob);
  const resumeCronJob = useScheduleStore((state) => state.resumeCronJob);
  const runCronJob = useScheduleStore((state) => state.runCronJob);
  const pauseWorkflowTask = useScheduleStore((state) => state.pauseWorkflowTask);
  const resumeWorkflowTask = useScheduleStore((state) => state.resumeWorkflowTask);
  const runWorkflowTask = useScheduleStore((state) => state.runWorkflowTask);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const renderCronJob = ({ item }: { item: CronJob }): React.JSX.Element => {
    const enabled = item.status === 'active';
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardMeta}>Status: {item.status}</Text>
        <Text style={styles.cardMeta}>Next: {formatNextRun(item.nextRunAt)}</Text>
        <Text style={styles.cardMeta}>{item.runCount} runs</Text>
        <ActionButtons
          enabled={enabled}
          onRun={() => void runCronJob(item.id)}
          onPause={() => void pauseCronJob(item.id)}
          onResume={() => void resumeCronJob(item.id)}
        />
      </View>
    );
  };

  const renderWorkflow = ({ item }: { item: WorkflowScheduledTaskSummary }): React.JSX.Element => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardMeta}>Workflow: {item.workflowId}</Text>
      <Text style={styles.cardMeta}>Next: {formatNextRun(item.nextRunAt)}</Text>
      <Text style={styles.cardMeta}>{item.runCount} runs</Text>
      <ActionButtons
        enabled={item.enabled}
        onRun={() => void runWorkflowTask(item.workflowId)}
        onPause={() => void pauseWorkflowTask(item.workflowId)}
        onResume={() => void resumeWorkflowTask(item.workflowId)}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Schedules</Text>
          <Pressable onPress={() => void loadAll()} style={styles.refreshButton}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>
        <Text style={styles.headerSubtitle}>
          Manage existing automation runs only. Creation/editing is chat-driven and not manual in mobile UI.
        </Text>

        {isLoading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color="#93C5FD" />
          </View>
        ) : (
          <FlatList
            data={cronJobs}
            keyExtractor={(item) => item.id}
            renderItem={renderCronJob}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View>
                <Text style={styles.sectionTitle}>Cron Jobs</Text>
                {cronJobs.length === 0 && (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>No cron jobs found.</Text>
                  </View>
                )}
                <Text style={styles.sectionTitle}>Workflow Schedules</Text>
                {workflowTasks.length === 0 && (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>No scheduled workflows found.</Text>
                  </View>
                )}
                {workflowTasks.map((task) => (
                  <View key={task.workflowId}>{renderWorkflow({ item: task })}</View>
                ))}
              </View>
            }
          />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  refreshButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  refreshText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  headerSubtitle: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  loaderWrap: {
    marginTop: 30,
    alignItems: 'center',
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 30,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  cardMeta: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.45)',
    backgroundColor: 'rgba(59,130,246,0.17)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionText: {
    color: '#BFDBFE',
    fontSize: 12,
    fontWeight: '700',
  },
  pauseButton: {
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.14)',
  },
  pauseText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
  },
  resumeButton: {
    borderColor: 'rgba(34,197,94,0.4)',
    backgroundColor: 'rgba(34,197,94,0.14)',
  },
  resumeText: {
    color: '#BBF7D0',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyText: {
    color: colors.textDim,
  },
  error: {
    color: '#FCA5A5',
    marginTop: 8,
  },
});
