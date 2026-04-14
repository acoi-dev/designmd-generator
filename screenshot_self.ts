/**
 * Take screenshots of our own Style Extractor at:
 * 1. Landing page
 * 2. Loading state (extracting stripe.com)
 * 3. Results state
 */
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Landing
  await page.goto('http://localhost:8765/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/se_landing.png', fullPage: true });
  console.log('saved landing');

  // Extract stripe (results)
  await page.fill('#url-input', 'https://stripe.com');
  await page.click('#extract-btn');
  // Wait for results
  await page.waitForSelector('#results', { state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/se_results.png', fullPage: true });
  console.log('saved results');

  // Mobile view
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/se_mobile.png', fullPage: true });
  console.log('saved mobile');

  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
