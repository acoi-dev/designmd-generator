#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BASE = 'https://designmd-generator-production.up.railway.app';
const domains = Object.keys(require('./prebuilt-index.json'));
const today = new Date().toISOString().split('T')[0];

const urls = [
  { loc: `${BASE}/`, changefreq: 'daily', priority: '1.0' },
  { loc: `${BASE}/about.html`, changefreq: 'monthly', priority: '0.7' },
  ...domains.map(d => ({
    loc: `${BASE}/?url=${encodeURIComponent(d)}`,
    changefreq: 'weekly',
    priority: '0.8'
  }))
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

const out = path.join(__dirname, 'sitemap.xml');
fs.writeFileSync(out, xml, 'utf-8');
console.log(`sitemap.xml generated: ${urls.length} URLs (2 static + ${domains.length} brands)`);
