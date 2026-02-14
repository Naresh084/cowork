// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { PairingQrResult, RemoteAccessStatus } from '@/stores/remote-access-store';

interface Step6PairProps {
  status: RemoteAccessStatus | null;
  pairingQr: PairingQrResult | null;
  expiresCountdown: string | null;
}

export function Step6Pair({ status, pairingQr, expiresCountdown }: Step6PairProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/55">Generate a short-lived QR and scan from the iPhone/Android app.</p>
      {(status?.deviceCount ?? 0) > 0 ? (
        <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
          {status?.deviceCount} device(s) paired.
        </div>
      ) : null}

      {pairingQr ? (
        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
            <img src={pairingQr.qrDataUrl} alt="Remote access pairing QR code" className="h-52 w-52 rounded-lg" />
          </div>
          <div className="space-y-2">
            <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
              <p className="text-[11px] uppercase tracking-wide text-white/40">QR expires in</p>
              <p className="mt-1 font-mono text-lg text-white/90">{expiresCountdown || '00:00'}</p>
            </div>
            <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
              <p className="text-[11px] uppercase tracking-wide text-white/40">Pairing link</p>
              <p className="mt-1 break-all text-xs text-white/80">{pairingQr.pairingUri}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/[0.15] bg-black/20 p-4 text-xs text-white/50">
          QR will appear after you run the pair step.
        </div>
      )}
    </div>
  );
}
