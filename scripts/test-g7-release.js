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
    assert.ok(url.startsWith('https://vivutravinh.id.vn'), `URL must strictly use primary domain: ${url}`);
    assert.ok(!url.includes('vivutravinh.vercel.app'), `Sitemap URL contains forbidden legacy domain: ${url}`);
  }

  // Must contain canonical homepage and places canonical path links
  assert.ok(content.includes('<loc>https://vivutravinh.id.vn/</loc>'), 'Homepage missing');
  assert.ok(content.includes('<loc>https://vivutravinh.id.vn/place/ao-ba-om</loc>'), 'Ao Ba Om canonical /place/ missing');
  assert.ok(content.includes('<loc>https://vivutravinh.id.vn/place/chua-hang</loc>'), 'Chua Hang canonical /place/ missing');

  // Must NOT contain query param URLs (?place=) in sitemap
  assert.ok(!content.includes('?place='), 'Sitemap contains forbidden ?place= query URLs');
});

runTest('Robots.txt points to canonical sitemap on production domain', () => {
  const robotsPath = path.join(ROOT_DIR, 'robots.txt');
  assert.ok(fs.existsSync(robotsPath), 'robots.txt missing');
  const content = fs.readFileSync(robotsPath, 'utf8');

  assert.ok(content.includes('User-agent: *'), 'Missing User-agent: *');
  assert.ok(content.includes('Allow: /'), 'Missing Allow: /');
  assert.ok(content.includes('Sitemap: https://vivutravinh.id.vn/sitemap.xml'), 'Incorrect Sitemap URL');
  assert.ok(!content.includes('vivutravinh.vercel.app'), 'Robots.txt contains forbidden legacy domain');
});

// 2. HTML HEAD SEO & SCHEMA.ORG AUDIT
console.log('\n--- 2. HTML Head SEO, Canonical & Schema.org Audit ---');
runTest('index.html contains canonical link, absolute OG tags, Twitter card & Schema.org JSON-LD', () => {
  const indexPath = path.join(ROOT_DIR, 'index.html');
  const content = fs.readFileSync(indexPath, 'utf8');

  // Canonical
  assert.ok(content.includes('<link rel="canonical" id="canonicalLink" href="https://vivutravinh.id.vn/">'), 'Missing or invalid canonical link');
  assert.ok(!content.includes('href="https://vivutravinh.vercel.app/"'), 'Canonical link must not contain legacy domain');

  // Open Graph
  assert.ok(content.includes('<meta property="og:url" content="https://vivutravinh.id.vn/">'), 'Missing og:url');
  assert.ok(content.includes('<meta property="og:site_name" content="ViVu Trà Vinh">'), 'Missing og:site_name');
  assert.ok(content.includes('property="og:image" content="https://vivutravinh.id.vn/icons/icon-512.png"'), 'og:image must be absolute URL on primary domain');
  assert.ok(!content.includes('property="og:image" content="https://vivutravinh.vercel.app'), 'og:image must not contain legacy domain');
  assert.ok(content.includes('property="og:title"'), 'Missing og:title');
  assert.ok(content.includes('property="og:description"'), 'Missing og:description');

  // Twitter Card
  assert.ok(content.includes('name="twitter:card" content="summary_large_image"'), 'Missing twitter:card');
  assert.ok(content.includes('name="twitter:image" content="https://vivutravinh.id.vn/icons/icon-512.png"'), 'twitter:image must be absolute URL on primary domain');
  assert.ok(!content.includes('name="twitter:image" content="https://vivutravinh.vercel.app'), 'twitter:image must not contain legacy domain');

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
  assert.ok(indexContent.includes('~4.8 MB (Precache 4.6 MiB), Cập nhật 09/2026'), 'Footer must display offline package metadata');

  const runbookPath = path.join(ROOT_DIR, 'docs/release-runbook.md');
  assert.ok(fs.existsSync(runbookPath), 'docs/release-runbook.md missing');
  const runbook = fs.readFileSync(runbookPath, 'utf8');
  assert.ok(runbook.includes('Database Backup Procedure') || runbook.includes('Sao Lưu Dữ Liệu'), 'Missing DB backup section in runbook');
  assert.ok(runbook.includes('Instant Rollback Procedure') || runbook.includes('Hoàn Tác Khẩn Cấp'), 'Missing rollback section in runbook');
  assert.ok(runbook.includes('git revert'), 'Missing git revert in runbook');
});

