#!/usr/bin/env node

/**
 * scripts/audit-g9-pilot-links.js
 *
 * Công cụ kiểm toán độc lập tình trạng liên kết nguồn Pilot G9.3A (Live Link & Semantic Auditor):
 * - CHỈ ĐỌC (Read-Only): Tuyệt đối KHÔNG thực hiện mutation dữ liệu (Zero Mutation Guard).
 * - Kiểm tra thực tế bằng HTTP GET với cơ chế timeout (8000ms), theo dõi redirect sâu (tối đa 5 lần) và giải nén gzip.
 * - Thẩm định ngữ nghĩa nội dung (Semantic Relevance Analysis):
 *   + Trích xuất page_title và so sánh với từ khóa thực thể dự kiến.
 *   + Phát hiện và gắn nhãn redirected_unrelated khi bài viết bị chuyển hướng sang đề tài không liên quan (giá vàng, trộm chó, thịt heo nhập khẩu...).
 *   + Phát hiện content_mismatch khi bài viết không liên quan đến thực thể.
 *   + Kiểm tra OpenStreetMap:
 *     * /search?query=lat,lng: gắn nhãn content_mismatch vì là truy vấn tìm kiếm, không chứng minh tọa độ thuộc địa điểm.
 *     * /node/, /way/, /relation/: gọi OSM API kiểm tra name và tags, nếu không khớp thực thể thì đánh content_mismatch.
 *   + active_relevant: HTTP 200 + nội dung/tags đúng thực thể.
 *   + dead: HTTP 404 hoặc chuyển hướng tới /404.
 *   + unreachable: Lỗi DNS (ENOTFOUND), chứng chỉ số TLS, hoặc quá hạn kết nối (ETIMEDOUT).
 *   + blocked: HTTP 401 hoặc 403.
 *   + unchecked: Chưa kiểm tra.
 * - Xuất báo cáo độc lập 3 chỉ số:
 *   1. Transport Reachable (Phản hồi hạ tầng mạng)
 *   2. Semantic Relevant (Nội dung đúng thực thể)
 *   3. Evidence Usable (Đủ điều kiện làm bằng chứng)
 * - In "31/31 checked" và số nguồn usable riêng (tuyệt đối không in "verified" khi có dead, unreachable hoặc mismatch).
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';

import {
  DEFAULT_CANDIDATES_PATH,
  checkNoMutationGuard
} from './audit-g9-pilot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CANDIDATE_KEYWORDS = Object.freeze({
  'pilot-01': ['ao bà om', 'ao ba om', 'ao vuông', 'ao vuong'],
  'pilot-02': ['chùa âng', 'chua ang', 'wat angkor', 'angkorajaborey'],
  'pilot-03': ['đền thờ bác hồ', 'den tho bac ho', 'chủ tịch hồ chí minh', 'bác hồ', 'long đức'],
  'pilot-04': ['bún nước lèo', 'bun nuoc leo', 'cô ba', 'co ba', 'hàng me'],
  'pilot-05': ['bánh tét', 'banh tet', 'trà cuôn', 'tra cuon', 'hai lý', 'hai ly'],
  'pilot-06': ['cafe 1985', 'cà phê 1985', '1985', 'sadela'],
  'pilot-07': ['huỳnh kha', 'huynh kha', 'sinh thái huỳnh kha'],
  'pilot-08': ['cồn chim', 'con chim'],
  'pilot-09': ['ba động', 'ba dong', 'biển ba động'],
  'pilot-10': ['chùa hang', 'chua hang', 'kompong chray', 'kompongchray']
});

export const KNOWN_UNRELATED_PATTERNS = Object.freeze([
  'thit-heo-nhap-khau',
  'thịt heo nhập khẩu',
  'gia-vang',
  'giá vàng',
  'trom-cho',
  'trộm chó',
  'phòng thủ chung',
  'đại lễ phật đản'
]);

export const FORBIDDEN_GENERIC_KEYWORDS = Object.freeze([
  'trà vinh',
  'tra vinh',
  'du lịch',
  'du lich',
  'ẩm thực',
  'am thuc',
  'địa điểm',
  'dia diem',
  'tỉnh trà vinh',
  'tinh tra vinh'
]);

export function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function normalizeText(str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase().normalize('NFC');
}

export function isGenericKeywordOnly(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = normalizeText(text);
  const cleaned = normalized.replace(/[,\.\-_\/\\\|]/g, ' ').trim();
  return FORBIDDEN_GENERIC_KEYWORDS.some(kw => cleaned === normalizeText(kw));
}

export function isSemanticMatch(text, candidateId) {
  if (!text || typeof text !== 'string') return false;
  if (isGenericKeywordOnly(text)) return false;
  const keywords = CANDIDATE_KEYWORDS[candidateId] || [];
  const normalized = normalizeText(text);
  return keywords.some(kw => {
    const normKw = normalizeText(kw);
    if (FORBIDDEN_GENERIC_KEYWORDS.some(fg => normKw === normalizeText(fg))) {
      return false;
    }
    return normalized.includes(normKw);
  });
}

export function isKnownUnrelated(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = normalizeText(text);
  return KNOWN_UNRELATED_PATTERNS.some(pat => normalized.includes(normalizeText(pat)));
}

/**
 * Thăm dò phần tử OpenStreetMap qua OSM API (OSM element có tên/tag khớp thực thể)
 */
