// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useRemoteAccessStore,
  type RemoteAccessStatus,
  type RemoteDraftOptions,
  type RemoteTunnelMode,
} from '@/stores/remote-access-store';
import { toast } from '@/components/ui/Toast';
import { RemoteDiagnosticsPanel } from './RemoteDiagnosticsPanel';
import { formatCountdown, getTunnelProviderMeta, normalizeDomainInput } from './constants';
import { RemoteStepShell, type RemoteStepState } from './RemoteStepShell';
import { Step1Provider } from './steps/Step1Provider';
import { Step2Options } from './steps/Step2Options';
import { Step3Dependency } from './steps/Step3Dependency';
import { Step4Auth } from './steps/Step4Auth';
import { Step5Runtime } from './steps/Step5Runtime';
import { Step6Pair } from './steps/Step6Pair';

const TOTAL_STEPS = 6;

interface RemoteSetupWizardProps {
  isHydrating: boolean;
  isEditing?: boolean;
  onComplete: () => void;
  onCancelEdit?: () => void;
}

interface StepProgress {
  mode: RemoteTunnelMode;
  endpoint: string | null;
  authNeeded: boolean;
  installNeeded: boolean;
  customEndpointMissing: boolean;
  stepOneComplete: boolean;
  stepTwoComplete: boolean;
  stepThreeComplete: boolean;
  stepFourComplete: boolean;
  stepFiveComplete: boolean;
  stepSixComplete: boolean;
  selectedProviderLabel: string;
}

function computeProgress(
  status: RemoteAccessStatus | null,
  draftProvider: RemoteTunnelMode | null,
  draftOptions: RemoteDraftOptions,
  pairingQrPresent: boolean,
): StepProgress {
  const mode = draftProvider ?? status?.tunnelMode ?? 'tailscale';
  const normalizedDomain = normalizeDomainInput(draftOptions.tunnelDomain);
  const visibility = mode === 'cloudflare' ? 'public' : draftOptions.tunnelVisibility;
  const installNeeded = mode !== 'custom';
  const authNeeded =
    mode === 'tailscale' || (mode === 'cloudflare' && Boolean((status?.tunnelDomain || normalizedDomain).trim()));
  const customEndpointMissing = mode === 'custom' && !draftOptions.publicBaseUrl.trim() && !normalizedDomain;
  const endpoint = status ? status.tunnelPublicUrl || status.publicBaseUrl || status.localBaseUrl : null;

  const stepOneComplete = Boolean(status && status.tunnelMode === mode);
  const stepTwoComplete = Boolean(
    status &&
      stepOneComplete &&
      (status.tunnelName || '') === draftOptions.tunnelName.trim() &&
      (status.tunnelDomain || '') === normalizedDomain &&
      status.tunnelVisibility === visibility &&
      (!customEndpointMissing && (mode !== 'custom' || Boolean(status.publicBaseUrl || normalizedDomain))),
  );
  const stepThreeComplete = Boolean(stepTwoComplete && (!installNeeded || status?.tunnelBinaryInstalled));
  const stepFourComplete = Boolean(stepThreeComplete && (!authNeeded || status?.tunnelAuthStatus === 'authenticated'));
  const stepFiveComplete = Boolean(stepFourComplete && status?.tunnelState === 'running' && endpoint);
  const stepSixComplete = Boolean(stepFiveComplete && ((status?.deviceCount ?? 0) > 0 || pairingQrPresent));

  return {
    mode,
    endpoint,
    authNeeded,
    installNeeded,
    customEndpointMissing,
    stepOneComplete,
    stepTwoComplete,
    stepThreeComplete,
    stepFourComplete,
    stepFiveComplete,
    stepSixComplete,
    selectedProviderLabel: getTunnelProviderMeta(mode).label,
  };
}

function stateForStep(index: number, progress: StepProgress): RemoteStepState {
  if (index === 1) return progress.stepOneComplete ? 'done' : 'active';
  if (index === 2) return !progress.stepOneComplete ? 'locked' : progress.stepTwoComplete ? 'done' : 'active';
  if (index === 3) return !progress.stepTwoComplete ? 'locked' : progress.stepThreeComplete ? 'done' : 'active';
  if (index === 4) return !progress.stepThreeComplete ? 'locked' : progress.stepFourComplete ? 'done' : 'active';
  if (index === 5) return !progress.stepFourComplete ? 'locked' : progress.stepFiveComplete ? 'done' : 'active';
  return !progress.stepFiveComplete ? 'locked' : progress.stepSixComplete ? 'done' : 'active';
}