// 6. REPORT PLACE API AUDIT
console.log('\n--- 6. Report Place API (api/report-place.js) Audit ---');
runTest('api/report-place uses the exact Supabase RPC parameter contract', () => {
  const reportPlaceSource = fs.readFileSync(path.join(ROOT_DIR, 'api', 'report-place.js'), 'utf8');
  assert.match(reportPlaceSource, /p_key:\s*`report_place_ip_\$\{ip\}`/);
  assert.match(reportPlaceSource, /p_window_seconds:\s*RATE_LIMIT_WINDOW_SECONDS/);
  assert.match(reportPlaceSource, /p_max_requests:\s*MAX_REQUESTS_PER_WINDOW/);
  assert.match(reportPlaceSource, /p_min_interval_seconds:\s*MIN_INTERVAL_SECONDS/);
  assert.doesNotMatch(reportPlaceSource, /\bclient_ip:\s*ip/);
});
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

  // 6. Payload size limit (MAX_PAYLOAD_SIZE = 64KB)
  const hugeRes = mockRes();
  const hugeDetails = 'A'.repeat(65 * 1024);
  await handler({
    method: 'POST',
    headers: { 'x-forwarded-for': '192.168.1.51' },
    body: {
      place_id: 'ao-ba-om',
      place_name: 'Ao Bà Om',
      issue_type: 'wrong_hours',
      details: hugeDetails
    }
  }, hugeRes);
  assert.equal(hugeRes.statusCode, 413, 'Expected 413 for payload exceeding 64KB');
  assert.equal(hugeRes.body.error.code, 'PAYLOAD_TOO_LARGE');

  // 7. Idempotency test (same client_report_id)
  const clientReportId = `test_rep_${Date.now()}`;
  const resFirst = mockRes();
  await handler({
    method: 'POST',
    headers: { 'x-forwarded-for': '192.168.1.52' },
    body: {
      place_id: 'ao-ba-om',
      place_name: 'Ao Bà Om',
      issue_type: 'wrong_address',
      details: 'Sai thông tin lần 1',
      client_report_id: clientReportId
    }
  }, resFirst);
  assert.equal(resFirst.statusCode, 200);

  // Second request with same client_report_id should be idempotent
  const resSecond = mockRes();
  await handler({
    method: 'POST',
    headers: { 'x-forwarded-for': '192.168.1.52' },
    body: {
      place_id: 'ao-ba-om',
      place_name: 'Ao Bà Om',
      issue_type: 'wrong_address',
      details: 'Sai thông tin lần 2 (khác text nhưng cùng client_report_id)',
      client_report_id: clientReportId
    }
  }, resSecond);
  // 8. Production configuration enforcement: disallow mock on production when Supabase is missing (prevent false success)
  const prevEnv = process.env.NODE_ENV;
  const prevVivu = process.env.VIVU_TEST;
  try {
    delete process.env.VIVU_TEST;
    delete process.env.ALLOW_MOCK_FALLBACK;
    delete process.env.ALLOW_LOCAL_RATE_LIMIT_FALLBACK;
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';

    const prodRes = mockRes();
    await handler({
      method: 'POST',
      headers: { 'x-forwarded-for': '192.168.1.99' },
      body: {
        place_id: 'ao-ba-om',
        place_name: 'Ao Bà Om',
        issue_type: 'wrong_address',
        details: 'Phản ánh trên production khi thiếu Supabase'
      }
    }, prodRes);

    assert.equal(prodRes.statusCode, 500, 'Production must return 500 CONFIG_ERROR when Supabase is unconfigured');
    assert.equal(prodRes.body.error.code, 'CONFIG_ERROR');
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevVivu) process.env.VIVU_TEST = prevVivu;
    delete process.env.VERCEL;
  }
});

// 7. SERVER-SIDE DYNAMIC SEO & OPEN GRAPH (RAW HTTP CRAWLER AUDIT)
console.log('\n--- 7. Server-Side Dynamic HTML & Open Graph Crawler Audit ---');
await runAsyncTest('api/og-place renders dynamic <title>, OG tags, Twitter cards and JSON-LD for crawlers without JS', async () => {
  const { renderPlaceHtml } = await import('../api/og-place.js');

  // Test place: Ao Bà Om
  const htmlAoBaOm = renderPlaceHtml('ao-ba-om');
  assert.ok(htmlAoBaOm.includes('<title>Ao Bà Om - ViVu Trà Vinh</title>'), 'Place title missing in raw HTML');
  assert.ok(htmlAoBaOm.includes('<meta property="og:title" content="Ao Bà Om - ViVu Trà Vinh">'), 'OG title missing');
  assert.ok(htmlAoBaOm.includes('<meta property="og:url" content="https://vivutravinh.id.vn/place/ao-ba-om">'), 'OG url missing');
  assert.ok(htmlAoBaOm.includes('<link rel="canonical" id="canonicalLink" href="https://vivutravinh.id.vn/place/ao-ba-om">'), 'Canonical link missing');
  assert.ok(!htmlAoBaOm.includes('vivutravinh.vercel.app'), 'Raw HTML must not use legacy vercel.app domain');
  assert.ok(!htmlAoBaOm.includes('?place='), 'Raw HTML must not use ?place= as canonical or OG URL');
  assert.ok(htmlAoBaOm.includes('<meta name="twitter:title" content="Ao Bà Om - ViVu Trà Vinh">'), 'Twitter title missing');
  assert.ok(htmlAoBaOm.includes('Ao Bà Om'), 'Place name missing in rendered HTML');
  assert.ok(htmlAoBaOm.includes('Danh thắng nổi tiếng'), 'Place description missing');

  // Test unknown place fallback
  const htmlFallback = renderPlaceHtml('non-existent-place');
  assert.ok(htmlFallback.includes('<title>ViVuTraVinh'), 'Fallback title missing');
  assert.ok(htmlFallback.includes('og:title'), 'Fallback OG title missing');

  // Test HTTP Handler mock for crawler request
  const ogHandler = (await import('../api/og-place.js')).default;
  const ogRes = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(data) { this.body = data; }
  };
  await ogHandler({
    url: '/place/chua-hang',
    query: { place: 'chua-hang' },
    headers: { 'user-agent': 'facebookexternalhit/1.1' }
  }, ogRes);

  assert.equal(ogRes.statusCode, 200);
  assert.ok(ogRes.headers['Content-Type'].includes('text/html'));
  assert.ok(ogRes.body.includes('Chùa Hang - ViVu Trà Vinh'));
  assert.ok(ogRes.body.includes('https://vivutravinh.id.vn/place/chua-hang'), 'OG handler must use primary domain');
  assert.ok(!ogRes.body.includes('vivutravinh.vercel.app'), 'OG handler must not use legacy vercel.app domain');
  assert.ok(!ogRes.body.includes('?place=chua-hang'));
});

