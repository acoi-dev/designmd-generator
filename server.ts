/**
 * Style Extractor — local web server
 * POST /api/extract  { url } → ExtractedDesign + all output formats
 * GET / → frontend
 */
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { fileURLToPath } from 'url';
import { extractStyle, ExtractedDesign } from './extract';
import {
  generateDesignMd,
  generateTailwindConfig,
  generateCssVars,
  generateTokensJson,
} from './generate';
import { chromium } from 'playwright';

// ───── Rate Limiter ─────
// 10 extractions per IP per 15 minutes
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  const remaining = Math.max(0, RATE_LIMIT_MAX - entry.count);
  return { allowed: entry.count <= RATE_LIMIT_MAX, remaining };
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

// Capture screenshot of the source site (separate browser session)
async function captureScreenshot(url: string): Promise<string | undefined> {
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2500);
    const buf = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false });
    await browser.close();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch (e) {
    return undefined;
  }
}

// Generate "Claude Code prompt" — directly usable prompt for Claude Code
// Now outputs full DESIGN.md format (same as generate.ts extended mode)
function generateClaudeCodePrompt(d: ExtractedDesign, lang: 'en' | 'ja' = 'en'): string {
  const headFamily = d.typography.headingFont.cleanFamily || 'Inter';
  const bodyFamily = d.typography.bodyFont.cleanFamily || 'Inter';
  const btn = d.components.primaryButton;
  const btn2 = d.components.secondaryButton;
  const card = d.components.card;
  const isDark = d.tags.includes('dark');
  const isRounded = d.tags.includes('rounded');
  const isSharp = d.tags.includes('sharp');
  const radiusVal = d.borderRadius[0]?.value || 8;
  const shadows = d.shadows || [];
  const typoDetails = d.typography.details || [];

  if (lang === 'ja') {
    let out = `# ${d.title} スタイルでLPを作って

以下の DESIGN.md に厳密に従ってLPを作ってください。実サイト(${d.url})から自動抽出した本物の値です。

## 1. ビジュアルテーマ
${d.mood}
タグ: ${d.tags.join(', ')}
${d.heroHeadline ? `\nヒーロー見出し: "${d.heroHeadline.slice(0, 80)}"` : ''}

## 2. カラーパレット（厳守）
| 役割 | 値 |
|---|---|
| 背景 | \`${d.colors.bg}\` |
| 背景セカンダリ | \`${d.colors.bgSecondary}\` |
| テキスト | \`${d.colors.text}\` |
| テキストセカンダリ | \`${d.colors.textSecondary}\` |
| プライマリ (CTA色) | \`${d.colors.primary}\` |
| セカンダリ | \`${d.colors.secondary}\` |
| ボーダー | \`${d.colors.border}\` |
${d.colors.palette.slice(0, 8).map((c, i) => `| パレット${i + 1} | \`${c.hex}\` (${c.role}) |`).join('\n')}

