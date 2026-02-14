// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import { isBenignTauriMissingCallbackWarning } from './tauri-callback-guard';

describe('tauri-callback-guard', () => {
  it('detects the known stale callback warning emitted during reloads', () => {
    expect(
      isBenignTauriMissingCallbackWarning(
        "[TAURI] Couldn't find callback id 123. This might happen when the app is reloaded while Rust is running an asynchronous operation.",
      ),
    ).toBe(true);
  });

  it('does not match unrelated warnings', () => {
    expect(isBenignTauriMissingCallbackWarning('Something else happened')).toBe(false);
  });
});
