import { test, expect } from '@playwright/test';

const URL = 'https://litsense.vercel.app';

test('feed loads', async ({ page }) => {
  await page.goto(URL);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/feed.png', fullPage: true });
});

test('book covers visible', async ({ page }) => {
  await page.goto(URL);
  await page.waitForTimeout(3000);
  const covers = page.locator('img');
  await expect(covers.first()).toBeVisible();
  await page.screenshot({ path: 'screenshots/covers.png', fullPage: true });
});

test('chat tab loads', async ({ page }) => {
  await page.goto(URL);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/chat.png', fullPage: true });
});