export async function probeOsmElement(type, id, candidateId, options = {}) {
  const osmApiUrl = `https://api.openstreetmap.org/api/0.6/${type}/${id}.json`;
  try {
    const res = await fetch(osmApiUrl, {
      signal: AbortSignal.timeout(options.timeoutMs || 8000),
      headers: {
        'User-Agent': 'ViVuTraVinh-Audit/2.1 (contact: admin@vivutravinh.vn)',
        'Accept': 'application/json'
      }
    });

    if (res.status === 404) {
      return {
        osm_element_type: type,
        osm_element_id: Number(id),
        osm_name: null,
        osm_tags: null,
        status: 'dead',
        httpStatus: 404,
        error: `Phần tử OSM ${type}/${id} không tồn tại (HTTP 404)`
      };
    }

    if (!res.ok) {
      return {
        osm_element_type: type,
        osm_element_id: Number(id),
        osm_name: null,
        osm_tags: null,
        status: 'unreachable',
        httpStatus: res.status,
        error: `Lỗi kết nối OSM API: HTTP ${res.status}`
      };
    }

    const json = await res.json();
    const element = (json.elements && json.elements[0]) || {};
    const tags = element.tags || {};
    const osmName = tags.name || tags.alt_name || tags['name:vi'] || null;

    const matches = osmName ? isSemanticMatch(osmName, candidateId) : false;

    if (matches) {
      return {
        osm_element_type: type,
        osm_element_id: Number(id),
        osm_name: osmName,
        osm_tags: tags,
        status: 'active_relevant',
        httpStatus: 200,
        pageTitle: osmName,
        error: null
      };
    }

    return {
      osm_element_type: type,
      osm_element_id: Number(id),
      osm_name: osmName,
      osm_tags: tags,
      status: 'content_mismatch',
      httpStatus: 200,
      pageTitle: osmName || 'OSM Unnamed Element',
      error: `Phần tử OSM (${type} ${id}) có tên '${osmName || 'không tên'}' không khớp thực thể ${candidateId}`
    };
  } catch (err) {
    return {
      osm_element_type: type,
      osm_element_id: Number(id),
      osm_name: null,
      osm_tags: null,
      status: 'unreachable',
      httpStatus: null,
      error: `Lỗi kết nối OSM API: ${err.message}`
    };
  }
}

/**
 * Thăm dò liên kết mạng và thẩm định nội dung
 */
