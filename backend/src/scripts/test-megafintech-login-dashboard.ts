/**
 * E2E smoke: log into demo.megafintech-hk.com and screenshot the post-login view.
 *
 * Requires: npx playwright install chromium
 *
 * Usage:
 *   cd backend && \
 *   WEB_BROWSER_DEMO_EMAIL='...' WEB_BROWSER_DEMO_PASSWORD='...' \
 *   npx tsx src/scripts/test-megafintech-login-dashboard.ts
 *
 * Output: uploads/browser-captures/megafintech-login-test/<uuid>-dashboard.png
 */
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { getUploadsRoot } from '../utils/uploadsPath.js';

const LOGIN_URL = 'https://demo.megafintech-hk.com/login';

async function main(): Promise<void> {
  const email = process.env.WEB_BROWSER_DEMO_EMAIL?.trim();
  const password = process.env.WEB_BROWSER_DEMO_PASSWORD?.trim();
  if (!email || !password) {
    console.error('Set WEB_BROWSER_DEMO_EMAIL and WEB_BROWSER_DEMO_PASSWORD');
    process.exit(1);
  }

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    // SPA: fields may be type="text" or custom; prefer accessible names from labels.
    const byLabelEmail = page.getByLabel(/email/i).first();
    const byLabelPwd = page.getByLabel(/password/i).first();
    const emailVisible = await byLabelEmail.isVisible().catch(() => false);
    if (emailVisible) {
      await byLabelEmail.fill(email);
      await byLabelPwd.fill(password);
    } else {
      await page.locator('input').first().waitFor({ state: 'visible', timeout: 45_000 });
      const inputs = page.locator('input:visible');
      const n = await inputs.count();
      if (n < 2) {
        throw new Error(`Expected at least 2 visible inputs, got ${n}`);
      }
      await inputs.nth(0).fill(email);
      await inputs.nth(1).fill(password);
    }

    const submit =
      page.getByRole('button', { name: /sign\s*in|登入|login|submit/i }).first();
    await submit.waitFor({ state: 'visible', timeout: 15_000 });
    await submit.click();

    await page.waitForURL(
      (u) => !u.pathname.includes('/login'),
      { timeout: 60_000 },
    );

    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    const outDir = path.join(getUploadsRoot(), 'browser-captures', 'megafintech-login-test');
    await fs.mkdir(outDir, { recursive: true });
    const file = path.join(outDir, `${randomUUID()}-dashboard.png`);
    await page.screenshot({ path: file, fullPage: true });

    console.log('PASS: logged in and saved dashboard screenshot');
    console.log(file);
    console.log('Public path hint: /uploads/browser-captures/megafintech-login-test/' + path.basename(file));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