## 3. タイポグラフィ
- 見出しフォント: \`${headFamily}\`
- 本文フォント: \`${bodyFamily}\`
`;
    if (typoDetails.length > 0) {
      out += `\n| 役割 | フォント | サイズ | ウェイト | 行高 | 字間 |\n|---|---|---|---|---|---|\n`;
      typoDetails.forEach(td => {
        out += `| ${td.role} | ${td.font} | ${td.size}px | ${td.weight} | ${td.lineHeight} | ${td.letterSpacing} |\n`;
      });
    }
    out += `\n### タイプスケール\n${d.typography.fontSizes.slice(0, 6).map((s, i) => `- ${['Display','H1','H2','H3','Body','Small'][i] || `Size${i+1}`}: ${s}px`).join('\n')}

## 4. コンポーネント
`;
    if (btn) {
      out += `### プライマリボタン
\`\`\`css
.btn-primary {
  background: ${btn.bg};
  color: ${btn.color};
  border-radius: ${btn.borderRadius}px;
  padding: ${btn.paddingV}px ${btn.paddingH}px;
  font-weight: ${btn.fontWeight};
  font-size: ${btn.fontSize}px;
}
\`\`\`
`;
    }
    if (btn2) {
      out += `### セカンダリボタン
\`\`\`css
.btn-secondary {
  background: ${btn2.bg};
  color: ${btn2.color};
  border-radius: ${btn2.borderRadius}px;
  padding: ${btn2.paddingV}px ${btn2.paddingH}px;
  font-weight: ${btn2.fontWeight};
  font-size: ${btn2.fontSize}px;
}
\`\`\`
`;
    }
    if (card) {
      out += `### カード
\`\`\`css
.card {
  background: ${card.bg};
  border-radius: ${card.borderRadius}px;
  padding: ${card.padding}px;${card.shadow && card.shadow !== 'none' ? `\n  box-shadow: ${card.shadow};` : ''}
}
\`\`\`
`;
    }

    out += `
## 5. レイアウト
- 基本単位: \`${d.spacing.base}px\`（倍数のみ使用: ${d.spacing.base * 2}px, ${d.spacing.base * 3}px, ${d.spacing.base * 4}px...）
${d.borderRadius.slice(0, 4).map(r => `- ${r.role}: ${r.value}px`).join('\n')}
`;

    if (shadows.length > 0) {
      out += `\n## 6. シャドウ\n| レベル | 値 |\n|---|---|\n`;
      shadows.slice(0, 4).forEach(s => {
        out += `| ${s.level} | \`${s.value.slice(0, 70)}${s.value.length > 70 ? '...' : ''}\` |\n`;
      });
    }

    out += `
## 7. ルール
### ✅ やること
- 上記カラーのみ使用
- フォントは \`${headFamily}\` / \`${bodyFamily}\` のみ
- スペーシングは ${d.spacing.base}px の倍数のみ
- ${isDark ? '背景は暗いまま' : '背景は明るいまま'}
- ${isRounded ? '角丸を使う（' + radiusVal + 'px以上）' : '角は控えめ（' + radiusVal + 'px以下）'}
${shadows.length > 0 ? '- 抽出したシャドウ値を使う（デフォルト値不可）' : ''}

### ❌ やらないこと
- パレット外の色を使わない
- フォントを別のものに差し替えない
- ${isDark ? '白背景パネルを使わない' : '暗いパネルを使わない'}
- 純黒(#000)をテキストに使わない → \`${d.colors.text}\` を使う

## 出力
完全な単一のHTMLファイルを出力してください。CSSはインラインの<style>タグ内に。
ヒーロー、特徴3つ、CTA、フッター を含めて。
`;
    return out;
  }

  // English (default)
  let out = `# Build a landing page in ${d.title} style

Follow this DESIGN.md strictly. All values are auto-extracted from the live site (${d.url}).

## 1. Visual Theme
${d.mood}
Tags: ${d.tags.join(', ')}
${d.heroHeadline ? `\nHero headline: "${d.heroHeadline.slice(0, 80)}"` : ''}

## 2. Color Palette (strict)
| Role | Value |
|---|---|
| Background | \`${d.colors.bg}\` |
| Background secondary | \`${d.colors.bgSecondary}\` |
| Text | \`${d.colors.text}\` |
| Text secondary | \`${d.colors.textSecondary}\` |
| Primary (CTA) | \`${d.colors.primary}\` |
| Secondary | \`${d.colors.secondary}\` |
| Border | \`${d.colors.border}\` |
${d.colors.palette.slice(0, 8).map((c, i) => `| Palette ${i + 1} | \`${c.hex}\` (${c.role}) |`).join('\n')}

