/**
 * Re-capture screenshots for sites known to show cookie banners.
 * Dismisses common cookie/consent banners before taking the screenshot.
 */
import { chromium } from 'playwright';
import * as fs from 'fs';

const COOKIE_BANNER_SITES = [
  { domain: 'figma.com', url: 'https://www.figma.com' },
  { domain: 'canva.com', url: 'https://www.canva.com/en/' },
  { domain: 'notion.so', url: 'https://www.notion.so' },
  { domain: 'dribbble.com', url: 'https://dribbble.com' },
  { domain: 'medium.com', url: 'https://medium.com' },
  { domain: 'twitch.tv', url: 'https://www.twitch.tv' },
  { domain: 'pinterest.jp', url: 'https://www.pinterest.com' },
];

// Common cookie banner dismiss selectors
const COOKIE_SELECTORS = [
  '[id*="cookie"] button',
  '[class*="cookie"] button',
  'button[id*="accept"]',
  'button[class*="accept"]',
  '[class*="consent"] button',
  '[id*="consent"] button',
  '[class*="banner"] button[class*="accept"]',
  '[class*="banner"] button[class*="close"]',
  '[data-testid*="cookie"] button',
  '[data-testid*="accept"]',
  '#onetrust-accept-btn-handler',
  '.onetrust-close-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '[class*="CookieConsent"] button',
];

// Text-based patterns for accept buttons
const ACCEPT_TEXTS = ['Accept', 'Accept All', 'Allow', 'Allow All', 'OK', 'Got it', 'Agree', 'I agree', 'Accept cookies', 'Accept all cookies'];

async function dismissCookieBanner(page: any): Promise<boolean> {
  let dismissed = false;

  // Try selector-based dismissal
  for (const sel of COOKIE_SELECTORS) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click();
        dismissed = true;
        break;
      }
    } catch {}
  }

  // Try text-based dismissal if selector approach didn't work
  if (!dismissed) {
    for (const text of ACCEPT_TEXTS) {
      try {
        const btn = page.getByRole('button', { name: text, exact: false }).first();
        if (await btn.isVisible({ timeout: 300 })) {
          await btn.click();
          dismissed = true;
          break;
        }
      } catch {}
    }
  }

  // Also try generic link/span text matches
  if (!dismissed) {
    for (const text of ACCEPT_TEXTS) {
      try {
        const el = page.locator(`text="${text}"`).first();
        if (await el.isVisible({ timeout: 300 })) {
          await el.click();
          dismissed = true;
          break;
        }
      } catch {}
    }
  }

  return dismissed;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results: { domain: string; status: string; cookieDismissed: boolean; size?: number }[] = [];

  for (const { domain, url } of COOKIE_BANNER_SITES) {
    console.log(`Capturing ${domain}...`);
    try {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
        },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      const page = await ctx.newPage();

      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Try to dismiss cookie banner
      const dismissed = await dismissCookieBanner(page);
      if (dismissed) {
        console.log(`  Cookie banner dismissed for ${domain}`);
        await page.waitForTimeout(1000);
      } else {
        console.log(`  No cookie banner detected for ${domain}`);
      }

      const buf = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false });
      const outPath = `screenshots/${domain}.jpg`;
      fs.writeFileSync(outPath, buf);
      const sizeKB = Math.round(buf.length / 1024);
      console.log(`  OK: ${domain} (${sizeKB}KB)`);
      results.push({ domain, status: 'ok', cookieDismissed: dismissed, size: sizeKB });
      await ctx.close();
    } catch (e: any) {
      const msg = e.message.slice(0, 80);
      console.log(`  FAIL: ${domain}: ${msg}`);
      results.push({ domain, status: `error: ${msg}`, cookieDismissed: false });
    }
  }

  await browser.close();

  console.log('\n--- Summary ---');
  for (const r of results) {
    const icon = r.status === 'ok' ? 'OK' : 'FAIL';
    const cookie = r.cookieDismissed ? ' (cookie dismissed)' : '';
    console.log(`  ${icon} ${r.domain}${r.size ? ` ${r.size}KB` : ''}${cookie}${r.status !== 'ok' ? ' - ' + r.status : ''}`);
  }
  const ok = results.filter(r => r.status === 'ok').length;
  const fail = results.filter(r => r.status !== 'ok').length;
  console.log(`\n${ok} succeeded, ${fail} failed`);
}

main();
