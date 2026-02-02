import { test, expect } from '@playwright/test';

test.describe('Gemini Cowork App', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');

    // Should show either onboarding or main app
    const hasOnboarding = await page.locator('text=API Key').isVisible().catch(() => false);
    const hasMainApp = await page.locator('[data-testid="main-layout"]').isVisible().catch(() => false);

    expect(hasOnboarding || hasMainApp).toBe(true);
  });

  test.describe('Onboarding Flow', () => {
    test('should show API key input on first visit', async ({ page }) => {
      // Clear any stored API key
      await page.evaluate(() => {
        localStorage.clear();
      });

      await page.goto('/');

      // Should show onboarding
      await expect(page.locator('text=API Key')).toBeVisible({ timeout: 10000 });
    });

    test('should validate API key format', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.clear();
      });

      await page.goto('/');

      // Wait for onboarding to load
      await page.waitForSelector('input[type="password"], input[placeholder*="key"]', { timeout: 10000 });

      // Enter invalid API key
      const input = page.locator('input[type="password"], input[placeholder*="key"]');
      await input.fill('invalid-key');

      // Try to submit
      const submitButton = page.locator('button:has-text("Continue"), button:has-text("Save"), button[type="submit"]');
      await submitButton.click();

      // Should show error
      await expect(page.locator('text=Invalid')).toBeVisible({ timeout: 5000 });
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
