// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  ToolPolicy,
  ToolRule,
  ToolProfile,
  ToolEvaluationResult,
  ToolCallContext,
} from '@cowork/shared';

// ============================================================================
// State Interface
// ============================================================================

interface ToolPolicyState {
  policy: ToolPolicy | null;
  isLoading: boolean;
  isModalOpen: boolean;
  error: string | null;
  testResult: ToolEvaluationResult | null;
}

interface ToolPolicyActions {
  // Core policy operations
  loadPolicy: () => Promise<void>;
  updatePolicy: (updates: Partial<ToolPolicy>) => Promise<void>;
  setProfile: (profile: ToolProfile) => Promise<void>;
  resetPolicy: () => Promise<void>;

  // Rule management
  addRule: (rule: Omit<ToolRule, 'priority'>) => Promise<void>;
  removeRule: (index: number) => Promise<void>;

  // Global allow/deny list management
  addToGlobalAllow: (tool: string) => Promise<void>;
  removeFromGlobalAllow: (tool: string) => Promise<void>;
  addToGlobalDeny: (tool: string) => Promise<void>;
  removeFromGlobalDeny: (tool: string) => Promise<void>;

  // Testing/Evaluation
  testTool: (context: ToolCallContext) => Promise<ToolEvaluationResult>;
  clearTestResult: () => void;

  // UI actions
  openModal: () => void;
  closeModal: () => void;
  clearError: () => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useToolPolicyStore = create<ToolPolicyState & ToolPolicyActions>(
  (set, get) => ({
    // Initial state
    policy: null,
    isLoading: false,
    isModalOpen: false,
    error: null,
    testResult: null,

    // Core policy operations
    loadPolicy: async () => {
      set({ isLoading: true, error: null });
      try {
        const policy = await invoke<ToolPolicy>('policy_get');
        set({ policy, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false,
        });
      }
    },

    updatePolicy: async (updates: Partial<ToolPolicy>) => {
      set({ isLoading: true, error: null });
      try {
        const policy = await invoke<ToolPolicy>('policy_update', {
          input: updates,
        });
        set({ policy, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false,
        });
        throw error;
      }
    },

    setProfile: async (profile: ToolProfile) => {
      set({ isLoading: true, error: null });
      try {
        const policy = await invoke<ToolPolicy>('policy_set_profile', {
          profile,
        });
        set({ policy, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false,
        });
        throw error;
      }
    },

    resetPolicy: async () => {
      set({ isLoading: true, error: null });
      try {
        const policy = await invoke<ToolPolicy>('policy_reset');
        set({ policy, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false,
        });
        throw error;
      }
    },

    // Rule management
    addRule: async (rule: Omit<ToolRule, 'priority'>) => {
      try {
        await invoke<ToolRule>('policy_add_rule', { input: rule });
        await get().loadPolicy(); // Reload to get updated rules
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },

    removeRule: async (index: number) => {
      try {
        await invoke('policy_remove_rule', { index });
        await get().loadPolicy();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },

    // Global allow/deny list management
    addToGlobalAllow: async (tool: string) => {
      const { policy, updatePolicy } = get();
      if (!policy) return;
      if (policy.globalAllow.includes(tool)) return;
      await updatePolicy({
        globalAllow: [...policy.globalAllow, tool],
      });
    },

    removeFromGlobalAllow: async (tool: string) => {
      const { policy, updatePolicy } = get();
      if (!policy) return;
      await updatePolicy({
        globalAllow: policy.globalAllow.filter((t) => t !== tool),
      });
    },

    addToGlobalDeny: async (tool: string) => {
      const { policy, updatePolicy } = get();
      if (!policy) return;
      if (policy.globalDeny.includes(tool)) return;
      await updatePolicy({
        globalDeny: [...policy.globalDeny, tool],
      });
    },

    removeFromGlobalDeny: async (tool: string) => {
      const { policy, updatePolicy } = get();
      if (!policy) return;
      await updatePolicy({
        globalDeny: policy.globalDeny.filter((t) => t !== tool),
      });
    },

    // Testing/Evaluation
    testTool: async (context: ToolCallContext): Promise<ToolEvaluationResult> => {
      try {
        const result = await invoke<ToolEvaluationResult>('policy_evaluate', {
          context,
        });
        set({ testResult: result });
        return result;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },

    clearTestResult: () => set({ testResult: null }),

    // UI actions
    openModal: () => set({ isModalOpen: true }),
    closeModal: () => set({ isModalOpen: false, testResult: null }),
    clearError: () => set({ error: null }),
  })
);

// ============================================================================
// Selectors
// ============================================================================

export const useCurrentProfile = () =>
  useToolPolicyStore((state) => state.policy?.profile || 'coding');

export const useGlobalAllowList = () =>
  useToolPolicyStore((state) => state.policy?.globalAllow || []);

export const useGlobalDenyList = () =>
  useToolPolicyStore((state) => state.policy?.globalDeny || []);

export const useCustomRules = () =>
  useToolPolicyStore((state) => state.policy?.rules || []);

export const useToolPolicyModalOpen = () =>
  useToolPolicyStore((state) => state.isModalOpen);

export const useToolPolicyLoading = () =>
  useToolPolicyStore((state) => state.isLoading);