## 3. Typography
- Heading font: \`${headFamily}\`
- Body font: \`${bodyFamily}\`
`;
  if (typoDetails.length > 0) {
    out += `\n| Role | Font | Size | Weight | Line Height | Letter Spacing |\n|---|---|---|---|---|---|\n`;
    typoDetails.forEach(td => {
      out += `| ${td.role} | ${td.font} | ${td.size}px | ${td.weight} | ${td.lineHeight} | ${td.letterSpacing} |\n`;
    });
  }
  out += `\n### Type Scale\n${d.typography.fontSizes.slice(0, 6).map((s, i) => `- ${['Display','H1','H2','H3','Body','Small'][i] || `Size${i+1}`}: ${s}px`).join('\n')}

## 4. Components
`;
  if (btn) {
    out += `### Primary Button
\`\`\`css
.btn-primary {
  background: ${btn.bg};
  color: ${btn.color};
  border-radius: ${btn.borderRadius}px;
  padding: ${btn.paddingV}px ${btn.paddingH}px;
  font-weight: ${btn.fontWeight};
  font-size: ${btn.fontSize}px;
}
\`\`\`
`;
  }
  if (btn2) {
    out += `### Secondary Button
\`\`\`css
.btn-secondary {
  background: ${btn2.bg};
  color: ${btn2.color};
  border-radius: ${btn2.borderRadius}px;
  padding: ${btn2.paddingV}px ${btn2.paddingH}px;
  font-weight: ${btn2.fontWeight};
  font-size: ${btn2.fontSize}px;
}
\`\`\`
`;
  }
  if (card) {
    out += `### Card
\`\`\`css
.card {
  background: ${card.bg};
  border-radius: ${card.borderRadius}px;
  padding: ${card.padding}px;${card.shadow && card.shadow !== 'none' ? `\n  box-shadow: ${card.shadow};` : ''}
}
\`\`\`
`;
  }

  out += `
## 5. Layout
- Base unit: \`${d.spacing.base}px\` (use multiples: ${d.spacing.base * 2}px, ${d.spacing.base * 3}px, ${d.spacing.base * 4}px...)
${d.borderRadius.slice(0, 4).map(r => `- ${r.role}: ${r.value}px`).join('\n')}
`;

  if (shadows.length > 0) {
    out += `\n## 6. Shadows & Elevation\n| Level | Value |\n|---|---|\n`;
    shadows.slice(0, 4).forEach(s => {
      out += `| ${s.level} | \`${s.value.slice(0, 70)}${s.value.length > 70 ? '...' : ''}\` |\n`;
    });
  }

  out += `
## 7. Rules
### ✅ Do
- Use only the colors above
- Use \`${headFamily}\` for headings, \`${bodyFamily}\` for body
- All spacing must be a multiple of ${d.spacing.base}px
- ${isDark ? 'Keep backgrounds dark' : 'Keep backgrounds light'}
- ${isRounded ? 'Use rounded corners (' + radiusVal + 'px+)' : 'Keep corners subtle (' + radiusVal + 'px or less)'}
${shadows.length > 0 ? '- Use extracted shadow values — not defaults' : ''}

### ❌ Don't
- Don't use colors outside the palette
- Don't substitute fonts
- ${isDark ? "Don't use white panels" : "Don't use dark panels"}
- Don't use pure black (#000) for text — use \`${d.colors.text}\`

## Output
Output a single complete HTML file. Put all CSS inside an inline <style> tag.
Include: hero section, 3 features, CTA, footer.
`;
  return out;
}

// Compute brand similarity (color distance + tag overlap)
function colorDistance(a: string, b: string): number {
  const ar = parseInt(a.slice(1,3), 16), ag = parseInt(a.slice(3,5), 16), ab = parseInt(a.slice(5,7), 16);
  const br = parseInt(b.slice(1,3), 16), bg = parseInt(b.slice(3,5), 16), bb = parseInt(b.slice(5,7), 16);
  return Math.sqrt(Math.pow(ar-br,2) + Math.pow(ag-bg,2) + Math.pow(ab-bb,2));
}

// Load known brands from brands_merged.json (58 real-scraped brands)
let _knownBrands: Array<{name: string; bg: string; primary: string; tags?: string[]}> | null = null;
function getKnownBrands() {
  if (_knownBrands) return _knownBrands;
  try {
    const data = JSON.parse(fs.readFileSync('/Users/ojiro/claude-hacks/typo_gen/brands_merged.json', 'utf8'));
    _knownBrands = data.filter((b: any) => b.ok).map((b: any) => ({
      name: b.name,
      bg: b.bg || '#000000',
      primary: b.primaryColor || b.buttonBg || '#888888',
    }));
    return _knownBrands || [];
  } catch (e) {
    return [];
  }
}

