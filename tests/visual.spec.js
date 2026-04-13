import { test, expect } from '@playwright/test';

const URL = 'https://litsense.vercel.app';

async function openDoor(page) {
  await page.goto(URL);
  await page.waitForTimeout(2000);
  const btn = page.getByText('OPEN THE DOOR');
  if (await btn.isVisible()) await btn.click();
  await page.waitForTimeout(2000);
}

test('welcome screen', async ({ page }) => {
  await page.goto(URL);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/welcome.png', fullPage: true });
});

test('feed loads', async ({ page }) => {
  await openDoor(page);
  await page.screenshot({ path: 'screenshots/feed.png', fullPage: true });
});

test('chat tab', async ({ page }) => {
  await openDoor(page);
  await page.getByText('Ask').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/chat.png', fullPage: true });
});

test('book covers', async ({ page }) => {
  await openDoor(page);
  await page.screenshot({ path: 'screenshots/covers.png', fullPage: true });
});
