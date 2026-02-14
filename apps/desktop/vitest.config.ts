// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'src-tauri', 'src-sidecar'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'src/test',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tauri-apps/api/core': resolve(__dirname, './src/test/mocks/tauri-core.ts'),
      '@tauri-apps/api/path': resolve(__dirname, './src/test/mocks/tauri-path.ts'),
      '@tauri-apps/api': resolve(__dirname, './src/test/mocks/tauri-api.ts'),
      '@tauri-apps/plugin-dialog': resolve(__dirname, './src/test/mocks/tauri-dialog.ts'),
      '@tauri-apps/plugin-shell': resolve(__dirname, './src/test/mocks/tauri-shell.ts'),
    },
  },
});
