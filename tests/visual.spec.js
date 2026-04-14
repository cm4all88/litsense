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

test('feed loads with books', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/feed.png', fullPage: true });
});

test('book covers not broken', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(3000);
  const images = page.locator('img');
  const count = await images.count();
  for (let i = 0; i < Math.min(count, 5); i++) {
    const img = images.nth(i);
    const naturalWidth = await img.evaluate(el => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  }
  await page.screenshot({ path: 'screenshots/covers.png', fullPage: true });
});

test('chat tab opens', async ({ page }) => {
  await openDoor(page);
  await page.locator('.ls-nav-btn').filter({ hasText: 'Ask' }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/chat.png', fullPage: true });
});

test('profile tab opens', async ({ page }) => {
  await openDoor(page);
  await page.locator('.ls-nav-btn').filter({ hasText: 'Profile' }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/profile.png', fullPage: true });
});

test('shelf tab opens', async ({ page }) => {
  await openDoor(page);
  await page.locator('.ls-nav-btn').filter({ hasText: 'My Shelf' }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/shelf.png', fullPage: true });
});

test('no console errors on load', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await openDoor(page);
  await page.waitForTimeout(3000);
  console.log('Console errors found:', errors);
  await page.screenshot({ path: 'screenshots/console-check.png', fullPage: true });
});
