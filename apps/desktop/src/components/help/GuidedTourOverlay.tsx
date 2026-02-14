// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GUIDED_TOUR_BY_ID } from '@/content/help/platform-help-content';
import { useHelpStore } from '@/stores/help-store';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getTargetRect(targetId: string): TargetRect | null {
  const element = document.querySelector(`[data-tour-id="${targetId}"]`) as HTMLElement | null;
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function GuidedTourOverlay() {
  const {
    activeTourId,
    activeTourStepIndex,
    nextTourStep,
    previousTourStep,
    stopTour,
    markTourCompleted,
  } = useHelpStore();
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  const tour = activeTourId ? GUIDED_TOUR_BY_ID[activeTourId] : null;
  const step = useMemo(() => {
    if (!tour) return null;
    return tour.steps[activeTourStepIndex] || null;
  }, [tour, activeTourStepIndex]);

  useEffect(() => {
    if (!tour || !step) {
      setTargetRect(null);
      return;
    }

    let skipTimer: number | null = null;
    const resolveRect = () => {
      const rect = getTargetRect(step.targetId);
      setTargetRect(rect);
      if (!rect) {
        skipTimer = window.setTimeout(() => {
          if (activeTourStepIndex >= tour.steps.length - 1) {
            markTourCompleted(tour.id);
            stopTour();
            return;
          }
          nextTourStep();
        }, 140);
      }
    };

    resolveRect();
    window.addEventListener('resize', resolveRect);
    window.addEventListener('scroll', resolveRect, true);

    return () => {
      window.removeEventListener('resize', resolveRect);
      window.removeEventListener('scroll', resolveRect, true);
      if (skipTimer !== null) {
        window.clearTimeout(skipTimer);
      }
    };
  }, [activeTourStepIndex, markTourCompleted, nextTourStep, step, stopTour, tour]);

  if (!tour || !step || !targetRect) {
    return null;
  }

  const isLastStep = activeTourStepIndex >= tour.steps.length - 1;
  const bubbleWidth = 360;
  const topWithOffset = targetRect.top + targetRect.height + 14;
  const bubbleTop =
    topWithOffset + 220 > window.innerHeight
      ? Math.max(14, targetRect.top - 230)
      : Math.min(window.innerHeight - 230, topWithOffset);
  const bubbleLeft = Math.min(
    Math.max(14, targetRect.left),
    Math.max(14, window.innerWidth - bubbleWidth - 14),
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/55" />
      <div
        className="absolute rounded-xl border-2 border-[#93C5FD] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-all duration-150"
        style={{
          top: targetRect.top - 6,
          left: targetRect.left - 6,
          width: targetRect.width + 12,
          height: targetRect.height + 12,
        }}
      />

      <div
        className="pointer-events-auto absolute rounded-xl border border-white/[0.12] bg-[#111218] p-3 shadow-2xl shadow-black/60"
        style={{
          top: bubbleTop,
          left: bubbleLeft,
          width: bubbleWidth,
        }}
      >
        <div className="inline-flex items-center gap-1.5 rounded-md bg-[#1D4ED8]/15 px-2 py-1 text-[11px] uppercase tracking-wide text-[#93C5FD]">
          <Sparkles className="h-3.5 w-3.5" />
          {tour.title}
        </div>
        <h4 className="mt-2 text-sm font-medium text-white/90">{step.title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-white/60">{step.description}</p>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-white/45">
            Step {activeTourStepIndex + 1} of {tour.steps.length}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => stopTour()}
              className="rounded-md px-2 py-1 text-xs text-white/55 hover:bg-white/[0.06] hover:text-white/85"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => previousTourStep()}
              disabled={activeTourStepIndex === 0}
              className={cn(
                'rounded-md px-2 py-1 text-xs',
                activeTourStepIndex === 0
                  ? 'cursor-not-allowed text-white/30'
                  : 'text-white/70 hover:bg-white/[0.06] hover:text-white/90',
              )}
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (isLastStep) {
                  markTourCompleted(tour.id);
                  stopTour();
                  return;
                }
                nextTourStep();
              }}
              className="rounded-md bg-[#1D4ED8] px-2.5 py-1 text-xs text-white hover:bg-[#3B82F6]"
            >
              {isLastStep ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
