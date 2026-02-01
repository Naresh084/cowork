import { createHash, randomBytes } from 'crypto';
import type { PKCEPair } from '../types.js';

// ============================================================================
// PKCE (Proof Key for Code Exchange)
// ============================================================================

/**
 * Generate a cryptographically random code verifier.
 * The verifier is a high-entropy cryptographic random string using
 * unreserved characters [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 */
function generateVerifier(length = 64): string {
  // Generate random bytes and convert to base64url
  const buffer = randomBytes(length);
  return buffer
    .toString('base64url')
    .slice(0, length);
}

/**
 * Generate the code challenge from the verifier using SHA-256.
 * challenge = BASE64URL(SHA256(verifier))
 */
function generateChallenge(verifier: string): string {
  return createHash('sha256')
    .update(verifier, 'utf8')
    .digest('base64url');
}

/**
 * Generate a PKCE code verifier and challenge pair.
 * Used for secure OAuth 2.0 authorization code flow.
 */
export function generatePKCE(): PKCEPair {
  const verifier = generateVerifier();
  const challenge = generateChallenge(verifier);

  return {
    verifier,
    challenge,
  };
}

/**
 * Generate a cryptographically random state parameter.
 * Used to prevent CSRF attacks during OAuth flow.
 */
export function generateState(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Encode state data as a URL-safe base64 string.
 */
export function encodeStateData(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
}

/**
 * Decode state data from a URL-safe base64 string.
 */
export function decodeStateData(encoded: string): Record<string, unknown> {
  try {
    // Handle both standard base64 and base64url formats
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '='
    );
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid state data');
  }
}
