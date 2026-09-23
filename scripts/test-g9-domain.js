#!/usr/bin/env node

/**
 * ViVuTraVinh - G9.3B Domain Standardization Unit Tests
 * Tests getSiteUrl(), getBaseUrl(), vercel.json edge routing,
 * sitemap.xml validity, and canonical link generation.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n=== G9.3B DOMAIN STANDARDIZATION UNIT TESTS ===\n');

// 1. Client-Side getSiteUrl() Tests
console.log('--- 1. js/config.js: getSiteUrl() Tests ---');

const { PRIMARY_DOMAIN, DEFAULT_SITE_URL, getSiteUrl, isValidCanonicalSiteUrl } = await import('../js/config.js');

runTest('getSiteUrl() defaults to DEFAULT_SITE_URL in Node.js environment', () => {
  assert.equal(PRIMARY_DOMAIN, 'vivutravinh.id.vn');
  assert.equal(DEFAULT_SITE_URL, 'https://vivutravinh.id.vn');
  assert.equal(getSiteUrl(), 'https://vivutravinh.id.vn');
});

runTest('getSiteUrl() strictly enforces canonical primary domain and rejects preview / evil origins', () => {
  const originalWindow = global.window;
  try {
    // Production apex origin
    global.window = { location: { origin: 'https://vivutravinh.id.vn' } };
    assert.equal(getSiteUrl(), 'https://vivutravinh.id.vn');

    // Localhost dev server must canonicalize to primary domain
    global.window = { location: { origin: 'http://localhost:8000' } };
    assert.equal(getSiteUrl(), 'https://vivutravinh.id.vn');

    // Preview deployment origin must canonicalize to primary domain
    global.window = { location: { origin: 'https://vivu-preview-branch.vercel.app' } };
    assert.equal(getSiteUrl(), 'https://vivutravinh.id.vn');

    // Host injection attempt: evil.example origin
    global.window = { location: { origin: 'https://evil.example' } };
    assert.equal(getSiteUrl(), 'https://vivutravinh.id.vn');

    // Untrusted overrides: javascript URL
    assert.equal(getSiteUrl({ siteUrl: 'javascript:alert(1)' }), 'https://vivutravinh.id.vn');

    // Untrusted overrides: HTTP unencrypted URL
    assert.equal(getSiteUrl({ siteUrl: 'http://vivutravinh.id.vn' }), 'https://vivutravinh.id.vn');

    // Untrusted overrides: evil.example URL
    assert.equal(getSiteUrl({ siteUrl: 'https://evil.example' }), 'https://vivutravinh.id.vn');

    // Allowed overrides: www normalizes to apex
    assert.equal(getSiteUrl({ siteUrl: 'https://www.vivutravinh.id.vn' }), 'https://vivutravinh.id.vn');
  } finally {
    global.window = originalWindow;
  }
});

// 2. Serverless Edge getBaseUrl() & Dynamic SSR Tests
console.log('\n--- 2. api/og-place.js: getBaseUrl() & Dynamic SSR Tests ---');

const { renderPlaceHtml, getBaseUrl, isValidSiteUrl, isAllowedHost } = await import('../api/og-place.js');

runTest('getBaseUrl() defaults to primary domain without request header', () => {
  assert.equal(getBaseUrl(), 'https://vivutravinh.id.vn');
  assert.equal(getBaseUrl(null), 'https://vivutravinh.id.vn');
  assert.equal(getBaseUrl({}), 'https://vivutravinh.id.vn');
});

runTest('getBaseUrl() rejects host injection attempts (evil.example, preview.vercel.app, javascript:, HTTP)', () => {
  // 1. Host injection via x-forwarded-host: evil.example
  const evilHostReq = { headers: { 'x-forwarded-host': 'evil.example' } };
  assert.equal(getBaseUrl(evilHostReq), 'https://vivutravinh.id.vn');

  // 2. Host injection via host header: evil.example
  const evilHostDirect = { headers: { host: 'evil.example' } };
  assert.equal(getBaseUrl(evilHostDirect), 'https://vivutravinh.id.vn');

  // 3. Vercel preview domain in host header: must canonicalize to primary domain
  const previewReq = { headers: { 'x-forwarded-host': 'vivu-staging-pr12.vercel.app' } };
  assert.equal(getBaseUrl(previewReq), 'https://vivutravinh.id.vn');

  // 4. www subdomain in host header: must canonicalize to primary apex domain
  const wwwReq = { headers: { 'x-forwarded-host': 'www.vivutravinh.id.vn' } };
  assert.equal(getBaseUrl(wwwReq), 'https://vivutravinh.id.vn');

  // 5. Port stripped and checked properly
  const portReq = { headers: { 'x-forwarded-host': 'vivutravinh.id.vn:443' } };
  assert.equal(getBaseUrl(portReq), 'https://vivutravinh.id.vn');

  // 6. Invalid SITE_URL env variable: javascript:
  const oldEnv = process.env.SITE_URL;
  try {
    process.env.SITE_URL = 'javascript:alert(1)';
    assert.equal(getBaseUrl(), 'https://vivutravinh.id.vn');

    // 7. Invalid SITE_URL env variable: plain HTTP
    process.env.SITE_URL = 'http://vivutravinh.id.vn';
    assert.equal(getBaseUrl(), 'https://vivutravinh.id.vn');

    // 8. Invalid SITE_URL env variable: untrusted domain
    process.env.SITE_URL = 'https://evil.example';
    assert.equal(getBaseUrl(), 'https://vivutravinh.id.vn');

    // 9. Valid SITE_URL env variable with www: normalizes to primary domain
    process.env.SITE_URL = 'https://www.vivutravinh.id.vn';
    assert.equal(getBaseUrl(), 'https://vivutravinh.id.vn');
  } finally {
    if (oldEnv === undefined) {
      delete process.env.SITE_URL;
    } else {
      process.env.SITE_URL = oldEnv;
    }
  }
});

runTest('renderPlaceHtml strictly enforces primary domain even under host injection attacks', () => {
  const evilReq = {
    headers: {
      'x-forwarded-host': 'evil.example',
      'x-forwarded-proto': 'https'
    }
  };
  const html = renderPlaceHtml('ao-ba-om', evilReq);
  assert.ok(html.includes('<link rel="canonical" id="canonicalLink" href="https://vivutravinh.id.vn/place/ao-ba-om">'));
  assert.ok(html.includes('<meta property="og:url" content="https://vivutravinh.id.vn/place/ao-ba-om">'));
  assert.ok(!html.includes('evil.example'), 'HTML must not reflect malicious injected host');
  assert.ok(!html.includes('vivutravinh.vercel.app'), 'HTML must not contain legacy domain');
  assert.ok(!html.includes('?place='));
});

// 3. Edge Redirects Configuration in vercel.json
console.log('\n--- 3. vercel.json Redirects Specification Tests ---');

runTest('vercel.json specifies valid permanent 308 redirect from www to apex', () => {
  const vercelPath = path.join(ROOT_DIR, 'vercel.json');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
  assert.ok(Array.isArray(vercelConfig.redirects), 'redirects array missing in vercel.json');

  const wwwRedirect = vercelConfig.redirects.find(r =>
    Array.isArray(r.has) &&
    r.has.some(h => h.type === 'host' && h.value === 'www.vivutravinh.id.vn')
  );

  assert.ok(wwwRedirect, 'www redirect rule missing');
  assert.equal(wwwRedirect.source, '/:path*');
  assert.equal(wwwRedirect.destination, 'https://vivutravinh.id.vn/:path*');
  assert.equal(wwwRedirect.permanent, true, 'Redirect must be permanent (HTTP 308)');
});

// 4. Sitemap.xml Specification Tests
console.log('\n--- 4. sitemap.xml Domain & Routing Specification Tests ---');

runTest('sitemap.xml strictly enforces https://vivutravinh.id.vn and canonical paths', () => {
  const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
  const content = fs.readFileSync(sitemapPath, 'utf8');

  // Verify XML structure
  assert.ok(content.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Missing XML declaration');
  assert.ok(content.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), 'Missing urlset tag');

  const locs = (content.match(/<loc>(.*?)<\/loc>/g) || []).map(t => t.replace(/<\/?loc>/g, ''));
  assert.ok(locs.length >= 10, 'Expected at least 10 URLs');

  for (const url of locs) {
    assert.ok(url.startsWith('https://vivutravinh.id.vn/'), `URL does not use primary domain: ${url}`);
    assert.ok(!url.includes('vivutravinh.vercel.app'), `URL contains legacy domain: ${url}`);
    assert.ok(!url.includes('#'), `Forbidden hash fragment: ${url}`);
    assert.ok(!url.includes('?'), `Forbidden query parameter: ${url}`);
  }

  // Key canonical routes
  assert.ok(locs.includes('https://vivutravinh.id.vn/'), 'Homepage missing');
  assert.ok(locs.includes('https://vivutravinh.id.vn/place/ao-ba-om'), 'Ao Ba Om missing');
  assert.ok(locs.includes('https://vivutravinh.id.vn/place/bien-ba-dong'), 'Bien Ba Dong missing');
  assert.ok(locs.includes('https://vivutravinh.id.vn/place/chua-ang'), 'Chua Ang missing');
  assert.ok(locs.includes('https://vivutravinh.id.vn/place/chua-hang'), 'Chua Hang missing');
  assert.ok(locs.includes('https://vivutravinh.id.vn/place/con-chim'), 'Con Chim missing');
});

// 5. CNAME File Protection Test
console.log('\n--- 5. Rollback Preparedness: CNAME Protection Test ---');

runTest('CNAME file is preserved and untouched for immediate GitHub Pages rollback', () => {
  const cnamePath = path.join(ROOT_DIR, 'CNAME');
  assert.ok(fs.existsSync(cnamePath), 'CNAME file must exist');
  const content = fs.readFileSync(cnamePath, 'utf8').trim();
  assert.equal(content, 'vivutravinh.id.vn', 'CNAME content must be vivutravinh.id.vn');
});

// 6. Cutover Verification Tool Exit Code & Simulation Tests
console.log('\n--- 6. verify:g9:cutover Exit Code & Server Detection Tests ---');

const { evaluateVerificationResults, runCutoverChecklist, createInitialChecklist } = await import('./verify-g9-cutover.js');

runTest('evaluateVerificationResults fails exit code (1) if failCount > 0 or SKIPPED', () => {
  const checklist1 = createInitialChecklist();
  checklist1[0].status = 'FAIL';
  checklist1[0].detail = 'Test failure';
  const eval1 = evaluateVerificationResults(checklist1);
  assert.equal(eval1.exitCode, 1, 'Must exit 1 on failures');
  assert.equal(eval1.isCutoverVerified, false);

  const checklist2 = createInitialChecklist();
  for (let i = 0; i < checklist2.length; i++) checklist2[i].status = 'PASS';
  checklist2[2].status = 'SKIPPED'; // mandatory check skipped
  const eval2 = evaluateVerificationResults(checklist2);
  assert.equal(eval2.exitCode, 1, 'Must exit 1 on skipped mandatory checks');
  assert.equal(eval2.isCutoverVerified, false);

  const checklistAllPass = createInitialChecklist();
  for (let i = 0; i < checklistAllPass.length; i++) checklistAllPass[i].status = 'PASS';
  const evalPass = evaluateVerificationResults(checklistAllPass);
  assert.equal(evalPass.exitCode, 0, 'Must exit 0 when all 11 items pass');
  assert.equal(evalPass.isCutoverVerified, true);
});

await runAsyncTest('runCutoverChecklist fails with exit code 1 when Server header is GitHub.com', async () => {
  const mockFetchGithub = async (url) => {
    return {
      ok: true,
      status: 200,
      headers: {
        get: (h) => (h.toLowerCase() === 'server' ? 'GitHub.com' : null)
      },
      text: async () => '<html><head><link rel="canonical" id="canonicalLink" href="https://vivutravinh.id.vn/"></head><body>GitHub Pages</body></html>'
    };
  };

  const { checklist, evaluation } = await runCutoverChecklist({
    targetUrl: 'https://vivutravinh.id.vn',
    fetchFn: mockFetchGithub,
    rootDir: ROOT_DIR,
    verbose: false
  });

  assert.equal(evaluation.exitCode, 1, 'Must fail exit code when served by GitHub Pages');
  assert.equal(evaluation.isCutoverVerified, false);
  assert.equal(checklist[0].status, 'FAIL');
  assert.ok(checklist[0].detail.includes('GitHub Pages'));
});

await runAsyncTest('runCutoverChecklist fails with exit code 1 when API returns 404', async () => {
  const mockFetchApi404 = async (url) => {
    if (url.includes('/api/report-place') || url.includes('/api/admin-profile')) {
      return {
        ok: false,
        status: 404,
        headers: { get: () => 'Vercel' },
        text: async () => 'Not Found'
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'Vercel' },
      text: async () => '<urlset><loc>https://vivutravinh.id.vn/</loc></urlset>'
    };
  };

  const { checklist, evaluation } = await runCutoverChecklist({
    targetUrl: 'https://vivutravinh.id.vn',
    fetchFn: mockFetchApi404,
    rootDir: ROOT_DIR,
    verbose: false
  });

  assert.equal(evaluation.exitCode, 1, 'Must fail exit code when API returns 404');
  assert.equal(evaluation.isCutoverVerified, false);
  assert.equal(checklist[2].status, 'FAIL', 'Public API should be marked FAIL');
});

console.log('\n========================================');
console.log(`G9.3B UNIT TEST SUMMARY: ${passedTests}/${totalTests} PASS`);
console.log('========================================\n');

if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
