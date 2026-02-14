// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);

function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  if (TRUTHY_VALUES.has(normalized)) {
    return true;
  }

  if (FALSY_VALUES.has(normalized)) {
    return false;
  }

  return defaultValue;
}

export const WORKFLOWS_ENABLED = parseBooleanFlag(import.meta.env.VITE_ENABLE_WORKFLOWS, false);
