/**
 * Style Extractor — URL → 完全な構造化デザインデータ
 * Refero Style Extractor の完全クローン
 *
 * 入力: 任意のサイトURL
 * 出力: { colors, fonts, spacing, typography, components, fontFaces, ...}
 */
import { chromium, Browser, Page } from 'playwright';

export interface FontFace {
  family: string;
  weight?: string;
  style?: string;
  src: string;
}

export interface ColorEntry {
  hex: string;
  role: string;       // "background" | "text" | "accent" | "surface" | "border" | "muted"
  count: number;      // how many times found
  area: number;       // total area covered
  contrast: 'light' | 'dark'; // suggested text on this bg
}

export interface FontEntry {
  family: string;
  cleanFamily: string;
  weights: string[];
  usedFor: string;    // "heading" | "body" | "code"
  fallback: string;
  realUrl?: string;   // woff2 URL if found
}

export interface SpacingEntry {
  value: number;       // px
  count: number;
  role: string;        // "section" | "card" | "element"
}

export interface BorderRadiusEntry {
  value: number;
  count: number;
  role: string;
}

export interface ButtonSample {
  bg: string;
  color: string;
  borderRadius: number;
  paddingH: number;
  paddingV: number;
  fontSize: number;
  fontWeight: string;
  variant?: string;      // "filled" | "outline" | "ghost" | "pill" | "icon" | "link"
  border?: string;       // border CSS value if outline style
}

export interface CardSample {
  bg: string;
  borderRadius: number;
  padding: number;
  shadow: string;
}

export interface ShadowEntry {
  value: string;       // full CSS shadow string
  count: number;
  level: string;       // "low" | "mid" | "high" | "deep"
}

export interface TypographyDetail {
  role: string;        // "Display" | "H1" | "H2" | "Body" etc.
  size: number;        // px
  weight: string;
  lineHeight: string;
  letterSpacing: string;
  font: string;        // family name
}

export interface CssCustomProperty {
  name: string;        // e.g. "--color-primary"
  value: string;       // e.g. "#ff5500"
  category: 'color' | 'spacing' | 'typography' | 'other';
}

export interface ExtractedDesign {
  url: string;
  title: string;
  description: string;
  scrapedAt: string;
  // raw scraped data
  colors: {
    bg: string;
    bgSecondary: string;
    text: string;
    textSecondary: string;
    primary: string;     // most distinctive accent
    secondary: string;
    border: string;
    palette: ColorEntry[];
  };
  typography: {
    headingFont: FontEntry;
    bodyFont: FontEntry;
    monoFont?: FontEntry;
    fontSizes: number[]; // sorted unique sizes
    lineHeights: number[];
    details: TypographyDetail[];
  };
  spacing: {
    base: number;       // base unit (e.g. 8px)
    common: SpacingEntry[];
  };
  borderRadius: BorderRadiusEntry[];
  shadows: ShadowEntry[];
  components: {
    primaryButton?: ButtonSample;
    secondaryButton?: ButtonSample;
    buttons: ButtonSample[];    // all distinct button variants (up to 6)
    card?: CardSample;
  };
  fontFaces: FontFace[];
  cssCustomProperties: CssCustomProperty[];
  // Tags / characterization
  tags: string[];      // "minimal" "playful" "dark" "high-contrast" etc.
  mood: string;        // overall feel description
  // Hero text snippet
  heroHeadline?: string;
  heroSubtitle?: string;
  isJapanese: boolean;
}

