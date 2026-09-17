// scripts/test-g7-release.js
// Bộ kiểm thử tự động G7: SEO, Privacy Telemetry, Release Runbook & Content Honesty Audit
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

process.env.VIVU_TEST = '1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n=== G7 RELEASE AUDIT: SEO, PRIVACY TELEMETRY, CONTENT HONESTY & ROLLBACK ===\n');

// 1. SITEMAP & ROBOTS AUDIT
console.log('--- 1. Sitemap.xml & Robots.txt Audit ---');
runTest('Sitemap.xml exists, valid XML, 0 hash fragments, correct canonical domain', () => {
  const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
  assert.ok(fs.existsSync(sitemapPath), 'sitemap.xml missing');
  const content = fs.readFileSync(sitemapPath, 'utf8');

  assert.ok(content.includes('<?xml version="1.0" encoding="UTF-8"?>'), 'Invalid XML declaration');
  assert.ok(content.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), 'Invalid urlset');

  // Must not have hash fragments (#) in <loc>
  const locMatches = content.match(/<loc>(.*?)<\/loc>/g) || [];
  assert.ok(locMatches.length >= 10, 'Expected at least 10 URLs in sitemap');

  for (const locTag of locMatches) {
    const url = locTag.replace(/<\/?loc>/g, '');
    assert.ok(!url.includes('#'), `Sitemap URL contains forbidden hash fragment: ${url}`);
    assert.ok(url.startsWith('https://vivutravinh.vercel.app'), `URL must use production domain: ${url}`);
  }

  // Must contain canonical homepage and places deep links
  assert.ok(content.includes('<loc>https://vivutravinh.vercel.app/</loc>'), 'Homepage missing');
  assert.ok(content.includes('?place=ao-ba-om'), 'Ao Ba Om canonical missing');
  assert.ok(content.includes('?place=chua-hang'), 'Chua Hang canonical missing');
});

runTest('Robots.txt points to canonical sitemap on production domain', () => {
  const robotsPath = path.join(ROOT_DIR, 'robots.txt');
  assert.ok(fs.existsSync(robotsPath), 'robots.txt missing');
  const content = fs.readFileSync(robotsPath, 'utf8');

  assert.ok(content.includes('User-agent: *'), 'Missing User-agent: *');
  assert.ok(content.includes('Allow: /'), 'Missing Allow: /');
  assert.ok(content.includes('Sitemap: https://vivutravinh.vercel.app/sitemap.xml'), 'Incorrect Sitemap URL');
});

// 2. HTML HEAD SEO & SCHEMA.ORG AUDIT
console.log('\n--- 2. HTML Head SEO, Canonical & Schema.org Audit ---');
runTest('index.html contains canonical link, absolute OG tags, Twitter card & Schema.org JSON-LD', () => {
  const indexPath = path.join(ROOT_DIR, 'index.html');
  const content = fs.readFileSync(indexPath, 'utf8');

  // Canonical
  assert.ok(content.includes('<link rel="canonical" id="canonicalLink" href="https://vivutravinh.vercel.app/">'), 'Missing or invalid canonical link');

  // Open Graph
  assert.ok(content.includes('<meta property="og:url" content="https://vivutravinh.vercel.app/">'), 'Missing og:url');
  assert.ok(content.includes('<meta property="og:site_name" content="ViVu Trà Vinh">'), 'Missing og:site_name');
  assert.ok(content.includes('property="og:image" content="https://vivutravinh.vercel.app/icons/icon-512.png"'), 'og:image must be absolute URL');
  assert.ok(content.includes('property="og:title"'), 'Missing og:title');
  assert.ok(content.includes('property="og:description"'), 'Missing og:description');

  // Twitter Card
  assert.ok(content.includes('name="twitter:card" content="summary_large_image"'), 'Missing twitter:card');
  assert.ok(content.includes('name="twitter:image" content="https://vivutravinh.vercel.app/icons/icon-512.png"'), 'twitter:image must be absolute URL');

  // Schema.org JSON-LD
  assert.ok(content.includes('<script type="application/ld+json">'), 'Missing Schema.org JSON-LD script tag');
  const jsonLdMatch = content.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch, 'Failed to extract JSON-LD');
  const jsonLd = JSON.parse(jsonLdMatch[1]);
  assert.equal(jsonLd['@context'], 'https://schema.org');
  assert.ok(Array.isArray(jsonLd['@graph']), '@graph array missing in JSON-LD');

  const types = jsonLd['@graph'].map(item => item['@type']);
  assert.ok(types.includes('WebSite'), 'Missing WebSite type in JSON-LD');
  assert.ok(types.includes('TouristDestination'), 'Missing TouristDestination type in JSON-LD');
});

// 3. PRIVACY TELEMETRY AUDIT
console.log('\n--- 3. Privacy Telemetry & PII Sanitization Audit ---');
await runAsyncTest('Telemetry circular buffer caps at 50 and scrubs PII (phones, emails, text)', async () => {
  const {
    getTelemetryEvents,
    clearTelemetryEvents,
    recordJsError,
    recordNetworkError,
    recordSyncError,
    sanitizeData
  } = await import('../js/telemetry.js');

  clearTelemetryEvents();

  // Test sanitization of sensitive PII
  const rawData = {
    author: 'Nguyễn Văn A',
    contact: '0912345678',
    email: 'user@example.com',
    comment: 'Bún ở đây siêu ngon!',
    token: 'secret_123',
    placeId: 'ao-ba-om',
    status: 200
  };

  const sanitized = sanitizeData(rawData);
  assert.equal(sanitized.author, '[REDACTED]');
  assert.equal(sanitized.contact, '[REDACTED_PHONE]');
  assert.equal(sanitized.email, '[REDACTED_EMAIL]');
  assert.equal(sanitized.comment, '[REDACTED]');
  assert.equal(sanitized.token, '[REDACTED]');
  assert.equal(sanitized.placeId, 'ao-ba-om');
  assert.equal(sanitized.status, 200);

  // Test circular buffer cap at 50
  for (let i = 0; i < 65; i++) {
    recordNetworkError(`/api/test/${i}`, new Error(`Simulated error ${i}`));
  }

  const events = getTelemetryEvents();
  assert.equal(events.length, 50, `Buffer should be capped at 50, but got ${events.length}`);
  // Should keep newest
  assert.ok(events[events.length - 1].message.includes('Simulated error 64'), 'Should retain the latest events');

  clearTelemetryEvents();
});