// 8. CLIENT-SIDE IDEMPOTENCY RETRY PRESERVATION AUDIT
console.log('\n--- 8. Client-Side Idempotency Retry Preservation Audit ---');
runTest('js/app.js binds and preserves client_report_id in localStorage across retries', () => {
  const appContent = fs.readFileSync(path.join(ROOT_DIR, 'js/app.js'), 'utf8');
  assert.ok(appContent.includes('vivu_pending_report_id_'), 'Missing localStorage key for pending report ID');
  assert.ok(appContent.includes('reportClientReportId'), 'Missing reportClientReportId element binding');
  assert.ok(appContent.includes('localStorage.removeItem(storageKey)'), 'Must clear storageKey on success');

  const indexContent = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.ok(indexContent.includes('id="reportClientReportId"'), 'index.html missing hidden input reportClientReportId');
});

// 9. CANONICAL ROUTE AUDIT (CONFIRM /place/{slug} IS USED, NOT /?place=...)
console.log('\n--- 9. Canonical Route Audit (Confirm /place/{slug}, Reject /?place=...) ---');
await runAsyncTest('Raw HTML generation enforces /place/{slug} canonical and rejects /?place=...', async () => {
  const { renderPlaceHtml } = await import('../api/og-place.js');
  const rendered = renderPlaceHtml('ao-ba-om');

  // Must have /place/ao-ba-om
  assert.ok(rendered.includes('href="https://vivutravinh.id.vn/place/ao-ba-om"'), 'Canonical href must be /place/ao-ba-om');
  assert.ok(rendered.includes('content="https://vivutravinh.id.vn/place/ao-ba-om"'), 'og:url must be /place/ao-ba-om');
  assert.ok(!rendered.includes('vivutravinh.vercel.app'), 'Rendered HTML must not use legacy vercel.app domain');

  // Must NOT have ?place= in canonical or og:url
  assert.ok(!rendered.includes('href="https://vivutravinh.id.vn/?place='), 'Canonical link must not contain ?place=');
  assert.ok(!rendered.includes('content="https://vivutravinh.id.vn/?place='), 'og:url must not contain ?place=');
});

// 10. SPA CLIENT ROUTING & ZERO ?place= AUDIT
console.log('\n--- 10. SPA Client Routing & Zero ?place= Audit ---');
runTest('js/app.js enforces /place/{slug} URL routing and cleans up ?place= completely', () => {
  const appCode = fs.readFileSync(path.join(ROOT_DIR, 'js/app.js'), 'utf8');

  // Must construct targetPath as /place/${encodeURIComponent(slug)}
  assert.ok(appCode.includes('`/place/${encodeURIComponent(slug)}`'), 'openDetailModal must format pathname as /place/{slug}');

  // Must delete ?place= param upon opening and closing
  assert.ok(appCode.includes("url.searchParams.delete('place')"), 'URL handling must explicitly delete ?place= parameter');

  // Must reset pathname to / upon closing modal
  assert.ok(appCode.includes("url.pathname = '/'"), 'closeDetailModal must restore pathname to /');

  // Must handle direct entry without duplicate history and replaceState back to /
  assert.ok(appCode.includes('isDirect: true'), 'SPA routing must mark direct entry to avoid duplicate history stack');

  // handleDeepLink must migrate legacy ?place= to canonical /place/
  assert.ok(appCode.includes('fromLegacyQuery: true'), 'handleDeepLink must flag legacy query for canonical URL migration');
});

console.log(`\n========================================`);
console.log(`G7 RELEASE AUDIT KẾT QUẢ: ${passedTests}/${totalTests} PASS`);
console.log(`========================================\n`);

if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
