/**
 * record-demo.ts — Record a smooth demo video of DESIGN.md Generator
 *
 * Usage: npx tsx record-demo.ts
 *
 * Outputs:
 *   videos/demo.webm  — raw Playwright recording
 *   videos/demo.mp4   — converted via ffmpeg
 *   videos/demo.gif   — optimized GIF for web embedding
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEOS_DIR = path.join(__dirname, 'videos');
const BASE_URL = 'http://localhost:8765';

// Video dimensions
const WIDTH = 1200;
const HEIGHT = 700;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // Ensure output directory
  if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  }

  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: {
      dir: VIDEOS_DIR,
      size: { width: WIDTH, height: HEIGHT },
    },
    // Disable animations for cleaner recording? No — we want the transitions.
    // But we do want to skip cookie banners and similar.
    locale: 'en-US',
  });

  const page = await context.newPage();

  // Suppress any dialogs
  page.on('dialog', async dialog => await dialog.dismiss());

  console.log('Navigating to site...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Wait for brand cards to load
  await page.waitForSelector('.brand-card', { timeout: 15000 });
  console.log('Brand cards loaded.');

  // Hold on the landing page for a moment so the viewer sees the full UI
  await sleep(1500);

  // Slowly type a URL in the search box to simulate real user behavior
  const input = page.locator('#url-input');
  await input.click();
  await sleep(300);

  // Type "spotify.com" character by character with realistic delays
  const url = 'spotify.com';
  for (const char of url) {
    await input.press(char);
    await sleep(60 + Math.random() * 40); // 60-100ms per keystroke
  }
  await sleep(600);

  // Clear the typed text — we'll click the brand card instead (looks more impressive)
  await input.fill('');
  await sleep(300);

  // Scroll down slightly to show brand cards better
  await page.mouse.wheel(0, 150);
  await sleep(500);

  // Find and click the Spotify brand card
  console.log('Clicking Spotify card...');
  const spotifyCard = page.locator('.brand-card', { has: page.locator('text=Spotify') }).first();

  // Scroll the card into view first
  await spotifyCard.scrollIntoViewIfNeeded();
  await sleep(300);

  // Hover over the card first for visual effect
  await spotifyCard.hover();
  await sleep(400);

  // Click the Spotify card
  await spotifyCard.click();

  // Wait for results to render
  console.log('Waiting for results...');
  await page.waitForSelector('#results[style*="display: block"], #results:not([style*="display: none"])', { timeout: 15000 }).catch(() => {});

  // More reliable: wait for result title to have content
  await page.waitForFunction(() => {
    const el = document.getElementById('result-title');
    return el && el.textContent && el.textContent !== '—';
  }, { timeout: 15000 });

  console.log('Results loaded.');
  await sleep(1000);

  // Scroll down slowly to show the full results: color palette, fonts, components
  console.log('Scrolling through results...');

  // Smooth scroll through results
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 120);
    await sleep(350);
  }

  // Pause at the bottom to show component preview
  await sleep(1200);

  // Scroll back to top smoothly
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(800);

  // Show the Copy button action — hover over it
  const copyBtn = page.locator('.copy-primary').first();
  if (await copyBtn.isVisible()) {
    await copyBtn.hover();
    await sleep(500);
    await copyBtn.click();
    await sleep(1000);
  }

  // Final pause on the results view
  await sleep(500);

  console.log('Recording complete. Closing browser...');

  // Close page and context to finalize video
  await page.close();
  await context.close();
  await browser.close();

  // Find the recorded video file (Playwright names it with a random hash)
  const videoFiles = fs.readdirSync(VIDEOS_DIR)
    .filter(f => f.endsWith('.webm'))
    .map(f => ({
      name: f,
      path: path.join(VIDEOS_DIR, f),
      mtime: fs.statSync(path.join(VIDEOS_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (videoFiles.length === 0) {
    console.error('No video file found!');
    process.exit(1);
  }

  const rawVideo = videoFiles[0].path;
  const mp4Output = path.join(VIDEOS_DIR, 'demo.mp4');
  const gifOutput = path.join(VIDEOS_DIR, 'demo.gif');

  console.log(`Raw video: ${rawVideo}`);

  // Convert to MP4
  console.log('Converting to MP4...');
  try {
    execSync(
      `ffmpeg -y -i "${rawVideo}" -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -an "${mp4Output}"`,
      { stdio: 'pipe' }
    );
    console.log(`MP4 saved: ${mp4Output}`);
  } catch (e: any) {
    console.error('MP4 conversion failed:', e.stderr?.toString());
  }

  // Convert to optimized GIF
  console.log('Converting to GIF...');
  try {
    const palettePath = path.join(VIDEOS_DIR, 'palette.png');
    // Two-pass GIF encoding for better quality
    execSync(
      `ffmpeg -y -i "${rawVideo}" -vf "fps=12,scale=${WIDTH}:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" "${palettePath}"`,
      { stdio: 'pipe' }
    );
    execSync(
      `ffmpeg -y -i "${rawVideo}" -i "${palettePath}" -lavfi "fps=12,scale=${WIDTH}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3" "${gifOutput}"`,
      { stdio: 'pipe' }
    );
    // Clean up palette
    if (fs.existsSync(palettePath)) fs.unlinkSync(palettePath);

    const gifSize = (fs.statSync(gifOutput).size / 1024 / 1024).toFixed(1);
    console.log(`GIF saved: ${gifOutput} (${gifSize} MB)`);
  } catch (e: any) {
    console.error('GIF conversion failed:', e.stderr?.toString());
  }

  // Rename raw video
  const demoWebm = path.join(VIDEOS_DIR, 'demo.webm');
  if (rawVideo !== demoWebm) {
    fs.renameSync(rawVideo, demoWebm);
  }

  // Print summary
  console.log('\n--- Demo Recording Summary ---');
  for (const f of ['demo.webm', 'demo.mp4', 'demo.gif']) {
    const fp = path.join(VIDEOS_DIR, f);
    if (fs.existsSync(fp)) {
      const size = (fs.statSync(fp).size / 1024 / 1024).toFixed(1);
      console.log(`  ${f}: ${size} MB`);
    }
  }
  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
