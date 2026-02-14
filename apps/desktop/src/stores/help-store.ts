// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GUIDED_TOUR_BY_ID } from '@/content/help/platform-help-content';

export interface HelpState {
  isHelpOpen: boolean;
  activeArticleId: string;
  activeTourId: string | null;
  activeTourStepIndex: number;
  completedTours: Record<string, boolean>;
  tourVersion: number;
}

interface HelpActions {
  openHelp: (articleId?: string) => void;
  closeHelp: () => void;
  startTour: (tourId: string, fromBeginning?: boolean) => void;
  stopTour: () => void;
  nextTourStep: () => void;
  previousTourStep: () => void;
  setTourStep: (stepIndex: number) => void;
  markTourCompleted: (tourId: string) => void;
  resetTours: () => void;
}

const TOUR_VERSION = 2;

const initialState: HelpState = {
  isHelpOpen: false,
  activeArticleId: 'platform-overview',
  activeTourId: null,
  activeTourStepIndex: 0,
  completedTours: {},
  tourVersion: TOUR_VERSION,
};

export const useHelpStore = create<HelpState & HelpActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      openHelp: (articleId = 'platform-overview') =>
        set({ isHelpOpen: true, activeArticleId: articleId }),

      closeHelp: () => set({ isHelpOpen: false }),

      startTour: (tourId, fromBeginning = true) => {
        const tour = GUIDED_TOUR_BY_ID[tourId];
        if (!tour) return;
        set((state) => ({
          activeTourId: tourId,
          activeTourStepIndex: fromBeginning ? 0 : state.activeTourStepIndex,
          isHelpOpen: false,
        }));
      },

      stopTour: () =>
        set({
          activeTourId: null,
          activeTourStepIndex: 0,
        }),

      nextTourStep: () => {
        const state = get();
        if (!state.activeTourId) return;
        const tour = GUIDED_TOUR_BY_ID[state.activeTourId];
        if (!tour) {
          set({ activeTourId: null, activeTourStepIndex: 0 });
          return;
        }

        const nextIndex = state.activeTourStepIndex + 1;
        if (nextIndex >= tour.steps.length) {
          set({
            activeTourId: null,
            activeTourStepIndex: 0,
            completedTours: {
              ...state.completedTours,
              [tour.id]: true,
            },
          });
          return;
        }

        set({ activeTourStepIndex: nextIndex });
      },

      previousTourStep: () =>
        set((state) => ({ activeTourStepIndex: Math.max(0, state.activeTourStepIndex - 1) })),

      setTourStep: (stepIndex) =>
        set({ activeTourStepIndex: Math.max(0, stepIndex) }),

      markTourCompleted: (tourId) =>
        set((state) => ({
          completedTours: {
            ...state.completedTours,
            [tourId]: true,
          },
        })),

      resetTours: () =>
        set({
          completedTours: {},
          activeTourId: null,
          activeTourStepIndex: 0,
          tourVersion: TOUR_VERSION,
        }),
    }),
    {
      name: 'help-store',
      partialize: (state) => ({
        activeArticleId: state.activeArticleId,
        completedTours: state.completedTours,
        tourVersion: state.tourVersion,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<HelpState> | undefined;
        const persistedVersion = persisted?.tourVersion ?? 0;
        if (persistedVersion !== TOUR_VERSION) {
          return {
            ...currentState,
            tourVersion: TOUR_VERSION,
            completedTours: {},
          };
        }

        return {
          ...currentState,
          ...persisted,
          isHelpOpen: false,
          activeTourId: null,
          activeTourStepIndex: 0,
        };
      },
    },
  ),
);