const EXTRACT_FN = `(() => {
  function rgbToHex(rgb) {
    if (!rgb) return '';
    var m = rgb.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!m) return '';
    var toHex = function(x) { return parseInt(x).toString(16).padStart(2, '0'); };
    return '#' + toHex(m[1]) + toHex(m[2]) + toHex(m[3]);
  }
  function isGrey(hex) {
    if (!hex || hex.length !== 7) return true;
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    return Math.max(r,g,b) - Math.min(r,g,b) < 25;
  }
  function isExtreme(hex) {
    return ['#ffffff','#000000','#fafafa','#f5f5f5','#f8f8f8','#fefefe','#f8f9fa','#fafbfc'].indexOf(hex) >= 0;
  }
  function luminance(hex) {
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    return (0.299*r + 0.587*g + 0.114*b) / 255;
  }
  function px(s) {
    if (!s) return 0;
    return parseFloat(s) || 0;
  }

  // ===== BODY ROOTS =====
  var bodyStyle = getComputedStyle(document.body);
  var rawBodyBg = bodyStyle.backgroundColor;
  // Handle transparent body — check html, then default to white
  var bodyBg = '';
  if (rawBodyBg === 'rgba(0, 0, 0, 0)' || rawBodyBg === 'transparent') {
    var htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    if (htmlBg && htmlBg !== 'rgba(0, 0, 0, 0)' && htmlBg !== 'transparent') {
      bodyBg = rgbToHex(htmlBg);
    } else {
      bodyBg = '#ffffff'; // browser default is white
    }
  } else {
    bodyBg = rgbToHex(rawBodyBg);
  }
  var bodyText = rgbToHex(bodyStyle.color);
  var bodyFontFamily = bodyStyle.fontFamily;

  // ===== HEADING =====
  var heading = document.querySelector('h1') || document.querySelector('h2') || document.querySelector('[class*="hero"] h1');
  var headingData = null;
  if (heading) {
    var hs = getComputedStyle(heading);
    headingData = {
      text: heading.textContent.trim().slice(0, 120),
      color: rgbToHex(hs.color),
      family: hs.fontFamily,
      size: hs.fontSize,
      weight: hs.fontWeight,
      lineHeight: hs.lineHeight,
      letterSpacing: hs.letterSpacing
    };
  }

  // Subtitle (next paragraph or h2 after h1)
  var subtitle = '';
  if (heading) {
    var sib = heading.nextElementSibling;
    while (sib) {
      if (sib.tagName === 'P' || sib.tagName === 'H2' || sib.tagName === 'H3' || sib.tagName === 'DIV') {
        var t = sib.textContent.trim();
        if (t.length > 10 && t.length < 300) {
          subtitle = t.slice(0, 200);
          break;
        }
      }
      sib = sib.nextElementSibling;
    }
  }

  // ===== ALL ELEMENTS PASS =====
  var allEls = document.querySelectorAll('*');
  var maxScan = Math.min(2500, allEls.length);
  var colorAreas = {};
  var colorRoles = {};
  var fontCounts = {};
  var weightCounts = {};
  var sizeCounts = {};
  var paddingCounts = {};
  var marginCounts = {};
  var radiusCounts = {};
  var shadowCounts = {};

  for (var i = 0; i < maxScan; i++) {
    var el = allEls[i];
    var cs = getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var area = rect.width * rect.height;

    // BG colors weighted by area
    var bg = rgbToHex(cs.backgroundColor);
    if (bg && bg.indexOf('#') === 0 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      if (area > 100 && area < 800000) {
        colorAreas[bg] = (colorAreas[bg] || 0) + area;
        if (!colorRoles[bg]) colorRoles[bg] = [];
        if (area > 200000) colorRoles[bg].push('section');
        else if (area > 20000) colorRoles[bg].push('block');
        else if (area > 2000) colorRoles[bg].push('button');
        else colorRoles[bg].push('badge');
      }
    }

    // Text colors
    var fg = rgbToHex(cs.color);
    if (fg && fg.indexOf('#') === 0) {
      if (!isGrey(fg) && !isExtreme(fg)) {
        colorAreas[fg] = (colorAreas[fg] || 0) + 50;
        if (!colorRoles[fg]) colorRoles[fg] = [];
        colorRoles[fg].push('text-accent');
      }
    }

    // Fonts
    var f = cs.fontFamily;
    if (f) fontCounts[f] = (fontCounts[f] || 0) + 1;
    var w = cs.fontWeight;
    if (w) weightCounts[w] = (weightCounts[w] || 0) + 1;
    var sz = px(cs.fontSize);
    if (sz > 0) sizeCounts[sz] = (sizeCounts[sz] || 0) + 1;

    // Spacing
    var p = px(cs.paddingTop);
    if (p > 0 && p < 200) paddingCounts[p] = (paddingCounts[p] || 0) + 1;
    var m = px(cs.marginTop);
    if (m > 0 && m < 200) marginCounts[m] = (marginCounts[m] || 0) + 1;

    // Border radius
    var br = px(cs.borderRadius);
    if (br > 0 && br < 200) radiusCounts[br] = (radiusCounts[br] || 0) + 1;

    // Shadow
    var sh = cs.boxShadow;
    if (sh && sh !== 'none') shadowCounts[sh] = (shadowCounts[sh] || 0) + 1;
  }

  // Build palette sorted by area
  var palette = Object.keys(colorAreas).map(function(k) {
    return {
      hex: k,
      area: colorAreas[k],
      roles: colorRoles[k] || [],
      contrast: luminance(k) < 0.5 ? 'light' : 'dark'
    };
  });
  palette.sort(function(a, b) { return b.area - a.area; });
  palette = palette.slice(0, 14);

  // Find primary accent — prefer perceptually vivid color
  function chroma(hex) {
    var r = parseInt(hex.slice(1,3), 16) / 255;
    var g = parseInt(hex.slice(3,5), 16) / 255;
    var b = parseInt(hex.slice(5,7), 16) / 255;
    var max = Math.max(r,g,b), min = Math.min(r,g,b);
    return max - min; // 0..1, perceptual chroma
  }
  function lum(hex) {
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    return (0.299*r + 0.587*g + 0.114*b) / 255;
  }
  // Filter: must be in mid-lightness range (vivid colors live here) AND have meaningful chroma
  var candidates = palette
    .filter(function(c) {
      if (isExtreme(c.hex) || c.hex === bodyBg || isGrey(c.hex)) return false;
      var l = lum(c.hex);
      var ch = chroma(c.hex);
      return l > 0.18 && l < 0.85 && ch > 0.30; // exclude too dark, too light, or low-chroma
    })
    .map(function(c) {
      return { hex: c.hex, score: chroma(c.hex) * Math.log(c.area + 10), area: c.area };
    });
  candidates.sort(function(a, b) { return b.score - a.score; });
  var primary = candidates[0] ? candidates[0].hex : '';
  // Fallback: if no good candidate, use the most saturated regardless of lightness
  if (!primary) {
    var fb = palette
      .filter(function(c) { return !isExtreme(c.hex) && c.hex !== bodyBg && !isGrey(c.hex); })
      .map(function(c) { return { hex: c.hex, score: chroma(c.hex) }; });
    fb.sort(function(a, b) { return b.score - a.score; });
    primary = fb[0] ? fb[0].hex : '';
  }
  var secondary = '';
  for (var si = 0; si < candidates.length; si++) {
    if (candidates[si].hex !== primary) {
      secondary = candidates[si].hex;
      break;
    }
  }

  // Border color (most common grey-ish that's not bg)
  var border = '';
  for (var bi = 0; bi < palette.length; bi++) {
    var c = palette[bi];
    if (isGrey(c.hex) && c.hex !== bodyBg && c.hex !== '#000000' && c.hex !== '#ffffff') {
      border = c.hex;
      break;
    }
  }

  // Font palette
  var fontEntries = Object.keys(fontCounts).map(function(k) { return [k, fontCounts[k]]; });
  fontEntries.sort(function(a, b) { return b[1] - a[1]; });
  var topFonts = fontEntries.slice(0, 8);

  // Font sizes
  var sizes = Object.keys(sizeCounts).map(function(k) { return parseFloat(k); });
  sizes.sort(function(a, b) { return b - a; });
  var topSizes = sizes.slice(0, 12);

  // Spacings: dedupe + sort
  var spacings = Object.keys(paddingCounts).map(function(k) { return [parseFloat(k), paddingCounts[k]]; });
  spacings.sort(function(a, b) { return b[1] - a[1]; });
  var topSpacings = spacings.slice(0, 8);

  // Border radii
  var radii = Object.keys(radiusCounts).map(function(k) { return [parseFloat(k), radiusCounts[k]]; });
  radii.sort(function(a, b) { return b[1] - a[1]; });
  var topRadii = radii.slice(0, 6);

  // ===== TYPOGRAPHY DETAILS (per heading level + body) =====
  var typoDetails = [];
  var typoSelectors = [
    { sel: 'h1', role: 'H1' }, { sel: 'h2', role: 'H2' }, { sel: 'h3', role: 'H3' },
    { sel: 'h4', role: 'H4' }, { sel: 'p', role: 'Body' },
    { sel: 'small, .text-sm, [class*="caption"]', role: 'Small' },
    { sel: 'code, pre, [class*="mono"]', role: 'Code' }
  ];
  var seenRoles = {};
  for (var ti = 0; ti < typoSelectors.length; ti++) {
    var tEl = document.querySelector(typoSelectors[ti].sel);
    if (tEl && !seenRoles[typoSelectors[ti].role]) {
      var ts = getComputedStyle(tEl);
      seenRoles[typoSelectors[ti].role] = true;
      typoDetails.push({
        role: typoSelectors[ti].role,
        size: px(ts.fontSize),
        weight: ts.fontWeight,
        lineHeight: ts.lineHeight,
        letterSpacing: ts.letterSpacing,
        font: ts.fontFamily.split(',')[0].replace(/['"]/g, '').trim()
      });
    }
  }

  // ===== SHADOW DETAILS =====
  var shadowList = [];
  var shadowEntries = Object.keys(shadowCounts).map(function(k) { return { value: k, count: shadowCounts[k] }; });
  shadowEntries.sort(function(a, b) { return b.count - a.count; });
  shadowList = shadowEntries.slice(0, 8);

  // ===== BUTTON SAMPLES (up to 6 variants) =====
  var btnSample = null;
  var btnSample2 = null;
  var allButtons = [];
  var seenBtnStyles = new Set();
  var btns = document.querySelectorAll('button, a[class*="btn"], a[class*="button"], [class*="cta"], [class*="primary"], [role="button"], a[class*="link"], [class*="outline"], [class*="secondary"], [class*="ghost"]');
  for (var bni = 0; bni < Math.min(60, btns.length); bni++) {
    var bs = getComputedStyle(btns[bni]);
    var bbg = rgbToHex(bs.backgroundColor);
    var bColor = rgbToHex(bs.color);
    var bBorder = bs.borderWidth !== '0px' && bs.borderStyle !== 'none' ? bs.border : '';
    var bRadius = px(bs.borderRadius);
    var isTransparent = bs.backgroundColor === 'rgba(0, 0, 0, 0)' || bs.backgroundColor === 'transparent';
    // Determine variant type
    var variant = 'filled';
    if (isTransparent && bBorder) variant = 'outline';
    else if (isTransparent && !bBorder) variant = 'ghost';
    if (bRadius >= 100) variant = 'pill';
    // Skip invisible/tiny elements
    var rect = btns[bni].getBoundingClientRect();
    if (rect.width < 30 || rect.height < 20) continue;
    // Create a style fingerprint to deduplicate
    var fingerprint = (bbg || 'transparent') + '|' + bColor + '|' + bRadius + '|' + variant;
    if (seenBtnStyles.has(fingerprint)) continue;
    seenBtnStyles.add(fingerprint);
    var sample = {
      bg: isTransparent ? 'transparent' : (bbg || 'transparent'),
      color: bColor,
      borderRadius: bRadius,
      paddingH: px(bs.paddingLeft),
      paddingV: px(bs.paddingTop),
      fontSize: px(bs.fontSize),
      fontWeight: bs.fontWeight,
      variant: variant,
      border: bBorder || ''
    };
    // Skip samples with no visual distinction
    if (sample.bg === 'transparent' && !bBorder && !bColor) continue;
    allButtons.push(sample);
    if (!btnSample && sample.bg !== 'transparent') btnSample = sample;
    else if (!btnSample2 && sample.bg !== 'transparent' && sample.bg !== (btnSample && btnSample.bg)) btnSample2 = sample;
    if (allButtons.length >= 6) break;
  }

  // ===== CARD SAMPLE =====
  var cardSample = null;
  var cards = document.querySelectorAll('[class*="card"], article, [class*="tile"], section');
  for (var ci = 0; ci < Math.min(30, cards.length); ci++) {
    var crs = getComputedStyle(cards[ci]);
    if (crs.boxShadow !== 'none' || px(crs.borderRadius) > 4) {
      cardSample = {
        bg: rgbToHex(crs.backgroundColor),
        borderRadius: px(crs.borderRadius),
        padding: px(crs.paddingTop),
        shadow: crs.boxShadow
      };
      break;
    }
  }

  // ===== @FONT-FACE EXTRACTION =====
  var fontFaces = [];
  var seenSrc = {};
  try {
    for (var s = 0; s < document.styleSheets.length; s++) {
      var sheet = document.styleSheets[s];
      try {
        var rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (var r = 0; r < rules.length; r++) {
          var rule = rules[r];
          if (rule.type === 5) {
            var family = (rule.style.fontFamily || '').replace(/['"]/g, '');
            var weight = rule.style.fontWeight || '';
            var style = rule.style.fontStyle || '';
            var srcStr = rule.style.src || rule.style.getPropertyValue('src') || '';
            var urlMatch = srcStr.match(/url\\(([^)]+\\.woff2?)[^)]*\\)/);
            if (urlMatch && family) {
              var url = urlMatch[1].replace(/['"]/g, '');
              try { url = new URL(url, sheet.href || location.href).href; } catch (e) {}
              if (!seenSrc[url]) {
                seenSrc[url] = true;
                fontFaces.push({ family: family, weight: weight, style: style, src: url });
              }
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {}

  // ===== CSS CUSTOM PROPERTIES EXTRACTION =====
  var cssCustomProps = [];
  var seenVarNames = {};
  try {
    for (var vs = 0; vs < document.styleSheets.length; vs++) {
      var vsheet = document.styleSheets[vs];
      try {
        var vrules = vsheet.cssRules || vsheet.rules;
        if (!vrules) continue;
        for (var vr = 0; vr < vrules.length; vr++) {
          var vrule = vrules[vr];
          // CSSStyleRule type === 1; check if selector targets :root or html
          if (vrule.type === 1 && /^(:root|html)$/i.test((vrule.selectorText || '').trim())) {
            var vstyle = vrule.style;
            for (var vp = 0; vp < vstyle.length; vp++) {
              var propName = vstyle[vp];
              if (propName.indexOf('--') === 0 && !seenVarNames[propName]) {
                seenVarNames[propName] = true;
                var propValue = vstyle.getPropertyValue(propName).trim();
                if (propValue) {
                  // Categorize
                  var cat = 'other';
                  var valLower = propValue.toLowerCase();
                  if (/#[0-9a-f]{3,8}\\b/.test(valLower) || valLower.indexOf('rgb') >= 0 || valLower.indexOf('hsl') >= 0 || valLower.indexOf('oklch') >= 0 || valLower.indexOf('color(') >= 0) {
                    cat = 'color';
                  } else if (/^-?[\\d.]+\\s*(px|rem|em|vh|vw|%)$/.test(valLower) || /^-?[\\d.]+$/.test(valLower)) {
                    // Check if it's typography-related by name
                    var nameLower = propName.toLowerCase();
                    if (nameLower.indexOf('font') >= 0 || nameLower.indexOf('line-height') >= 0 || nameLower.indexOf('letter-spacing') >= 0 || nameLower.indexOf('text') >= 0) {
                      cat = 'typography';
                    } else {
                      cat = 'spacing';
                    }
                  } else if (/font|family|weight|line-height|letter-spacing|text/.test(propName.toLowerCase())) {
                    cat = 'typography';
                  }
                  cssCustomProps.push({ name: propName, value: propValue, category: cat });
                }
              }
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  // Also extract from computed style on :root (catches properties set via JS)
  try {
    var rootCS = getComputedStyle(document.documentElement);
    // We already got stylesheet-declared ones; now check for any that were set dynamically
    // Unfortunately getComputedStyle doesn't enumerate custom properties, so we skip this
  } catch (e) {}

  // ===== JAPANESE DETECTION =====
  var htmlLang = document.documentElement.lang || '';
  var isJapanese = htmlLang.startsWith('ja') ||
    (document.querySelector('meta[http-equiv="content-language"]') || {}).content === 'ja' ||
    bodyFontFamily.indexOf('Noto Sans JP') >= 0 ||
    bodyFontFamily.indexOf('游ゴシック') >= 0 ||
    bodyFontFamily.indexOf('Yu Gothic') >= 0 ||
    bodyFontFamily.indexOf('Hiragino') >= 0 ||
    bodyFontFamily.indexOf('ヒラギノ') >= 0 ||
    bodyFontFamily.indexOf('Meiryo') >= 0 ||
    bodyFontFamily.indexOf('メイリオ') >= 0;

  // ===== META =====
  // Prefer og:site_name > clean document.title > hostname
  var ogSite = (document.querySelector('meta[property="og:site_name"]') || {}).content || '';
  var rawTitle = document.title || '';
  // Strip everything after the first separator (| — – - :)
  var cleanTitle = rawTitle;
  var seps = ['|', '—', '–', ' - ', ': '];
  for (var ti = 0; ti < seps.length; ti++) {
    var idx = cleanTitle.indexOf(seps[ti]);
    if (idx > 0) cleanTitle = cleanTitle.slice(0, idx).trim();
  }
  // Pick shortest meaningful title
  var titleCandidates = [ogSite, cleanTitle, rawTitle].filter(function(t) { return t && t.length > 1; });
  titleCandidates.sort(function(a, b) { return a.length - b.length; });
  var title = titleCandidates[0] || '';
  if (title.length > 40) title = title.slice(0, 38) + '…';
  var description = (document.querySelector('meta[name="description"]') || {}).content || '';

  return {
    title: title,
    description: description,
    bodyBg: bodyBg,
    bodyText: bodyText,
    bodyFont: bodyFontFamily,
    heading: headingData,
    subtitle: subtitle,
    palette: palette,
    primary: primary,
    secondary: secondary,
    border: border,
    fonts: topFonts,
    fontSizes: topSizes,
    spacings: topSpacings,
    borderRadii: topRadii,
    button: btnSample,
    button2: btnSample2,
    allButtons: allButtons,
    card: cardSample,
    fontFaces: fontFaces,
    shadows: shadowList,
    typoDetails: typoDetails,
    isJapanese: isJapanese,
    cssCustomProps: cssCustomProps
  };
})()`;

