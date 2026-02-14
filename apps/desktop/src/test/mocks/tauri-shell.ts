// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { vi } from 'vitest';

export const open = vi.fn().mockResolvedValue(undefined);

export const Command = vi.fn().mockImplementation(() => ({
  execute: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
  spawn: vi.fn().mockResolvedValue({
    pid: 12345,
    kill: vi.fn(),
    write: vi.fn(),
  }),
}));

export default {
  open,
  Command,
};
