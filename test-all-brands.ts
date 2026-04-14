import { chromium, type Page } from 'playwright';

const BASE_URL = 'http://localhost:8765';
const TIMEOUT = 10_000; // 10s per brand max

interface BrandResult {
  domain: string;
  pass: boolean;
  failures: string[];
  durationMs: number;
}

async function waitForPrebuiltData(page: Page): Promise<string[]> {
  // Wait for prebuiltData to be loaded (poll until it's a non-null object with keys)
  await page.waitForFunction(() => {
    const d = (window as any).prebuiltData;
    return d !== null && d !== undefined && typeof d === 'object' && Object.keys(d).length > 0;
  }, { timeout: 30_000 });
  // Get all domains
  const domains = await page.evaluate(() => Object.keys((window as any).prebuiltData));
  return domains;
}

async function testBrand(page: Page, domain: string): Promise<BrandResult> {
  const start = Date.now();
  const failures: string[] = [];

  try {
    // Construct URL and call setUrl
    const url = `https://${domain}`;
    await page.evaluate((u: string) => {
      (window as any).setUrl(u);
    }, url);

    // Wait a tick for rendering
    await page.waitForTimeout(200);

    // 1. Results page loads (landing hidden, results visible)
    const landingDisplay = await page.evaluate(() => {
      const el = document.getElementById('landing');
      return el ? getComputedStyle(el).display : 'MISSING';
    });
    if (landingDisplay !== 'none') {
      failures.push(`landing not hidden (display: ${landingDisplay})`);
    }

    const resultsDisplay = await page.evaluate(() => {
      const el = document.getElementById('results');
      return el ? getComputedStyle(el).display : 'MISSING';
    });
    if (resultsDisplay === 'none' || resultsDisplay === 'MISSING') {
      failures.push(`results not visible (display: ${resultsDisplay})`);
      // If results not visible, skip further checks
      return { domain, pass: false, failures, durationMs: Date.now() - start };
    }

    // 2. Title is displayed (not empty, not "—")
    const title = await page.evaluate(() => {
      const el = document.getElementById('result-title');
      return el ? el.textContent?.trim() || '' : '';
    });
    if (!title || title === '—' || title === '-') {
      failures.push(`title is empty or placeholder ("${title}")`);
    }

    // 3. Screenshot image loads (img visible with valid src)
    const screenshotInfo = await page.evaluate(() => {
      const el = document.getElementById('site-screenshot') as HTMLImageElement | null;
      if (!el) return { exists: false, display: 'MISSING', src: '' };
      const computed = getComputedStyle(el);
      return {
        exists: true,
        display: computed.display,
        src: el.src || '',
        naturalWidth: el.naturalWidth,
      };
    });
    if (!screenshotInfo.exists) {
      failures.push('screenshot img element missing');
    } else if (screenshotInfo.display === 'none') {
      failures.push('screenshot img hidden (display: none)');
    } else if (!screenshotInfo.src || screenshotInfo.src === 'about:blank') {
      failures.push('screenshot img has no src');
    }

    // 4. Color palette has at least 3 swatches
    const swatchCount = await page.evaluate(() => {
      const row = document.getElementById('color-row');
      if (!row) return 0;
      return row.querySelectorAll('.swatch').length;
    });
    if (swatchCount < 3) {
      failures.push(`color palette has only ${swatchCount} swatches (need >= 3)`);
    }

    // 5. DESIGN.md output content not empty
    const outputContent = await page.evaluate(() => {
      const el = document.getElementById('output-content');
      return el ? el.textContent?.trim() || '' : '';
    });
    if (!outputContent || outputContent.length < 50) {
      failures.push(`DESIGN.md output too short (${outputContent.length} chars)`);
    }

    // 6. Format tabs present (DESIGN.md tab exists)
    const tabInfo = await page.evaluate(() => {
      const tabsEl = document.getElementById('output-tabs');
      if (!tabsEl) return { exists: false, tabs: [] as string[], hasDesignMd: false };
      const buttons = tabsEl.querySelectorAll('.output-tab');
      const tabs = Array.from(buttons).map(b => b.textContent?.trim() || '');
      return {
        exists: true,
        tabs,
        hasDesignMd: tabs.some(t => t.includes('DESIGN.md')),
      };
    });
    if (!tabInfo.exists) {
      failures.push('output-tabs element missing');
    } else if (!tabInfo.hasDesignMd) {
      failures.push(`no DESIGN.md tab found (tabs: ${tabInfo.tabs.join(', ')})`);
    }

    // 7. No error banners visible
    const errorBannerVisible = await page.evaluate(() => {
      const el = document.getElementById('error-banner');
      if (!el) return false;
      return el.classList.contains('show');
    });
    if (errorBannerVisible) {
      const errorText = await page.evaluate(() => {
        const el = document.getElementById('error-text');
        return el?.textContent?.trim() || '';
      });
      failures.push(`error banner visible: "${errorText}"`);
    }

    // 8. "More designs" grid at the bottom has cards
    const moreDesignsCount = await page.evaluate(() => {
      const grid = document.getElementById('more-designs-grid');
      if (!grid) return -1;
      return grid.querySelectorAll('.brand-card').length;
    });
    if (moreDesignsCount === -1) {
      failures.push('more-designs-grid element missing');
    } else if (moreDesignsCount === 0) {
      failures.push('more-designs-grid has 0 brand cards');
    }

    // 9. Component preview section exists and has content
    const componentPreviewInfo = await page.evaluate(() => {
      const el = document.getElementById('component-preview');
      if (!el) return { exists: false, hasContent: false };
      return {
        exists: true,
        hasContent: el.innerHTML.trim().length > 0,
        childCount: el.children.length,
      };
    });
    if (!componentPreviewInfo.exists) {
      failures.push('component-preview element missing');
    } else if (!componentPreviewInfo.hasContent) {
      failures.push('component-preview is empty');
    }

    // 10. No Cloudflare/error page titles
    const pageTitle = await page.title();
    const errorTitles = ['Just a moment', 'Access Denied', 'Error', '403 Forbidden', '404 Not Found', 'Attention Required'];
    for (const errTitle of errorTitles) {
      if (pageTitle.toLowerCase().includes(errTitle.toLowerCase())) {
        failures.push(`page title indicates error: "${pageTitle}"`);
        break;
      }
    }

  } catch (err: any) {
    failures.push(`exception: ${err.message}`);
  }

  return {
    domain,
    pass: failures.length === 0,
    failures,
    durationMs: Date.now() - start,
  };
}

