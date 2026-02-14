// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { HeartbeatStatus, HeartbeatConfig, SystemEvent } from '@cowork/shared';

// ============================================================================
// State Interface
// ============================================================================

interface HeartbeatState {
  status: HeartbeatStatus | null;
  config: HeartbeatConfig;
  events: SystemEvent[];
  isLoading: boolean;
  error: string | null;
}

interface HeartbeatActions {
  loadStatus: () => Promise<void>;
  loadConfig: () => Promise<void>;
  loadEvents: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  setConfig: (config: HeartbeatConfig) => Promise<void>;
  wake: (mode?: 'now' | 'next-heartbeat') => Promise<void>;
  queueEvent: (event: Omit<SystemEvent, 'id' | 'scheduledAt'>) => Promise<string>;
  clearEvents: () => Promise<number>;
  clearError: () => void;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: HeartbeatConfig = {
  enabled: true,
  intervalMs: 60000, // 1 minute
  systemEventsEnabled: true,
  cronEnabled: true,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useHeartbeatStore = create<HeartbeatState & HeartbeatActions>(
  (set, get) => ({
    // Initial state
    status: null,
    config: DEFAULT_CONFIG,
    events: [],
    isLoading: false,
    error: null,

    // Load current heartbeat status
    loadStatus: async () => {
      try {
        const status = await invoke<HeartbeatStatus>('heartbeat_get_status');
        set({ status });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
      }
    },

    // Load heartbeat configuration
    loadConfig: async () => {
      try {
        const config = await invoke<HeartbeatConfig>('heartbeat_get_config');
        set({ config });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
      }
    },

    // Load queued events
    loadEvents: async () => {
      try {
        const events = await invoke<SystemEvent[]>('heartbeat_get_events');
        set({ events });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
      }
    },

    // Start heartbeat service
    start: async () => {
      set({ isLoading: true, error: null });
      try {
        await invoke('heartbeat_start');
        await get().loadStatus();
        set({ isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false,
        });
      }
    },

    // Stop heartbeat service
    stop: async () => {
      set({ isLoading: true, error: null });
      try {
        await invoke('heartbeat_stop');
        await get().loadStatus();
        set({ isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false,
        });
      }
    },

    // Update configuration
    setConfig: async (config: HeartbeatConfig) => {
      set({ isLoading: true, error: null });
      try {
        const updatedConfig = await invoke<HeartbeatConfig>(
          'heartbeat_set_config',
          { config }
        );
        set({ config: updatedConfig, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false,
        });
      }
    },

    // Trigger immediate wake
    wake: async (mode: 'now' | 'next-heartbeat' = 'now') => {
      try {
        await invoke('heartbeat_wake', { mode });
        await get().loadStatus();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
      }
    },

    // Queue a system event
    queueEvent: async (
      event: Omit<SystemEvent, 'id' | 'scheduledAt'>
    ): Promise<string> => {
      try {
        const eventId = await invoke<string>('heartbeat_queue_event', {
          input: event,
        });
        await get().loadEvents();
        return eventId;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },

    // Clear all queued events
    clearEvents: async (): Promise<number> => {
      try {
        const count = await invoke<number>('heartbeat_clear_events');
        set({ events: [] });
        return count;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },

    clearError: () => set({ error: null }),
  })
);

// ============================================================================
// Selectors
// ============================================================================

export const useHeartbeatStatus = () =>
  useHeartbeatStore((state) => state.status);

export const useHeartbeatConfig = () =>
  useHeartbeatStore((state) => state.config);

export const useHeartbeatEvents = () =>
  useHeartbeatStore((state) => state.events);

export const useHeartbeatIsRunning = () =>
  useHeartbeatStore((state) => state.status?.isRunning ?? false);

export const useHeartbeatEventQueueSize = () =>
  useHeartbeatStore((state) => state.status?.eventQueueSize ?? 0);
