import { test, expect } from '@playwright/test';

const URL = 'https://your-litsense-url.vercel.app';

test('feed loads', async ({ page }) => {
  await page.goto(URL);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/feed.png', fullPage: true });
});
