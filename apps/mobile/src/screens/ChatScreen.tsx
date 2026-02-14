// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Composer } from '@/components/Composer';
import { MessageBubble } from '@/components/MessageBubble';
import { collectPendingPermissions, collectPendingQuestions } from '@/lib/chat';
import { colors } from '@/theme/colors';
import { useActiveSessionDetails, useChatStore } from '@/stores/useChatStore';
import type { AttachmentPayload, ChatItem } from '@/types/remote';

export function ChatScreen(): React.JSX.Element {
  const sessions = useChatStore((state) => state.sessions);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const streamBuffer = useChatStore((state) =>
    activeSessionId ? state.streamBuffers[activeSessionId] || '' : '',
  );
  const isLoadingSessions = useChatStore((state) => state.isLoadingSessions);
  const isLoadingSession = useChatStore((state) => state.isLoadingSession);
  const isSending = useChatStore((state) => state.isSending);
  const error = useChatStore((state) => state.error);

  const loadSessions = useChatStore((state) => state.loadSessions);
  const createSession = useChatStore((state) => state.createSession);
  const selectSession = useChatStore((state) => state.selectSession);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const stopGeneration = useChatStore((state) => state.stopGeneration);
  const respondPermission = useChatStore((state) => state.respondPermission);
  const respondQuestion = useChatStore((state) => state.respondQuestion);

  const details = useActiveSessionDetails();

  useEffect(() => {
    if (sessions.length === 0) {
      void loadSessions();
    }
  }, [sessions.length, loadSessions]);

  const items = useMemo(() => {
    const base = (details?.chatItems || []).slice();
    base.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return base;
  }, [details?.chatItems]);

  const pendingPermissions = useMemo(() => collectPendingPermissions(items), [items]);
  const pendingQuestions = useMemo(() => collectPendingQuestions(items), [items]);

  const handleSend = async (
    content: string,
    attachments: AttachmentPayload[],
  ): Promise<void> => {
    if (!activeSessionId) {
      const session = await createSession({});
      await sendMessage(session.id, content, attachments);
      return;
    }
    await sendMessage(activeSessionId, content, attachments);
  };

  const isStreaming = streamBuffer.length > 0;

  const renderItem = ({ item }: { item: ChatItem }): React.JSX.Element => (
    <MessageBubble item={item} />
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Cowork Chat</Text>
            <Text style={styles.subtitle}>
              Streaming chat + multimedia from your desktop assistant
            </Text>
          </View>
          <Pressable style={styles.newSessionButton} onPress={() => void createSession({})}>
            <Text style={styles.newSessionText}>New</Text>
          </Pressable>
        </View>

        <View style={styles.sessionRow}>
          <FlatList
            data={sessions}
            horizontal
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sessionListContent}
            renderItem={({ item }) => {
              const active = item.id === activeSessionId;
              return (
                <Pressable
                  onPress={() => void selectSession(item.id)}
                  style={[styles.sessionChip, active && styles.sessionChipActive]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.sessionChipText, active && styles.sessionChipTextActive]}
                  >
                    {item.title || item.firstMessage || 'Untitled session'}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>

        {pendingPermissions.length > 0 && activeSessionId && (
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>Permission required</Text>
            {pendingPermissions.map((entry) => (
              <View key={entry.id} style={styles.alertRow}>
                <Text style={styles.alertLabel}>{entry.label}</Text>
                <View style={styles.alertActions}>
                  <Pressable
                    style={styles.alertButton}
                    onPress={() => void respondPermission(activeSessionId, entry.permissionId, 'allow_once')}
                  >
                    <Text style={styles.alertButtonText}>Allow once</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.alertButton, styles.alertButtonDanger]}
                    onPress={() => void respondPermission(activeSessionId, entry.permissionId, 'deny')}
                  >
                    <Text style={styles.alertButtonDangerText}>Deny</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {pendingQuestions.length > 0 && activeSessionId && (
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>Question from assistant</Text>
            {pendingQuestions.map((entry) => (
              <View key={entry.id} style={styles.alertRow}>
                <Text style={styles.alertLabel}>{entry.question}</Text>
                <View style={styles.alertActions}>
                  <Pressable
                    style={styles.alertButton}
                    onPress={() => void respondQuestion(activeSessionId, entry.questionId, 'Yes')}
                  >
                    <Text style={styles.alertButtonText}>Yes</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.alertButton, styles.alertButtonDanger]}
                    onPress={() => void respondQuestion(activeSessionId, entry.questionId, 'No')}
                  >
                    <Text style={styles.alertButtonDangerText}>No</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.timelineWrap}>
          {(isLoadingSessions || isLoadingSession) && (
            <View style={styles.loader}>
              <ActivityIndicator color="#93C5FD" />
            </View>
          )}

          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.timelineContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySubtitle}>Start with a prompt or attach an image.</Text>
              </View>
            }
            ListFooterComponent={
              isStreaming ? (
                <View style={styles.streamingBubble}>
                  <Text style={styles.streamingText}>{streamBuffer}</Text>
                </View>
              ) : null
            }
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Composer
          disabled={isLoadingSessions || isSending}
          isStreaming={isStreaming}
          onSend={handleSend}
          onStop={async () => {
            if (activeSessionId) {
              await stopGeneration(activeSessionId);
            }
          }}
        />
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
  },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    marginTop: 2,
    fontSize: 12,
  },
  newSessionButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.4)',
    backgroundColor: 'rgba(59,130,246,0.17)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newSessionText: {
    color: '#BFDBFE',
    fontWeight: '700',
    fontSize: 12,
  },
  sessionRow: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
  },
  sessionListContent: {
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 8,
  },
  sessionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: 220,
  },
  sessionChipActive: {
    backgroundColor: 'rgba(37,99,235,0.24)',
    borderColor: 'rgba(59,130,246,0.7)',
  },
  sessionChipText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  sessionChipTextActive: {
    color: '#DBEAFE',
    fontWeight: '600',
  },
  alertCard: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    backgroundColor: 'rgba(245,158,11,0.12)',
    padding: 10,
    gap: 8,
  },
  alertTitle: {
    color: '#FCD88D',
    fontWeight: '600',
    fontSize: 12,
  },
  alertRow: {
    gap: 6,
  },
  alertLabel: {
    color: '#FDE68A',
    fontSize: 12,
  },
  alertActions: {
    flexDirection: 'row',
    gap: 8,
  },
  alertButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.35)',
    backgroundColor: 'rgba(250,204,21,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  alertButtonDanger: {
    borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  alertButtonText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '600',
  },
  alertButtonDangerText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
  },
  timelineWrap: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  timelineContent: {
    paddingBottom: 14,
  },
  loader: {
    paddingVertical: 6,
  },
  emptyState: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  streamingBubble: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.5)',
    backgroundColor: 'rgba(30,64,175,0.2)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignSelf: 'flex-start',
    maxWidth: '95%',
  },
  streamingText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: '#FCA5A5',
    marginHorizontal: 12,
    marginVertical: 6,
    fontSize: 12,
  },
});
