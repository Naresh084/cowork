// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import type { OAuthCallbackResult } from '../types.js';
import { OAUTH_CALLBACK_PORT, OAUTH_REDIRECT_URI } from '../types.js';

// ============================================================================
// OAuth Callback Server
// ============================================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface OAuthCallbackServer {
  /**
   * Wait for the OAuth callback to complete.
   * Resolves with the authorization code and state.
   */
  waitForCallback(): Promise<OAuthCallbackResult>;

  /**
   * Close the server and cleanup.
   */
  close(): Promise<void>;
}

interface ServerOptions {
  timeoutMs?: number;
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Authentication Successful</title>
    <style>
      :root {
        --bg: #FAFAFA;
        --card-bg: #FFFFFF;
        --text-primary: #1F2937;
        --text-secondary: #6B7280;
        --success: #10B981;
        --border: #E5E7EB;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #111827;
          --card-bg: #1F2937;
          --text-primary: #F9FAFB;
          --text-secondary: #9CA3AF;
          --success: #34D399;
          --border: #374151;
        }
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: var(--bg);
        color: var(--text-primary);
        padding: 1rem;
      }
      .card {
        background: var(--card-bg);
        border-radius: 16px;
        padding: 3rem 2rem;
        width: 100%;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border: 1px solid var(--border);
      }
      .icon-wrapper {
        width: 64px;
        height: 64px;
        background: rgba(16, 185, 129, 0.1);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1.5rem;
      }
      .icon {
        width: 32px;
        height: 32px;
        color: var(--success);
      }
      h1 {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0 0 0.5rem;
        letter-spacing: -0.025em;
      }
      p {
        color: var(--text-secondary);
        font-size: 0.95rem;
        line-height: 1.5;
        margin: 0 0 2rem;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--text-primary);
        color: var(--card-bg);
        font-weight: 500;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        text-decoration: none;
        transition: opacity 0.2s;
        font-size: 0.95rem;
        border: none;
        cursor: pointer;
        width: 100%;
        box-sizing: border-box;
      }
      .btn:hover { opacity: 0.9; }
      .sub-text {
        margin-top: 1rem;
        font-size: 0.8rem;
        color: var(--text-secondary);
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon-wrapper">
        <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1>All set!</h1>
      <p>You've successfully signed in. You can now return to Cowork.</p>
      <button class="btn" onclick="window.close()">Close this tab</button>
      <div class="sub-text">If the button doesn't work, please close this tab manually.</div>
    </div>
  </body>
</html>`;

const ERROR_HTML = (message: string) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Authentication Failed</title>
    <style>
      :root {
        --bg: #FAFAFA;
        --card-bg: #FFFFFF;
        --text-primary: #1F2937;
        --text-secondary: #6B7280;
        --error: #EF4444;
        --border: #E5E7EB;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #111827;
          --card-bg: #1F2937;
          --text-primary: #F9FAFB;
          --text-secondary: #9CA3AF;
          --error: #F87171;
          --border: #374151;
        }
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: var(--bg);
        color: var(--text-primary);
        padding: 1rem;
      }
      .card {
        background: var(--card-bg);
        border-radius: 16px;
        padding: 3rem 2rem;
        width: 100%;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--border);
      }
      .icon-wrapper {
        width: 64px;
        height: 64px;
        background: rgba(239, 68, 68, 0.1);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1.5rem;
      }
      .icon {
        width: 32px;
        height: 32px;
        color: var(--error);
      }
      h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.5rem; }
      p { color: var(--text-secondary); font-size: 0.95rem; line-height: 1.5; margin: 0; }
      .error-message { color: var(--error); font-size: 0.85rem; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon-wrapper">
        <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h1>Authentication Failed</h1>
      <p>Something went wrong during sign in. Please try again.</p>
      <div class="error-message">${escapeHtml(message)}</div>
    </div>
  </body>
</html>`;

/**
 * Start a local HTTP server to receive the OAuth callback.
 */
export async function startOAuthCallbackServer(
  options: ServerOptions = {}
): Promise<OAuthCallbackServer> {
  const { timeoutMs = 5 * 60 * 1000 } = options;

  const redirectUri = new URL(OAUTH_REDIRECT_URI);
  const callbackPath = redirectUri.pathname || '/';
  const port = OAUTH_CALLBACK_PORT;
  const origin = `${redirectUri.protocol}//${redirectUri.host}`;

  let settled = false;
  let resolveCallback: (result: OAuthCallbackResult) => void;
  let rejectCallback: (error: Error) => void;
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const callbackPromise = new Promise<OAuthCallbackResult>((resolve, reject) => {
    resolveCallback = (result: OAuthCallbackResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve(result);
    };
    rejectCallback = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      reject(error);
    };
  });

  timeoutHandle = setTimeout(() => {
    rejectCallback(new Error('OAuth callback timed out'));
  }, timeoutMs);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid request');
      return;
    }

    const url = new URL(req.url, origin);

    if (url.pathname !== callbackPath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    if (error) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ERROR_HTML(errorDescription || error));
      rejectCallback(new Error(errorDescription || error));
      setImmediate(() => server.close());
      return;
    }

    if (!code || !state) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ERROR_HTML('Missing authorization code or state'));
      rejectCallback(new Error('Missing authorization code or state'));
      setImmediate(() => server.close());
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(SUCCESS_HTML);

    resolveCallback({ code, state });
    setImmediate(() => server.close());
  });

  // Start the server
  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error & { code?: string }) => {
      server.off('error', handleError);
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${port} is already in use. Please close any other applications using this port.`
          )
        );
        return;
      }
      reject(error);
    };

    server.once('error', handleError);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', handleError);
      resolve();
    });
  });

  server.on('error', (error) => {
    rejectCallback(error instanceof Error ? error : new Error(String(error)));
  });

  return {
    waitForCallback: () => callbackPromise,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error && (error as Error & { code?: string }).code !== 'ERR_SERVER_NOT_RUNNING') {
            reject(error);
            return;
          }
          if (!settled) {
            rejectCallback(new Error('OAuth callback server closed'));
          }
          resolve();
        });
      }),
  };
}
