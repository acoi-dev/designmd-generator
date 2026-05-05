/**
 * extract.js — Raw DOM/CSSOM extractor, injected via chrome.scripting.executeScript
 *
 * Must be a standalone function (no closures over popup scope).
 * Ported from style-extractor/extract.ts EXTRACT_FN (133:592).
 *
 * Returns raw shape consumed by postprocess.js -> ExtractedDesign.
 */
function extractRaw() {
  function rgbToHex(rgb) {
    if (!rgb) return '';
    var m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return '';
    var toHex = function (x) { return parseInt(x).toString(16).padStart(2, '0'); };
    return '#' + toHex(m[1]) + toHex(m[2]) + toHex(m[3]);
  }
  function isGrey(hex) {
    if (!hex || hex.length !== 7) return true;
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return Math.max(r, g, b) - Math.min(r, g, b) < 25;
  }
  function isExtreme(hex) {
    return ['#ffffff', '#000000', '#fafafa', '#f5f5f5', '#f8f8f8', '#fefefe', '#f8f9fa', '#fafbfc'].indexOf(hex) >= 0;
  }
  function luminance(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  function px(s) {
    if (!s) return 0;
    return parseFloat(s) || 0;
  }

  var bodyStyle = getComputedStyle(document.body);
  var rawBodyBg = bodyStyle.backgroundColor;
  var bodyBg = '';
  if (rawBodyBg === 'rgba(0, 0, 0, 0)' || rawBodyBg === 'transparent') {
    var htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    if (htmlBg && htmlBg !== 'rgba(0, 0, 0, 0)' && htmlBg !== 'transparent') {
      bodyBg = rgbToHex(htmlBg);
    } else {
      bodyBg = '#ffffff';
    }
  } else {
    bodyBg = rgbToHex(rawBodyBg);
  }
  var bodyText = rgbToHex(bodyStyle.color);
  var bodyFontFamily = bodyStyle.fontFamily;

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
  // v1.2.0 additions
  var fontFeatureCounts = {};
  var iconFontCounts = {};
  var gradientCounts = {};
  var ICON_FONT_PATTERNS = ['material symbols', 'material icons', 'fontawesome', 'font awesome', 'phosphor', 'remixicon', 'ionicons', 'feather', 'bootstrap-icons', 'google symbols'];

  for (var i = 0; i < maxScan; i++) {
    var el = allEls[i];
    var cs = getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var area = rect.width * rect.height;

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

    var fg = rgbToHex(cs.color);
    if (fg && fg.indexOf('#') === 0) {
      if (!isGrey(fg) && !isExtreme(fg)) {
        colorAreas[fg] = (colorAreas[fg] || 0) + 50;
        if (!colorRoles[fg]) colorRoles[fg] = [];
        colorRoles[fg].push('text-accent');
      }
    }

    var f = cs.fontFamily;
    if (f) {
      fontCounts[f] = (fontCounts[f] || 0) + 1;
      // v1.2.0: detect icon fonts
      var fLower = f.toLowerCase();
      for (var ifp = 0; ifp < ICON_FONT_PATTERNS.length; ifp++) {
        if (fLower.indexOf(ICON_FONT_PATTERNS[ifp]) >= 0) {
          iconFontCounts[f] = (iconFontCounts[f] || 0) + 1;
          break;
        }
      }
    }
    var w = cs.fontWeight;
    if (w) weightCounts[w] = (weightCounts[w] || 0) + 1;
    var sz = px(cs.fontSize);
    if (sz > 0) sizeCounts[sz] = (sizeCounts[sz] || 0) + 1;

    // v1.2.0: font-feature-settings (tabular-nums / ligatures / stylistic sets)
    var ff = cs.fontFeatureSettings;
    if (ff && ff !== 'normal') fontFeatureCounts[ff] = (fontFeatureCounts[ff] || 0) + 1;

    var p = px(cs.paddingTop);
    if (p > 0 && p < 200) paddingCounts[p] = (paddingCounts[p] || 0) + 1;
    var m = px(cs.marginTop);
    if (m > 0 && m < 200) marginCounts[m] = (marginCounts[m] || 0) + 1;

    var br = px(cs.borderRadius);
    if (br > 0 && br < 200) radiusCounts[br] = (radiusCounts[br] || 0) + 1;

    var sh = cs.boxShadow;
    if (sh && sh !== 'none') shadowCounts[sh] = (shadowCounts[sh] || 0) + 1;

    // v1.2.0: gradients from background-image
    var bgi = cs.backgroundImage;
    if (bgi && bgi !== 'none' && /gradient/.test(bgi)) {
      gradientCounts[bgi] = (gradientCounts[bgi] || 0) + 1;
    }
  }

  var palette = Object.keys(colorAreas).map(function (k) {
    return {
      hex: k,
      area: colorAreas[k],
      roles: colorRoles[k] || [],
      contrast: luminance(k) < 0.5 ? 'light' : 'dark'
    };
  });
  palette.sort(function (a, b) { return b.area - a.area; });
  palette = palette.slice(0, 14);

  function chroma(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max - min;
  }
  function lum(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  var candidates = palette
    .filter(function (c) {
      if (isExtreme(c.hex) || c.hex === bodyBg || isGrey(c.hex)) return false;
      var l = lum(c.hex);
      var ch = chroma(c.hex);
      return l > 0.18 && l < 0.85 && ch > 0.30;
    })
    .map(function (c) {
      return { hex: c.hex, score: chroma(c.hex) * Math.log(c.area + 10), area: c.area };
    });
  candidates.sort(function (a, b) { return b.score - a.score; });
  var primary = candidates[0] ? candidates[0].hex : '';
  if (!primary) {
    var fb = palette
      .filter(function (c) { return !isExtreme(c.hex) && c.hex !== bodyBg && !isGrey(c.hex); })
      .map(function (c) { return { hex: c.hex, score: chroma(c.hex) }; });
    fb.sort(function (a, b) { return b.score - a.score; });
    primary = fb[0] ? fb[0].hex : '';
  }
  var secondary = '';
  for (var si = 0; si < candidates.length; si++) {
    if (candidates[si].hex !== primary) {
      secondary = candidates[si].hex;
      break;
    }
  }

  var border = '';
  for (var bi = 0; bi < palette.length; bi++) {
    var c = palette[bi];
    if (isGrey(c.hex) && c.hex !== bodyBg && c.hex !== '#000000' && c.hex !== '#ffffff') {
      border = c.hex;
      break;
    }
  }

  var fontEntries = Object.keys(fontCounts).map(function (k) { return [k, fontCounts[k]]; });
  fontEntries.sort(function (a, b) { return b[1] - a[1]; });
  var topFonts = fontEntries.slice(0, 8);

  var sizes = Object.keys(sizeCounts).map(function (k) { return parseFloat(k); });
  sizes.sort(function (a, b) { return b - a; });
  var topSizes = sizes.slice(0, 12);

  var spacings = Object.keys(paddingCounts).map(function (k) { return [parseFloat(k), paddingCounts[k]]; });
  spacings.sort(function (a, b) { return b[1] - a[1]; });
  var topSpacings = spacings.slice(0, 8);

  var radii = Object.keys(radiusCounts).map(function (k) { return [parseFloat(k), radiusCounts[k]]; });
  radii.sort(function (a, b) { return b[1] - a[1]; });
  var topRadii = radii.slice(0, 6);

  // v1.2.0: margins
  var marginsArr = Object.keys(marginCounts).map(function (k) { return [parseFloat(k), marginCounts[k]]; });
  marginsArr.sort(function (a, b) { return b[1] - a[1]; });
  var topMargins = marginsArr.slice(0, 8);

  // v1.2.0: detect 4px / 8px spacing scale base
  function detectSpacingBase(arrs) {
    var seen = {};
    for (var sa = 0; sa < arrs.length; sa++) {
      for (var sb = 0; sb < arrs[sa].length; sb++) {
        var n = arrs[sa][sb][0];
        if (n > 0 && n <= 96 && !(n in seen)) seen[n] = 1;
      }
    }
    var keys = Object.keys(seen).map(parseFloat);
    if (!keys.length) return null;
    var div8 = 0, div4 = 0;
    for (var k = 0; k < keys.length; k++) {
      if (keys[k] % 8 === 0) div8++;
      if (keys[k] % 4 === 0) div4++;
    }
    var ratio8 = div8 / keys.length;
    var ratio4 = div4 / keys.length;
    keys.sort(function (a, b) { return a - b; });
    return {
      base: ratio8 > 0.6 ? 8 : ratio4 > 0.6 ? 4 : null,
      ratio8: Math.round(ratio8 * 100),
      ratio4: Math.round(ratio4 * 100),
      sample: keys.slice(0, 12)
    };
  }
  var spacingScale = detectSpacingBase([topSpacings, topMargins]);

  // v1.2.0: font-feature-settings
  var fontFeatures = Object.keys(fontFeatureCounts).map(function (k) { return { value: k, count: fontFeatureCounts[k] }; });
  fontFeatures.sort(function (a, b) { return b.count - a.count; });
  fontFeatures = fontFeatures.slice(0, 5);

  // v1.2.0: icon fonts
  var iconFonts = Object.keys(iconFontCounts).map(function (k) { return { value: k, count: iconFontCounts[k] }; });
  iconFonts.sort(function (a, b) { return b.count - a.count; });
  iconFonts = iconFonts.slice(0, 3);

  // v1.2.0: gradients
  var gradients = Object.keys(gradientCounts).map(function (k) { return { value: k, count: gradientCounts[k] }; });
  gradients.sort(function (a, b) { return b.count - a.count; });
  gradients = gradients.slice(0, 5);

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

  var shadowList = [];
  var shadowEntries = Object.keys(shadowCounts).map(function (k) { return { value: k, count: shadowCounts[k] }; });
  shadowEntries.sort(function (a, b) { return b.count - a.count; });
  shadowList = shadowEntries.slice(0, 8);

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
    var variant = 'filled';
    if (isTransparent && bBorder) variant = 'outline';
    else if (isTransparent && !bBorder) variant = 'ghost';
    if (bRadius >= 100) variant = 'pill';
    var rectB = btns[bni].getBoundingClientRect();
    if (rectB.width < 30 || rectB.height < 20) continue;
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
    if (sample.bg === 'transparent' && !bBorder && !bColor) continue;
    allButtons.push(sample);
    if (!btnSample && sample.bg !== 'transparent') btnSample = sample;
    else if (!btnSample2 && sample.bg !== 'transparent' && sample.bg !== (btnSample && btnSample.bg)) btnSample2 = sample;
    if (allButtons.length >= 6) break;
  }

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
            var urlMatch = srcStr.match(/url\(([^)]+\.woff2?)[^)]*\)/);
            if (urlMatch && family) {
              var url = urlMatch[1].replace(/['"]/g, '');
              try { url = new URL(url, sheet.href || location.href).href; } catch (e) { }
              if (!seenSrc[url]) {
                seenSrc[url] = true;
                fontFaces.push({ family: family, weight: weight, style: style, src: url });
              }
            }
          }
        }
      } catch (e) { }
    }
  } catch (e) { }

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
          if (vrule.type === 1 && /^(:root|html)$/i.test((vrule.selectorText || '').trim())) {
            var vstyle = vrule.style;
            for (var vp = 0; vp < vstyle.length; vp++) {
              var propName = vstyle[vp];
              if (propName.indexOf('--') === 0 && !seenVarNames[propName]) {
                seenVarNames[propName] = true;
                var propValue = vstyle.getPropertyValue(propName).trim();
                if (propValue) {
                  var cat = 'other';
                  var valLower = propValue.toLowerCase();
                  if (/#[0-9a-f]{3,8}\b/.test(valLower) || valLower.indexOf('rgb') >= 0 || valLower.indexOf('hsl') >= 0 || valLower.indexOf('oklch') >= 0 || valLower.indexOf('color(') >= 0) {
                    cat = 'color';
                  } else if (/^-?[\d.]+\s*(px|rem|em|vh|vw|%)$/.test(valLower) || /^-?[\d.]+$/.test(valLower)) {
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
      } catch (e) { }
    }
  } catch (e) { }

  var htmlLang = document.documentElement.lang || '';
  var metaCL = document.querySelector('meta[http-equiv="content-language"]');
  var isJapanese = htmlLang.startsWith('ja') ||
    (metaCL && metaCL.content === 'ja') ||
    bodyFontFamily.indexOf('Noto Sans JP') >= 0 ||
    bodyFontFamily.indexOf('游ゴシック') >= 0 ||
    bodyFontFamily.indexOf('Yu Gothic') >= 0 ||
    bodyFontFamily.indexOf('Hiragino') >= 0 ||
    bodyFontFamily.indexOf('ヒラギノ') >= 0 ||
    bodyFontFamily.indexOf('Meiryo') >= 0 ||
    bodyFontFamily.indexOf('メイリオ') >= 0;

  var ogSite = (document.querySelector('meta[property="og:site_name"]') || {}).content || '';
  var rawTitle = document.title || '';
  var cleanTitle = rawTitle;
  var seps = ['|', '—', '–', ' - ', ': '];
  for (var tj = 0; tj < seps.length; tj++) {
    var idx = cleanTitle.indexOf(seps[tj]);
    if (idx > 0) cleanTitle = cleanTitle.slice(0, idx).trim();
  }
  var titleCandidates = [ogSite, cleanTitle, rawTitle].filter(function (t) { return t && t.length > 1; });
  titleCandidates.sort(function (a, b) { return a.length - b.length; });
  var title = titleCandidates[0] || '';
  if (title.length > 40) title = title.slice(0, 38) + '…';
  var description = (document.querySelector('meta[name="description"]') || {}).content || '';

  return {
    url: location.href,
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
    cssCustomProps: cssCustomProps,
    // v1.2.0
    margins: topMargins,
    spacingScale: spacingScale,
    fontFeatures: fontFeatures,
    iconFonts: iconFonts,
    gradients: gradients
  };
}
