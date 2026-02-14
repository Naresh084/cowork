// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { test, expect } from '@playwright/test';

test.describe('Cowork App', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');

    // Should show either onboarding or main app
    const hasOnboarding = await page.locator('text=API Key').isVisible().catch(() => false);
    const hasMainApp = await page.locator('[data-testid="main-layout"]').isVisible().catch(() => false);

    expect(hasOnboarding || hasMainApp).toBe(true);
  });

  test.describe('Onboarding Flow', () => {
    test('should show simple setup fields on first visit', async ({ page }) => {
      // Clear any stored API key
      await page.evaluate(() => {
        localStorage.clear();
      });

      await page.goto('/');

      // Should show onboarding
      await expect(page.locator('text=Name')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=Provider')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=API Key')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Chat Interface', () => {
    test.beforeEach(async ({ page }) => {
      // Mock API key to skip onboarding
      await page.evaluate(() => {
        localStorage.setItem('gemini-api-key', 'AIzaSyTest123456789');
      });
      await page.goto('/');
    });

    test('should show input area', async ({ page }) => {
      // Look for textarea or input for message
      const messageInput = page.locator('textarea, input[placeholder*="message"], input[placeholder*="Ask"]');
      await expect(messageInput.first()).toBeVisible({ timeout: 10000 });
    });

    test('should show welcome screen when no messages', async ({ page }) => {
      // Should show welcome content
      const welcomeText = page.locator('text=Gemini, text=Hello, text=What can');
      await expect(welcomeText.first()).toBeVisible({ timeout: 10000 });
    });
  });
});
