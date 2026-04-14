/**
 * Pre-extract DESIGN.md for gallery brands
 * Merges with existing data to avoid re-extracting
 */
import { extractStyle } from './extract';
import { generateDesignMd, generateTailwindConfig, generateCssVars, generateTokensJson } from './generate';
import * as fs from 'fs';

const BRANDS = [
  // Existing 16
  { label: 'Stripe', url: 'https://stripe.com', domain: 'stripe.com' },
  { label: 'Vercel', url: 'https://vercel.com', domain: 'vercel.com' },
  { label: 'Figma', url: 'https://www.figma.com', domain: 'figma.com' },
  { label: 'OpenAI', url: 'https://openai.com', domain: 'openai.com' },
  { label: 'Linear', url: 'https://www.linear.app', domain: 'linear.app' },
  { label: 'GitHub', url: 'https://github.com', domain: 'github.com' },
  { label: 'Netflix', url: 'https://www.netflix.com', domain: 'netflix.com' },
  { label: 'Spotify', url: 'https://www.spotify.com', domain: 'spotify.com' },
  { label: 'Notion', url: 'https://www.notion.so', domain: 'notion.so' },
  { label: 'Apple', url: 'https://www.apple.com', domain: 'apple.com' },
  { label: 'Airbnb', url: 'https://www.airbnb.com', domain: 'airbnb.com' },
  { label: 'Shopify', url: 'https://www.shopify.com', domain: 'shopify.com' },
  { label: 'Supabase', url: 'https://supabase.com', domain: 'supabase.com' },
  { label: 'Framer', url: 'https://www.framer.com', domain: 'framer.com' },
  { label: 'Coinbase', url: 'https://www.coinbase.com', domain: 'coinbase.com' },
  { label: 'Slack', url: 'https://slack.com', domain: 'slack.com' },
  // Wave 2
  { label: 'Canva', url: 'https://www.canva.com', domain: 'canva.com' },
  { label: 'Dribbble', url: 'https://dribbble.com', domain: 'dribbble.com' },
  { label: 'Twitch', url: 'https://www.twitch.tv', domain: 'twitch.tv' },
  { label: 'Discord', url: 'https://discord.com', domain: 'discord.com' },
  { label: 'Revolut', url: 'https://www.revolut.com', domain: 'revolut.com' },
  { label: 'Raycast', url: 'https://www.raycast.com', domain: 'raycast.com' },
  { label: 'Loom', url: 'https://www.loom.com', domain: 'loom.com' },
  { label: 'LINE', url: 'https://line.me/ja', domain: 'line.me' },
  { label: 'メルカリ', url: 'https://jp.mercari.com', domain: 'mercari.com' },
  { label: 'note', url: 'https://note.com', domain: 'note.com' },
  { label: 'SmartHR', url: 'https://smarthr.jp', domain: 'smarthr.jp' },
  { label: 'freee', url: 'https://www.freee.co.jp', domain: 'freee.co.jp' },
  { label: 'クックパッド', url: 'https://cookpad.com', domain: 'cookpad.com' },
  { label: 'ZOZOTOWN', url: 'https://zozo.jp', domain: 'zozo.jp' },
  { label: 'Wantedly', url: 'https://www.wantedly.com', domain: 'wantedly.com' },
  { label: 'LayerX', url: 'https://layerx.co.jp', domain: 'layerx.co.jp' },
  // Wave 3 (new)
  { label: '楽天', url: 'https://www.rakuten.co.jp', domain: 'rakuten.co.jp' },
  { label: 'PayPay', url: 'https://paypay.ne.jp', domain: 'paypay.ne.jp' },
  { label: 'マネーフォワード', url: 'https://moneyforward.com', domain: 'moneyforward.com' },
  { label: 'BASE', url: 'https://thebase.com', domain: 'thebase.com' },
  { label: 'Sansan', url: 'https://jp.sansan.com', domain: 'sansan.com' },
  { label: 'Qiita', url: 'https://qiita.com', domain: 'qiita.com' },
  { label: 'Pinterest', url: 'https://www.pinterest.jp', domain: 'pinterest.jp' },
  { label: 'Intercom', url: 'https://www.intercom.com', domain: 'intercom.com' },
  { label: 'Zapier', url: 'https://zapier.com', domain: 'zapier.com' },
  { label: 'Airtable', url: 'https://www.airtable.com', domain: 'airtable.com' },
  { label: 'Railway', url: 'https://railway.app', domain: 'railway.app' },
  { label: 'Webflow', url: 'https://webflow.com', domain: 'webflow.com' },
  { label: 'Tesla', url: 'https://www.tesla.com', domain: 'tesla.com' },
  { label: 'Nike', url: 'https://www.nike.com', domain: 'nike.com' },
  { label: 'Wise', url: 'https://wise.com', domain: 'wise.com' },
  { label: 'Plaid', url: 'https://plaid.com', domain: 'plaid.com' },
];

async function main() {
  let results: Record<string, any> = {};
  try {
    results = JSON.parse(fs.readFileSync('prebuilt.json', 'utf8'));
    console.log(`Loaded ${Object.keys(results).length} existing brands`);
  } catch { console.log('Starting fresh'); }

  const toExtract = BRANDS.filter(b => !results[b.domain]);
  console.log(`Need to extract: ${toExtract.length} new brands\n`);

  for (const b of toExtract) {
    console.log(`Extracting ${b.label}...`);
    try {
      const design = await extractStyle(b.url);
      const designMd = generateDesignMd(design, 'extended');
      const tailwind = generateTailwindConfig(design);
      const cssVars = generateCssVars(design);
      const tokens = generateTokensJson(design);
      results[b.domain] = { label: b.label, domain: b.domain, design, designMd, tailwind, cssVars, tokens };
      console.log(`  ✓ ${b.label}`);
    } catch (e: any) {
      console.log(`  ✗ ${b.label}: ${e.message}`);
    }
  }
  fs.writeFileSync('prebuilt.json', JSON.stringify(results, null, 2));
  console.log(`\nDone. ${Object.keys(results).length} brands saved to prebuilt.json`);
}
main();
