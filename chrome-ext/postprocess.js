/**
 * postprocess.js — Transform raw extractor output into ExtractedDesign
 *
 * Ported from style-extractor/extract.ts characterize() + extractStyle() body
 * (lines 594–828). No Playwright / no browser launch — just pure JS on the
 * raw object returned by extractRaw().
 */

function characterize(raw) {
  const tags = [];
  const lum = (hex) => {
    if (!hex || hex.length !== 7) return 0.5;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  const isDark = lum(raw.bodyBg) < 0.4;
  tags.push(isDark ? 'dark' : 'light');

  const radii = (raw.borderRadii || []).map((r) => r[0]);
  const avgRadius = radii.length ? radii.reduce((a, b) => a + b, 0) / radii.length : 0;
  if (avgRadius < 2) tags.push('sharp');
  else if (avgRadius < 8) tags.push('soft');
  else tags.push('rounded');

  const palette = raw.palette || [];
  const vivid = palette.filter((p) => {
    const h = p.hex;
    if (!h || h.length !== 7) return false;
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max - min > 100;
  });
  if (vivid.length > 3) tags.push('colorful');
  else if (vivid.length > 0) tags.push('accented');
  else tags.push('monochrome');

  const hsize = raw.heading ? parseFloat(raw.heading.size) : 0;
  if (hsize > 64) tags.push('bold-typography');
  else if (hsize < 28) tags.push('compact');

  const fonts = (raw.fonts || []).map((f) => f[0].toLowerCase());
  if (fonts.some((f) => f.includes('mono'))) tags.push('monospace');
  const isSerif = fonts.some((f) => {
    if (f.includes('sans-serif') || f.includes('sans serif')) return false;
    return /\bserif\b/.test(f) || f.includes('garamond') || f.includes('playfair') ||
      f.includes('libre baskerville') || f.includes('cormorant') || f.includes('eb garamond') ||
      f.includes('lora') || f.includes('merriweather') || f.includes('crimson');
  });
  if (isSerif) tags.push('serif');
  else tags.push('sans-serif');

  let mood = '';
  if (isDark && vivid.length > 2) mood = 'High-contrast dark mode with vivid accents — feels modern, technical, and focused.';
  else if (isDark) mood = 'Refined dark mode with muted tones — cinematic and premium.';
  else if (avgRadius > 12) mood = 'Friendly, approachable design with rounded shapes and generous whitespace.';
  else if (tags.includes('serif')) mood = 'Editorial and authoritative — feels like a magazine or news site.';
  else if (vivid.length > 3) mood = 'Energetic and playful with bold colors and confident hierarchy.';
  else mood = 'Clean, minimal, and product-focused with deliberate use of whitespace.';

  return { tags, mood };
}

function postProcess(raw) {
  const url = raw.url || '';
  const { tags, mood } = characterize(raw);

  const lumBg = (() => {
    if (!raw.bodyBg) return 0.5;
    const r = parseInt(raw.bodyBg.slice(1, 3), 16);
    const g = parseInt(raw.bodyBg.slice(3, 5), 16);
    const b = parseInt(raw.bodyBg.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  })();
  const isDark = lumBg < 0.5;

  function rgbDist(a, b) {
    if (!a || !b || a.length !== 7 || b.length !== 7) return 999;
    const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab_ = parseInt(a.slice(5, 7), 16);
    const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb_ = parseInt(b.slice(5, 7), 16);
    return Math.sqrt(Math.pow(ar - br, 2) + Math.pow(ag - bg, 2) + Math.pow(ab_ - bb_, 2));
  }

  const rawPalette = raw.palette || [];
  const dedupedPalette = [];
  for (const c of rawPalette) {
    if (!c.hex) continue;
    const dup = dedupedPalette.find((d) => rgbDist(d.hex, c.hex) < 12);
    if (!dup) dedupedPalette.push(c);
  }

  const palette = dedupedPalette.map((p) => ({
    hex: p.hex,
    role: (p.roles && p.roles[0]) || 'unknown',
    count: 1,
    area: Math.round(p.area),
    contrast: p.contrast,
  }));

  function isMutedNeutral(hex, bgHex) {
    if (!hex || hex.length !== 7) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const chr = (max - min) / 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return chr < 0.15 && lum > 0.25 && lum < 0.75 && rgbDist(hex, bgHex) > 30;
  }
  const bgHex = raw.bodyBg || (isDark ? '#000000' : '#ffffff');
  let textSecondary = (palette.find((p) => isMutedNeutral(p.hex, bgHex)) || {}).hex;
  if (!textSecondary) textSecondary = isDark ? '#999999' : '#666666';

  const headingFont = {
    family: (raw.heading && raw.heading.family) || raw.bodyFont || 'sans-serif',
    cleanFamily: ((raw.heading && raw.heading.family) || '').split(',')[0].replace(/['"]/g, '').trim(),
    weights: [(raw.heading && raw.heading.weight) || '700'],
    usedFor: 'heading',
    fallback: 'sans-serif',
  };
  const bodyFont = {
    family: raw.bodyFont || 'sans-serif',
    cleanFamily: (raw.bodyFont || '').split(',')[0].replace(/['"]/g, '').trim(),
    weights: ['400'],
    usedFor: 'body',
    fallback: 'sans-serif',
  };

  const fontFaces = (raw.fontFaces || []).map((ff) => ff);
  for (const ff of fontFaces) {
    const famLower = (ff.family || '').toLowerCase();
    const hClean = (headingFont.cleanFamily || '').toLowerCase();
    const bClean = (bodyFont.cleanFamily || '').toLowerCase();
    if (hClean && (hClean === famLower || famLower.includes(hClean.split(' ')[0]))) {
      headingFont.realUrl = headingFont.realUrl || ff.src;
    }
    if (bClean && (bClean === famLower || famLower.includes(bClean.split(' ')[0]))) {
      bodyFont.realUrl = bodyFont.realUrl || ff.src;
    }
  }

  const result = {
    url,
    title: raw.title || url,
    description: raw.description || '',
    scrapedAt: new Date().toISOString(),
    colors: {
      bg: raw.bodyBg || (isDark ? '#000000' : '#ffffff'),
      bgSecondary: (palette[1] && palette[1].hex) || raw.bodyBg,
      text: raw.bodyText || (isDark ? '#ffffff' : '#000000'),
      textSecondary,
      primary: raw.primary || '#888888',
      secondary: raw.secondary || raw.primary || '#aaaaaa',
      border: raw.border || (isDark ? '#222222' : '#e5e5e5'),
      palette,
    },
    typography: {
      headingFont,
      bodyFont,
      fontSizes: (raw.fontSizes || []).slice(0, 10),
      lineHeights: [],
      details: [],
    },
    spacing: {
      base: (raw.spacings && raw.spacings[0] && raw.spacings[0][0]) || 16,
      common: (raw.spacings || []).map((s) => ({
        value: s[0],
        count: s[1],
        role: s[0] >= 60 ? 'section' : s[0] >= 24 ? 'card' : 'element',
      })),
      // v1.2.0
      margins: (raw.margins || []).map((s) => ({ value: s[0], count: s[1] })),
      detectedBase: raw.spacingScale || null,
    },
    borderRadius: (raw.borderRadii || []).map((r) => ({
      value: r[0],
      count: r[1],
      role: r[0] >= 100 ? 'pill' : r[0] >= 16 ? 'card' : r[0] >= 6 ? 'button' : 'subtle',
    })),
    shadows: (raw.shadows || []).map((s) => {
      const blurMatch = s.value.match(/(\d+)px\s+(\d+)px\s+(\d+)px/);
      const blur = blurMatch ? parseInt(blurMatch[3]) : 0;
      return {
        value: s.value,
        count: s.count,
        level: blur <= 4 ? 'low' : blur <= 12 ? 'mid' : blur <= 24 ? 'high' : 'deep',
      };
    }),
    components: {
      primaryButton: raw.button,
      secondaryButton: raw.button2 || undefined,
      buttons: raw.allButtons || [],
      card: raw.card,
    },
    fontFaces,
    cssCustomProperties: (raw.cssCustomProps || []).map((cp) => ({
      name: cp.name,
      value: cp.value,
      category: cp.category,
    })),
    // v1.2.0 additions
    fontFeatures: raw.fontFeatures || [],
    iconFonts: raw.iconFonts || [],
    gradients: raw.gradients || [],
    tags,
    mood,
    heroHeadline: raw.heading && raw.heading.text,
    heroSubtitle: raw.subtitle,
    isJapanese: !!raw.isJapanese,
  };

  const typoDetails = (raw.typoDetails || []).map((td) => ({
    role: td.role,
    size: td.size,
    weight: td.weight,
    lineHeight: td.lineHeight,
    letterSpacing: td.letterSpacing,
    font: td.font,
  }));
  result.typography.details = typoDetails;

  return result;
}
