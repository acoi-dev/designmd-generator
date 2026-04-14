#!/usr/bin/env npx tsx

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Types ──────────────────────────────────────────────────────
interface BrandEntry {
  label: string;
  domain: string;
  design: unknown;
  designMd: string;
  tailwind: string;
  cssVars: string;
  tokens: string;
}

type PrebuiltData = Record<string, BrandEntry>;

// ─── Load prebuilt data ─────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const prebuiltPath = resolve(__dirname, '..', 'prebuilt.json');

function loadPrebuilt(): PrebuiltData {
  if (!existsSync(prebuiltPath)) {
    console.error(`\x1b[31m✗ prebuilt.json not found at ${prebuiltPath}\x1b[0m`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(prebuiltPath, 'utf-8'));
}

// ─── Brand lookup (partial match) ───────────────────────────────
function findBrand(query: string, data: PrebuiltData): [string, BrandEntry] | null {
  const q = query.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

  // 1. Exact domain match
  if (data[q]) return [q, data[q]];

  // 2. Match by domain prefix (e.g., "stripe" → "stripe.com")
  //    The query must match the part before the first dot in the domain key
  const matches = Object.entries(data).filter(([domain]) => {
    const domainBase = domain.split('.')[0]; // "stripe" from "stripe.com"
    return domain.startsWith(q + '.') || domainBase === q || domain.includes(q);
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Prefer exact base match (e.g., "stripe" → "stripe.com" over "stripe.dev")
  const exactBase = matches.find(([domain]) => domain.split('.')[0] === q);
  if (exactBase) return exactBase;

  // Prefer domain that starts with query
  const prefixMatch = matches.find(([domain]) => domain.startsWith(q));
  if (prefixMatch) return prefixMatch;

  // Return first match
  return matches[0];
}

// ─── Format mapping ─────────────────────────────────────────────
type FormatKey = 'designmd' | 'tailwind' | 'css' | 'tokens';

const FORMAT_CONFIG: Record<FormatKey, { field: keyof BrandEntry; filename: string; description: string }> = {
  designmd: { field: 'designMd', filename: 'DESIGN.md', description: 'DESIGN.md' },
  tailwind: { field: 'tailwind', filename: 'tailwind.config.js', description: 'tailwind.config.js' },
  css: { field: 'cssVars', filename: 'variables.css', description: 'variables.css' },
  tokens: { field: 'tokens', filename: 'design-tokens.json', description: 'design-tokens.json' },
};

// ─── CLI ─────────────────────────────────────────────────────────
const program = new Command();

program
  .name('design-md')
  .description('Generate design system files from prebuilt brand data')
  .version('1.0.0');

// ── add command ──────────────────────────────────────────────────
program
  .command('add <domain>')
  .description('Generate a design system file for a brand')
  .option('-f, --format <format>', 'Output format: designmd, tailwind, css, tokens', 'designmd')
  .option('-o, --output <path>', 'Custom output file path')
  .action((domain: string, opts: { format: string; output?: string }) => {
    const data = loadPrebuilt();
    const formatKey = opts.format.toLowerCase() as FormatKey;

    if (!FORMAT_CONFIG[formatKey]) {
      console.error(`\x1b[31m✗ Unknown format: "${opts.format}". Available: designmd, tailwind, css, tokens\x1b[0m`);
      process.exit(1);
    }

    const result = findBrand(domain, data);
    if (!result) {
      console.error(`\x1b[31m✗ Brand not found: "${domain}". Run "design-md list" to see available brands.\x1b[0m`);
      process.exit(1);
    }

    const [matchedDomain, brand] = result;
    const config = FORMAT_CONFIG[formatKey];
    const content = brand[config.field] as string;

    if (!content) {
      console.error(`\x1b[31m✗ No ${config.description} data available for ${brand.label} (${matchedDomain})\x1b[0m`);
      process.exit(1);
    }

    const outputPath = opts.output || resolve(process.cwd(), config.filename);
    writeFileSync(outputPath, content, 'utf-8');
    console.log(`\x1b[32m✓ ${config.description} created for ${brand.label} (${matchedDomain})\x1b[0m`);
    console.log(`  → ${outputPath}`);
  });

// ── list command ─────────────────────────────────────────────────
program
  .command('list')
  .description('List all available brands')
  .option('-j, --json', 'Output as JSON')
  .action((opts: { json?: boolean }) => {
    const data = loadPrebuilt();
    const entries = Object.entries(data);

    if (opts.json) {
      const list = entries.map(([domain, brand]) => ({ domain, label: brand.label }));
      console.log(JSON.stringify(list, null, 2));
      return;
    }

    console.log(`\n\x1b[1m  Available Brands (${entries.length})\x1b[0m\n`);

    // Group by TLD for nicer display
    const maxLabelLen = Math.max(...entries.map(([, b]) => b.label.length));
    entries.forEach(([domain, brand]) => {
      const label = brand.label.padEnd(maxLabelLen + 2);
      console.log(`  \x1b[36m${label}\x1b[0m ${domain}`);
    });

    console.log(`\n  \x1b[2mUsage: design-md add <domain> [--format tailwind|css|tokens]\x1b[0m\n`);
  });

program.parse();
