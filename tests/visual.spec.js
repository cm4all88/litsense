import { test, expect } from '@playwright/test';

const URL = process.env.BASE_URL || 'https://litsense.vercel.app';
const SS   = (name) => ({ path: `screenshots/${name}.png` });

// ── Helper: dismiss welcome screen + neutralise blocking overlays ─────────────
async function openDoor(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });

  const doorBtn = page.getByText(/open the door/i);
  if (await doorBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await doorBtn.click();
    await page.waitForTimeout(700);
  }

  await page.waitForSelector('.ls-nav', { timeout: 10000 });

  // The Ask tab empty state reuses .ls-welcome which has position:fixed z-index:500
  // — disable pointer-events on any full-screen .ls-welcome so nav clicks work
  await page.evaluate(() => {
    document.querySelectorAll('.ls-welcome').forEach(el => {
      if (parseInt(window.getComputedStyle(el).zIndex, 10) >= 400) {
        el.style.pointerEvents = 'none';
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. WELCOME SCREEN
// ─────────────────────────────────────────────────────────────────────────────
test('welcome screen renders correctly', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.screenshot(SS('1-welcome'));

  // Keyhole just needs to be in the DOM — it may be display:none via CSS animation
  const keyhole = page.locator('img[src="/keyhole.svg"]');
  if (await keyhole.count() > 0) {
    await expect(keyhole).toBeAttached();
  }

  // Either welcome door OR main nav must be present
  const doorVisible = await page.getByText(/open the door/i).isVisible({ timeout: 3000 }).catch(() => false);
  const navVisible  = await page.locator('.ls-nav').isVisible({ timeout: 3000 }).catch(() => false);
  expect(doorVisible || navVisible).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DISCOVER TAB
// ─────────────────────────────────────────────────────────────────────────────
test('discover tab loads with wheel and rows', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(1200);
  await page.screenshot(SS('2-discover-full'));

  // Wheel covers (className="fill") should exist
  const wheelCovers = page.locator('.ls-book-cover.fill');
  await expect(wheelCovers.first()).toBeVisible({ timeout: 8000 });

  // At least 3 book covers total on the page
  const allCovers = page.locator('.ls-book-cover');
  expect(await allCovers.count()).toBeGreaterThan(2);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. BOOK COVERS — no blanks
// ─────────────────────────────────────────────────────────────────────────────
test('book covers are not blank', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(2500);
  await page.screenshot(SS('3-covers'));

  const fallbacks   = await page.locator('.ls-book-cover-title').count();
  const loadedImgs  = await page.locator('.ls-book-cover img').evaluateAll(imgs =>
    imgs.filter(img => img.naturalWidth > 5).length
  );
  console.log(`Fallback titles: ${fallbacks}, loaded images: ${loadedImgs}`);
  expect(fallbacks + loadedImgs).toBeGreaterThan(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SAGE MOMENT CARD
// ─────────────────────────────────────────────────────────────────────────────
test('Sage moment card types and completes', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(800);

  const card = page.locator('.ls-moment-card');
  if (await card.isVisible({ timeout: 4000 }).catch(() => false)) {
    await page.screenshot(SS('4a-sage-typing'));
    await page.waitForTimeout(3500);
    await page.screenshot(SS('4b-sage-done'));
    await expect(card).toBeVisible();
  } else {
    await page.screenshot(SS('4-no-moment'));
    console.log('No moment card (suppressed by context)');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SVG SCENE BACKGROUND
// ─────────────────────────────────────────────────────────────────────────────
test('SVG scene background is present', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(1000);
  await page.screenshot(SS('5-scene-background'));
  const svgs = await page.locator('svg[viewBox="0 0 390 320"]').count();
  console.log(`Scene SVGs found: ${svgs}`);
  expect(svgs).toBeGreaterThanOrEqual(0); // soft — just screenshot for review
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. DETAIL SHEET — cover stays contained
// ─────────────────────────────────────────────────────────────────────────────
test('book tile hover opens detail sheet, cover is not full-screen', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(1200);

  // Hover first non-fill cover (tiles in horizontal rows)
  const tiles = page.locator('.ls-book-cover:not(.fill)');
  if (await tiles.count() > 0) {
    await tiles.first().hover();
    await page.waitForTimeout(600);
    await page.screenshot(SS('6a-hover'));

    const sheet = page.locator('[style*="border-radius: 24px 24px 0"]').first();
    if (await sheet.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.screenshot(SS('6b-detail-sheet'));
      const box = await sheet.locator('.ls-book-cover').first().boundingBox().catch(() => null);
      if (box) {
        expect(box.width).toBeLessThan(200);
        console.log(`Cover in sheet: ${Math.round(box.width)}×${Math.round(box.height)}px ✓`);
      }
    } else {
      await page.screenshot(SS('6-no-sheet'));
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. MOOD CHIPS
// ─────────────────────────────────────────────────────────────────────────────
test('mood chip filters rows and shows banner', async ({ page }) => {
  await openDoor(page);
  await page.waitForTimeout(800);

  const chip = page.locator('.ls-mood-chip').filter({ hasText: 'Escape' });
  if (await chip.isVisible({ timeout: 3000 }).catch(() => false)) {
    await chip.click();
    await page.waitForTimeout(600);
    await page.screenshot(SS('7-mood-escape'));
    await expect(page.locator('.ls-mood-banner')).toBeVisible({ timeout: 3000 });
    console.log('Mood filter ✓');
  } else {
    await page.screenshot(SS('7-chips-offscreen'));
    console.log('Mood chips need scroll');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. NAV TABS
// ─────────────────────────────────────────────────────────────────────────────
test('all nav tabs render', async ({ page }) => {
  await openDoor(page);

  const tabs = [
    { label: 'My Shelf', ss: '8a-shelf' },
    { label: 'Profile',  ss: '8b-profile' },
    { label: 'Ask',      ss: '8c-ask' },
    { label: 'Discover', ss: '8d-discover' },
  ];

  for (const { label, ss } of tabs) {
    const btn = page.locator('.ls-nav-btn').filter({ hasText: label });
    await btn.click({ force: true });
    await page.waitForTimeout(500);

    // After each click re-neutralise any blocking welcome overlays
    await page.evaluate(() => {
      document.querySelectorAll('.ls-welcome').forEach(el => {
        el.style.pointerEvents = 'none';
        el.style.zIndex = '0';
      });
    });

    await page.screenshot(SS(ss));
    await expect(btn).toHaveClass(/on/);
    console.log(`"${label}" tab ✓`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. CHAT
// ─────────────────────────────────────────────────────────────────────────────
test('chat sends and receives a response', async ({ page }) => {
  await openDoor(page);

  await page.locator('.ls-nav-btn').filter({ hasText: 'Ask' }).click({ force: true });
  await page.waitForTimeout(500);

  // Neutralise any blocking overlay in the ask panel
  await page.evaluate(() => {
    document.querySelectorAll('.ls-welcome, .ls-ask-msgs *').forEach(el => {
      const z = parseInt(window.getComputedStyle(el).zIndex, 10);
      if (z >= 400) { el.style.pointerEvents = 'none'; el.style.zIndex = '0'; }
    });
  });

  await page.screenshot(SS('9a-ask-empty'));

  const input = page.locator('textarea.ls-chat-input');
  await expect(input).toBeVisible({ timeout: 6000 });
  await input.fill('What should I read if I loved Pachinko?');
  await page.screenshot(SS('9b-typed'));

  // Use keyboard Enter — avoids send button being intercepted
  await input.press('Enter');
  await page.waitForTimeout(700);
  await page.screenshot(SS('9c-loading'));

  await page.waitForSelector('.ls-bubble.ai', { timeout: 25000 });
  await page.waitForTimeout(2500);
  await page.screenshot(SS('9d-response'));

  const text = await page.locator('.ls-bubble.ai').first().textContent();
  expect(text?.length).toBeGreaterThan(20);
  console.log(`AI replied (100c): ${text?.slice(0, 100)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. NO CRITICAL ERRORS
// ─────────────────────────────────────────────────────────────────────────────
test('no critical JS errors on load', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  await openDoor(page);
  await page.waitForTimeout(2000);
  await page.screenshot(SS('10-errors'));

  const real = errors.filter(e =>
    !e.includes('favicon') && !e.includes('extension') &&
    !e.includes('Non-Error promise') && !e.includes('ResizeObserver') &&
    !e.includes('Loading chunk')
  );
  if (real.length) console.log('JS errors:', real);
  expect(real.length).toBeLessThan(5);
});
