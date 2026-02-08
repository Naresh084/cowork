import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { colors } from '@/theme/colors';
import type { AttachmentPayload } from '@/types/remote';

interface ComposerProps {
  disabled?: boolean;
  isStreaming?: boolean;
  onSend: (text: string, attachments: AttachmentPayload[]) => Promise<void>;
  onStop: () => Promise<void>;
}

interface LocalAttachment {
  id: string;
  payload: AttachmentPayload;
}

function extensionFromMime(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
}

export function Composer({
  disabled = false,
  isStreaming = false,
  onSend,
  onStop,
}: ComposerProps): React.JSX.Element {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);

  const canSend = useMemo(
    () => !disabled && !isSending && (text.trim().length > 0 || attachments.length > 0),
    [disabled, isSending, text, attachments.length],
  );

  const addImageAttachment = async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      quality: 0.85,
      mediaTypes: ['images'],
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'image/jpeg';
    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const payload: AttachmentPayload = {
      type: 'image',
      name: asset.fileName || `photo.${extensionFromMime(mimeType)}`,
      mimeType,
      data: base64,
    };

    setAttachments((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        payload,
      },
    ]);
  };

  const removeAttachment = (id: string): void => {
    setAttachments((current) => current.filter((entry) => entry.id !== id));
  };

  const handleSend = async (): Promise<void> => {
    if (!canSend) return;
    setIsSending(true);
    try {
      await onSend(
        text.trim(),
        attachments.map((entry) => entry.payload),
      );
      setText('');
      setAttachments([]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {attachments.length > 0 && (
        <View style={styles.attachmentRow}>
          {attachments.map((attachment) => (
            <Pressable
              key={attachment.id}
              onPress={() => removeAttachment(attachment.id)}
              style={styles.attachmentChip}
            >
              <Text style={styles.attachmentText}>{attachment.payload.name}</Text>
              <Text style={styles.attachmentRemove}>Remove</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.controlsRow}>
        <Pressable onPress={() => void addImageAttachment()} style={styles.actionButton}>
          <Text style={styles.actionButtonLabel}>+ Image</Text>
        </Pressable>

        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          style={styles.input}
          editable={!disabled}
          placeholder="Message Cowork..."
          placeholderTextColor={colors.textDim}
        />

        {isStreaming ? (
          <Pressable onPress={() => void onStop()} style={[styles.sendButton, styles.stopButton]}>
            <Text style={styles.sendButtonLabel}>Stop</Text>
          </Pressable>
        ) : (
          <Pressable disabled={!canSend} onPress={() => void handleSend()} style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}>
            <Text style={styles.sendButtonLabel}>{isSending ? '...' : 'Send'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
    gap: 6,
  },
  attachmentChip: {
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.4)',
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attachmentText: {
    color: colors.text,
    fontSize: 12,
    maxWidth: 150,
  },
  attachmentRemove: {
    color: '#93C5FD',
    fontSize: 11,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  actionButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  actionButtonLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    maxHeight: 128,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    color: colors.text,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
  },
  sendButton: {
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stopButton: {
    backgroundColor: '#DC2626',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonLabel: {
    color: '#F8FAFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
