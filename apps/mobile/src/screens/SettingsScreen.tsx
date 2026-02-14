// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { useAuthStore } from '@/stores/useAuthStore';

export function SettingsScreen(): React.JSX.Element {
  const endpoint = useAuthStore((state) => state.endpoint);
  const status = useAuthStore((state) => state.status);
  const refreshStatus = useAuthStore((state) => state.refreshStatus);
  const logout = useAuthStore((state) => state.logout);
  const isBusy = useAuthStore((state) => state.isBusy);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Mobile Settings</Text>
        <Text style={styles.subtitle}>Secure link status and account controls</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Endpoint</Text>
          <Text selectable style={styles.cardValue}>
            {endpoint || 'Not connected'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Remote Status</Text>
          <Text style={styles.cardValue}>
            {status?.enabled && status.running ? 'Connected' : 'Unavailable'}
          </Text>
          <Text style={styles.cardHint}>
            Tunnel mode: {status?.tunnelMode || 'unknown'} · Devices: {status?.deviceCount ?? 0}
          </Text>
        </View>

        {status?.tunnelHints?.length ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Tunnel hints (desktop)</Text>
            {status.tunnelHints.map((hint, index) => (
              <Text key={`${hint}-${index}`} style={styles.hintText}>
                {hint}
              </Text>
            ))}
          </View>
        ) : null}

        <Pressable style={styles.refreshButton} onPress={() => void refreshStatus()}>
          <Text style={styles.refreshButtonText}>Refresh status</Text>
        </Pressable>

        <Pressable
          style={[styles.logoutButton, isBusy && styles.disabledButton]}
          disabled={isBusy}
          onPress={() => void logout()}
        >
          <Text style={styles.logoutButtonText}>Logout this device</Text>
        </Pressable>
      </ScrollView>
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
  content: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 32,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 5,
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
  },
  cardLabel: {
    color: colors.textDim,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardValue: {
    marginTop: 4,
    color: colors.text,
    fontSize: 13,
  },
  cardHint: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 12,
  },
  hintText: {
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    color: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 11,
  },
  refreshButton: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
    paddingVertical: 10,
  },
  refreshButtonText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  logoutButton: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.15)',
    alignItems: 'center',
    paddingVertical: 11,
  },
  logoutButtonText: {
    color: '#FCA5A5',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
