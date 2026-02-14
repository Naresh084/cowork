// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { create } from 'zustand';

export type ConfirmVariant = 'default' | 'danger';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  dedupeKey?: string;
}

interface ConfirmRequest extends ConfirmOptions {
  id: string;
  resolve: (value: boolean) => void;
  promise: Promise<boolean>;
}

interface ConfirmState {
  activeRequest: ConfirmRequest | null;
  queue: ConfirmRequest[];
}

interface ConfirmActions {
  requestConfirm: (options: ConfirmOptions) => Promise<boolean>;
  resolveActiveRequest: (approved: boolean) => void;
  dismissAll: () => void;
}

function createRequest(options: ConfirmOptions): ConfirmRequest {
  let resolver: ((value: boolean) => void) | null = null;
  const promise = new Promise<boolean>((resolve) => {
    resolver = resolve;
  });

  return {
    id: `confirm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel || 'Confirm',
    cancelLabel: options.cancelLabel || 'Cancel',
    variant: options.variant || 'default',
    dedupeKey: options.dedupeKey,
    resolve: (value: boolean) => resolver?.(value),
    promise,
  };
}

function findByDedupeKey(
  activeRequest: ConfirmRequest | null,
  queue: ConfirmRequest[],
  dedupeKey: string | undefined,
): ConfirmRequest | null {
  if (!dedupeKey) return null;
  if (activeRequest?.dedupeKey === dedupeKey) {
    return activeRequest;
  }
  return queue.find((request) => request.dedupeKey === dedupeKey) || null;
}

export const useConfirmStore = create<ConfirmState & ConfirmActions>()((set, get) => ({
  activeRequest: null,
  queue: [],

  requestConfirm: (options) => {
    const existing = findByDedupeKey(
      get().activeRequest,
      get().queue,
      options.dedupeKey,
    );
    if (existing) {
      return existing.promise;
    }

    const request = createRequest(options);
    set((state) => {
      if (!state.activeRequest) {
        return { activeRequest: request };
      }
      return { queue: [...state.queue, request] };
    });
    return request.promise;
  },

  resolveActiveRequest: (approved) => {
    const activeRequest = get().activeRequest;
    if (!activeRequest) return;

    activeRequest.resolve(approved);
    set((state) => {
      const [next, ...rest] = state.queue;
      return {
        activeRequest: next || null,
        queue: rest,
      };
    });
  },

  dismissAll: () => {
    const { activeRequest, queue } = get();
    if (activeRequest) {
      activeRequest.resolve(false);
    }
    for (const request of queue) {
      request.resolve(false);
    }
    set({
      activeRequest: null,
      queue: [],
    });
  },
}));

export async function requestConfirm(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().requestConfirm(options);
}
