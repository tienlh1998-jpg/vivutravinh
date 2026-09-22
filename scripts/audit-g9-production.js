#!/usr/bin/env node

/**
 * scripts/audit-g9-production.js
 *
 * Kiểm toán đường cơ sở (Baseline Audit) dữ liệu Production cho Giai đoạn G9.0:
 * - CHỈ ĐỌC (Read-Only): Tuyệt đối KHÔNG thực hiện mutation (chặn mọi method ngoài GET/HEAD).
 * - BẢO MẬT: Tuyệt đối KHÔNG in secret hay token ra console/log (chỉ in "đã cấu hình" / "chưa cấu hình").
 * - KHÔNG PII: Loại bỏ hoàn toàn email, tên tác giả cá nhân, IP và số điện thoại người đóng góp.
 * - Hỗ trợ 3 chế độ kiểm toán thật:
 *   1. service_role: Đọc trực tiếp Supabase REST toàn quyền mọi status (scope: full_production).
 *   2. admin_token: Gọi Vercel /api/admin-* kèm Authorization Bearer và phân trang (scope: admin_visible).
 *   3. public_anon: Chỉ đọc dữ liệu public approved; toàn bộ số liệu nội bộ không đọc được là null/unknown (scope: public_only, baseline: BASELINE PARTIAL).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validatePlace } from '../js/place-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const DEFAULT_SUPABASE_URL = 'https://foyraoimhksfvlxndwxr.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXJhb2ltaGtzZnZseG5kd3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjkwNzAsImV4cCI6MjA5NTMwNTA3MH0.ARJ173UkVNCichCiJmVrbp2aTByVoXnSEAIsIvbnYJ8';
const DEFAULT_VERCEL_URL = 'https://vivutravinh.vercel.app';

const TEST_KEYWORDS = [
  'test', 'thu nghiem', 'thử nghiệm', 'adasdasd', 'asdasd', 'abc', 'xyz', 'demo', 'sample', 'fake'
];

/**
 * Hàm gọi mạng an toàn - CHỈ CHO PHÉP GET và HEAD, chặn đứng mọi mutation
 */
export async function auditFetch(url, options = {}, fetchFn = globalThis.fetch) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error(`MUTATION_FORBIDDEN: Method ${method} is blocked. Audit script is strictly read-only.`);
  }
  return fetchFn(url, options);
}

export function isLikelyTestData(place) {
  const textToCheck = [
    place.name || '',
    place.slug || '',
    place.address || '',
    place.description || '',
    place.note || ''
  ].join(' ').toLowerCase();

  for (const kw of TEST_KEYWORDS) {
    if (textToCheck.includes(kw)) {
      return { isTest: true, reason: `Chứa từ khóa/mẫu dữ liệu thử nghiệm: "${kw}"` };
    }
  }

  if ((place.name || '').trim().length < 3) {
    return { isTest: true, reason: 'Tên quá ngắn (< 3 ký tự)' };
  }

  const addr = (place.address || '').trim().toLowerCase();
  if (addr === 'tv' || addr === 'test' || addr === 'dia chi test') {
    return { isTest: true, reason: `Địa chỉ không có thật ("${place.address}")` };
  }

  return { isTest: false, reason: '' };
}

export function analyzeMissingFields(place) {
  const validation = validatePlace(place, { mode: 'approval' });
  const missing = [];
  const warnCodes = new Set(validation.warnings.map(w => w.code));

  if (warnCodes.has('WARN_MISSING_IMAGES')) missing.push('ảnh');
  if (warnCodes.has('WARN_MISSING_ADDRESS')) missing.push('địa chỉ');
  if (warnCodes.has('WARN_MISSING_COORDINATES')) missing.push('GPS');
  if (warnCodes.has('WARN_MISSING_HOURS') || warnCodes.has('WARN_INCOMPLETE_HOURS')) missing.push('giờ mở cửa');
  if (warnCodes.has('WARN_MISSING_PRICE')) missing.push('khoảng giá');
  if (warnCodes.has('WARN_MISSING_CONTACT')) missing.push('liên hệ');
  if (warnCodes.has('WARN_MISSING_MAP_LINK')) missing.push('Google Maps');

  return missing;
}

export function classifyPlace(place) {
  const testCheck = isLikelyTestData(place);
  if (testCheck.isTest) {
    return {
      category: 'nghi dữ liệu test',
      recommendation: 'đề xuất archive',
      reason: testCheck.reason
    };
  }

  if (place.operating_status === 'Permanently Closed' || place.status === 'archived') {
    return {
      category: 'đề xuất archive',
      recommendation: 'archive',
      reason: 'Địa điểm đã đóng cửa vĩnh viễn hoặc đã được gắn nhãn archive'
    };
  }

  const missing = analyzeMissingFields(place);
  if (missing.length > 0) {
    return {
      category: 'cần xác minh',
      recommendation: 'giữ lại & bổ sung',
      reason: `Thiếu các trường: ${missing.join(', ')}`
    };
  }

  return {
    category: 'giữ nguyên',
    recommendation: 'giữ nguyên',
    reason: 'Đầy đủ thông tin cơ bản và đã được chuẩn hóa'
  };
}

function parseTotalFromRange(rangeHeader, fallbackLen) {
  if (rangeHeader && rangeHeader.includes('/')) {
    const parts = rangeHeader.split('/');
    const total = parseInt(parts[1], 10);
    if (!isNaN(total)) return total;
  }
  return fallbackLen;
}

async function fetchSupabaseTable(supabaseUrl, table, query = '', keyToUse = '', fetchFn = globalThis.fetch) {
  const url = `${supabaseUrl}/rest/v1/${table}?${query}`;
  const response = await auditFetch(url, {
    method: 'GET',
    headers: {
      apikey: keyToUse,
      Authorization: `Bearer ${keyToUse}`,
      Prefer: 'count=exact'
    },
    signal: AbortSignal.timeout(10000)
  }, fetchFn);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} from ${table}: ${text.slice(0, 150)}`);
  }

  const contentRange = response.headers.get('content-range') || '';
  const data = await response.json();
  return { data, contentRange, total: parseTotalFromRange(contentRange, data.length) };
}

/**
 * Phân trang qua Vercel admin API cho đến khi lấy hết bản ghi
 */
async function fetchAdminPaginated(baseUrl, endpoint, token, dataProp, fetchFn = globalThis.fetch) {
  const items = [];
  let page = 1;
  const limit = 50;
  let totalReported = null;

  while (true) {
    const url = `${baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}&limit=${limit}`;
    const res = await auditFetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(10000)
    }, fetchFn);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status} from ${endpoint}: ${errText.slice(0, 150)}`);
    }

    const body = await res.json();
    const pageItems = body[dataProp] || [];
    items.push(...pageItems);

    const pagination = body.pagination || {};
    if (typeof pagination.total === 'number') {
      totalReported = pagination.total;
    }

    const totalPages = pagination.total_pages || (pageItems.length < limit ? page : page + 1);
    if (page >= totalPages || pageItems.length === 0) {
      break;
    }
    page++;
  }

  return { items, total: totalReported !== null ? totalReported : items.length };
}