export async function probeUrl(urlStr, options = {}) {
  const candidateId = options.candidateId || 'unknown';

  // 1. Xử lý OpenStreetMap URLs
  if (urlStr.includes('openstreetmap.org')) {
    if (urlStr.includes('/search')) {
      return {
        url: urlStr,
        effectiveUrl: urlStr,
        httpStatus: 200,
        pageTitle: 'OpenStreetMap Search Query',
        sourceStatus: 'content_mismatch',
        osm_element_type: 'search',
        osm_element_id: null,
        osm_name: null,
        error: 'OSM search URL chỉ là trang tìm kiếm tọa độ, không đủ điều kiện làm bằng chứng tọa độ thực thể'
      };
    }

    const osmMatch = urlStr.match(/\/(node|way|relation)\/(\d+)/);
    if (osmMatch) {
      const [, osmType, osmId] = osmMatch;
      const osmRes = await probeOsmElement(osmType, osmId, candidateId, options);
      return {
        url: urlStr,
        effectiveUrl: urlStr,
        httpStatus: osmRes.httpStatus,
        pageTitle: osmRes.pageTitle || osmRes.osm_name,
        sourceStatus: osmRes.status,
        osm_element_type: osmRes.osm_element_type,
        osm_element_id: osmRes.osm_element_id,
        osm_name: osmRes.osm_name,
        osm_tags: osmRes.osm_tags,
        error: osmRes.error
      };
    }
  }

  // 2. Xử lý Web URLs qua HTTP/HTTPS fetch
  try {
    const res = await fetch(urlStr, {
      signal: AbortSignal.timeout(options.timeoutMs || 8000),
      headers: {
        'User-Agent': 'ViVuTraVinh-Audit/2.1 (data-quality-pilot; contact: admin@vivutravinh.vn)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    const effectiveUrl = res.url || urlStr;
    const effectiveLower = effectiveUrl.toLowerCase();

    // Phát hiện trang 404 hoặc trang lỗi
    if (
      res.status === 404 ||
      effectiveLower.endsWith('/404') ||
      effectiveLower.endsWith('/404.html') ||
      effectiveLower.includes('/404?') ||
      effectiveLower.includes('/404/') ||
      effectiveLower.endsWith('/error') ||
      effectiveLower.includes('/error?') ||
      effectiveLower.includes('/error/') ||
      effectiveLower.endsWith('/not-found') ||
      effectiveLower.includes('/not-found?')
    ) {
      return {
        url: urlStr,
        effectiveUrl,
        httpStatus: 404,
        pageTitle: '404 Not Found',
        sourceStatus: 'dead',
        error: 'Trang thông báo 404 Not Found (hoặc chuyển hướng tới trang lỗi)'
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        url: urlStr,
        effectiveUrl,
        httpStatus: res.status,
        pageTitle: null,
        sourceStatus: 'blocked',
        error: `HTTP ${res.status} Bị từ chối truy cập`
      };
    }

    if (res.status >= 400) {
      return {
        url: urlStr,
        effectiveUrl,
        httpStatus: res.status,
        pageTitle: null,
        sourceStatus: 'dead',
        error: `HTTP ${res.status} Lỗi máy khách/máy chủ`
      };
    }

    // Đọc HTML trích xuất title
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()) : '';
    const pageTitle = rawTitle.length > 0 ? rawTitle : null;

    // Phân tích ngữ nghĩa nội dung
    const isRedirected = effectiveUrl !== urlStr && !effectiveLower.endsWith('/');
    const titleOrUrlMatches = isSemanticMatch(pageTitle || '', candidateId) || isSemanticMatch(effectiveUrl, candidateId);
    const contentMatches = isSemanticMatch(html.slice(0, 100000), candidateId);
    const matchesEntity = titleOrUrlMatches || contentMatches;

    const hasKnownUnrelated = isKnownUnrelated(pageTitle || '') || isKnownUnrelated(effectiveUrl);

    if (hasKnownUnrelated || (isRedirected && !matchesEntity)) {
      return {
        url: urlStr,
        effectiveUrl,
        httpStatus: res.status,
        pageTitle,
        sourceStatus: 'redirected_unrelated',
        error: `Chuyển hướng sang bài viết không liên quan: '${pageTitle || effectiveUrl}'`
      };
    }

    if (!matchesEntity) {
      return {
        url: urlStr,
        effectiveUrl,
        httpStatus: res.status,
        pageTitle,
        sourceStatus: 'content_mismatch',
        error: `Nội dung/tiêu đề trang '${pageTitle || 'không có tiêu đề'}' không khớp thực thể ${candidateId}`
      };
    }

    return {
      url: urlStr,
      effectiveUrl,
      httpStatus: res.status,
      pageTitle,
      sourceStatus: 'active_relevant',
      error: null
    };
  } catch (err) {
    const errCode = err.cause?.code || err.code || 'NETWORK_ERROR';
    return {
      url: urlStr,
      effectiveUrl: null,
      httpStatus: null,
      pageTitle: null,
      sourceStatus: 'unreachable',
      error: `${errCode}: ${err.message}`
    };
  }
}

/**
 * Kiểm toán toàn diện liên kết nguồn Pilot G9.3A
 */
export async function auditCandidateLinks(filePath = DEFAULT_CANDIDATES_PATH, options = {}) {
  checkNoMutationGuard({ method: 'GET' });

  if (!fs.existsSync(filePath)) {
    throw new Error(`Không tìm thấy tệp hồ sơ tại: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const candidates = JSON.parse(raw);

  const urlMap = new Map(); // url -> Array of usages

  candidates.forEach(cand => {
    const candId = cand.id || 'unknown';

    (cand.source_urls || []).forEach(url => {
      if (!urlMap.has(url)) urlMap.set(url, []);
      urlMap.get(url).push({ candidateId: candId, location: 'source_urls' });
    });

    (cand.sources_metadata || []).forEach(meta => {
      if (meta && meta.url) {
        if (!urlMap.has(meta.url)) urlMap.set(meta.url, []);
        urlMap.get(meta.url).push({
          candidateId: candId,
          location: 'sources_metadata',
          declaredStatus: meta.source_status,
          declaredHttp: meta.http_status,
          declaredEffective: meta.effective_url,
          declaredTitle: meta.page_title
        });
      }
    });

    if (cand.field_sources && typeof cand.field_sources === 'object') {
      Object.entries(cand.field_sources).forEach(([fieldKey, list]) => {
        if (Array.isArray(list)) {
          list.forEach(item => {
            if (item && item.url) {
              if (!urlMap.has(item.url)) urlMap.set(item.url, []);
              urlMap.get(item.url).push({
                candidateId: candId,
                location: `field_sources.${fieldKey}`,
                declaredStatus: item.source_status,
                declaredHttp: item.http_status,
                declaredEffective: item.effective_url,
                declaredTitle: item.page_title
              });
            }
          });
        }
      });
    }
  });

  const uniqueUrls = Array.from(urlMap.keys());
  console.log(`=== BẮT ĐẦU KIỂM TOÁN LIÊN KẾT NGUỒN PILOT G9.3A (LIVE LINK & SEMANTIC AUDITOR) ===`);
  console.log(`Đường dẫn tệp: ${filePath}`);
  console.log(`Tổng số URL kiểm tra: ${uniqueUrls.length}`);
  console.log(`Chế độ: Thẩm định trạng thái mạng và tính liên quan nội dung (Semantic Relevance Analysis).\n`);

  const results = [];
  const mismatches = [];

  for (let i = 0; i < uniqueUrls.length; i++) {
    const url = uniqueUrls[i];
    const usages = urlMap.get(url) || [];
    const primaryCandidateId = usages[0]?.candidateId || 'unknown';

    const delay = url.includes('openstreetmap.org') ? 500 : 200;
    if (i > 0) await new Promise(r => setTimeout(r, delay));

    const probeRes = await probeUrl(url, { ...options, candidateId: primaryCandidateId });
    results.push(probeRes);

    // Đối chiếu với khai báo trong dataset
    for (const u of usages) {
      if (u.declaredStatus) {
        if (u.declaredStatus === 'active') {
          mismatches.push({
            url,
            candidateId: u.candidateId,
            location: u.location,
            issue: "DEPRECATED_ACTIVE_STATUS: Dữ liệu vẫn dùng nhãn 'active' thay vì active_relevant"
          });
        }
        if (probeRes.sourceStatus !== u.declaredStatus) {
          mismatches.push({
            url,
            candidateId: u.candidateId,
            location: u.location,
            issue: `STATUS_MISMATCH: Thực tế là '${probeRes.sourceStatus}' nhưng khai là '${u.declaredStatus}' (Ghi chú: ${probeRes.error || 'không lỗi'})`
          });
        }
      }
    }
  }

  // Phân loại tổng hợp
  const breakdown = {
    total: results.length,
    active_relevant: results.filter(r => r.sourceStatus === 'active_relevant').length,
    dead: results.filter(r => r.sourceStatus === 'dead').length,
    unreachable: results.filter(r => r.sourceStatus === 'unreachable').length,
    redirected_unrelated: results.filter(r => r.sourceStatus === 'redirected_unrelated').length,
    content_mismatch: results.filter(r => r.sourceStatus === 'content_mismatch').length,
    blocked: results.filter(r => r.sourceStatus === 'blocked').length,
    unchecked: results.filter(r => r.sourceStatus === 'unchecked').length
  };

  const transportReachable = results.filter(r => r.sourceStatus !== 'unreachable').length;
  const semanticRelevant = results.filter(r => r.sourceStatus === 'active_relevant').length;
  const evidenceUsable = breakdown.active_relevant;

  // In bảng kết quả chi tiết
  console.log('----------------------------------------------------------------------------------------------------------------------------------');
  console.log('| #  | Tình trạng             | HTTP | Tiêu đề / Mốc OSM                                | Lỗi / Ghi chú ngữ nghĩa                 |');
  console.log('----------------------------------------------------------------------------------------------------------------------------------');
  results.forEach((r, idx) => {
    const idxStr = String(idx + 1).padStart(2, ' ');
    const statusStr = r.sourceStatus.toUpperCase().padEnd(22, ' ');
    const httpStr = (r.httpStatus !== null && r.httpStatus !== undefined ? String(r.httpStatus) : '---').padEnd(4, ' ');
    const titleDisplay = (r.pageTitle || r.osm_name || '(Không có tiêu đề)').slice(0, 48).padEnd(48, ' ');
    const note = (r.error || 'OK (Nội dung đúng thực thể)').slice(0, 40).padEnd(40, ' ');

    console.log(`| ${idxStr} | ${statusStr} | ${httpStr} | ${titleDisplay} | ${note} |`);
    if (r.effectiveUrl && r.effectiveUrl !== r.url) {
      console.log(`|    | ↳ Chuyển hướng: ${r.effectiveUrl.slice(0, 110)}`);
    }
  });
  console.log('----------------------------------------------------------------------------------------------------------------------------------\n');

  // In bảng phân loại tổng hợp
  console.log('=== BẢNG PHÂN LOẠI TÌNH TRẠNG LIÊN KẾT NGUỒN ===');
  console.log(`- TỔNG SỐ URL KIỂM TOÁN:                         ${breakdown.total} (${breakdown.total}/${breakdown.total} checked)`);
  console.log(`- HOẠT ĐỘNG & ĐÚNG NỘI DUNG (active_relevant):   ${breakdown.active_relevant}`);
  console.log(`- ĐÃ CHẾT / 404 (dead):                          ${breakdown.dead}`);
  console.log(`- KHÔNG THỂ KẾT NỐI (unreachable - DNS/TLS):     ${breakdown.unreachable}`);
  console.log(`- CHUYỂN HƯỚNG SAI NỘI DUNG (redirected_unrelated): ${breakdown.redirected_unrelated}`);
  console.log(`- NỘI DUNG / MỐC KHÔNG KHỚP (content_mismatch):  ${breakdown.content_mismatch}`);
  console.log(`- BỊ CHẶN TRUY CẬP (blocked - HTTP 401/403):     ${breakdown.blocked}`);
  console.log(`- CHƯA KIỂM TRA (unchecked):                     ${breakdown.unchecked}\n`);

  console.log('=== CHỈ SỐ ĐỘC LẬP (INDEPENDENT METRICS) ===');
  console.log(`- Transport Reachable (Phản hồi hạ tầng mạng):  ${transportReachable} / ${breakdown.total}`);
  console.log(`- Semantic Relevant (Nội dung đúng thực thể):   ${semanticRelevant} / ${breakdown.total}`);
  console.log(`- Evidence Usable (Đủ điều kiện làm bằng chứng): ${evidenceUsable} / ${breakdown.total}\n`);

  // Kiểm tra sai lệch khai báo
  if (mismatches.length > 0) {
    console.error(`[LỖI SAI LỆCH KHAI BÁO NGUỒN (${mismatches.length})]:`);
    mismatches.forEach(m => {
      console.error(`  ✗ [${m.candidateId}] [${m.location}] ${m.issue} (URL: ${m.url})`);
    });
    console.error('\n=> KIỂM TOÁN TÍNH CHÂN THỰC LIÊN KẾT THẤT BẠI.');
    process.exit(1);
  }

  console.log(`✅ KIỂM TOÁN LIÊN KẾT NGUỒN HOÀN TẤT: ${breakdown.total}/${breakdown.total} checked, ${evidenceUsable} nguồn usable.`);
  console.log('✅ XÁC NHẬN MINH BẠCH: Đã phát hiện và gắn nhãn đầy đủ các liên kết dead, unreachable, redirected_unrelated và content_mismatch.\n');

  return {
    success: true,
    breakdown,
    metrics: {
      transportReachable,
      semanticRelevant,
      evidenceUsable
    },
    results,
    mismatches
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  auditCandidateLinks().catch(err => {
    console.error(`[FATAL ERROR] ${err.message}`);
    process.exit(1);
  });
}
