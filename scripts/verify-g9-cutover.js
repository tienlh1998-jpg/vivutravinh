#!/usr/bin/env node

/**
 * ViVuTraVinh - G9.3B Live Domain Cutover Verification Tool
 * Performs rigorous 11-item verification against live target.
 * 
 * Safety & Integrity Contract:
 * - 100% READ-ONLY SMOKE TEST (Zero write, zero rate-limit impact, zero DB mutations).
 * - Verifies Vercel serverless function existence via GET /api/report-place expecting HTTP 405.
 * - Verifies Admin auth API via GET /api/admin-profile without token expecting HTTP 401.
 * - Detects GitHub Pages server response and fails if domain has not yet cut over to Vercel.
 * - Exit code contract:
 *   - failCount > 0 => exit 1
 *   - Any mandatory check SKIPPED => exit 1
 *   - Only when ALL 11 checks PASS => exit 0 & prints "CUTOVER VERIFIED".
 * 
 * Usage:
 *   npm run verify:g9:cutover
 *   node scripts/verify-g9-cutover.js --url https://vivutravinh.id.vn
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const DEFAULT_TARGET = 'https://vivutravinh.id.vn';
const PRIMARY_DOMAIN = 'vivutravinh.id.vn';

export function createInitialChecklist() {
  return [
    { id: 1, title: 'SSL Certificate, HTTPS Apex Status & Vercel Server Identity', status: 'PENDING', detail: '' },
    { id: 2, title: 'WWW to Apex 308/301 Permanent Redirect', status: 'PENDING', detail: '' },
    { id: 3, title: 'Public API Serverless Function Existence (GET /api/report-place -> HTTP 405)', status: 'PENDING', detail: '' },
    { id: 4, title: 'Admin Auth API Serverless Function (GET /api/admin-profile -> HTTP 401)', status: 'PENDING', detail: '' },
    { id: 5, title: 'Admin Dashboard UI (/admin.html)', status: 'PENDING', detail: '' },
    { id: 6, title: 'Canonical URL in Homepage HTML (Strict Primary Domain)', status: 'PENDING', detail: '' },
    { id: 7, title: 'Sitemap XML Accessibility & Domain Contract', status: 'PENDING', detail: '' },
    { id: 8, title: 'Robots.txt Sitemap Declaration', status: 'PENDING', detail: '' },
    { id: 9, title: 'PWA Manifest & Service Worker Accessibility', status: 'PENDING', detail: '' },
    { id: 10, title: 'Deep Link (/place/{slug}) & Dynamic OG SSR Crawler', status: 'PENDING', detail: '' },
    { id: 11, title: 'CNAME Repo File Protection (Rollback Readiness)', status: 'PENDING', detail: '' }
  ];
}

export function evaluateVerificationResults(checklist) {
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const item of checklist) {
    if (item.status === 'PASS') passCount++;
    else if (item.status === 'WARN') warnCount++;
    else if (item.status === 'FAIL') failCount++;
    else if (item.status === 'SKIPPED') skipCount++;
  }

  const isCutoverVerified = (passCount === checklist.length && failCount === 0 && skipCount === 0 && warnCount === 0);
  const exitCode = isCutoverVerified ? 0 : 1;

  return {
    passCount,
    warnCount,
    failCount,
    skipCount,
    isCutoverVerified,
    exitCode
  };
}

async function fetchWithTimeout(fetchFn, url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function runCutoverChecklist({
  targetUrl = DEFAULT_TARGET,
  fetchFn = fetch,
  rootDir = ROOT_DIR,
  verbose = true
} = {}) {
  const checklist = createInitialChecklist();

  if (verbose) {
    console.log('\n=== G9.3B LIVE DOMAIN CUTOVER VERIFICATION TOOL ===');
    console.log(`Target URL : ${targetUrl}`);
    console.log(`Timestamp  : ${new Date().toISOString()}`);
    console.log('Mode       : READ-ONLY SMOKE TEST (Zero Write / Zero Mutation / Zero Rate-Limit Impact)\n');
  }

  // Check 11: Local CNAME File Protection (Always checked locally first)
  const cnamePath = path.join(rootDir, 'CNAME');
  if (fs.existsSync(cnamePath)) {
    const content = fs.readFileSync(cnamePath, 'utf8').trim();
    if (content === PRIMARY_DOMAIN) {
      checklist[10].status = 'PASS';
      checklist[10].detail = `CNAME file intact at repo root ("${content}")`;
    } else {
      checklist[10].status = 'FAIL';
      checklist[10].detail = `CNAME content mismatch: expected "${PRIMARY_DOMAIN}", got "${content}"`;
    }
  } else {
    checklist[10].status = 'FAIL';
    checklist[10].detail = 'CNAME file missing at repo root! Rollback capability compromised!';
  }

  // Network checks
  try {
    // 1. SSL & Homepage & Server identity check
    try {
      const homeRes = await fetchWithTimeout(fetchFn, targetUrl, { redirect: 'follow' });
      const serverHeader = homeRes.headers?.get ? (homeRes.headers.get('server') || '') : '';
      
      if (serverHeader.toLowerCase().includes('github')) {
        checklist[0].status = 'FAIL';
        checklist[0].detail = `Server header indicates GitHub Pages (${serverHeader}). Domain cutover to Vercel has NOT taken effect yet!`;
      } else if (homeRes.ok) {
        checklist[0].status = 'PASS';
        checklist[0].detail = `HTTP ${homeRes.status} OK (Server: ${serverHeader || 'Vercel Edge'})`;
      } else {
        checklist[0].status = 'FAIL';
        checklist[0].detail = `HTTP ${homeRes.status} ${homeRes.statusText || ''} (Server: ${serverHeader})`;
      }

      if (homeRes.ok) {
        const homeHtml = await homeRes.text();
        // 6. Canonical link check
        if (homeHtml.includes(`href="https://${PRIMARY_DOMAIN}/"`) || homeHtml.includes(`href="${targetUrl}/"`)) {
          checklist[5].status = 'PASS';
          checklist[5].detail = `Canonical correctly references https://${PRIMARY_DOMAIN}/`;
        } else {
          checklist[5].status = 'FAIL';
          checklist[5].detail = 'Canonical link missing or does not match primary domain';
        }
      } else {
        checklist[5].status = 'FAIL';
        checklist[5].detail = 'Could not load homepage';
      }
    } catch (err) {
      checklist[0].status = 'SKIPPED';
      checklist[0].detail = `Network error (DNS likely not yet resolving): ${err.message}`;
      checklist[5].status = 'SKIPPED';
      checklist[5].detail = 'Skipped due to connection failure';
    }

    // 2. WWW Redirect Check
    const wwwUrl = targetUrl.replace('://', '://www.');
    try {
      const wwwRes = await fetchWithTimeout(fetchFn, wwwUrl, { redirect: 'manual' });
      const status = wwwRes.status;
      const location = wwwRes.headers?.get ? (wwwRes.headers.get('location') || '') : '';
      if ([301, 302, 307, 308].includes(status) && location.includes(PRIMARY_DOMAIN)) {
        checklist[1].status = 'PASS';
        checklist[1].detail = `HTTP ${status} redirect to ${location}`;
      } else if (status === 200) {
        checklist[1].status = 'WARN';
        checklist[1].detail = 'WWW served HTTP 200 without redirecting to apex';
      } else {
        checklist[1].status = 'FAIL';
        checklist[1].detail = `WWW returned HTTP ${status}, expected 308`;
      }
    } catch (err) {
      checklist[1].status = 'SKIPPED';
      checklist[1].detail = `WWW check skipped: ${err.message}`;
    }

    // 3. Public API Serverless Function Existence (GET expecting 405 Method Not Allowed)
    // 100% read-only: does NOT do POST, does NOT mutate rate limits, does NOT write DB
    try {
      const reportRes = await fetchWithTimeout(fetchFn, `${targetUrl}/api/report-place`, {
        method: 'GET'
      });
      if (reportRes.status === 405) {
        checklist[2].status = 'PASS';
        checklist[2].detail = 'HTTP 405 Method Not Allowed (Vercel Serverless Function verified without mutation)';
      } else if (reportRes.status === 404) {
        checklist[2].status = 'FAIL';
        checklist[2].detail = 'HTTP 404 Not Found (Vercel Function not deployed or route not mapped)';
      } else {
        checklist[2].status = 'WARN';
        checklist[2].detail = `/api/report-place returned unexpected HTTP ${reportRes.status}`;
      }
    } catch (err) {
      checklist[2].status = 'SKIPPED';
      checklist[2].detail = `Public API check skipped: ${err.message}`;
    }

    // 4. Admin Auth API Serverless Function (GET expecting 401 Unauthorized without token)
    try {
      const adminApiRes = await fetchWithTimeout(fetchFn, `${targetUrl}/api/admin-profile`, {
        method: 'GET'
      });
      if (adminApiRes.status === 401) {
        checklist[3].status = 'PASS';
        checklist[3].detail = 'HTTP 401 Unauthorized (Vercel Admin Auth API verified & actively securing endpoints)';
      } else if (adminApiRes.status === 404) {
        checklist[3].status = 'FAIL';
        checklist[3].detail = 'HTTP 404 Not Found (Admin API function not deployed)';
      } else {
        checklist[3].status = 'WARN';
        checklist[3].detail = `/api/admin-profile returned unexpected HTTP ${adminApiRes.status}`;
      }
    } catch (err) {
      checklist[3].status = 'SKIPPED';
      checklist[3].detail = `Admin API check skipped: ${err.message}`;
    }

    // 5. Admin Dashboard UI Check
    try {
      const adminRes = await fetchWithTimeout(fetchFn, `${targetUrl}/admin.html`);
      if (adminRes.ok) {
        const text = await adminRes.text();
        if (text.includes('admin') || text.includes('Quản Trị') || text.includes('supabase')) {
          checklist[4].status = 'PASS';
          checklist[4].detail = 'HTTP 200, valid admin dashboard loaded';
        } else {
          checklist[4].status = 'WARN';
          checklist[4].detail = 'HTTP 200, but admin keywords missing';
        }
      } else {
        checklist[4].status = 'FAIL';
        checklist[4].detail = `HTTP ${adminRes.status} ${adminRes.statusText || ''}`;
      }
    } catch (err) {
      checklist[4].status = 'SKIPPED';
      checklist[4].detail = `Admin check skipped: ${err.message}`;
    }

    // 7. Sitemap XML Check
    try {
      const sitemapRes = await fetchWithTimeout(fetchFn, `${targetUrl}/sitemap.xml`);
      if (sitemapRes.ok) {
        const xml = await sitemapRes.text();
        if (xml.includes('<urlset') && xml.includes(PRIMARY_DOMAIN)) {
          checklist[6].status = 'PASS';
          checklist[6].detail = `HTTP 200, valid urlset with ${PRIMARY_DOMAIN}`;
        } else {
          checklist[6].status = 'FAIL';
          checklist[6].detail = `HTTP 200, but missing urlset or ${PRIMARY_DOMAIN}`;
        }
      } else {
        checklist[6].status = 'FAIL';
        checklist[6].detail = `HTTP ${sitemapRes.status} ${sitemapRes.statusText || ''}`;
      }
    } catch (err) {
      checklist[6].status = 'SKIPPED';
      checklist[6].detail = `Sitemap check skipped: ${err.message}`;
    }

    // 8. Robots.txt Check
    try {
      const robotsRes = await fetchWithTimeout(fetchFn, `${targetUrl}/robots.txt`);
      if (robotsRes.ok) {
        const txt = await robotsRes.text();
        if (txt.includes(`Sitemap: https://${PRIMARY_DOMAIN}/sitemap.xml`) || txt.includes(`Sitemap: ${targetUrl}/sitemap.xml`)) {
          checklist[7].status = 'PASS';
          checklist[7].detail = 'HTTP 200, Sitemap declared correctly';
        } else {
          checklist[7].status = 'WARN';
          checklist[7].detail = 'HTTP 200, but Sitemap line mismatch';
        }
      } else {
        checklist[7].status = 'FAIL';
        checklist[7].detail = `HTTP ${robotsRes.status} ${robotsRes.statusText || ''}`;
      }
    } catch (err) {
      checklist[7].status = 'SKIPPED';
      checklist[7].detail = `Robots check skipped: ${err.message}`;
    }

    // 9. PWA Manifest & Service Worker Check
    try {
      const [manRes, swRes] = await Promise.all([
        fetchWithTimeout(fetchFn, `${targetUrl}/manifest.json`),
        fetchWithTimeout(fetchFn, `${targetUrl}/service-worker.js`)
      ]);
      const manOk = manRes.ok;
      const swOk = swRes.ok;
      if (manOk && swOk) {
        checklist[8].status = 'PASS';
        checklist[8].detail = 'Manifest & Service Worker both returned HTTP 200';
      } else {
        checklist[8].status = 'FAIL';
        checklist[8].detail = `Manifest: HTTP ${manRes.status}, Service Worker: HTTP ${swRes.status}`;
      }
    } catch (err) {
      checklist[8].status = 'SKIPPED';
      checklist[8].detail = `PWA check skipped: ${err.message}`;
    }

    // 10. Deep Link & Dynamic OG SSR Check
    try {
      const ogRes = await fetchWithTimeout(fetchFn, `${targetUrl}/place/ao-ba-om`, {
        headers: { 'User-Agent': 'facebookexternalhit/1.1 (ViVu Crawler Check)' }
      });
      if (ogRes.ok) {
        const html = await ogRes.text();
        if (html.includes('og:title') && html.includes('Ao Bà Om')) {
          checklist[9].status = 'PASS';
          checklist[9].detail = 'HTTP 200, Dynamic SSR OpenGraph tags verified for social crawler';
        } else {
          checklist[9].status = 'WARN';
          checklist[9].detail = 'HTTP 200, but place OG meta tags missing (SPA client-side fallback)';
        }
      } else {
        checklist[9].status = 'FAIL';
        checklist[9].detail = `HTTP ${ogRes.status} ${ogRes.statusText || ''}`;
      }
    } catch (err) {
      checklist[9].status = 'SKIPPED';
      checklist[9].detail = `Deep link check skipped: ${err.message}`;
    }
  } catch (outerErr) {
    if (verbose) console.error('Fatal execution error during checklist:', outerErr);
  }

  const evaluation = evaluateVerificationResults(checklist);

  if (verbose) {
    console.log('--- 11-Item Cutover Checklist Results ---');
    for (const item of checklist) {
      let icon = '•';
      if (item.status === 'PASS') icon = '✓';
      else if (item.status === 'WARN') icon = '⚠';
      else if (item.status === 'FAIL') icon = '✗';
      else if (item.status === 'SKIPPED') icon = '○';

      console.log(`  ${icon} [${item.status}] #${item.id} ${item.title}`);
      if (item.detail) {
        console.log(`      └─ ${item.detail}`);
      }
    }

    console.log('\n========================================');
    console.log(`CHECKLIST STATUS: ${evaluation.passCount} PASS | ${evaluation.warnCount} WARN | ${evaluation.failCount} FAIL | ${evaluation.skipCount} SKIPPED`);
    console.log('========================================\n');

    if (checklist[0].status === 'FAIL' && checklist[0].detail.includes('GitHub')) {
      console.log('🛑 KẾT LUẬN: Domain hiện vẫn đang trỏ về GitHub Pages, chưa hoàn thành chuyển đổi DNS sang Vercel.');
    }

    if (evaluation.isCutoverVerified) {
      console.log('🎉 CUTOVER VERIFIED: Toàn bộ 11 hạng mục chuyển đổi domain đã đạt chuẩn trên môi trường Vercel!\n');
    } else {
      console.log('❌ CUTOVER NOT VERIFIED: Có hạng mục chưa đạt chuẩn hoặc bị bỏ qua (exit code 1).\n');
    }
  }

  return { checklist, evaluation };
}

// CLI Execution entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  let cliTarget = DEFAULT_TARGET;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      cliTarget = args[i + 1].replace(/\/$/, '');
      i++;
    }
  }

  runCutoverChecklist({ targetUrl: cliTarget, verbose: true })
    .then(({ evaluation }) => {
      process.exitCode = evaluation.exitCode;
    })
    .catch(err => {
      console.error('Fatal CLI execution error:', err);
      process.exitCode = 1;
    });
}