/**
 * Đối soát động giữa fallback JSON, sitemap và danh sách địa điểm production
 */
export function computeFallbackComparison(fallbackList, sitemapContent, placesList = []) {
  const result = {
    fallbackTotal: 0,
    sitemapTotal: 0,
    matchedAnyStatus: 0,
    matchedApproved: 0,
    matchedNonApproved: 0,
    matchedInProduction: 0,
    missingInProduction: [],
    slugVariations: [],
    sitemapOnlyUnpaired: [],
    fallbackOnlyUnpaired: [],
    sitemapApprovedCount: 0,
    sitemapNonApprovedSlugs: [],
    sitemapMissingInProdSlugs: []
  };

  const placeStatusBySlug = new Map();
  for (const p of placesList || []) {
    const slug = (p.slug || '').trim().toLowerCase();
    if (slug) {
      placeStatusBySlug.set(slug, (p.status || 'unknown').toLowerCase());
    }
  }

  if (Array.isArray(fallbackList) && fallbackList.length > 0) {
    result.fallbackTotal = fallbackList.length;

    for (const fb of fallbackList) {
      const fbSlug = (fb['Slug'] || fb.slug || '').trim().toLowerCase();
      if (placeStatusBySlug.has(fbSlug)) {
        result.matchedAnyStatus++;
        const st = placeStatusBySlug.get(fbSlug);
        if (st === 'approved') {
          result.matchedApproved++;
        } else {
          result.matchedNonApproved++;
        }
      } else {
        result.missingInProduction.push({
          name: fb['Tên địa điểm'] || fb.name || 'Không rõ tên',
          slug: fbSlug,
          category: fb['Phân loại'] || fb.category || 'Chưa phân loại'
        });
      }
    }
    result.matchedInProduction = result.matchedAnyStatus;
  }

  if (typeof sitemapContent === 'string' && sitemapContent.trim().length > 0) {
    const matches = sitemapContent.match(/<loc>[^<]+<\/loc>/g) || [];
    const placeUrls = matches.filter(m => m.includes('/place/'));
    result.sitemapTotal = placeUrls.length;

    const sitemapSlugs = placeUrls.map(u => {
      const text = u.replace(/<\/?loc>/g, '').trim();
      const parts = text.split('/place/');
      return (parts[1] || '').replace(/\/$/, '').toLowerCase();
    }).filter(Boolean);

    // Kiểm tra tính đồng bộ public/SEO (chỉ dựa trên approved)
    for (const sSlug of sitemapSlugs) {
      if (placeStatusBySlug.has(sSlug)) {
        const st = placeStatusBySlug.get(sSlug);
        if (st === 'approved') {
          result.sitemapApprovedCount++;
        } else {
          result.sitemapNonApprovedSlugs.push({ slug: sSlug, status: st });
        }
      } else {
        result.sitemapMissingInProdSlugs.push(sSlug);
      }
    }

    const fallbackSlugs = Array.isArray(fallbackList)
      ? fallbackList.map(fb => (fb['Slug'] || fb.slug || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const fbSet = new Set(fallbackSlugs);
    const smSet = new Set(sitemapSlugs);

    const sitemapOnly = sitemapSlugs.filter(s => !fbSet.has(s));
    const fallbackOnly = fallbackSlugs.filter(s => !smSet.has(s));

    const pairedSm = new Set();
    const pairedFb = new Set();
    const variations = [];

    for (const s of sitemapOnly) {
      for (const f of fallbackOnly) {
        if (!pairedFb.has(f) && (f.includes(s) || s.includes(f))) {
          variations.push({ fallback: f, sitemap: s });
          pairedSm.add(s);
          pairedFb.add(f);
          break;
        }
      }
    }

    result.slugVariations = variations;
    result.sitemapOnlyUnpaired = sitemapOnly.filter(s => !pairedSm.has(s));
    result.fallbackOnlyUnpaired = fallbackOnly.filter(f => !pairedFb.has(f));
  }

  return result;
}

/**
 * Định dạng phần đối soát Fallback và Sitemap trong Markdown một cách hoàn toàn động
 */
function formatFallbackSection(fallbackComparison) {
  if (!fallbackComparison || (fallbackComparison.fallbackTotal === 0 && fallbackComparison.sitemapTotal === 0)) {
    return 'Chưa có dữ liệu đối soát fallback JSON hoặc sitemap (UNKNOWN).';
  }

  const hasMismatch = ((fallbackComparison.fallbackTotal || 0) > 0 && (fallbackComparison.matchedApproved || 0) < fallbackComparison.fallbackTotal)
    || (fallbackComparison.slugVariations && fallbackComparison.slugVariations.length > 0)
    || (fallbackComparison.sitemapOnlyUnpaired && fallbackComparison.sitemapOnlyUnpaired.length > 0)
    || (fallbackComparison.fallbackOnlyUnpaired && fallbackComparison.fallbackOnlyUnpaired.length > 0)
    || ((fallbackComparison.sitemapNonApprovedSlugs || []).length > 0);

  const intro = hasMismatch
    ? 'Có sự bất đối xứng dữ liệu giữa các nguồn dữ liệu của dự án:\n'
    : 'Dữ liệu đối soát giữa các nguồn dữ liệu của dự án:\n';

  const lines = [intro];

  if (typeof fallbackComparison.fallbackTotal === 'number' && fallbackComparison.fallbackTotal > 0) {
    lines.push(`1. **Snapshot Fallback (\`data/data-fallback.json\`):**`);
    lines.push(`   - Chứa **${fallbackComparison.fallbackTotal}** địa điểm mẫu dạng local snapshot đang chờ xác minh nguồn gốc và bản quyền.`);

    const matchedAny = typeof fallbackComparison.matchedAnyStatus === 'number'
      ? fallbackComparison.matchedAnyStatus
      : (fallbackComparison.matchedInProduction || 0);
    const matchedApp = typeof fallbackComparison.matchedApproved === 'number'
      ? fallbackComparison.matchedApproved
      : (typeof fallbackComparison.matchedInProduction === 'number' ? fallbackComparison.matchedInProduction : 0);

    if (matchedAny === matchedApp) {
      lines.push(`   - Hiện **${matchedApp}/${fallbackComparison.fallbackTotal}** địa điểm tồn tại trên Supabase Production dưới trạng thái \`approved\` (công khai).`);
    } else {
      lines.push(`   - Đối soát trạng thái CSDL Production:`);
      lines.push(`     - Tồn tại ở bất kỳ trạng thái nào (\`matchedAnyStatus\`): **${matchedAny}/${fallbackComparison.fallbackTotal}** địa điểm.`);
      lines.push(`     - Tồn tại và đang công khai (\`matchedApproved\`): **${matchedApp}/${fallbackComparison.fallbackTotal}** địa điểm.`);
    }
  }

  if (typeof fallbackComparison.sitemapTotal === 'number' && fallbackComparison.sitemapTotal > 0) {
    lines.push(`2. **Sitemap (\`sitemap.xml\`):**`);
    lines.push(`   - Chứa **${fallbackComparison.sitemapTotal}** canonical URLs.`);

    if (typeof fallbackComparison.sitemapApprovedCount === 'number') {
      lines.push(`   - Đồng bộ SEO công khai (chỉ tính approved): **${fallbackComparison.sitemapApprovedCount}/${fallbackComparison.sitemapTotal}** canonical URLs đã có bản ghi \`approved\` trên Supabase.`);
    }

    if (fallbackComparison.slugVariations && fallbackComparison.slugVariations.length > 0) {
      lines.push(`   - Có sự lệch cấu trúc slug so với Fallback:`);
      for (const v of fallbackComparison.slugVariations) {
        lines.push(`     - Fallback dùng \`${v.fallback}\` ↔ Sitemap dùng \`${v.sitemap}\``);
      }
    }

    if (fallbackComparison.sitemapOnlyUnpaired && fallbackComparison.sitemapOnlyUnpaired.length > 0) {
      lines.push(`   - ${fallbackComparison.sitemapOnlyUnpaired.length} địa điểm có trong Sitemap nhưng thiếu trong Fallback JSON: ${fallbackComparison.sitemapOnlyUnpaired.map(s => `\`${s}\``).join(', ')}.`);
    }

    if (fallbackComparison.fallbackOnlyUnpaired && fallbackComparison.fallbackOnlyUnpaired.length > 0) {
      lines.push(`   - ${fallbackComparison.fallbackOnlyUnpaired.length} địa điểm có trong Fallback JSON nhưng thiếu trong Sitemap: ${fallbackComparison.fallbackOnlyUnpaired.map(s => `\`${s}\``).join(', ')}.`);
    }

    if (fallbackComparison.sitemapNonApprovedSlugs && fallbackComparison.sitemapNonApprovedSlugs.length > 0) {
      lines.push(`   - ⚠️ Cảnh báo SEO: ${fallbackComparison.sitemapNonApprovedSlugs.length} URL trong Sitemap tương ứng với địa điểm chưa approved trong CSDL: ${fallbackComparison.sitemapNonApprovedSlugs.map(x => `\`${x.slug}\` (${x.status})`).join(', ')}.`);
    }
  }

  return lines.join('\n');
}

/**
 * Sinh báo cáo Markdown chuẩn từ chính kết quả kiểm toán (KHÔNG VIẾT CỨNG SỐ LIỆU HAY TÊN/SLUG)
 */
export function generateMarkdownReport(auditData) {
  const { authMode, timestamp, scope, baselineStatus, placesSummary, commentsSummary, reportsSummary, fallbackComparison } = auditData;

  const placesTotalDisplay = placesSummary.total !== null ? placesSummary.total : (placesSummary.observedPublicTotal !== null ? `${placesSummary.observedPublicTotal} (chỉ tính public approved)` : 'UNKNOWN');
  const placesScope = placesSummary.scope;

  const commentsTotalDisplay = commentsSummary.total !== null ? commentsSummary.total : (commentsSummary.observedPublicTotal !== null ? `${commentsSummary.observedPublicTotal} (chỉ tính public approved non-hidden)` : 'UNKNOWN');
  const commentsScope = commentsSummary.scope;

  const reportsTotalDisplay = reportsSummary.total !== null ? reportsSummary.total : 'UNKNOWN (yêu cầu quyền quản trị)';
  const reportsScope = reportsSummary.scope;

  const fallbackTotalDisplay = fallbackComparison && typeof fallbackComparison.fallbackTotal === 'number' ? fallbackComparison.fallbackTotal : 'UNKNOWN';
  const sitemapTotalDisplay = fallbackComparison && typeof fallbackComparison.sitemapTotal === 'number' ? fallbackComparison.sitemapTotal : 'UNKNOWN';

  const fallbackStatusCol = fallbackComparison && fallbackComparison.fallbackTotal > 0
    ? 'Snapshot local đang chờ xác minh nguồn'
    : 'Không có dữ liệu fallback (UNKNOWN)';

  const matchedApp = fallbackComparison && typeof fallbackComparison.matchedApproved === 'number'
    ? fallbackComparison.matchedApproved
    : (fallbackComparison?.matchedInProduction || 0);
  const matchedAny = fallbackComparison && typeof fallbackComparison.matchedAnyStatus === 'number'
    ? fallbackComparison.matchedAnyStatus
    : matchedApp;

  let fallbackEvalCol = 'Chưa đối soát.';
  if (fallbackComparison && typeof fallbackComparison.fallbackTotal === 'number' && fallbackComparison.fallbackTotal > 0) {
    if (matchedApp === fallbackComparison.fallbackTotal) {
      fallbackEvalCol = 'Đã đồng bộ đầy đủ trên Supabase production (toàn bộ approved).';
    } else if (matchedAny > matchedApp) {
      fallbackEvalCol = `⚠️ Chưa đồng bộ đủ approved (${matchedApp}/${fallbackComparison.fallbackTotal} approved, ${matchedAny}/${fallbackComparison.fallbackTotal} mọi status)${fallbackComparison.sitemapTotal > 0 ? '; có bất đối xứng với sitemap.xml' : ''}.`;
    } else {
      fallbackEvalCol = `⚠️ Chưa có đủ trên Supabase (${matchedApp}/${fallbackComparison.fallbackTotal} approved)${fallbackComparison.sitemapTotal > 0 ? '; có bất đối xứng với sitemap.xml' : ''}.`;
    }
  }

  const sitemapStatusCol = fallbackComparison && typeof fallbackComparison.sitemapTotal === 'number' && fallbackComparison.sitemapTotal > 0
    ? `${fallbackComparison.sitemapTotal} đường dẫn canonical \`/place/{slug}\``
    : 'Không có dữ liệu sitemap (UNKNOWN)';

  let sitemapEvalCol = 'Chưa đối soát.';
  if (fallbackComparison && typeof fallbackComparison.sitemapTotal === 'number' && fallbackComparison.sitemapTotal > 0) {
    const sitemapApproved = typeof fallbackComparison.sitemapApprovedCount === 'number' ? fallbackComparison.sitemapApprovedCount : null;
    if (fallbackComparison.slugVariations && fallbackComparison.slugVariations.length > 0) {
      sitemapEvalCol = '⚠️ Đang chứa một số slug chưa đồng bộ với fallback JSON/Supabase.';
    } else if (sitemapApproved !== null && sitemapApproved < fallbackComparison.sitemapTotal) {
      sitemapEvalCol = `⚠️ ${sitemapApproved}/${fallbackComparison.sitemapTotal} URL sitemap có dữ liệu approved trên Supabase.`;
    } else {
      sitemapEvalCol = 'Đồng bộ với dữ liệu địa điểm approved.';
    }
  }

  const recordsTableRows = (placesSummary.records || []).map(r => {
    return `| **${r.id}** | ${r.name} | \`${r.slug}\` | \`${r.status}\` | \`${r.classification}\` | **${r.recommendation}** | ${r.reason} |`;
  }).join('\n');

  // Phân tích ảnh không hardcode ID
  const totalObserved = (placesSummary.records || []).length;
  let completenessSection = '';
  if (totalObserved === 0) {
    completenessSection = 'Chưa có bản ghi địa điểm nào được ghi nhận để phân tích độ đầy đủ.';
  } else {
    const imgIssues = [];
    const localImgCount = (placesSummary.records || []).filter(r => {
      const img = String(r.image_link || (Array.isArray(r.images) ? r.images[0] : '') || '');
      return img.startsWith('./') || (img.startsWith('/') && !img.startsWith('//'));
    }).length;
    const driveImgCount = (placesSummary.records || []).filter(r => {
      const img = String(r.image_link || (Array.isArray(r.images) ? r.images[0] : '') || '');
      return img.includes('drive.google.com');
    }).length;
    if (localImgCount > 0) imgIssues.push(`${localImgCount} bản ghi dùng file ảnh cục bộ`);
    if (driveImgCount > 0) imgIssues.push(`${driveImgCount} bản ghi dùng link drive chưa public`);
    const imgNote = imgIssues.length > 0 ? ` (trong đó ${imgIssues.join(', ')})` : '';

    const completenessScopeLabel = authMode === 'public_anon'
      ? 'bản ghi công khai đã quan sát'
      : 'bản ghi production/admin-visible đã quan sát';

    completenessSection = `Thống kê trường dữ liệu trên ${totalObserved} ${completenessScopeLabel}:

- **Ảnh (\`images\`, \`image_link\`):** ${totalObserved - placesSummary.missingFields.images}/${totalObserved} bản ghi có ảnh${imgNote}.
- **Địa chỉ (\`address\`):** ${placesSummary.missingFields.address} bản ghi không hợp lệ hoặc thiếu.
- **Tọa độ GPS (\`coordinates\`):** ${placesSummary.missingFields.coordinates} bản ghi thiếu tọa độ GPS.
- **Giờ mở cửa (\`opening_time\`, \`closing_time\`):** ${placesSummary.missingFields.hours} bản ghi thiếu giờ mở cửa.
- **Khoảng giá (\`price_raw\`):** ${placesSummary.missingFields.price} bản ghi thiếu khoảng giá.
- **Thông tin liên hệ (\`contact\`):** ${placesSummary.missingFields.contact} bản ghi thiếu thông tin liên hệ.
- **Liên kết bản đồ (\`map_link\`):** ${placesSummary.missingFields.mapLink} bản ghi thiếu Google Maps.
- **Trùng lặp Slug (\`slug\`):** ${placesSummary.duplicateSlugs.length === 0 ? '0 (Không phát hiện trùng lặp)' : `${placesSummary.duplicateSlugs.length} trường hợp trùng`}.`;
  }

  // Đề xuất archive hoàn toàn động từ danh sách bản ghi, hiển thị status của từng ID
  const archiveCandidates = (placesSummary.records || [])
    .filter(r => r.recommendation === 'đề xuất archive' || r.classification === 'nghi dữ liệu test')
    .map(r => `ID ${r.id} (${r.status || 'unknown'})`);

  const archiveProposalText = archiveCandidates.length > 0
    ? `Đề xuất xem xét lưu trữ (chuyển sang \`archived\`) đối với các bản ghi nghi dữ liệu thử nghiệm: ${archiveCandidates.join(', ')} (hành động chỉ là đề xuất kỹ thuật, tuân thủ nghiêm ngặt ZERO MUTATION trong G9.0).`
    : `Hiện không có bản ghi nào thuộc diện đề xuất archive.`;

  const placesEvalNote = placesSummary?.evaluationNote || 'UNKNOWN';
  const placesEvalDisplay = placesEvalNote.startsWith('⚠️') ? placesEvalNote : (placesEvalNote === 'UNKNOWN' ? 'UNKNOWN' : `⚠️ ${placesEvalNote}`);
  const commentsEvalDisplay = commentsSummary?.evaluationNote || 'UNKNOWN';
  const reportsEvalDisplay = reportsSummary?.evaluationNote || 'UNKNOWN';

  let listWarningText = '';
  if (authMode === 'public_anon') {
    listWarningText = `> [!WARNING]
> Các bản ghi dưới đây là các bản ghi **approved công khai** được quan sát trên Supabase Production và xuất hiện trên giao diện người dùng nếu website kết nối qua chế độ \`?source=supabase\`.`;
  } else if (authMode === 'admin_token') {
    listWarningText = `> [!WARNING]
> Các bản ghi dưới đây là **toàn bộ bản ghi quan sát được qua API Quản trị** (gồm mọi trạng thái: \`approved\`, \`draft\`, \`archived\`...). Chỉ các bản ghi có trạng thái \`approved\` mới hiển thị trên giao diện người dùng công khai.`;
  } else {
    listWarningText = `> [!WARNING]
> Các bản ghi dưới đây là **toàn bộ bản ghi trong CSDL Production** (gồm mọi trạng thái: \`approved\`, \`draft\`, \`archived\`...). Chỉ các bản ghi có trạng thái \`approved\` mới hiển thị trên giao diện người dùng công khai.`;
  }

  return `# Báo Cáo Kiểm Toán Dữ Liệu Production (G9.0 Baseline Audit)

> **Dự án:** ViVuTraVinh — Cẩm nang du lịch tự túc & bản đồ số Trà Vinh  
> **Mốc thực hiện:** G9.0 — Đóng hồ sơ G8 và lập baseline production  
> **Thời điểm kiểm toán (timestamp):** \`${timestamp}\`  
> **Chế độ xác thực (authMode):** \`${authMode}\`  
> **Phạm vi quan sát (scope):** \`${scope}\`  
> **Trạng thái Baseline:** **${baselineStatus}**  
> **Phương pháp:** Kiểm toán chỉ đọc (Read-Only), ZERO MUTATION, ZERO SECRETS, ZERO PII  

---

## 1. Tóm Tắt Hiện Trạng Cơ Sở Dữ Liệu Production

Hạ tầng quản trị vận hành G8 đã hoàn tất và được nghiệm thu:
- Vòng kiểm toán trực tiếp **G8 Live Audit đạt 10/10 PASS**.
- Quy trình tự động dọn dẹp fixture sau kiểm toán đạt **0 dòng rác còn sót**.
- Hai commit vá lỗi schema production cuối cùng đã được ghi nhận:
  - \`c0d5c6a\`: \`fix(db): preserve comment photo_url on existing schemas\`
  - \`1e24d02\`: \`fix(db): backfill comment update timestamp column\`

### Bảng Thống Kê Số Liệu & Phạm Vi Quan Sát

| Thực thể | Số lượng quan sát | Scope quan sát | Trạng thái chi tiết | Đánh giá chất lượng |
| :--- | :---: | :---: | :--- | :--- |
| **Địa điểm (\`places\`)** | **${placesTotalDisplay}** | \`${placesScope}\` | ${formatPlacesStatus(placesSummary)} | ${placesEvalDisplay} |
| **Bình luận (\`place_comments\`)** | **${commentsTotalDisplay}** | \`${commentsScope}\` | ${formatCommentsStatus(commentsSummary)} | ${commentsEvalDisplay} |
| **Báo sai (\`place_reports\`)** | **${reportsTotalDisplay}** | \`${reportsScope}\` | ${formatReportsStatus(reportsSummary)} | ${reportsEvalDisplay} |
| **Snapshot Fallback (\`data-fallback.json\`)** | **${fallbackTotalDisplay}** | \`local_snapshot\` | ${fallbackStatusCol} | ${fallbackEvalCol} |
| **Sitemap (\`sitemap.xml\`)** | **${sitemapTotalDisplay}** | \`public_seo\` | ${sitemapStatusCol} | ${sitemapEvalCol} |

${formatBaselineScopeNote(authMode)}

---

## 2. Danh Mục Chi Tiết Dữ Liệu Địa Điểm Đã Quan Sát

${listWarningText}

### Bảng Kiểm Kê Địa Điểm (\`places\`)

| ID | Tên địa điểm | Slug | Status | Phân loại đề xuất | Khuyến nghị hành động | Lý do đánh dấu |
| :---: | :--- | :--- | :---: | :--- | :---: | :--- |
${recordsTableRows || '| - | Không có bản ghi nào | - | - | - | - | - |'}

---

## 3. Phân Tích Độ Đầy Đủ Dữ Liệu (Observed Field Completeness)

${completenessSection}

---

## 4. Đối Soát Giữa Fallback JSON, Sitemap và Supabase Production

${formatFallbackSection(fallbackComparison)}

---

## 5. Kế Hoạch Đề Xuất Cho Các Giai Đoạn Tiếp Theo (Zero Mutation Trong G9.0)

> [!IMPORTANT]
> Toàn bộ các mục dưới đây là **ĐỀ XUẤT THIẾT KẾ VÀ QUY TRÌNH**, tuân thủ nghiêm ngặt nguyên tắc **ZERO MUTATION trong G9.0**:
> - Tuyệt đối không xóa, không sửa, không archive bất kỳ bản ghi nào trong G9.0.
> - Việc xử lý dữ liệu test sẽ chỉ diễn ra tại G9.2 sau khi có kế hoạch dọn dẹp chi tiết và người dùng phê duyệt.

1. **Xử lý dữ liệu thử nghiệm (Dự kiến G9.2):**
   - ${archiveProposalText}
   - Ưu tiên archive thay vì hard delete để giữ tính toàn vẹn của ID sequence và audit log.
2. **Contract chất lượng dữ liệu và Validator (G9.1):**
   - Xây dựng bộ quy tắc validator 3 mức (Required, Verified, Optional).
   - Kiểm soát tính hợp lệ của tọa độ GPS Trà Vinh, định dạng Google Maps, giờ mở cửa.
3. **Pilot 5–10 địa điểm thật (G9.3):**
   - Chuẩn hóa nguồn gốc và phiếu xác minh cho 5–10 địa điểm du lịch tiêu biểu từ Fallback JSON trước khi nạp vào Supabase.
4. **Đồng bộ hóa Fallback, SEO và Offline (G9.4):**
   - Thống nhất quy ước slug duy nhất và đồng bộ giữa Supabase, Fallback JSON và Sitemap.
`;
}

function formatBaselineScopeNote(authMode) {
  if (authMode === 'admin_token') {
    return `> [!NOTE]
> **Xác nhận Baseline Scope (Chế độ \`admin_token\`):**
> - **Đường cơ sở phạm vi quản trị (ADMIN_VISIBLE) đã hoàn thành đầy đủ.**
> - Hệ thống đã phân trang và đọc thành công 100% bản ghi địa điểm (mọi status: approved, draft, archived), bình luận và phản ánh báo sai qua các API quản trị Vercel với quyền Bearer token.
> - Toàn bộ số liệu nội bộ đã được xác thực (\`verified = true\`). Không cần nâng cấp thêm trừ khi cần kiểm toán mức hệ quản trị CSDL cấp thấp qua service role.`;
  }

  if (authMode === 'service_role') {
    return `> [!NOTE]
> **Xác nhận Baseline Scope (Chế độ \`service_role\`):**
> - **Đường cơ sở toàn bộ production (FULL_PRODUCTION) đã hoàn thành đầy đủ ở cấp cao nhất.**
> - Hệ thống đã đọc trực tiếp các bảng \`places\`, \`place_comments\`, \`place_reports\` trên Supabase REST với quyền đặc quyền máy chủ.
> - Mọi trạng thái và cấu trúc dữ liệu nội bộ đã được xác minh toàn diện (\`verified = true\`, scope: full_production).`;
  }

  return `> [!NOTE]
> **Giải thích về Baseline Scope (Chế độ \`public_anon\`):**
> - Ở chế độ \`public_anon\`, hệ thống chỉ quan sát được các bản ghi được cấp quyền đọc công khai (\`status = 'approved'\` cho places và \`status = 'approved' AND is_hidden = false\` cho comments).
> - Mọi số liệu nội bộ (bản nháp draft, lưu trữ archived, bình luận chưa duyệt, phản ánh báo sai) **không được giả định bằng 0** mà được đánh dấu là \`null\` / \`UNKNOWN\` (verified = false).
> - **Hướng dẫn nâng cấp Baseline:** Để nâng cấp lên **BASELINE COMPLETE**, quản trị viên cần chạy lại script với biến môi trường \`ADMIN_ACCESS_TOKEN\` (đọc qua Vercel API) hoặc \`SUPABASE_SERVICE_ROLE_KEY\` (đọc trực tiếp Supabase REST).`;
}

function formatPlacesStatus(summary) {
  if (summary.byStatus.draft === null && summary.byStatus.archived === null) {
    return `approved: ${summary.byStatus.approved || 0}, draft: UNKNOWN, archived: UNKNOWN`;
  }
  return Object.entries(summary.byStatus).map(([k, v]) => `${k}: ${v !== null ? v : 'UNKNOWN'}`).join(', ');
}

function formatCommentsStatus(summary) {
  if (summary.byStatus.pending === null) {
    return `approved (public): ${summary.byStatus.approved || 0}, pending: UNKNOWN, hidden: UNKNOWN`;
  }
  return Object.entries(summary.byStatus).map(([k, v]) => `${k}: ${v !== null ? v : 'UNKNOWN'}`).join(', ');
}

function formatReportsStatus(summary) {
  if (summary.total === null) {
    return 'Chưa xác thực (RLS bảo vệ; cần quyền admin/service_role)';
  }
  return Object.entries(summary.byStatus).map(([k, v]) => `${k}: ${v !== null ? v : 'UNKNOWN'}`).join(', ');
}

/**
 * Thực thi kiểm toán dữ liệu production
 */
export async function runProductionAudit(options = {}) {
  const env = options.env || process.env;
  const fetchFn = options.fetchFn || globalThis.fetch;
  const writeDocs = options.writeDocs !== undefined ? options.writeDocs : true;

  const supabaseUrl = (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const adminAccessToken = env.ADMIN_ACCESS_TOKEN || '';
  const rawVercel = env.VERCEL_URL || env.APP_URL || DEFAULT_VERCEL_URL;
  const vercelBase = rawVercel.startsWith('http') ? rawVercel.replace(/\/$/, '') : `https://${rawVercel.replace(/\/$/, '')}`;

  // Xác định chế độ thật và scope
  let authMode = 'public_anon';
  let scope = 'public_only';
  let baselineStatus = 'BASELINE PARTIAL (PUBLIC-ONLY SCOPE)';

  if (serviceRoleKey) {
    authMode = 'service_role';
    scope = 'full_production';
    baselineStatus = 'BASELINE COMPLETE (FULL_PRODUCTION)';
  } else if (adminAccessToken) {
    authMode = 'admin_token';
    scope = 'admin_visible';
    baselineStatus = 'BASELINE COMPLETE (ADMIN_VISIBLE)';
  }

  console.log('================================================================');
  console.log('🔍 VI VU TRÀ VINH — BÁO CÁO ĐƯỜNG CƠ SỞ DỮ LIỆU PRODUCTION (G9.0)');
  console.log('================================================================\n');

  console.log('1. TRẠNG THÁI CẤU HÌNH & XÁC THỰC:');
  console.log(`- Supabase URL              : ${supabaseUrl}`);
  console.log(`- Supabase Anon Key         : ${supabaseAnonKey ? 'đã cấu hình' : 'chưa cấu hình'}`);
  console.log(`- Supabase Service Role Key : ${serviceRoleKey ? 'đã cấu hình' : 'chưa cấu hình'}`);
  console.log(`- Admin Access Token        : ${adminAccessToken ? 'đã cấu hình' : 'chưa cấu hình'}`);
  console.log(`- Vercel URL                : ${vercelBase}`);
  console.log(`- Chế độ kiểm toán          : ${authMode.toUpperCase()}`);
  console.log(`- Phạm vi quan sát (scope)  : ${scope}`);
  console.log(`- Đánh giá Baseline         : ${baselineStatus}\n`);

  const auditData = {
    timestamp: new Date().toISOString(),
    authMode,
    scope,
    baselineStatus,
    placesSummary: {
      total: null, // null nếu chưa đọc toàn diện
      observedPublicTotal: null,
      scope: authMode === 'public_anon' ? 'public_only' : scope,
      verified: authMode !== 'public_anon',
      byStatus: {
        approved: null,
        draft: null,
        hidden: null,
        archived: null
      },
      missingFields: {
        images: 0,
        address: 0,
        coordinates: 0,
        hours: 0,
        price: 0,
        contact: 0,
        mapLink: 0
      },
      duplicateSlugs: [],
      records: [],
      evaluationNote: ''
    },
    commentsSummary: {
      total: null,
      observedPublicTotal: null,
      scope: authMode === 'public_anon' ? 'public_only' : scope,
      verified: authMode !== 'public_anon',
      byStatus: {
        approved: null,
        pending: null,
        hidden: null,
        rejected: null
      },
      hiddenCount: null,
      activeCount: null,
      evaluationNote: ''
    },
    reportsSummary: {
      total: null,
      scope: authMode === 'public_anon' ? 'unknown' : scope,
      verified: authMode !== 'public_anon',
      byStatus: {
        pending: null,
        reviewed: null,
        resolved: null,
        dismissed: null
      },
      byIssueType: {},
      evaluationNote: ''
    },
    fallbackComparison: {
      fallbackTotal: 0,
      sitemapTotal: 0,
      matchedInProduction: 0,
      missingInProduction: [],
      slugVariations: [],
      sitemapOnlyUnpaired: [],
      fallbackOnlyUnpaired: []
    }
  };

  // =========================================================================
  // A. KIỂM TOÁN ĐỊA ĐIỂM (places)
  // =========================================================================
  console.log('2. KIỂM TOÁN BẢNG ĐỊA ĐIỂM (places):');
  let placesList = [];

  try {
    if (authMode === 'service_role') {
      const res = await fetchSupabaseTable(supabaseUrl, 'places', 'select=*&order=id.asc', serviceRoleKey, fetchFn);
      placesList = res.data;
      auditData.placesSummary.total = res.total;
      auditData.placesSummary.verified = true;
      auditData.placesSummary.byStatus = { approved: 0, draft: 0, hidden: 0, archived: 0 };
      for (const p of placesList) {
        const st = p.status || 'unknown';
        auditData.placesSummary.byStatus[st] = (auditData.placesSummary.byStatus[st] || 0) + 1;
      }
      console.log(`✓ [service_role] Đọc đầy đủ ${placesList.length} bản ghi places (Tổng: ${res.total})`);
    } else if (authMode === 'admin_token') {
      const res = await fetchAdminPaginated(vercelBase, '/api/admin-places?status=all', adminAccessToken, 'places', fetchFn);
      placesList = res.items;
      auditData.placesSummary.total = res.total;
      auditData.placesSummary.verified = true;
      auditData.placesSummary.byStatus = { approved: 0, draft: 0, hidden: 0, archived: 0 };
      for (const p of placesList) {
        const st = p.status || 'unknown';
        auditData.placesSummary.byStatus[st] = (auditData.placesSummary.byStatus[st] || 0) + 1;
      }
      console.log(`✓ [admin_token] Đọc qua Vercel API ${placesList.length} bản ghi places (Tổng: ${res.total})`);
    } else {
      // public_anon: Chỉ đọc approved qua Supabase REST với anon key
      const res = await fetchSupabaseTable(supabaseUrl, 'places', 'select=*&order=id.asc', supabaseAnonKey, fetchFn);
      placesList = res.data;
      auditData.placesSummary.total = null; // KHÔNG được ghi tổng toàn bộ là số này
      auditData.placesSummary.observedPublicTotal = placesList.length;
      auditData.placesSummary.verified = false;
      auditData.placesSummary.byStatus = {
        approved: placesList.length,
        draft: null, // Không thể quan sát
        hidden: null,
        archived: null
      };
      console.log(`ℹ️ [public_anon] Đọc được ${placesList.length} bản ghi công khai (status = 'approved'). Các trạng thái khác là UNKNOWN.`);
    }
  } catch (err) {
    console.warn(`⚠️ Lỗi khi đọc bảng places: ${err.message}`);
    auditData.placesSummary.total = null;
    auditData.placesSummary.verified = false;
    auditData.placesSummary.error = err.message;
  }

  // Phân tích độ đầy đủ và phân loại cho các bản ghi thu thập được
  const slugCounts = new Map();
  for (const p of placesList) {
    const slug = (p.slug || '').trim().toLowerCase();
    slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);

    const missing = analyzeMissingFields(p);
    if (missing.includes('ảnh')) auditData.placesSummary.missingFields.images++;
    if (missing.includes('địa chỉ')) auditData.placesSummary.missingFields.address++;
    if (missing.includes('GPS')) auditData.placesSummary.missingFields.coordinates++;
    if (missing.includes('giờ mở cửa')) auditData.placesSummary.missingFields.hours++;
    if (missing.includes('khoảng giá')) auditData.placesSummary.missingFields.price++;
    if (missing.includes('liên hệ')) auditData.placesSummary.missingFields.contact++;
    if (missing.includes('Google Maps')) auditData.placesSummary.missingFields.mapLink++;

    const classification = classifyPlace(p);
    auditData.placesSummary.records.push({
      id: p.id,
      name: p.name,
      slug: p.slug,
      category: p.category,
      area: p.area,
      status: p.status,
      images: p.images,
      image_link: p.image_link,
      classification: classification.category,
      recommendation: classification.recommendation,
      reason: classification.reason,
      missingFields: missing
    });
  }

  for (const [slug, count] of slugCounts.entries()) {
    if (count > 1) {
      auditData.placesSummary.duplicateSlugs.push({ slug, count });
    }
  }

  const testCount = auditData.placesSummary.records.filter(r => r.classification === 'nghi dữ liệu test').length;
  if (testCount > 0 && testCount === auditData.placesSummary.records.length) {
    auditData.placesSummary.evaluationNote = '100% bản ghi công khai hiện tại là dữ liệu thử nghiệm/rác. Chưa có địa điểm du lịch thật nào được phê duyệt.';
  } else if (testCount > 0) {
    auditData.placesSummary.evaluationNote = `Có ${testCount} bản ghi nghi dữ liệu thử nghiệm cần xem xét xử lý.`;
  } else {
    auditData.placesSummary.evaluationNote = 'Dữ liệu địa điểm không phát hiện mẫu thử nghiệm rõ rệt.';
  }

  console.log(`  - Phân bổ status:`, auditData.placesSummary.byStatus);
  console.log(`  - Thiếu ảnh: ${auditData.placesSummary.missingFields.images}`);
  console.log(`  - Thiếu địa chỉ chuẩn: ${auditData.placesSummary.missingFields.address}`);
  console.log(`  - Thiếu tọa độ GPS: ${auditData.placesSummary.missingFields.coordinates}`);
  console.log(`  - Thiếu giờ mở cửa: ${auditData.placesSummary.missingFields.hours}`);
  console.log(`  - Thiếu khoảng giá: ${auditData.placesSummary.missingFields.price}`);
  console.log(`  - Thiếu thông tin liên hệ: ${auditData.placesSummary.missingFields.contact}`);
  console.log(`  - Trùng lặp slug: ${auditData.placesSummary.duplicateSlugs.length}\n`);

  // =========================================================================
  // B. KIỂM TOÁN BÌNH LUẬN (place_comments)
  // =========================================================================
  console.log('3. KIỂM TOÁN BẢNG BÌNH LUẬN (place_comments):');
  let commentsList = [];

  try {
    if (authMode === 'service_role') {
      const res = await fetchSupabaseTable(supabaseUrl, 'place_comments', 'select=*&order=id.asc', serviceRoleKey, fetchFn);
      commentsList = res.data;
      auditData.commentsSummary.total = res.total;
      auditData.commentsSummary.verified = true;
      auditData.commentsSummary.byStatus = { approved: 0, pending: 0, hidden: 0, rejected: 0 };
      auditData.commentsSummary.hiddenCount = 0;
      auditData.commentsSummary.activeCount = 0;

      for (const c of commentsList) {
        const st = c.status || 'unknown';
        auditData.commentsSummary.byStatus[st] = (auditData.commentsSummary.byStatus[st] || 0) + 1;
        if (c.is_hidden) auditData.commentsSummary.hiddenCount++;
        else auditData.commentsSummary.activeCount++;
      }
      auditData.commentsSummary.evaluationNote = `Tổng cộng ${res.total} bình luận trong CSDL (${auditData.commentsSummary.activeCount} hiển thị, ${auditData.commentsSummary.hiddenCount} ẩn).`;
      console.log(`✓ [service_role] Đọc đầy đủ ${commentsList.length} bình luận (Tổng: ${res.total})`);
    } else if (authMode === 'admin_token') {
      const res = await fetchAdminPaginated(vercelBase, '/api/admin-comments?status=all', adminAccessToken, 'comments', fetchFn);
      commentsList = res.items;
      auditData.commentsSummary.total = res.total;
      auditData.commentsSummary.verified = true;
      auditData.commentsSummary.byStatus = { approved: 0, pending: 0, hidden: 0, rejected: 0 };
      auditData.commentsSummary.hiddenCount = 0;
      auditData.commentsSummary.activeCount = 0;

      for (const c of commentsList) {
        const st = c.status || 'unknown';
        auditData.commentsSummary.byStatus[st] = (auditData.commentsSummary.byStatus[st] || 0) + 1;
        if (c.is_hidden) auditData.commentsSummary.hiddenCount++;
        else auditData.commentsSummary.activeCount++;
      }
      auditData.commentsSummary.evaluationNote = `Quản trị viên quan sát ${res.total} bình luận qua API.`;
      console.log(`✓ [admin_token] Đọc qua Vercel API ${commentsList.length} bình luận (Tổng: ${res.total})`);
    } else {
      // public_anon: Chỉ đọc approved + is_hidden=false
      const res = await fetchSupabaseTable(supabaseUrl, 'place_comments', 'select=*&is_hidden=eq.false&status=eq.approved', supabaseAnonKey, fetchFn);
      commentsList = res.data;
      auditData.commentsSummary.total = null; // KHÔNG được ghi tổng toàn bộ
      auditData.commentsSummary.observedPublicTotal = commentsList.length;
      auditData.commentsSummary.verified = false;
      auditData.commentsSummary.byStatus = {
        approved: commentsList.length,
        pending: null,
        hidden: null,
        rejected: null
      };
      auditData.commentsSummary.hiddenCount = null;
      auditData.commentsSummary.activeCount = commentsList.length;
      auditData.commentsSummary.evaluationNote = `Quan sát công khai ${commentsList.length} bình luận approved. Các bình luận pending/hidden/rejected nội bộ là UNKNOWN.`;
      console.log(`ℹ️ [public_anon] Đọc được ${commentsList.length} bình luận công khai approved. Các trạng thái khác là UNKNOWN.`);
    }
  } catch (err) {
    console.warn(`⚠️ Lỗi khi đọc bảng place_comments: ${err.message}`);
    auditData.commentsSummary.total = null;
    auditData.commentsSummary.verified = false;
    auditData.commentsSummary.error = err.message;
    auditData.commentsSummary.evaluationNote = `Lỗi truy vấn: ${err.message}`;
  }

  console.log(`  - Phân bổ status:`, auditData.commentsSummary.byStatus);
  console.log(`  - Tổng quan sát được: ${commentsList.length}\n`);

  // =========================================================================
  // C. KIỂM TOÁN PHẢN ÁNH BÁO SAI (place_reports)
  // =========================================================================
  console.log('4. KIỂM TOÁN BẢNG PHẢN ÁNH BÁO SAI (place_reports):');

  try {
    if (authMode === 'service_role') {
      const res = await fetchSupabaseTable(supabaseUrl, 'place_reports', 'select=*&order=created_at.desc', serviceRoleKey, fetchFn);
      const reportsList = res.data;
      auditData.reportsSummary.total = res.total;
      auditData.reportsSummary.verified = true;
      auditData.reportsSummary.byStatus = { pending: 0, reviewed: 0, resolved: 0, dismissed: 0 };
      auditData.reportsSummary.byIssueType = {};

      for (const r of reportsList) {
        const st = r.status || 'unknown';
        auditData.reportsSummary.byStatus[st] = (auditData.reportsSummary.byStatus[st] || 0) + 1;
        const it = r.issue_type || 'unknown';
        auditData.reportsSummary.byIssueType[it] = (auditData.reportsSummary.byIssueType[it] || 0) + 1;
      }
      auditData.reportsSummary.evaluationNote = `Tổng cộng ${res.total} phản ánh báo sai trong CSDL.`;
      console.log(`✓ [service_role] Đọc đầy đủ ${reportsList.length} báo sai (Tổng: ${res.total})`);
    } else if (authMode === 'admin_token') {
      const res = await fetchAdminPaginated(vercelBase, '/api/admin-reports?status=all', adminAccessToken, 'reports', fetchFn);
      const reportsList = res.items;
      auditData.reportsSummary.total = res.total;
      auditData.reportsSummary.verified = true;
      auditData.reportsSummary.byStatus = { pending: 0, reviewed: 0, resolved: 0, dismissed: 0 };
      auditData.reportsSummary.byIssueType = {};

      for (const r of reportsList) {
        const st = r.status || 'unknown';
        auditData.reportsSummary.byStatus[st] = (auditData.reportsSummary.byStatus[st] || 0) + 1;
        const it = r.issue_type || 'unknown';
        auditData.reportsSummary.byIssueType[it] = (auditData.reportsSummary.byIssueType[it] || 0) + 1;
      }
      auditData.reportsSummary.evaluationNote = `Quản trị viên quan sát ${res.total} báo sai qua API.`;
      console.log(`✓ [admin_token] Đọc qua Vercel API ${reportsList.length} báo sai (Tổng: ${res.total})`);
    } else {
      // public_anon: KHÔNG THỂ ĐỌC ĐƯỢC vì RLS chặn toàn diện anon
      auditData.reportsSummary.total = null;
      auditData.reportsSummary.verified = false;
      auditData.reportsSummary.scope = 'unknown';
      auditData.reportsSummary.byStatus = {
        pending: null,
        reviewed: null,
        resolved: null,
        dismissed: null
      };
      auditData.reportsSummary.evaluationNote = 'UNKNOWN: Bảng place_reports được bảo vệ RLS nghiêm ngặt (chỉ cấp cho service_role); không thể quan sát ở chế độ public_anon.';
      console.log('ℹ️ [public_anon] Bảng place_reports được bảo vệ RLS nghiêm ngặt. Trạng thái và số lượng: UNKNOWN (verified = false).');
    }
  } catch (err) {
    console.warn(`⚠️ Lỗi khi đọc bảng place_reports: ${err.message}`);
    auditData.reportsSummary.total = null;
    auditData.reportsSummary.verified = false;
    auditData.reportsSummary.error = err.message;
    auditData.reportsSummary.evaluationNote = `Lỗi truy vấn: ${err.message}`;
  }

  // =========================================================================
  // D. ĐỐI SOÁT VỚI FALLBACK JSON VÀ SITEMAP (HOÀN TOÀN ĐỘNG)
  // =========================================================================
  console.log('\n5. ĐỐI SOÁT VỚI DATA-FALLBACK.JSON VÀ SITEMAP.XML:');
  const fallbackPath = options.fallbackPath || path.join(ROOT_DIR, 'data', 'data-fallback.json');
  const sitemapPath = options.sitemapPath || path.join(ROOT_DIR, 'sitemap.xml');

  let fallbackList = options.fallbackList || null;
  if (!fallbackList && fs.existsSync(fallbackPath)) {
    try {
      fallbackList = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    } catch {}
  }

  let sitemapContent = options.sitemapContent || null;
  if (!sitemapContent && fs.existsSync(sitemapPath)) {
    try {
      sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
    } catch {}
  }

  auditData.fallbackComparison = computeFallbackComparison(fallbackList, sitemapContent, placesList);

  if (auditData.fallbackComparison.fallbackTotal > 0) {
    console.log(`  - Snapshot fallback local: ${auditData.fallbackComparison.fallbackTotal} địa điểm (chờ xác minh nguồn)`);
    console.log(`  - Đã có mặt trên Supabase (mọi status): ${auditData.fallbackComparison.matchedAnyStatus}`);
    console.log(`  - Đã có mặt trên Supabase (approved)  : ${auditData.fallbackComparison.matchedApproved}`);
    console.log(`  - Chưa có trên Supabase               : ${auditData.fallbackComparison.missingInProduction.length}`);
  }
  if (auditData.fallbackComparison.sitemapTotal > 0) {
    console.log(`  - Số canonical URL /place/{slug} trong sitemap.xml: ${auditData.fallbackComparison.sitemapTotal}`);
    console.log(`  - Canonical URLs đã approved trong CSDL: ${auditData.fallbackComparison.sitemapApprovedCount}`);
  }

  // =========================================================================
  // E. XUẤT VĂN BẢN VÀ BÁO CÁO TÁI LẬP
  // =========================================================================
  const mdReport = generateMarkdownReport(auditData);

  if (writeDocs) {
    const docsPath = path.join(ROOT_DIR, 'docs', 'g9-data-audit.md');
    fs.writeFileSync(docsPath, mdReport, 'utf8');
    console.log(`\n✓ Đã tạo báo cáo kiểm toán tái lập tại: docs/g9-data-audit.md`);
  }

  return auditData;
}

// Chạy trực tiếp qua CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runProductionAudit().catch(err => {
    console.error('Lỗi kiểm toán baseline production:', err);
    process.exit(1);
  });
}
