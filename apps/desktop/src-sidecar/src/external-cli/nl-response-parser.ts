// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { ExternalCliResponsePayload } from './types.js';

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

export function parseNaturalLanguageResponse(input: string): ExternalCliResponsePayload {
  const text = input.trim();
  const lower = normalize(input);

  if (!text) {
    return {
      decision: 'answer',
      text,
    };
  }

  if (/(^|\b)(cancel|stop|abort|never mind|nevermind)(\b|$)/.test(lower)) {
    return {
      decision: 'cancel',
      text,
    };
  }

  if (/(^|\b)(allow|approve|yes|ok|okay|go ahead|proceed)(\b|$)/.test(lower)) {
    if (/(session|always|remember|all future|future)/.test(lower)) {
      return {
        decision: 'allow_session',
        text,
      };
    }

    return {
      decision: 'allow_once',
      text,
    };
  }

  if (/(^|\b)(deny|reject|no|don't allow|do not allow|block)(\b|$)/.test(lower)) {
    return {
      decision: 'deny',
      text,
    };
  }

  return {
    decision: 'answer',
    text,
  };
}
