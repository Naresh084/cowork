import { vi } from 'vitest';

export const open = vi.fn().mockResolvedValue(null);
export const save = vi.fn().mockResolvedValue(null);
export const message = vi.fn().mockResolvedValue(undefined);
export const ask = vi.fn().mockResolvedValue(true);
export const confirm = vi.fn().mockResolvedValue(true);

export default {
  open,
  save,
  message,
  ask,
  confirm,
};