export function RemoteSetupWizard({
  isHydrating,
  isEditing = false,
  onComplete,
  onCancelEdit,
}: RemoteSetupWizardProps) {
  const {
    status,
    pairingQr,
    error,
    draftProvider,
    draftOptions,
    isSavingProvider,
    isSavingOptions,
    isInstallingTunnel,
    isAuthenticatingTunnel,
    isStartingTunnel,
    isStoppingTunnel,
    isGeneratingQr,
    setDraftProvider,
    setDraftOptions,
    applyDraftProvider,
    applyDraftOptions,
    installTunnelBinary,
    authenticateTunnel,
    startTunnel,
    generatePairingQr,
    discardDraftChanges,
  } = useRemoteAccessStore();

  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(-1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [expiresCountdown, setExpiresCountdown] = useState<string | null>(null);

  const progress = useMemo(
    () => computeProgress(status, draftProvider, draftOptions, Boolean(pairingQr)),
    [status, draftProvider, draftOptions, pairingQr],
  );

  const selectedProvider = useMemo(
    () => getTunnelProviderMeta(progress.mode),
    [progress.mode],
  );

  useEffect(() => {
    if (!pairingQr) {
      setExpiresCountdown(null);
      return;
    }

    setExpiresCountdown(formatCountdown(pairingQr.expiresAt));
    const timer = setInterval(() => {
      setExpiresCountdown(formatCountdown(pairingQr.expiresAt));
    }, 1000);

    return () => clearInterval(timer);
  }, [pairingQr]);

  useEffect(() => {
    if (!isEditing) return;
    setCurrentStep(1);
    setStepError(null);
  }, [isEditing]);

  const isBusy =
    isHydrating ||
    isSavingProvider ||
    isSavingOptions ||
    isInstallingTunnel ||
    isAuthenticatingTunnel ||
    isStartingTunnel ||
    isStoppingTunnel ||
    isGeneratingQr;

  const currentState = stateForStep(currentStep, progress);

  const goToStep = (nextStep: number) => {
    const bounded = Math.min(TOTAL_STEPS, Math.max(1, nextStep));
    setDirection(bounded > currentStep ? -1 : 1);
    setCurrentStep(bounded);
  };

  const handleBack = () => {
    if (currentStep <= 1 || isBusy) return;
    goToStep(currentStep - 1);
  };

  const runCurrentStep = async () => {
    if (isBusy || isHydrating) return;

    setStepError(null);
    try {
      if (currentStep === 1) {
        if (!progress.stepOneComplete) {
          await applyDraftProvider();
        }
        goToStep(2);
        return;
      }

      if (currentStep === 2) {
        if (!progress.stepOneComplete) {
          throw new Error('Select and save a provider first.');
        }

        if (progress.customEndpointMissing) {
          throw new Error('Custom mode needs endpoint URL or domain before continuing.');
        }

        if (!progress.stepTwoComplete) {
          await applyDraftOptions();
        }

        goToStep(3);
        return;
      }

      if (currentStep === 3) {
        if (!progress.stepTwoComplete) {
          throw new Error('Apply tunnel configuration first.');
        }

        if (progress.installNeeded && !status?.tunnelBinaryInstalled) {
          await installTunnelBinary();
        }

        goToStep(4);
        return;
      }

      if (currentStep === 4) {
        if (!progress.stepThreeComplete) {
          throw new Error('Install provider dependency first.');
        }

        if (progress.authNeeded && status?.tunnelAuthStatus !== 'authenticated') {
          await authenticateTunnel();
        }

        goToStep(5);
        return;
      }

      if (currentStep === 5) {
        if (!progress.stepFourComplete) {
          throw new Error('Authenticate provider first.');
        }

        if (status?.tunnelState !== 'running' || !progress.endpoint) {
          await startTunnel();
        }

        goToStep(6);
        return;
      }

      if (currentStep === 6) {
        if (!progress.stepFiveComplete) {
          throw new Error('Tunnel must be running before pairing.');
        }

        if ((status?.deviceCount ?? 0) === 0 && !pairingQr) {
          await generatePairingQr();
          toast.success('Pairing QR generated');
        }

        onComplete();
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setStepError(message);
    }
  };

  const actionLabel = useMemo(() => {
    if (currentStep === 1) return progress.stepOneComplete ? 'Next' : 'Save provider';
    if (currentStep === 2) return progress.stepTwoComplete ? 'Next' : 'Apply configuration';
    if (currentStep === 3) {
      if (!progress.installNeeded || status?.tunnelBinaryInstalled) return 'Next';
      return `Install ${selectedProvider.installLabel}`;
    }
    if (currentStep === 4) {
      if (!progress.authNeeded || status?.tunnelAuthStatus === 'authenticated') return 'Next';
      return `Authenticate ${selectedProvider.label}`;
    }
    if (currentStep === 5) return status?.tunnelState === 'running' ? 'Next' : 'Start tunnel';
    if (progress.stepSixComplete) return isEditing ? 'Save and return' : 'Finish setup';
    return 'Generate QR & finish';
  }, [
    currentStep,
    progress.stepOneComplete,
    progress.stepTwoComplete,
    progress.installNeeded,
    progress.authNeeded,
    progress.stepSixComplete,
    selectedProvider.installLabel,
    selectedProvider.label,
    status?.tunnelBinaryInstalled,
    status?.tunnelAuthStatus,
    status?.tunnelState,
    isEditing,
  ]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#2A6AF2]/30 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(37,99,235,0.22),rgba(13,16,24,0.85))] p-5">
        <p className="text-xs uppercase tracking-[0.12em] text-white/55">Guided Remote Setup</p>
        <h3 className="mt-1 text-lg font-semibold text-white/95">
          {isEditing ? 'Edit remote tunnel setup' : 'Secure internet access for phone control'}
        </h3>
        <p className="mt-2 text-sm text-white/70">
          Strict step-by-step flow. Each step validates before you can move forward.
        </p>
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          initial={{ opacity: 0, x: direction > 0 ? 80 : -80 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction > 0 ? -80 : 80 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <RemoteStepShell
            step={currentStep}
            totalSteps={TOTAL_STEPS}
            state={currentState}
            title={
              currentStep === 1
                ? 'Choose tunnel provider'
                : currentStep === 2
                  ? 'Configure tunnel options'
                  : currentStep === 3
                    ? 'Install provider dependency'
                    : currentStep === 4
                      ? 'Authenticate provider'
                      : currentStep === 5
                        ? 'Start tunnel and verify'
                        : 'Pair phone with QR'
            }
            description={
              currentStep === 1
                ? 'Pick one provider first. Later steps adapt automatically.'
                : currentStep === 2
                  ? 'Set tunnel name, endpoint/domain, and access scope.'
                  : currentStep === 3
                    ? 'Install required runtime binary for managed lifecycle.'
                    : currentStep === 4
                      ? 'Run provider auth if required for selected mode.'
                      : currentStep === 5
                        ? 'Start and verify endpoint before pairing devices.'
                        : 'Generate short-lived QR and pair from mobile app.'
            }
          >
            {currentStep === 1 ? (
              <Step1Provider
                selectedMode={progress.mode}
                savedMode={status?.tunnelMode || null}
                onSelectMode={(mode) => setDraftProvider(mode)}
                disabled={isHydrating}
              />
            ) : null}

            {currentStep === 2 ? (
              <Step2Options
                mode={progress.mode}
                options={draftOptions}
                customEndpointMissing={progress.customEndpointMissing}
                onChange={(input) => setDraftOptions(input)}
                disabled={isHydrating}
              />
            ) : null}

            {currentStep === 3 ? (
              <Step3Dependency
                installLabel={selectedProvider.installLabel}
                status={status}
                installNeeded={progress.installNeeded}
              />
            ) : null}

            {currentStep === 4 ? (
              <Step4Auth authLabel={selectedProvider.authLabel} authNeeded={progress.authNeeded} status={status} />
            ) : null}

            {currentStep === 5 ? <Step5Runtime status={status} endpoint={progress.endpoint} /> : null}

            {currentStep === 6 ? (
              <Step6Pair status={status} pairingQr={pairingQr} expiresCountdown={expiresCountdown} />
            ) : null}
          </RemoteStepShell>
        </motion.div>
      </AnimatePresence>

      {(stepError || error || status?.tunnelLastError) && (
        <div className="rounded-xl border border-[#FF6A6A]/35 bg-[#FF5449]/10 px-3 py-2 text-sm text-[#FFB1AB]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              {stepError || error || status?.tunnelLastError}
            </p>
            <button
              type="button"
              onClick={() => setShowDiagnostics((prev) => !prev)}
              className="rounded-lg border border-[#FFB1AB]/40 px-2 py-1 text-xs text-[#FFCECA] hover:bg-[#FF5449]/20"
            >
              {showDiagnostics ? 'Hide diagnostics' : 'Open diagnostics'}
            </button>
          </div>
        </div>
      )}

      {showDiagnostics ? (
        <RemoteDiagnosticsPanel diagnostics={status?.diagnostics || []} lastError={status?.tunnelLastError || null} />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-black/20 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 1 || isBusy}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.15] bg-white/[0.05] px-3 py-2 text-sm text-white/85 hover:bg-white/[0.08] disabled:opacity-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>

          {isEditing && onCancelEdit ? (
            <button
              type="button"
              onClick={() => {
                discardDraftChanges();
                onCancelEdit();
              }}
              disabled={isBusy}
              className="rounded-lg border border-white/[0.15] px-3 py-2 text-sm text-white/70 hover:bg-white/[0.05] disabled:opacity-50"
            >
              Cancel
            </button>
          ) : null}
        </div>

        <button
          type="button"
          disabled={isBusy || currentState === 'locked'}
          onClick={() => void runCurrentStep()}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm',
            isBusy || currentState === 'locked'
              ? 'cursor-not-allowed border border-[#3A76FF]/20 bg-[#1D4ED8]/15 text-[#9AB6F9]/70'
              : 'border border-[#3A76FF]/45 bg-[#1D4ED8]/25 text-[#C9DAFF] hover:bg-[#1D4ED8]/35',
          )}
        >
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
