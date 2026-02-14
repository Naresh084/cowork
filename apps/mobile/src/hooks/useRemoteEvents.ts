// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useChatStore } from '@/stores/useChatStore';
import type { RemoteEventEnvelope } from '@/types/remote';

function safeParse(raw: string): RemoteEventEnvelope | null {
  try {
    return JSON.parse(raw) as RemoteEventEnvelope;
  } catch {
    return null;
  }
}

export function useRemoteEvents(): void {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const wsEndpoint = useAuthStore((state) => state.wsEndpoint);
  const token = useAuthStore((state) => state.token);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const applyEnvelope = useChatStore((state) => state.applyEventEnvelope);

  const wsRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated || !wsEndpoint || !token) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const connect = (): void => {
      if (cancelled) return;
      const separator = wsEndpoint.includes('?') ? '&' : '?';
      const url = `${wsEndpoint}${separator}token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            sessionId: activeSessionId || undefined,
          }),
        );
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        const parsed = safeParse(event.data);
        if (parsed) {
          applyEnvelope(parsed);
        }
      };

      ws.onerror = () => {
        // Reconnect path handled by close callback.
      };

      ws.onclose = () => {
        if (cancelled) return;
        const attempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = attempt;
        const delay = Math.min(15000, 750 * attempt);
        retryTimerRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, wsEndpoint, token, applyEnvelope, activeSessionId]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== ws.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        sessionId: activeSessionId || undefined,
      }),
    );
  }, [activeSessionId]);
}