function findSimilarBrands(d: ExtractedDesign, n = 5): Array<{name: string; primary: string; bg: string; distance: number}> {
  const known = getKnownBrands();
  const scored = known.map(b => ({
    ...b,
    distance: colorDistance(d.colors.primary, b.primary) + colorDistance(d.colors.bg, b.bg) * 0.5,
  }));
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, n);
}

const PORT = parseInt(process.env.PORT || '8765');
const STATIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

// ───── Prebuilt data (loaded once at startup for /api/brand/:domain) ─────
let _prebuiltData: Record<string, any> | null = null;
function getPrebuiltData(): Record<string, any> {
  if (!_prebuiltData) {
    try {
      _prebuiltData = JSON.parse(fs.readFileSync(path.join(STATIC_DIR, 'prebuilt.json'), 'utf8'));
      console.log(`[prebuilt] Loaded ${Object.keys(_prebuiltData!).length} brands into memory`);
    } catch (e) {
      console.error('[prebuilt] Failed to load prebuilt.json:', e);
      _prebuiltData = {};
    }
  }
  return _prebuiltData!;
}

// C-1: SSRF prevention — block private/internal URLs
function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const h = parsed.hostname;
    if (/^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.)/.test(h)) return false;
    if (h === 'localhost' || h === '[::1]' || h.endsWith('.local')) return false;
    return true;
  } catch { return false; }
}