// Tag the design with characterizations
function characterize(raw: any): { tags: string[]; mood: string } {
  const tags: string[] = [];
  const lum = (hex: string) => {
    if (!hex || hex.length !== 7) return 0.5;
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return (0.299*r + 0.587*g + 0.114*b) / 255;
  };
  const isDark = lum(raw.bodyBg) < 0.4;
  tags.push(isDark ? 'dark' : 'light');

  const radii = (raw.borderRadii || []).map((r: any) => r[0]);
  const avgRadius = radii.length ? radii.reduce((a: number, b: number) => a + b, 0) / radii.length : 0;
  if (avgRadius < 2) tags.push('sharp');
  else if (avgRadius < 8) tags.push('soft');
  else tags.push('rounded');

  // Color saturation
  const palette = raw.palette || [];
  const vivid = palette.filter((p: any) => {
    const h = p.hex;
    if (!h || h.length !== 7) return false;
    const r = parseInt(h.slice(1,3), 16), g = parseInt(h.slice(3,5), 16), b = parseInt(h.slice(5,7), 16);
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    return max - min > 100;
  });
  if (vivid.length > 3) tags.push('colorful');
  else if (vivid.length > 0) tags.push('accented');
  else tags.push('monochrome');

  // Heading size
  const hsize = raw.heading ? parseFloat(raw.heading.size) : 0;
  if (hsize > 64) tags.push('bold-typography');
  else if (hsize < 28) tags.push('compact');

  // Mono detection
  const fonts = (raw.fonts || []).map((f: any) => f[0].toLowerCase());
  if (fonts.some((f: string) => f.includes('mono'))) tags.push('monospace');
  // Serif detection - need to exclude "sans-serif" which contains "serif"
  const isSerif = fonts.some((f: string) => {
    if (f.includes('sans-serif') || f.includes('sans serif')) return false;
    return /\bserif\b/.test(f) || f.includes('garamond') || f.includes('playfair') ||
           f.includes('libre baskerville') || f.includes('cormorant') || f.includes('eb garamond') ||
           f.includes('lora') || f.includes('merriweather') || f.includes('crimson');
  });
  if (isSerif) tags.push('serif');
  else tags.push('sans-serif');

  // Mood
  let mood = '';
  if (isDark && vivid.length > 2) mood = 'High-contrast dark mode with vivid accents — feels modern, technical, and focused.';
  else if (isDark) mood = 'Refined dark mode with muted tones — cinematic and premium.';
  else if (avgRadius > 12) mood = 'Friendly, approachable design with rounded shapes and generous whitespace.';
  else if (tags.includes('serif')) mood = 'Editorial and authoritative — feels like a magazine or news site.';
  else if (vivid.length > 3) mood = 'Energetic and playful with bold colors and confident hierarchy.';
  else mood = 'Clean, minimal, and product-focused with deliberate use of whitespace.';

  return { tags, mood };
}

