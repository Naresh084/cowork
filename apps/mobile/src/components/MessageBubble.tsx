import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { extractMessageText } from '@/lib/chat';
import type { ChatItem } from '@/types/remote';

interface MessageBubbleProps {
  item: ChatItem;
}

function getMediaUri(item: ChatItem): string | null {
  const data = typeof item.data === 'string' ? item.data : null;
  const mimeType = typeof item.mimeType === 'string' ? item.mimeType : 'image/png';
  if (data) {
    return `data:${mimeType};base64,${data}`;
  }
  if (typeof item.url === 'string') return item.url;
  return null;
}

export function MessageBubble({ item }: MessageBubbleProps): React.JSX.Element | null {
  if (item.kind === 'media') {
    const mediaType = typeof item.mediaType === 'string' ? item.mediaType : 'image';
    const uri = getMediaUri(item);
    if (!uri) return null;
    return (
      <View style={styles.mediaWrap}>
        {mediaType === 'image' ? (
          <Image source={{ uri }} style={styles.mediaImage} resizeMode="cover" />
        ) : (
          <View style={styles.mediaVideoPlaceholder}>
            <Text style={styles.videoText}>Video generated</Text>
            <Text style={styles.videoSub}>{uri}</Text>
          </View>
        )}
      </View>
    );
  }

  if (item.kind === 'tool_start' || item.kind === 'tool_result') {
    const name = typeof item.name === 'string' ? item.name : 'Tool';
    const status = typeof item.status === 'string' ? item.status : 'running';
    return (
      <View style={styles.toolCard}>
        <Text style={styles.toolTitle}>{name}</Text>
        <Text style={styles.toolStatus}>{status}</Text>
      </View>
    );
  }

  if (item.kind === 'thinking') {
    const content = typeof item.content === 'string' ? item.content : '';
    if (!content.trim()) return null;
    return (
      <View style={styles.thinkingBubble}>
        <Text style={styles.thinkingText}>{content}</Text>
      </View>
    );
  }

  if (item.kind === 'error') {
    const message = typeof item.message === 'string' ? item.message : 'Error';
    return (
      <View style={styles.errorBubble}>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  }

  const text = extractMessageText(item);
  if (!text) return null;

  const isUser = item.kind === 'user_message';
  const isSystem = item.kind === 'system_message';

  return (
    <View
      style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.assistantBubble,
        isSystem ? styles.systemBubble : null,
      ]}
    >
      <Text style={[styles.messageText, isSystem ? styles.systemText : null]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  messageBubble: {
    maxWidth: '92%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primarySoft,
    borderColor: 'rgba(37,99,235,0.55)',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgElevated,
  },
  systemBubble: {
    alignSelf: 'center',
    maxWidth: '100%',
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderColor: 'rgba(245,158,11,0.4)',
  },
  messageText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  systemText: {
    color: '#FCD88D',
    fontSize: 12,
  },
  thinkingBubble: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  thinkingText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  toolCard: {
    alignSelf: 'stretch',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.45)',
    backgroundColor: 'rgba(30,64,175,0.18)',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  toolTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  toolStatus: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  mediaWrap: {
    alignSelf: 'stretch',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    backgroundColor: colors.bgElevated,
  },
  mediaImage: {
    width: '100%',
    height: 220,
    backgroundColor: colors.panelAlt,
  },
  mediaVideoPlaceholder: {
    padding: 12,
  },
  videoText: {
    color: colors.text,
    fontWeight: '600',
  },
  videoSub: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 12,
  },
  errorBubble: {
    alignSelf: 'stretch',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.12)',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    lineHeight: 18,
  },
});
