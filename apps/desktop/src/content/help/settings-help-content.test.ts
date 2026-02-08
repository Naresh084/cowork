import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SETTINGS_HELP_BY_ID } from './settings-help-content';

const SETTINGS_FILES = [
  resolve(process.cwd(), 'src/components/settings/ApiKeysSettings.tsx'),
  resolve(process.cwd(), 'src/components/settings/GeneralSettings.tsx'),
  resolve(process.cwd(), 'src/components/settings/CapabilitySettings.tsx'),
  resolve(process.cwd(), 'src/components/settings/RuntimeSettings.tsx'),
  resolve(process.cwd(), 'src/components/settings/IntegrationSettings.tsx'),
  resolve(process.cwd(), 'src/components/settings/WhatsAppSettings.tsx'),
  resolve(process.cwd(), 'src/components/settings/SlackSettings.tsx'),
  resolve(process.cwd(), 'src/components/settings/TelegramSettings.tsx'),
  resolve(process.cwd(), 'src/components/settings/DiscordSettings.tsx'),
  resolve(process.cwd(), 'src/components/settings/IMessageSettings.tsx'),
  resolve(process.cwd(), 'src/components/settings/TeamsSettings.tsx'),
];

describe('settings help content coverage', () => {
  it('maps every referenced settingId to a help entry', () => {
    const referencedSettingIds = new Set<string>();

    for (const fileUrl of SETTINGS_FILES) {
      const content = readFileSync(fileUrl, 'utf-8');
      const matches = content.matchAll(/settingId=\"([^\"]+)\"/g);
      for (const match of matches) {
        const settingId = match[1];
        if (settingId) {
          referencedSettingIds.add(settingId);
        }
      }
    }

    expect(referencedSettingIds.size).toBeGreaterThan(0);

    for (const settingId of referencedSettingIds) {
      expect(SETTINGS_HELP_BY_ID[settingId]).toBeDefined();
    }
  });
});
