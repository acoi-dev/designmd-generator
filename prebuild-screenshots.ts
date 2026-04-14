/**
 * Capture screenshots for all prebuilt brands
 * Saves to screenshots/{domain}.jpg
 */
import { chromium } from 'playwright';
import * as fs from 'fs';

async function main() {
  const results = JSON.parse(fs.readFileSync('prebuilt.json', 'utf8'));
  const domains = Object.keys(results);
  console.log(`${domains.length} brands to screenshot\n`);

  const browser = await chromium.launch({ headless: true });

  for (const domain of domains) {
    const outPath = `screenshots/${domain}.jpg`;
    if (fs.existsSync(outPath)) {
      console.log(`  ⏭ ${domain} (exists)`);
      continue;
    }
    const entry = results[domain];
    const url = entry.design?.url || `https://${domain}`;
    console.log(`  📸 ${domain}...`);
    try {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2500);
      const buf = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false });
      fs.writeFileSync(outPath, buf);
      await ctx.close();
      console.log(`  ✓ ${domain} (${Math.round(buf.length / 1024)}KB)`);
    } catch (e: any) {
      console.log(`  ✗ ${domain}: ${e.message.slice(0, 60)}`);
    }
  }

  await browser.close();
  const count = fs.readdirSync('screenshots').filter(f => f.endsWith('.jpg')).length;
  console.log(`\nDone. ${count} screenshots saved.`);
}
main();
