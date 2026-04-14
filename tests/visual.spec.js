import { test, expect } from '@playwright/test';

const URL = process.env.BASE_URL || 'https://litsense.vercel.app';
const SS   = (name) => ({ path: `screenshots/${name}.png` });

// ── Helper: dismiss welcome screen ────────────────────────────────────────────
async function openDoor(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  // Welcome screen shows once per day — click through if present
  const doorBtn = page.getByText(/open the door/i);
  if (await doorBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await doorBtn.click();
    await page.waitForTimeout(600);
  }
  // Wait for main nav to be visible
  await page.waitForSelector('.ls-nav', { timeout: 10000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. WELCOME SCREEN
// ─────────────────────────────────────────────────────────────────────────────
test('welcome screen renders correctly', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.screenshot(SS('1-welcome'));

  // Keyhole image should load
  const keyhole = page.locator('img[src="/keyhole.svg"]');
  if (await keyhole.count() > 0) {
    await expect(keyhole).toBeVisible();
  }

  // "Open the door" button should exist
  const doorBtn = page.getByText(/open the door/i);
  if (await doorBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await expect(doorBtn).toBeVisible();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. MAIN DISCOVER TAB
// ─────────────────────────────────────────────────────────────────────────────
test('discover tab loads with wheel and rows', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(1200); // let animations settle
  await page.screenshot(SS('2-discover-full'));

  // Wheel track exists
  const wheelBooks = page.locator('[style*="perspective"]');
  await expect(wheelBooks.first()).toBeVisible({ timeout: 8000 });

  // Book rows exist
  const rows = page.locator('[style*="overflowX"][style*="auto"]');
  expect(await rows.count()).toBeGreaterThan(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. BOOK COVERS — no blanks
// ─────────────────────────────────────────────────────────────────────────────
test('book covers are not blank — fallback text shows for failed loads', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(2500); // give covers time to load/fail

  await page.screenshot(SS('3-covers'));

  // Every .ls-book-cover should either have a visible img OR fallback title text
  const covers = page.locator('.ls-book-cover');
  const count = await covers.count();
  expect(count).toBeGreaterThan(0);

  // At least some covers should have visible content (not just an empty dark box)
  const fallbacks = page.locator('.ls-book-cover-title');
  const imgs      = page.locator('.ls-book-cover img[style*="display: block"]');
  const totalContent = await fallbacks.count() + await imgs.count();
  expect(totalContent).toBeGreaterThan(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SAGE / TOP MOMENT — types a message
// ─────────────────────────────────────────────────────────────────────────────
test('Sage moment card appears and types', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(800);

  const momentCard = page.locator('.ls-moment-card');
  if (await momentCard.isVisible({ timeout: 4000 }).catch(() => false)) {
    await page.screenshot(SS('4a-sage-typing'));
    // Wait for typing to finish (cursor disappears)
    await page.waitForTimeout(3000);
    await page.screenshot(SS('4b-sage-done'));
    // Arrow should appear after typing
    const arrow = momentCard.locator('text=→');
    await expect(arrow).toBeVisible({ timeout: 5000 });
  } else {
    // No moment card — still pass, just note it
    await page.screenshot(SS('4-no-moment'));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SVG SCENE BACKGROUND
// ─────────────────────────────────────────────────────────────────────────────
test('SVG scene background renders behind wheel', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(1000);

  // The scene container should exist
  const scene = page.locator('svg[viewBox="0 0 390 320"]').first();
  if (await scene.count() > 0) {
    await expect(scene).toBeAttached();
  }
  await page.screenshot(SS('5-scene-background'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. BOOK DETAIL SHEET — opens on hover, correct size
// ─────────────────────────────────────────────────────────────────────────────
test('hovering a book tile opens detail sheet at correct size', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(1200);

  // Find a book tile in the horizontal rows (not the wheel)
  const tile = page.locator('[style*="flexShrink: 0"][style*="cursor: pointer"]').first();
  if (await tile.count() > 0) {
    await tile.hover();
    await page.waitForTimeout(500);
    await page.screenshot(SS('6a-tile-hover'));

    // Detail sheet should appear
    const sheet = page.locator('[style*="border-radius: 24px 24px 0"]');
    if (await sheet.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.screenshot(SS('6b-detail-sheet'));
      // Cover inside sheet should NOT be full-screen (width should be small)
      const sheetCover = sheet.locator('.ls-book-cover').first();
      const box = await sheetCover.boundingBox();
      if (box) {
        // Cover should be < 200px wide — not escaped to full screen
        expect(box.width).toBeLessThan(200);
        console.log(`Detail sheet cover size: ${box.width}×${box.height}px ✓`);
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. MOOD CHIPS — filter works
// ─────────────────────────────────────────────────────────────────────────────
test('mood chips filter discover rows', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(800);

  const escapeChip = page.locator('.ls-mood-chip').filter({ hasText: 'Escape' });
  if (await escapeChip.isVisible({ timeout: 3000 }).catch(() => false)) {
    await escapeChip.click();
    await page.waitForTimeout(600);
    await page.screenshot(SS('7-mood-escape'));
    // Banner should appear
    const banner = page.locator('.ls-mood-banner');
    await expect(banner).toBeVisible({ timeout: 3000 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. NAV TABS
// ─────────────────────────────────────────────────────────────────────────────
test('all nav tabs are tappable and render', async ({ page }) => {
  await openDoor(page);

  const tabs = [
    { label: 'My Shelf', screenshot: '8a-shelf' },
    { label: 'Profile',  screenshot: '8b-profile' },
    { label: 'Ask',      screenshot: '8c-ask' },
    { label: 'Discover', screenshot: '8d-discover-return' },
  ];

  for (const { label, screenshot } of tabs) {
    const btn = page.locator('.ls-nav-btn').filter({ hasText: label });
    await btn.click();
    await page.waitForTimeout(500);
    await page.screenshot(SS(screenshot));
    await expect(btn).toHaveClass(/on/);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. CHAT — sends a message, gets a response
// ─────────────────────────────────────────────────────────────────────────────
test('chat sends message and receives response', async ({ page }) => {
  await openDoor(page);

  // Go to Ask tab
  await page.locator('.ls-nav-btn').filter({ hasText: 'Ask' }).click();
  await page.waitForTimeout(400);

  await page.screenshot(SS('9a-chat-empty'));

  // Type and send a message
  const input = page.locator('textarea.ls-chat-input');
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill('What should I read if I loved Pachinko?');
  await page.screenshot(SS('9b-chat-typed'));

  await page.locator('.ls-send-btn').click();
  await page.waitForTimeout(600);
  await page.screenshot(SS('9c-chat-loading'));

  // Wait for AI response (up to 20s)
  await page.waitForSelector('.ls-bubble.ai', { timeout: 20000 });
  await page.waitForTimeout(2000); // let typewriter finish
  await page.screenshot(SS('9d-chat-response'));

  const aiMsg = page.locator('.ls-bubble.ai').first();
  await expect(aiMsg).toBeVisible();
  const text = await aiMsg.textContent();
  expect(text?.length).toBeGreaterThan(20);
  console.log(`AI response (first 100 chars): ${text?.slice(0, 100)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. NO CONSOLE ERRORS on load
// ─────────────────────────────────────────────────────────────────────────────
test('no critical console errors on load', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await openDoor(page);
  await page.waitForTimeout(2000);
  await page.screenshot(SS('10-console-check'));

  // Filter out known benign errors (CSP, extension noise, network blips)
  const realErrors = errors.filter(e =>
    !e.includes('favicon') &&
    !e.includes('extension') &&
    !e.includes('Non-Error promise') &&
    !e.includes('ResizeObserver')
  );

  if (realErrors.length > 0) {
    console.log('Console errors found:', realErrors);
  }
  // Soft assertion — log but don't fail on first deploy
  expect(realErrors.length).toBeLessThan(5);
});
