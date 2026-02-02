import { vi } from 'vitest';

export const homeDir = vi.fn().mockResolvedValue('/Users/testuser');
export const appDataDir = vi.fn().mockResolvedValue('/Users/testuser/Library/Application Support');
export const join = vi.fn((...args: string[]) => args.join('/'));
export const basename = vi.fn((path: string) => path.split('/').pop() || '');
export const dirname = vi.fn((path: string) => {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
});

export default {
  homeDir,
  appDataDir,
  join,
  basename,
  dirname,
};
