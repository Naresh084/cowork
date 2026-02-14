// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import { parseNaturalLanguageResponse } from './nl-response-parser.js';

describe('parseNaturalLanguageResponse', () => {
  it('parses allow once', () => {
    expect(parseNaturalLanguageResponse('allow')).toMatchObject({ decision: 'allow_once' });
    expect(parseNaturalLanguageResponse('yes go ahead')).toMatchObject({ decision: 'allow_once' });
  });

  it('parses allow session', () => {
    expect(parseNaturalLanguageResponse('allow for this session')).toMatchObject({
      decision: 'allow_session',
    });
    expect(parseNaturalLanguageResponse('always allow')).toMatchObject({
      decision: 'allow_session',
    });
  });

  it('parses deny and cancel', () => {
    expect(parseNaturalLanguageResponse('deny')).toMatchObject({ decision: 'deny' });
    expect(parseNaturalLanguageResponse('cancel this')).toMatchObject({ decision: 'cancel' });
  });

  it('falls back to answer', () => {
    expect(parseNaturalLanguageResponse('Use branch feature/external-cli')).toMatchObject({
      decision: 'answer',
    });
  });
});
