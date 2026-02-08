import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '@/theme/colors';
import { useAuthStore } from '@/stores/useAuthStore';

interface OnboardingScreenProps {
  onPaired: () => void;
}

export function OnboardingScreen({ onPaired }: OnboardingScreenProps): React.JSX.Element {
  const pairWithQr = useAuthStore((state) => state.pairWithQr);
  const isBusy = useAuthStore((state) => state.isBusy);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [permission, requestPermission] = useCameraPermissions();
  const [deviceName, setDeviceName] = useState('My phone');
  const [manualCode, setManualCode] = useState('');
  const [scanLocked, setScanLocked] = useState(false);

  const canScan = useMemo(
    () => Boolean(permission?.granted) && !scanLocked && !isBusy,
    [permission?.granted, scanLocked, isBusy],
  );

  const handlePair = async (raw: string): Promise<void> => {
    try {
      clearError();
      setScanLocked(true);
      await pairWithQr(raw, deviceName);
      onPaired();
    } catch {
      setScanLocked(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Mobile Pairing</Text>
        <Text style={styles.heroTitle}>Scan desktop QR to connect</Text>
        <Text style={styles.heroSubtitle}>
          No account login. Pair directly with your Cowork desktop tunnel for secure chat access.
        </Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Device name</Text>
        <TextInput
          value={deviceName}
          onChangeText={setDeviceName}
          placeholder="My phone"
          placeholderTextColor={colors.textDim}
          style={styles.input}
        />

        <View style={styles.cameraFrame}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={
                canScan
                  ? ({ data }) => {
                    void handlePair(data);
                  }
                  : undefined
              }
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraPlaceholderText}>Camera permission required</Text>
              <Pressable style={styles.primaryButton} onPress={() => void requestPermission()}>
                <Text style={styles.primaryButtonText}>Enable camera</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Text style={styles.manualLabel}>Simulator/manual pairing URL</Text>
        <TextInput
          value={manualCode}
          onChangeText={setManualCode}
          placeholder="cowork://pair?d=..."
          placeholderTextColor={colors.textDim}
          style={[styles.input, styles.manualInput]}
        />
        <Pressable
          style={[styles.primaryButton, (!manualCode.trim() || isBusy) && styles.buttonDisabled]}
          disabled={!manualCode.trim() || isBusy}
          onPress={() => void handlePair(manualCode.trim())}
        >
          <Text style={styles.primaryButtonText}>Pair with code</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.35)',
    backgroundColor: 'rgba(30,64,175,0.2)',
    padding: 16,
  },
  heroEyebrow: {
    color: '#93C5FD',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  heroSubtitle: {
    marginTop: 8,
    color: colors.textMuted,
    lineHeight: 20,
  },
  formCard: {
    flex: 1,
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    padding: 14,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  cameraFrame: {
    height: 280,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#05070C',
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
  },
  cameraPlaceholderText: {
    color: colors.textMuted,
  },
  manualLabel: {
    marginTop: 12,
    marginBottom: 6,
    color: colors.textDim,
    fontSize: 12,
  },
  manualInput: {
    minHeight: 44,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#F8FAFF',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  error: {
    marginTop: 10,
    color: '#FCA5A5',
    fontSize: 12,
  },
});
