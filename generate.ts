/**
 * Generate output formats from ExtractedDesign
 * - DESIGN.md (9-section format matching getdesign.md quality)
 * - tailwind.config.js
 * - CSS variables
 * - design-tokens.json
 */
import { ExtractedDesign } from './extract';

// ─── Helpers ─────────────────────────────────────────────────────
function rgbFromHex(hex: string): [number, number, number] {
  if (!hex || hex.length !== 7) return [0, 0, 0];
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function colorRoleName(idx: number): string {
  return ['primary', 'secondary', 'tertiary', 'accent-1', 'accent-2', 'accent-3', 'muted-1', 'muted-2'][idx] || `color-${idx + 1}`;
}

function shortHex(hex: string): string {
  return hex.toUpperCase();
}

function brandSlug(d: ExtractedDesign): string {
  try {
    const h = new URL(d.url).hostname.replace('www.', '').replace(/\./g, '-');
    return h;
  } catch {
    return 'design';
  }
}

function chroma(hex: string): number {
  if (!hex || hex.length !== 7) return 0;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function luminance(hex: string): number {
  if (!hex || hex.length !== 7) return 0.5;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// ─── DESIGN.md Generator (9-section format) ────────────────────
export function generateDesignMd(d: ExtractedDesign, mode: 'compact' | 'extended' = 'extended'): string {
  const headFamily = d.typography.headingFont.cleanFamily || 'Inter';
  const bodyFamily = d.typography.bodyFont.cleanFamily || 'Inter';
  const isDark = d.tags.includes('dark');
  const isRounded = d.tags.includes('rounded');
  const isSharp = d.tags.includes('sharp');
  const baseRadius = d.borderRadius[0]?.value || 0;
  const btn = d.components.primaryButton;
  const btn2 = d.components.secondaryButton;
  const card = d.components.card;
  const isJP = d.isJapanese;

  const lines: string[] = [];
  lines.push(`# Design System Inspired by ${d.title}`);
  lines.push('');
  lines.push(`> Auto-extracted from \`${d.url}\` on ${new Date(d.scrapedAt).toISOString().slice(0, 10)}`);
  lines.push('');

  // ── Section 1: Visual Theme & Atmosphere ──
  lines.push('## 1. Visual Theme & Atmosphere');
  lines.push('');
  lines.push(d.mood);
  lines.push('');
  if (d.heroHeadline) {
    lines.push(`The hero section leads with "${d.heroHeadline.slice(0, 100)}"${d.heroSubtitle ? ` followed by "${d.heroSubtitle.slice(0, 100)}"` : ''}.`);
    lines.push('');
  }
  lines.push('**Key Characteristics:**');
  lines.push(`- ${headFamily} as the heading font${d.typography.headingFont.realUrl ? ' (custom web font loaded via @font-face)' : ''}`);
  lines.push(`- ${bodyFamily} as the body font for all running text`);
  const headDetail = d.typography.details.find(t => t.role === 'H1');
  if (headDetail) {
    lines.push(`- Heading weight ${headDetail.weight}${headDetail.letterSpacing && headDetail.letterSpacing !== 'normal' ? `, letter-spacing ${headDetail.letterSpacing}` : ''}`);
  }
  lines.push(`- ${isDark ? 'Dark background (' + d.colors.bg + ')' : 'Light/white background (' + d.colors.bg + ')'} as the primary canvas`);
  lines.push(`- Primary accent \`${d.colors.primary}\` used for CTAs and brand highlights`);
  if (d.shadows.length > 0) {
    lines.push(`- ${d.shadows.length} shadow level(s) detected — ${d.shadows[0].value.includes('rgba') ? 'tinted shadows' : 'standard shadows'}`);
  }
  lines.push(`- ${isRounded ? 'Rounded corners (' + baseRadius + 'px+) creating a friendly, approachable feel' : isSharp ? 'Sharp corners (0-2px) for a precise, technical aesthetic' : 'Moderate border-radius (' + baseRadius + 'px) — balanced and professional'}`);
  lines.push(`- Tags: ${d.tags.join(', ')}`);
  lines.push('');

  // ── Section 2: Color Palette & Roles ──
  lines.push('## 2. Color Palette & Roles');
  lines.push('');
  lines.push('### Primary');
  lines.push(`- **Primary Accent** (\`${d.colors.primary}\`) · \`--color-primary\`: Brand color, CTA backgrounds, link text, interactive highlights.`);
  if (d.colors.secondary && d.colors.secondary !== d.colors.primary) {
    lines.push(`- **Secondary Accent** (\`${d.colors.secondary}\`) · \`--color-secondary\`: Secondary brand, hover states, complementary highlights.`);
  }
  lines.push(`- **Background** (\`${d.colors.bg}\`) · \`--color-bg\`: Page background, primary canvas.`);
  if (d.colors.bgSecondary !== d.colors.bg) {
    lines.push(`- **Background Secondary** (\`${d.colors.bgSecondary}\`) · \`--color-bg-secondary\`: Cards, surfaces, alternating sections.`);
  }
  lines.push('');
  lines.push('### Text');
  lines.push(`- **Text Primary** (\`${d.colors.text}\`) · \`--color-text\`: Headings and body text.`);
  lines.push(`- **Text Secondary** (\`${d.colors.textSecondary}\`) · \`--color-text-secondary\`: Muted text, captions, placeholders.`);
  lines.push('');
  lines.push('### Borders & Surfaces');
  lines.push(`- **Border** (\`${d.colors.border}\`) · \`--color-border\`: Dividers, outlines, input borders.`);
  lines.push('');

  if (mode === 'extended' && d.colors.palette.length > 0) {
    lines.push('### Full Extracted Palette');
    lines.push('');
    lines.push('| # | Hex | CSS Variable | Role | Area | Contrast |');
    lines.push('|---|---|---|---|---|---|');
    d.colors.palette.slice(0, 14).forEach((c, i) => {
      const varName = `--palette-${i + 1}`;
      lines.push(`| ${i + 1} | \`${c.hex}\` | \`${varName}\` | ${c.role} | ${c.area > 100000 ? 'large' : c.area > 10000 ? 'medium' : 'small'} | text-${c.contrast} |`);
    });
    lines.push('');
  }

  // ── Section 3: Typography Rules ──
  lines.push('## 3. Typography Rules');
  lines.push('');
  lines.push(`- **Heading Font:** \`${headFamily}\`${d.typography.headingFont.realUrl ? ' (web font)' : ', sans-serif'}`);
  lines.push(`- **Body Font:** \`${bodyFamily}\`${d.typography.bodyFont.realUrl ? ' (web font)' : ', sans-serif'}`);
  if (d.typography.monoFont) {
    lines.push(`- **Mono Font:** \`${d.typography.monoFont.cleanFamily}\``);
  }
  lines.push('');

  if (d.typography.details.length > 0) {
    lines.push('### Type Hierarchy');
    lines.push('');
    lines.push('| Role | Font | Size | Weight | Line Height | Letter Spacing |');
    lines.push('|---|---|---|---|---|---|');
    d.typography.details.forEach(td => {
      lines.push(`| ${td.role} | ${td.font} | ${td.size}px | ${td.weight} | ${td.lineHeight} | ${td.letterSpacing} |`);
    });
    lines.push('');
  }

  if (mode === 'extended' && d.typography.fontSizes.length > 0) {
    lines.push('### Type Scale');
    lines.push('');
    const labels = ['Display', 'H1', 'H2', 'H3', 'H4', 'Body L', 'Body', 'Small', 'XS', 'Caption'];
    lines.push('| Token | Size | Suggested Usage |');
    lines.push('|---|---|---|');
    d.typography.fontSizes.slice(0, 10).forEach((s, i) => {
      lines.push(`| ${labels[i] || `Size ${i + 1}`} | \`${s}px\` | ${i < 5 ? 'headings' : 'body / supporting text'} |`);
    });
    lines.push('');
  }

  // Japanese typography recommendations
  if (isJP) {
    lines.push('### Japanese Typography (CJK)');
    lines.push('');
    lines.push('This site uses Japanese (CJK) text. Apply the following rules:');
    lines.push('');
    lines.push('- **Line height:** Use `1.7`–`2.0` for body text (CJK needs more vertical space than Latin)');
    lines.push('- **Letter spacing:** Use `0.04em`–`0.08em` for body text (improves Japanese readability)');
    lines.push(`- **Font fallback:** Always include a Japanese font fallback: \`${headFamily}, "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif\``);
    lines.push('- **Word break:** Use `word-break: normal` and `overflow-wrap: anywhere` — never `break-all` for Japanese');
    lines.push('- **Kinsoku (禁則処理):** Avoid line breaks before closing brackets 」）】 or after opening brackets 「（【');
    lines.push('- **Heading line-height:** `1.3`–`1.5` (tighter than body, but looser than Latin headings)');
    lines.push('- **Minimum body font size:** `14px` (Japanese characters are complex, smaller is hard to read)');
    lines.push('');
  }

  // ── Section 4: Component Stylings ──
  lines.push('## 4. Component Stylings');
  lines.push('');

  // Use allButtons if available, fall back to primary/secondary
  const allBtns = d.components.buttons && d.components.buttons.length > 0 ? d.components.buttons : [];
  const variantNames: Record<string, string> = { filled: 'Filled', outline: 'Outline', ghost: 'Ghost', pill: 'Pill', icon: 'Icon', link: 'Link' };

  if (allBtns.length > 0) {
    const usedLabels: Record<string, number> = {};
    allBtns.forEach((b: any, i: number) => {
      const vName = variantNames[b.variant] || 'Filled';
      let label: string;
      let cls: string;
      if (i === 0) {
        label = 'Primary Button';
        cls = 'btn-primary';
      } else {
        usedLabels[vName] = (usedLabels[vName] || 0) + 1;
        label = usedLabels[vName] > 1 ? `${vName} Button ${usedLabels[vName]}` : `${vName} Button`;
        cls = usedLabels[vName] > 1 ? `btn-${(b.variant || 'alt').toLowerCase()}-${usedLabels[vName]}` : `btn-${(b.variant || 'secondary').toLowerCase()}`;
      }
      lines.push(`### ${label}`);
      lines.push('');
      lines.push('```css');
      lines.push(`.${cls} {`);
      lines.push(`  background: ${b.bg};`);
      lines.push(`  color: ${b.color};`);
      lines.push(`  border-radius: ${b.borderRadius}px;`);
      lines.push(`  padding: ${b.paddingV}px ${b.paddingH}px;`);
      lines.push(`  font-size: ${b.fontSize}px;`);
      lines.push(`  font-weight: ${b.fontWeight};`);
      if (b.border) {
        lines.push(`  border: ${b.border};`);
      } else {
        lines.push('  border: none;');
      }
      lines.push('  cursor: pointer;');
      lines.push('}');
      lines.push('```');
      lines.push('');
    });
  } else {
    // Fallback to old primary/secondary
    if (btn) {
      lines.push('### Primary Button');
      lines.push('');
      lines.push('```css');
      lines.push('.btn-primary {');
      lines.push(`  background: ${btn.bg};`);
      lines.push(`  color: ${btn.color};`);
      lines.push(`  border-radius: ${btn.borderRadius}px;`);
      lines.push(`  padding: ${btn.paddingV}px ${btn.paddingH}px;`);
      lines.push(`  font-size: ${btn.fontSize}px;`);
      lines.push(`  font-weight: ${btn.fontWeight};`);
      lines.push('  border: none;');
      lines.push('  cursor: pointer;');
      lines.push('}');
      lines.push('```');
      lines.push('');
    }
    if (btn2) {
      lines.push('### Secondary Button');
      lines.push('');
      lines.push('```css');
      lines.push('.btn-secondary {');
      lines.push(`  background: ${btn2.bg};`);
      lines.push(`  color: ${btn2.color};`);
      lines.push(`  border-radius: ${btn2.borderRadius}px;`);
      lines.push(`  padding: ${btn2.paddingV}px ${btn2.paddingH}px;`);
      lines.push(`  font-size: ${btn2.fontSize}px;`);
      lines.push(`  font-weight: ${btn2.fontWeight};`);
      lines.push('  border: none;');
      lines.push('  cursor: pointer;');
      lines.push('}');
      lines.push('```');
      lines.push('');
    }
  }

  if (card) {
    lines.push('### Card');
    lines.push('');
    lines.push('```css');
    lines.push('.card {');
    lines.push(`  background: ${card.bg};`);
    lines.push(`  border-radius: ${card.borderRadius}px;`);
    lines.push(`  padding: ${card.padding}px;`);
    if (card.shadow && card.shadow !== 'none') {
      lines.push(`  box-shadow: ${card.shadow};`);
    }
    lines.push('}');
    lines.push('```');
    lines.push('');
  }

  if (!btn && !card && allBtns.length === 0) {
    lines.push('No prominent button or card components detected. Use the color palette and typography rules above to create components consistent with the brand.');
    lines.push('');
  }

  // ── Section 5: Layout Principles ──
  lines.push('## 5. Layout Principles');
  lines.push('');
  lines.push(`- **Base spacing unit:** \`${d.spacing.base}px\` — use multiples (${d.spacing.base * 2}px, ${d.spacing.base * 3}px, ${d.spacing.base * 4}px, etc.)`);
  lines.push('');
  if (mode === 'extended' && d.spacing.common.length > 0) {
    lines.push('### Spacing Scale (extracted from real elements)');
    lines.push('');
    lines.push('| Token | Value | Role |');
    lines.push('|---|---|---|');
    d.spacing.common.slice(0, 8).forEach((s, i) => {
      lines.push(`| spacing-${i + 1} | \`${s.value}px\` | ${s.role} |`);
    });
    lines.push('');
  }
  lines.push('### Border Radius Scale');
  lines.push('');
  lines.push('| Token | Value | Element |');
  lines.push('|---|---|---|');
  d.borderRadius.slice(0, 6).forEach(r => {
    lines.push(`| radius-${r.role} | \`${r.value}px\` | ${r.role} |`);
  });
  lines.push('');

  // ── Section 6: Depth & Elevation ──
  lines.push('## 6. Depth & Elevation');
  lines.push('');
  if (d.shadows.length > 0) {
    lines.push('| Level | Shadow | Usage |');
    lines.push('|---|---|---|');
    d.shadows.slice(0, 5).forEach((s, i) => {
      const usage = s.level === 'low' ? 'Cards, subtle elevation' : s.level === 'mid' ? 'Dropdowns, popovers' : s.level === 'high' ? 'Modals, floating elements' : 'Hero sections, deep layers';
      lines.push(`| ${s.level.charAt(0).toUpperCase() + s.level.slice(1)} | \`${s.value.slice(0, 80)}${s.value.length > 80 ? '...' : ''}\` | ${usage} |`);
    });
    lines.push('');
    const hasTinted = d.shadows.some(s => s.value.includes('rgba') && !s.value.match(/rgba\((0,\s*0,\s*0|255,\s*255,\s*255)/));
    if (hasTinted) {
      lines.push('> **Note:** This site uses chromatic (color-tinted) shadows rather than pure black — this is a deliberate brand choice that adds warmth to elevation.');
    }
  } else {
    lines.push('No prominent box-shadows detected. This design likely uses flat surfaces with borders or background color changes for depth.');
  }
  lines.push('');

  // ── Section 7: Do's and Don'ts ──
  lines.push("## 7. Do's and Don'ts");
  lines.push('');
  lines.push('### ✅ Do');
  const dos: string[] = [];
  dos.push(`Use \`${d.colors.bg}\` as the primary background color`);
  dos.push(`Use \`${headFamily}\` for all headings and \`${bodyFamily}\` for body text`);
  dos.push(`Use \`${d.colors.primary}\` as the single dominant accent/CTA color`);
  dos.push(`Maintain \`${d.spacing.base}px\` as the base spacing unit — all gaps should be multiples`);
  if (isDark) dos.push('Keep the overall feel dark — use dark surfaces throughout');
  if (isRounded) dos.push(`Use rounded corners (\`${baseRadius}px\`+) consistently for all interactive elements`);
  if (isSharp) dos.push('Keep corners sharp (0-2px radius) for a precise, technical feel');
  if (d.tags.includes('serif')) dos.push('Use serif fonts for headlines to maintain editorial authority');
  if (d.tags.includes('bold-typography')) dos.push('Make headlines large and bold — typography is the hero element');
  if (d.tags.includes('monochrome')) dos.push(`Stick to grayscale + \`${d.colors.primary}\` accent — avoid color overload`);
  if (d.tags.includes('colorful')) dos.push('Embrace bold color combinations — playful energy is the point');
  if (d.shadows.length > 0) dos.push('Apply the shadow system for elevation — use the extracted shadow values');
  if (headDetail && headDetail.weight) dos.push(`Use weight ${headDetail.weight} for headings to match the brand's typographic voice`);
  if (isJP) {
    dos.push('Use `line-height: 1.7-2.0` for Japanese body text');
    dos.push('Include Japanese font fallback (Noto Sans JP, Hiragino, Yu Gothic)');
  }
  dos.forEach(line => lines.push(`- ${line}`));
  lines.push('');
  lines.push("### ❌ Don't");
  const donts: string[] = [];
  donts.push(`Don't use colors outside the extracted palette without justification`);
  donts.push(`Don't substitute ${headFamily}/${bodyFamily} with generic alternatives`);
  donts.push(`Don't use irregular spacing — stick to ${d.spacing.base}px grid`);
  if (isDark) donts.push("Don't introduce bright white surfaces — they break the dark palette");
  else donts.push("Don't use dark/black backgrounds — this is a light-themed design");
  if (isRounded) donts.push("Don't use sharp corners — they feel hostile in this rounded design language");
  if (isSharp) donts.push("Don't use large border-radius — keep everything crisp and geometric");
  if (d.tags.includes('monochrome')) donts.push("Don't add additional saturated colors beyond the primary accent");
  if (d.tags.includes('serif')) donts.push("Don't mix in geometric sans-serif headlines — it breaks the editorial tone");
  if (d.tags.includes('compact')) donts.push("Don't use oversized hero text — this brand uses restrained type");
  donts.push(`Don't use pure black (#000000) for text — use \`${d.colors.text}\` instead`);
  donts.push("Don't add decorative elements not present in the original design");
  if (isJP) {
    donts.push("Don't use `word-break: break-all` for Japanese text — it breaks in the middle of words");
    donts.push("Don't set body font size below 14px for Japanese — characters are too complex");
    donts.push("Don't use Latin-optimized line-height (1.2-1.4) for Japanese body text");
  }
  donts.forEach(line => lines.push(`- ${line}`));
  lines.push('');

  // ── Section 8: Responsive Behavior ──
  if (mode === 'extended') {
    lines.push('## 8. Responsive Behavior');
    lines.push('');
    lines.push('| Breakpoint | Width | Notes |');
    lines.push('|---|---|---|');
    lines.push('| Mobile | < 640px | Single column, stack sections, reduce font sizes ~80% |');
    lines.push('| Tablet | 640–1024px | 2-column where appropriate, maintain spacing ratios |');
    lines.push('| Desktop | 1024–1440px | Full layout as designed |');
    lines.push('| Wide | > 1440px | Max-width container, center content |');
    lines.push('');
    lines.push('- Touch targets: minimum 44×44px on mobile');
    lines.push(`- Maintain ${d.spacing.base}px base unit across breakpoints — only scale multipliers`);
    lines.push('');
  }

  // ── Section 9: Agent Prompt Guide ──
  lines.push('## 9. Agent Prompt Guide');
  lines.push('');
  lines.push('### Quick Color Reference');
  lines.push('');
  lines.push('```');
  lines.push(`Background:  ${d.colors.bg}`);
  lines.push(`Text:        ${d.colors.text}`);
  lines.push(`Accent:      ${d.colors.primary}`);
  if (d.colors.secondary !== d.colors.primary) {
    lines.push(`Secondary:   ${d.colors.secondary}`);
  }
  lines.push(`Border:      ${d.colors.border}`);
  lines.push('```');
  lines.push('');
  lines.push('### Example Prompts');
  lines.push('');
  lines.push(`1. "Build a hero section with a \`${d.colors.bg}\` background, \`${headFamily}\` heading in \`${d.colors.text}\`, and a \`${d.colors.primary}\` CTA button${btn ? ` with ${btn.borderRadius}px radius` : ''}."`)
  lines.push(`2. "Create a pricing card using background \`${d.colors.bgSecondary}\`, border \`${d.colors.border}\`, \`${bodyFamily}\` for text, and ${d.spacing.base * 3}px padding."`);
  lines.push(`3. "Design a navigation bar — \`${d.colors.bg}\` background, \`${d.colors.text}\` links, \`${d.colors.primary}\` for active state."`);
  lines.push(`4. "Build a feature grid with 3 columns, ${d.spacing.base * 3}px gap, each card using the card component style."`);
  lines.push(`5. "Create a footer with \`${isDark ? d.colors.bgSecondary : d.colors.text}\` background, \`${isDark ? d.colors.text : d.colors.bg}\` text, and ${d.spacing.base * 2}px padding."`);
  lines.push('');
  lines.push('### Iteration Guide');
  lines.push('');
  lines.push('1. Start with layout structure (sections, grid, spacing)');
  lines.push('2. Apply colors from the palette — background first, then text, then accents');
  lines.push('3. Set typography — font families, sizes from the type scale, weights');
  lines.push('4. Add components — buttons, cards, inputs using the specs above');
  lines.push('5. Apply border-radius consistently across all elements');
  if (d.shadows.length > 0) {
    lines.push('6. Add shadows for depth — use the extracted shadow values, not defaults');
  }
  lines.push(`${d.shadows.length > 0 ? '7' : '6'}. Check responsive behavior — test mobile and tablet layouts`);
  lines.push(`${d.shadows.length > 0 ? '8' : '7'}. Final pass — verify all colors match, spacing is consistent, fonts are correct`);
  lines.push('');

  // ── Section 10: CSS Custom Properties ──
  const cssProps = (d.cssCustomProperties || []);
  if (cssProps.length > 0) {
    lines.push('## 10. CSS Custom Properties');
    lines.push('');
    lines.push(`> ${cssProps.length} custom properties extracted from \`:root\` / \`html\` stylesheets.`);
    lines.push('');

    const colorProps = cssProps.filter(p => p.category === 'color');
    const spacingProps = cssProps.filter(p => p.category === 'spacing');
    const typoProps = cssProps.filter(p => p.category === 'typography');
    const otherProps = cssProps.filter(p => p.category === 'other');

    if (colorProps.length > 0) {
      lines.push('### Color Variables');
      lines.push('');
      lines.push('| Variable | Value |');
      lines.push('|---|---|');
      colorProps.slice(0, 30).forEach(p => {
        lines.push(`| \`${p.name}\` | \`${p.value}\` |`);
      });
      if (colorProps.length > 30) lines.push(`| ... | *(${colorProps.length - 30} more)* |`);
      lines.push('');
    }

    if (spacingProps.length > 0) {
      lines.push('### Spacing Variables');
      lines.push('');
      lines.push('| Variable | Value |');
      lines.push('|---|---|');
      spacingProps.slice(0, 20).forEach(p => {
        lines.push(`| \`${p.name}\` | \`${p.value}\` |`);
      });
      if (spacingProps.length > 20) lines.push(`| ... | *(${spacingProps.length - 20} more)* |`);
      lines.push('');
    }

    if (typoProps.length > 0) {
      lines.push('### Typography Variables');
      lines.push('');
      lines.push('| Variable | Value |');
      lines.push('|---|---|');
      typoProps.slice(0, 20).forEach(p => {
        lines.push(`| \`${p.name}\` | \`${p.value}\` |`);
      });
      if (typoProps.length > 20) lines.push(`| ... | *(${typoProps.length - 20} more)* |`);
      lines.push('');
    }

    if (mode === 'extended' && otherProps.length > 0) {
      lines.push('### Other Variables');
      lines.push('');
      lines.push('| Variable | Value |');
      lines.push('|---|---|');
      otherProps.slice(0, 15).forEach(p => {
        lines.push(`| \`${p.name}\` | \`${p.value}\` |`);
      });
      if (otherProps.length > 15) lines.push(`| ... | *(${otherProps.length - 15} more)* |`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Tailwind config generator ─────────────────────────────────
export function generateTailwindConfig(d: ExtractedDesign): string {
  const headingFamily = d.typography.headingFont.cleanFamily || 'Inter';
  const bodyFamily = d.typography.bodyFont.cleanFamily || 'Inter';
  return `/** @type {import('tailwindcss').Config} */
// Auto-generated from ${d.url}
module.exports = {
  content: ['./src/**/*.{html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '${d.colors.bg}',
        'bg-secondary': '${d.colors.bgSecondary}',
        text: '${d.colors.text}',
        'text-secondary': '${d.colors.textSecondary}',
        primary: '${d.colors.primary}',
        secondary: '${d.colors.secondary}',
        border: '${d.colors.border}',
${d.colors.palette.slice(0, 6).map((c, i) => `        '${colorRoleName(i)}': '${c.hex}',`).join('\n')}
      },
      fontFamily: {
        heading: ['${headingFamily}', 'sans-serif'],
        body: ['${bodyFamily}', 'sans-serif'],
      },
      borderRadius: {
${d.borderRadius.slice(0, 4).map(r => `        '${r.role}': '${r.value}px',`).join('\n')}
      },
      spacing: {
${d.spacing.common.slice(0, 6).map((s, i) => `        '${i + 1}': '${s.value}px',`).join('\n')}
      },
    },
  },
  plugins: [],
};
`;
}

// ─── CSS variables generator ───────────────────────────────────
export function generateCssVars(d: ExtractedDesign): string {
  const lines: string[] = [];
  lines.push(`/* Auto-generated from ${d.url} */`);
  lines.push(`:root {`);
  lines.push(`  /* Colors */`);
  lines.push(`  --color-bg: ${d.colors.bg};`);
  lines.push(`  --color-bg-secondary: ${d.colors.bgSecondary};`);
  lines.push(`  --color-text: ${d.colors.text};`);
  lines.push(`  --color-text-secondary: ${d.colors.textSecondary};`);
  lines.push(`  --color-primary: ${d.colors.primary};`);
  lines.push(`  --color-secondary: ${d.colors.secondary};`);
  lines.push(`  --color-border: ${d.colors.border};`);
  d.colors.palette.slice(0, 6).forEach((c, i) => {
    lines.push(`  --color-${colorRoleName(i)}: ${c.hex};`);
  });
  lines.push('');
  lines.push(`  /* Typography */`);
  lines.push(`  --font-heading: '${d.typography.headingFont.cleanFamily}', sans-serif;`);
  lines.push(`  --font-body: '${d.typography.bodyFont.cleanFamily}', sans-serif;`);
  d.typography.fontSizes.slice(0, 6).forEach((s, i) => {
    const labels = ['display', 'h1', 'h2', 'h3', 'body', 'small'];
    lines.push(`  --text-${labels[i] || `size-${i}`}: ${s}px;`);
  });
  lines.push('');
  lines.push(`  /* Spacing */`);
  d.spacing.common.slice(0, 6).forEach((s, i) => {
    lines.push(`  --space-${i + 1}: ${s.value}px;`);
  });
  lines.push('');
  lines.push(`  /* Border radius */`);
  d.borderRadius.slice(0, 4).forEach(r => {
    lines.push(`  --radius-${r.role}: ${r.value}px;`);
  });

  // Include original CSS custom properties from the source site
  const cssProps = (d.cssCustomProperties || []);
  if (cssProps.length > 0) {
    lines.push('');
    lines.push(`  /* Original custom properties from ${d.url} */`);
    const categories: Array<{ label: string; cat: string }> = [
      { label: 'Colors', cat: 'color' },
      { label: 'Spacing', cat: 'spacing' },
      { label: 'Typography', cat: 'typography' },
      { label: 'Other', cat: 'other' },
    ];
    for (const { label, cat } of categories) {
      const props = cssProps.filter(p => p.category === cat);
      if (props.length > 0) {
        lines.push(`  /* ${label} */`);
        props.forEach(p => {
          lines.push(`  ${p.name}: ${p.value};`);
        });
      }
    }
  }

  lines.push(`}`);
  return lines.join('\n');
}

// ─── Design tokens JSON ─────────────────────────────────────────
export function generateTokensJson(d: ExtractedDesign): string {
  const tokens = {
    $schema: 'https://design-tokens.org/schema.json',
    meta: {
      source: d.url,
      title: d.title,
      scrapedAt: d.scrapedAt,
      tags: d.tags,
    },
    colors: {
      background: { value: d.colors.bg, type: 'color' },
      backgroundSecondary: { value: d.colors.bgSecondary, type: 'color' },
      text: { value: d.colors.text, type: 'color' },
      textSecondary: { value: d.colors.textSecondary, type: 'color' },
      primary: { value: d.colors.primary, type: 'color' },
      secondary: { value: d.colors.secondary, type: 'color' },
      border: { value: d.colors.border, type: 'color' },
      palette: d.colors.palette.slice(0, 12).map((c, i) => ({
        name: colorRoleName(i),
        value: c.hex,
        role: c.role,
      })),
    },
    typography: {
      headingFont: { value: d.typography.headingFont.cleanFamily, type: 'fontFamily' },
      bodyFont: { value: d.typography.bodyFont.cleanFamily, type: 'fontFamily' },
      fontSizes: d.typography.fontSizes.map(s => ({ value: s, type: 'dimension', unit: 'px' })),
      details: d.typography.details,
    },
    spacing: d.spacing.common.map(s => ({ value: s.value, type: 'dimension', unit: 'px' })),
    borderRadius: d.borderRadius.map(r => ({ value: r.value, type: 'dimension', unit: 'px', role: r.role })),
    shadows: (d.shadows || []).map(s => ({ value: s.value, level: s.level })),
    components: d.components,
    cssCustomProperties: (d.cssCustomProperties || []).reduce((acc: Record<string, any[]>, p) => {
      if (!acc[p.category]) acc[p.category] = [];
      acc[p.category].push({ name: p.name, value: p.value });
      return acc;
    }, {} as Record<string, any[]>),
  };
  return JSON.stringify(tokens, null, 2);
}
