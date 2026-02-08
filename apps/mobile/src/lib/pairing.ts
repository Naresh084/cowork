import { Buffer } from 'buffer';
import type { PairResponse, PairingPayload } from '@/types/remote';

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function decodeBase64Url(encoded: string): string {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function parsePairingUri(raw: string): PairingPayload {
  const value = raw.trim();
  if (!value.startsWith('cowork://pair?d=')) {
    throw new Error('Invalid pairing QR format.');
  }

  const query = value.slice('cowork://pair?d='.length);
  const encoded = decodeURIComponent(query);
  const payload = JSON.parse(decodeBase64Url(encoded)) as PairingPayload;

  if (
    !payload ||
    payload.version !== 1 ||
    typeof payload.endpoint !== 'string' ||
    typeof payload.wsEndpoint !== 'string' ||
    typeof payload.pairingCode !== 'string' ||
    typeof payload.expiresAt !== 'number'
  ) {
    throw new Error('Pairing payload is invalid.');
  }

  if (payload.expiresAt <= Date.now()) {
    throw new Error('Pairing QR has expired. Generate a new one.');
  }

  return payload;
}

export async function completePairing(
  payload: PairingPayload,
  deviceName: string,
  platform: 'ios' | 'android',
): Promise<PairResponse> {
  const endpoint = normalizeBaseUrl(payload.endpoint);
  const response = await fetch(`${endpoint}/v1/pair`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      pairingCode: payload.pairingCode,
      deviceName,
      platform,
    }),
  });

  if (!response.ok) {
    let message = `Pairing failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  return (await response.json()) as PairResponse;
}
