import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { useChatStore } from '@/stores/useChatStore';
import type { SessionSummary } from '@/types/remote';

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function SessionsScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const sessions = useChatStore((state) => state.sessions);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const loadSessions = useChatStore((state) => state.loadSessions);
  const selectSession = useChatStore((state) => state.selectSession);
  const createSession = useChatStore((state) => state.createSession);
  const error = useChatStore((state) => state.error);

  useEffect(() => {
    if (sessions.length === 0) {
      void loadSessions();
    }
  }, [sessions.length, loadSessions]);

  const openSession = async (sessionId: string): Promise<void> => {
    await selectSession(sessionId);
    navigation.navigate('Chat' as never);
  };

  const renderSession = ({ item }: { item: SessionSummary }): React.JSX.Element => {
    const active = item.id === activeSessionId;
    return (
      <Pressable onPress={() => void openSession(item.id)} style={[styles.card, active && styles.cardActive]}>
        <Text numberOfLines={1} style={styles.title}>
          {item.title || item.firstMessage || 'Untitled session'}
        </Text>
        <Text style={styles.meta}>
          {item.provider || 'provider'} · {item.model || 'model'}
        </Text>
        <Text style={styles.meta}>
          {item.messageCount} messages · updated {formatRelativeTime(item.updatedAt)}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Sessions</Text>
            <Text style={styles.headerSubtitle}>Resume or switch historical conversations</Text>
          </View>
          <Pressable style={styles.newButton} onPress={() => void createSession({})}>
            <Text style={styles.newButtonText}>New</Text>
          </Pressable>
        </View>

        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderSession}
          onRefresh={() => void loadSessions()}
          refreshing={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No sessions found</Text>
              <Text style={styles.emptySubtitle}>Create one from Chat to get started.</Text>
            </View>
          }
        />

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
    marginBottom: 10,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 12,
  },
  newButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.4)',
    backgroundColor: 'rgba(59,130,246,0.17)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newButtonText: {
    color: '#BFDBFE',
    fontWeight: '700',
    fontSize: 12,
  },
  listContent: {
    paddingBottom: 22,
    gap: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardActive: {
    borderColor: 'rgba(59,130,246,0.65)',
    backgroundColor: 'rgba(37,99,235,0.18)',
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: colors.textMuted,
    marginTop: 4,
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: colors.textMuted,
    marginTop: 6,
  },
  error: {
    color: '#FCA5A5',
    marginTop: 8,
  },
});