// L-6: Health check endpoint
// L-2: Port from env

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url || '/';

  // Health check
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return; }

  // POST /api/extract
  if (req.method === 'POST' && url === '/api/extract') {
    // Rate limit check
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const { allowed, remaining } = checkRateLimit(clientIp);
    res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (!allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Please wait 15 minutes.' }));
      return;
    }

    let body = '';
    const MAX_BODY = 10 * 1024; // 10KB
    req.on('data', c => {
      body += c;
      if (body.length > MAX_BODY) { req.destroy(); return; }
    });
    req.on('end', async () => {
      try {
        const { url: targetUrl, lang: reqLang } = JSON.parse(body);
        const lang: 'en' | 'ja' = reqLang === 'ja' ? 'ja' : 'en';
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'url required' }));
          return;
        }
        const fullUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
        // C-1: SSRF prevention
        if (!isAllowedUrl(fullUrl)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'URL not allowed' }));
          return;
        }
        console.log(`[extract] ${targetUrl} (lang=${lang})`);
        const [design, screenshot] = await Promise.all([
          extractStyle(fullUrl),
          captureScreenshot(fullUrl),
        ]);
        const similarBrands = findSimilarBrands(design, 5);
        const result = {
          design,
          screenshotBase64: screenshot,
          similarBrands,
          formats: {
            'DESIGN.md': generateDesignMd(design, 'extended'),
            'tailwind.config.js': generateTailwindConfig(design),
            'css-variables.css': generateCssVars(design),
            'design-tokens.json': generateTokensJson(design),
          },
        };
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        console.error('[extract] error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // GET /api/brand/:domain — return full prebuilt data for a single brand
  const brandMatch = url.match(/^\/api\/brand\/([a-zA-Z0-9._-]+)/);
  if (req.method === 'GET' && brandMatch) {
    const domain = decodeURIComponent(brandMatch[1]);
    const data = getPrebuiltData();
    const entry = data[domain];
    if (entry) {
      const json = JSON.stringify(entry);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      };
      // gzip if client supports it
      if (req.headers['accept-encoding']?.includes('gzip')) {
        const compressed = zlib.gzipSync(Buffer.from(json, 'utf8'));
        headers['Content-Encoding'] = 'gzip';
        res.writeHead(200, headers);
        res.end(compressed);
      } else {
        res.writeHead(200, headers);
        res.end(json);
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Brand not found: ${domain}` }));
    }
    return;
  }

  // Static files — strip query string before resolving
  const pathOnly = url.split('?')[0];

  // /pack and /pack/* → serve from /Users/ojiro/claude-hacks/typo_gen/
  if (pathOnly === '/pack') {
    res.writeHead(302, { Location: '/pack/' });
    res.end();
    return;
  }
  if (pathOnly.startsWith('/pack/')) {
    let resourcePath = pathOnly.replace('/pack/', '/');
    if (resourcePath === '/' || resourcePath === '') resourcePath = '/gallery.html';
    const packPath = path.join('/Users/ojiro/claude-hacks/typo_gen', resourcePath);
    if (fs.existsSync(packPath) && fs.statSync(packPath).isFile()) {
      const ext = path.extname(packPath);
      const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(packPath));
      return;
    }
  }

  const filePath = (pathOnly === '/' || pathOnly === '') ? '/index.html' : pathOnly;
  const fullPath = path.resolve(STATIC_DIR, '.' + filePath);
  // C-3: Path traversal prevention
  if (!fullPath.startsWith(STATIC_DIR) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  // ───── Dynamic OGP for ?url= parameter on index.html ─────
  if (filePath === '/index.html') {
    let html = fs.readFileSync(fullPath, 'utf8');
    const urlParam = new URL(url, 'http://localhost').searchParams.get('url');
    if (urlParam) {
      try {
        const parsedDomain = new URL(urlParam.startsWith('http') ? urlParam : 'https://' + urlParam).hostname.replace(/^www\./, '');
        const ogPath = path.join(STATIC_DIR, 'og', parsedDomain + '.png');
        if (fs.existsSync(ogPath)) {
          const data = getPrebuiltData();
          const brand = data[parsedDomain];
          const escAttr = (s: string) => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          const brandTitle = escAttr(brand?.design?.title || brand?.label || parsedDomain);
          const ogImageUrl = `https://designmd.dev/og/${parsedDomain}.png`;
          const ogTitle = `${brandTitle} — DESIGN.md Generator`;
          const ogDesc = `${brandTitle}のカラー・フォント・コンポーネントを抽出。AIにそっくりなUIを作らせよう`;
          // Replace og:image
          html = html.replace(
            /<meta property="og:image" content="[^"]*">/,
            `<meta property="og:image" content="${ogImageUrl}">`
          );
          // Replace twitter:image
          html = html.replace(
            /<meta name="twitter:image" content="[^"]*">/,
            `<meta name="twitter:image" content="${ogImageUrl}">`
          );
          // Replace og:title
          html = html.replace(
            /<meta property="og:title" content="[^"]*">/,
            `<meta property="og:title" content="${ogTitle}">`
          );
          // Replace twitter:title
          html = html.replace(
            /<meta name="twitter:title" content="[^"]*">/,
            `<meta name="twitter:title" content="${ogTitle}">`
          );
          // Replace og:description
          html = html.replace(
            /<meta property="og:description" content="[^"]*">/,
            `<meta property="og:description" content="${ogDesc}">`
          );
          // Replace twitter:description
          html = html.replace(
            /<meta name="twitter:description" content="[^"]*">/,
            `<meta name="twitter:description" content="${ogDesc}">`
          );
          // Replace og:url
          html = html.replace(
            /<meta property="og:url" content="[^"]*">/,
            `<meta property="og:url" content="https://designmd.dev/?url=${parsedDomain}">`
          );
        }
      } catch (_) {
        // Invalid URL param — serve default HTML
      }
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  {
    const ext = path.extname(fullPath);
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };
    const headers: Record<string, string> = { 'Content-Type': types[ext] || 'text/plain' };
    // Prevent caching for JSON data (prebuilt.json changes frequently)
    if (ext === '.json') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }
    // Add JPEG support
    if (ext === '.jpg' || ext === '.jpeg') {
      headers['Content-Type'] = 'image/jpeg';
    }
    // gzip compression for JSON files
    if (ext === '.json' && req.headers['accept-encoding']?.includes('gzip')) {
      const compressed = zlib.gzipSync(fs.readFileSync(fullPath));
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      res.end(compressed);
      return;
    }
    res.writeHead(200, headers);
    res.end(fs.readFileSync(fullPath));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// Eagerly load prebuilt data at startup
getPrebuiltData();

server.listen(PORT, () => {
  console.log(`Style Extractor running at http://localhost:${PORT}`);
});
