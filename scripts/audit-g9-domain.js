#!/usr/bin/env node

/**
 * ViVuTraVinh - G9.3B Domain Standardization Audit
 * Verifies that all production URLs, runtime code, metadata, sitemaps, robots.txt,
 * and redirect configurations strictly use the primary domain 'vivutravinh.id.vn',
 * and that CNAME is preserved for rapid rollback.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PRIMARY_DOMAIN = 'vivutravinh.id.vn';
const PRIMARY_ORIGIN = `https://${PRIMARY_DOMAIN}`;
const LEGACY_DOMAIN = 'vivutravinh.vercel.app';

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function assertCheck(name, condition, errorMsg = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✓ [PASS] ${name}`);
  } else {
    failedChecks++;
    console.error(`  ✗ [FAIL] ${name}${errorMsg ? ` - ${errorMsg}` : ''}`);
  }
}

console.log('\n=== G9.3B DOMAIN STANDARDIZATION & CNAME INTEGRITY AUDIT ===\n');

// 1. CNAME Integrity Check (Rollback Safety)
console.log('--- 1. CNAME File & Rollback Safety Check ---');
const cnamePath = path.join(ROOT_DIR, 'CNAME');
assertCheck('CNAME file exists at repo root', fs.existsSync(cnamePath));
if (fs.existsSync(cnamePath)) {
  const cnameContent = fs.readFileSync(cnamePath, 'utf8').trim();
  assertCheck(`CNAME file specifies exact domain "${PRIMARY_DOMAIN}"`, cnameContent === PRIMARY_DOMAIN, `Found: "${cnameContent}"`);
}

// 2. Zero Hardcoded Legacy Domain in Runtime Files
console.log('\n--- 2. Zero Hardcoded Legacy Domain in Production Runtime Files ---');
const RUNTIME_FILES = [
  'index.html',
  'js/config.js',
  'js/app.js',
  'api/og-place.js',
  'robots.txt',
  'sitemap.xml',
  'google-apps-script/import-place.gs'
];

for (const relPath of RUNTIME_FILES) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    assertCheck(`File exists: ${relPath}`, false, 'File not found');
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const count = (content.match(new RegExp(LEGACY_DOMAIN, 'g')) || []).length;
  assertCheck(
    `No "${LEGACY_DOMAIN}" in ${relPath}`,
    count === 0,
    `Found ${count} occurrences`
  );
}

// 3. Centralized Architecture in js/config.js
console.log('\n--- 3. Centralized SITE_URL Architecture in js/config.js ---');
const configPath = path.join(ROOT_DIR, 'js/config.js');
const configContent = fs.readFileSync(configPath, 'utf8');
assertCheck('js/config.js defines PRIMARY_DOMAIN', configContent.includes(`PRIMARY_DOMAIN = '${PRIMARY_DOMAIN}'`));
assertCheck('js/config.js defines DEFAULT_SITE_URL', configContent.includes('DEFAULT_SITE_URL ='));
assertCheck('js/config.js exports getSiteUrl function', configContent.includes('export function getSiteUrl'));
assertCheck('js/config.js defines ALLOWED_CANONICAL_HOSTS allowlist', configContent.includes('ALLOWED_CANONICAL_HOSTS'));

// 4. Serverless Edge SSR in api/og-place.js
console.log('\n--- 4. Dynamic Base URL in api/og-place.js ---');
const ogPath = path.join(ROOT_DIR, 'api/og-place.js');
const ogContent = fs.readFileSync(ogPath, 'utf8');
assertCheck('api/og-place.js implements getBaseUrl(request)', ogContent.includes('function getBaseUrl(request'));
assertCheck('api/og-place.js defaults to primary domain', ogContent.includes(`https://${PRIMARY_DOMAIN}`));
assertCheck('api/og-place.js defines ALLOWED_CANONICAL_HOSTS allowlist', ogContent.includes('ALLOWED_CANONICAL_HOSTS'));
assertCheck('api/og-place.js passes request into renderPlaceHtml', ogContent.includes('renderPlaceHtml(baseHtml, place, request)'));

// 5. Index.html SEO & Metadata Standardization
console.log('\n--- 5. index.html Head SEO & Canonical Tags ---');
const indexPath = path.join(ROOT_DIR, 'index.html');
const indexContent = fs.readFileSync(indexPath, 'utf8');
assertCheck('index.html canonical link uses primary domain', indexContent.includes(`<link rel="canonical" id="canonicalLink" href="${PRIMARY_ORIGIN}/">`));
assertCheck('index.html og:url uses primary domain', indexContent.includes(`<meta property="og:url" content="${PRIMARY_ORIGIN}/">`));
assertCheck('index.html og:image uses primary domain', indexContent.includes(`<meta property="og:image" content="${PRIMARY_ORIGIN}/icons/icon-512.png">`));
assertCheck('index.html twitter:image uses primary domain', indexContent.includes(`<meta name="twitter:image" content="${PRIMARY_ORIGIN}/icons/icon-512.png">`));
assertCheck('index.html JSON-LD @id uses primary domain', indexContent.includes(`"@id": "${PRIMARY_ORIGIN}/#website"`));
assertCheck('index.html JSON-LD url uses primary domain', indexContent.includes(`"url": "${PRIMARY_ORIGIN}/"`));

// 6. Robots.txt and Sitemap.xml Standardization
console.log('\n--- 6. Robots.txt and Sitemap.xml Standardization ---');
const robotsPath = path.join(ROOT_DIR, 'robots.txt');
const robotsContent = fs.readFileSync(robotsPath, 'utf8');
assertCheck('robots.txt points Sitemap to primary domain', robotsContent.includes(`Sitemap: ${PRIMARY_ORIGIN}/sitemap.xml`));

const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
const locMatches = sitemapContent.match(/<loc>(.*?)<\/loc>/g) || [];
assertCheck('sitemap.xml contains at least 10 URLs', locMatches.length >= 10, `Found: ${locMatches.length}`);

let allSitemapValid = true;
for (const tag of locMatches) {
  const url = tag.replace(/<\/?loc>/g, '');
  if (!url.startsWith(PRIMARY_ORIGIN)) {
    allSitemapValid = false;
    break;
  }
}
assertCheck(`All sitemap URLs start with ${PRIMARY_ORIGIN}`, allSitemapValid);

// 7. Edge Redirect Configuration in vercel.json
console.log('\n--- 7. Edge Redirect Configuration in vercel.json ---');
const vercelPath = path.join(ROOT_DIR, 'vercel.json');
assertCheck('vercel.json exists', fs.existsSync(vercelPath));
if (fs.existsSync(vercelPath)) {
  try {
    const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
    assertCheck('vercel.json is valid JSON', true);
    const redirects = vercelConfig.redirects || [];
    const wwwRedirect = redirects.find(r => 
      Array.isArray(r.has) && 
      r.has.some(h => h.type === 'host' && h.value === `www.${PRIMARY_DOMAIN}`)
    );
    assertCheck(
      `vercel.json defines redirect from www.${PRIMARY_DOMAIN} to apex`,
      Boolean(wwwRedirect && wwwRedirect.destination.startsWith(PRIMARY_ORIGIN)),
      wwwRedirect ? `Destination: ${wwwRedirect.destination}` : 'Rule not found'
    );
  } catch (err) {
    assertCheck('vercel.json is valid JSON', false, err.message);
  }
}

// Summary
console.log('\n========================================');
console.log(`G9.3B AUDIT SUMMARY: ${passedChecks}/${totalChecks} PASS (${failedChecks} FAIL)`);
console.log('========================================\n');

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