export async function extractStyle(url: string): Promise<ExtractedDesign> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(3500);
  } catch (err) {
    // Try domcontentloaded as fallback
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  const raw: any = await page.evaluate(EXTRACT_FN as any);
  await browser.close();

  // Build structured output
  const { tags, mood } = characterize(raw);
  const lumBg = (() => {
    if (!raw.bodyBg) return 0.5;
    const r = parseInt(raw.bodyBg.slice(1,3), 16);
    const g = parseInt(raw.bodyBg.slice(3,5), 16);
    const b = parseInt(raw.bodyBg.slice(5,7), 16);
    return (0.299*r + 0.587*g + 0.114*b) / 255;
  })();
  const isDark = lumBg < 0.5;

  // Dedup colors that are visually identical (RGB distance < 12)
  function rgbDist(a: string, b: string): number {
    if (!a || !b || a.length !== 7 || b.length !== 7) return 999;
    const ar = parseInt(a.slice(1,3), 16), ag = parseInt(a.slice(3,5), 16), ab_ = parseInt(a.slice(5,7), 16);
    const br = parseInt(b.slice(1,3), 16), bg = parseInt(b.slice(3,5), 16), bb_ = parseInt(b.slice(5,7), 16);
    return Math.sqrt(Math.pow(ar-br, 2) + Math.pow(ag-bg, 2) + Math.pow(ab_-bb_, 2));
  }
  const rawPalette = raw.palette || [];
  const dedupedPalette: any[] = [];
  for (const c of rawPalette) {
    if (!c.hex) continue;
    const dup = dedupedPalette.find(d => rgbDist(d.hex, c.hex) < 12);
    if (!dup) dedupedPalette.push(c);
  }

  const palette: ColorEntry[] = dedupedPalette.map((p: any) => ({
    hex: p.hex,
    role: (p.roles && p.roles[0]) || 'unknown',
    count: 1,
    area: Math.round(p.area),
    contrast: p.contrast,
  }));

  // Detect text-secondary: prefer a NEUTRAL muted color (grey-ish), not the brand accent
  function isMutedNeutral(hex: string, bgHex: string): boolean {
    if (!hex || hex.length !== 7) return false;
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    const chr = (max - min) / 255; // chroma
    const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
    // Muted: low chroma AND mid-lightness AND not same as bg
    return chr < 0.15 && lum > 0.25 && lum < 0.75 && rgbDist(hex, bgHex) > 30;
  }
  const bgHex = raw.bodyBg || (isDark ? '#000000' : '#ffffff');
  let textSecondary = palette.find(p => isMutedNeutral(p.hex, bgHex))?.hex;
  if (!textSecondary) textSecondary = isDark ? '#999999' : '#666666';

  const headingFont: FontEntry = {
    family: raw.heading?.family || raw.bodyFont || 'sans-serif',
    cleanFamily: (raw.heading?.family || '').split(',')[0].replace(/['"]/g, '').trim(),
    weights: [raw.heading?.weight || '700'],
    usedFor: 'heading',
    fallback: 'sans-serif',
  };
  const bodyFont: FontEntry = {
    family: raw.bodyFont || 'sans-serif',
    cleanFamily: (raw.bodyFont || '').split(',')[0].replace(/['"]/g, '').trim(),
    weights: ['400'],
    usedFor: 'body',
    fallback: 'sans-serif',
  };

  // Match font faces to fonts
  const fontFaces: FontFace[] = (raw.fontFaces || []).map((ff: any) => ff);
  for (const ff of fontFaces) {
    const famLower = ff.family.toLowerCase();
    if (headingFont.cleanFamily.toLowerCase() === famLower || famLower.includes(headingFont.cleanFamily.toLowerCase().split(' ')[0])) {
      headingFont.realUrl = headingFont.realUrl || ff.src;
    }
    if (bodyFont.cleanFamily.toLowerCase() === famLower || famLower.includes(bodyFont.cleanFamily.toLowerCase().split(' ')[0])) {
      bodyFont.realUrl = bodyFont.realUrl || ff.src;
    }
  }

  const result: ExtractedDesign = {
    url,
    title: raw.title || url,
    description: raw.description || '',
    scrapedAt: new Date().toISOString(),
    colors: {
      bg: raw.bodyBg || (isDark ? '#000000' : '#ffffff'),
      bgSecondary: palette[1]?.hex || raw.bodyBg,
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
      common: (raw.spacings || []).map((s: any) => ({
        value: s[0],
        count: s[1],
        role: s[0] >= 60 ? 'section' : s[0] >= 24 ? 'card' : 'element',
      })),
    },
    borderRadius: (raw.borderRadii || []).map((r: any) => ({
      value: r[0],
      count: r[1],
      role: r[0] >= 100 ? 'pill' : r[0] >= 16 ? 'card' : r[0] >= 6 ? 'button' : 'subtle',
    })),
    shadows: (raw.shadows || []).map((s: any) => {
      // Classify shadow depth by blur radius
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
    cssCustomProperties: (raw.cssCustomProps || []).map((cp: any) => ({
      name: cp.name,
      value: cp.value,
      category: cp.category as 'color' | 'spacing' | 'typography' | 'other',
    })),
    tags,
    mood,
    heroHeadline: raw.heading?.text,
    heroSubtitle: raw.subtitle,
    isJapanese: !!raw.isJapanese,
  };

  // Build typography details
  const typoDetails: TypographyDetail[] = (raw.typoDetails || []).map((td: any) => ({
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