async function main() {
  console.log('=== DESIGN.md Generator — Full Brand Test ===');
  console.log(`Target: ${BASE_URL}`);
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Suppress console noise from the page
  // page.on('console', () => {});

  console.log('Loading page...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });

  // Debug: check prebuiltData state
  const debugState = await page.evaluate(() => {
    return {
      prebuiltData: typeof (window as any).prebuiltData,
      isNull: (window as any).prebuiltData === null,
      isUndefined: (window as any).prebuiltData === undefined,
    };
  });
  console.log('Debug prebuiltData state:', debugState);

  // If prebuiltData is null, manually fetch it
  if (debugState.isNull || debugState.isUndefined) {
    console.log('prebuiltData not loaded, fetching manually...');
    await page.evaluate(async () => {
      const res = await fetch('/prebuilt.json');
      if (res.ok) {
        (window as any).prebuiltData = await res.json();
      }
    });
  }

  console.log('Waiting for prebuilt data to load...');
  const domains = await waitForPrebuiltData(page);
  console.log(`Found ${domains.length} brands in prebuiltData\n`);

  const results: BrandResult[] = [];
  let passCount = 0;
  let failCount = 0;

  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];
    const progress = `[${i + 1}/${domains.length}]`;

    const result = await testBrand(page, domain);
    results.push(result);

    if (result.pass) {
      passCount++;
      // Print compact pass line
      process.stdout.write(`${progress} PASS  ${domain} (${result.durationMs}ms)\n`);
    } else {
      failCount++;
      process.stdout.write(`${progress} FAIL  ${domain} (${result.durationMs}ms)\n`);
      for (const f of result.failures) {
        process.stdout.write(`         -> ${f}\n`);
      }
    }
  }

  await browser.close();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total brands: ${domains.length}`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Pass rate: ${((passCount / domains.length) * 100).toFixed(1)}%`);

  if (failCount > 0) {
    console.log('\n--- FAILED BRANDS ---');
    // Group failures by type
    const failureTypes = new Map<string, string[]>();
    for (const r of results) {
      if (!r.pass) {
        for (const f of r.failures) {
          // Normalize failure message for grouping
          const key = f.replace(/".*?"/, '"..."').replace(/\(\d+ chars\)/, '(N chars)').replace(/\(display: .*?\)/, '(display: ...)');
          if (!failureTypes.has(key)) failureTypes.set(key, []);
          failureTypes.get(key)!.push(r.domain);
        }
      }
    }

    console.log('\n--- FAILURES GROUPED BY TYPE ---');
    for (const [type, doms] of [...failureTypes.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n  [${doms.length}x] ${type}`);
      for (const d of doms) {
        console.log(`        - ${d}`);
      }
    }

    console.log('\n--- DETAILED FAILURES ---');
    for (const r of results) {
      if (!r.pass) {
        console.log(`\n  ${r.domain}:`);
        for (const f of r.failures) {
          console.log(`    - ${f}`);
        }
      }
    }
  }

  // Exit with error code if there are failures
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
