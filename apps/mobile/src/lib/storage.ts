// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import * as SecureStore from 'expo-secure-store';

const STORAGE_KEYS = {
  endpoint: 'cowork.endpoint',
  wsEndpoint: 'cowork.wsEndpoint',
  token: 'cowork.token',
  deviceName: 'cowork.deviceName',
} as const;

export interface AuthStorageState {
  endpoint: string;
  wsEndpoint: string;
  token: string;
  deviceName: string;
}

export async function readAuthStorage(): Promise<AuthStorageState | null> {
  const [endpoint, wsEndpoint, token, deviceName] = await Promise.all([
    SecureStore.getItemAsync(STORAGE_KEYS.endpoint),
    SecureStore.getItemAsync(STORAGE_KEYS.wsEndpoint),
    SecureStore.getItemAsync(STORAGE_KEYS.token),
    SecureStore.getItemAsync(STORAGE_KEYS.deviceName),
  ]);

  if (!endpoint || !wsEndpoint || !token) {
    return null;
  }

  return {
    endpoint,
    wsEndpoint,
    token,
    deviceName: deviceName || 'Mobile',
  };
}

export async function writeAuthStorage(input: AuthStorageState): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.endpoint, input.endpoint),
    SecureStore.setItemAsync(STORAGE_KEYS.wsEndpoint, input.wsEndpoint),
    SecureStore.setItemAsync(STORAGE_KEYS.token, input.token),
    SecureStore.setItemAsync(STORAGE_KEYS.deviceName, input.deviceName),
  ]);
}

export async function clearAuthStorage(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(STORAGE_KEYS.endpoint),
    SecureStore.deleteItemAsync(STORAGE_KEYS.wsEndpoint),
    SecureStore.deleteItemAsync(STORAGE_KEYS.token),
    SecureStore.deleteItemAsync(STORAGE_KEYS.deviceName),
  ]);
}