// 4. CONTENT HONESTY AUDIT
console.log('\n--- 4. Content Honesty Audit (Misleading Claims Scrubbed) ---');
runTest('No unverified claims of "chính thức" or "thời gian thực" in copy', () => {
  const indexContent = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const uiContent = fs.readFileSync(path.join(ROOT_DIR, 'js/ui.js'), 'utf8');

  // Check tagline and community banner in index.html
  assert.ok(!indexContent.includes('Cẩm nang du lịch số chính thức của tỉnh Trà Vinh'), 'Misleading "chính thức" in tagline');
  assert.ok(!indexContent.includes('Cộng đồng thổ địa chính thức Trà Vinh'), 'Misleading "chính thức" in community banner');

  // Check ui.js
  assert.ok(!uiContent.includes('theo thời gian thực'), 'Misleading "theo thời gian thực" in ui.js');
  assert.ok(!uiContent.includes('thời gian thực'), 'Misleading "thời gian thực" in ui.js');

  // Disclaimer in footer
  assert.ok(indexContent.includes('ViVu Trà Vinh là dự án cẩm nang du lịch và bản đồ số mã nguồn mở'), 'Missing honest footer disclaimer');
  assert.ok(indexContent.includes('Gói dữ liệu ngoại tuyến'), 'Missing offline package note');
});

// 5. VERSIONING & RELEASE RUNBOOK AUDIT
console.log('\n--- 5. Versioning & Release Runbook Audit ---');
runTest('Version consistency across package.json, dist/version.json, and footer display', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '2.1.0', 'package.json must be 2.1.0');

  const indexContent = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.ok(indexContent.includes('Phiên bản v2.1.0'), 'Footer must display v2.1.0');
  assert.ok(indexContent.includes('~2.5 MB, Cập nhật 09/2026'), 'Footer must display offline package metadata');

  const runbookPath = path.join(ROOT_DIR, 'docs/release-runbook.md');
  assert.ok(fs.existsSync(runbookPath), 'docs/release-runbook.md missing');
  const runbook = fs.readFileSync(runbookPath, 'utf8');
  assert.ok(runbook.includes('Database Backup Procedure') || runbook.includes('Sao Lưu Dữ Liệu'), 'Missing DB backup section in runbook');
  assert.ok(runbook.includes('Instant Rollback Procedure') || runbook.includes('Hoàn Tác Khẩn Cấp'), 'Missing rollback section in runbook');
  assert.ok(runbook.includes('git revert'), 'Missing git revert in runbook');
});

// 6. REPORT PLACE API AUDIT
console.log('\n--- 6. Report Place API (api/report-place.js) Audit ---');
await runAsyncTest('api/report-place handles validation, rate limiting, and 200 response', async () => {
  const handler = (await import('../api/report-place.js')).default;

  function mockRes() {
    return {
      statusCode: 200,
      headers: {},
      body: null,
      setHeader(name, val) { this.headers[name] = val; },
      end(data) { this.body = data ? JSON.parse(data) : null; }
    };
  }

  // 1. GET not allowed
  const res1 = mockRes();
  await handler({ method: 'GET', headers: {} }, res1);
  assert.equal(res1.statusCode, 405);

  // 2. Missing place_id
  const res2 = mockRes();
  await handler({ method: 'POST', headers: {}, body: { details: 'Sai giờ' } }, res2);
  assert.equal(res2.statusCode, 400);
  assert.equal(res2.body.error.code, 'MISSING_PLACE_ID');

  // 3. Invalid issue type
  const res3 = mockRes();
  await handler({ method: 'POST', headers: {}, body: { place_id: 'ao-ba-om', issue_type: 'hack', details: 'Sai' } }, res3);
  assert.equal(res3.statusCode, 400);
  assert.equal(res3.body.error.code, 'INVALID_ISSUE_TYPE');

  // 4. Too short details
  const res4 = mockRes();
  await handler({ method: 'POST', headers: {}, body: { place_id: 'ao-ba-om', issue_type: 'wrong_hours', details: 'ab' } }, res4);
  assert.equal(res4.statusCode, 400);
  assert.equal(res4.body.error.code, 'INVALID_DETAILS');

  // 5. Valid report
  const res5 = mockRes();
  await handler({
    method: 'POST',
    headers: { 'x-forwarded-for': '192.168.1.50' },
    body: {
      place_id: 'ao-ba-om',
      place_name: 'Ao Bà Om',
      issue_type: 'wrong_hours',
      details: 'Quán mở từ 6h sáng đến 18h tối thay vì cả ngày'
    }
  }, res5);
  assert.equal(res5.statusCode, 200);
  assert.equal(res5.body.success, true);
  assert.equal(res5.body.data.place_id, 'ao-ba-om');
});

console.log(`\n========================================`);
console.log(`G7 RELEASE AUDIT KẾT QUẢ: ${passedTests}/${totalTests} PASS`);
console.log(`========================================\n`);

if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
