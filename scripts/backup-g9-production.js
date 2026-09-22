#!/usr/bin/env node

/**
 * scripts/backup-g9-production.js
 *
 * Tạo Cleanup Manifest / Pre-mutation Snapshot cho Giai đoạn G9.2:
 * - CHUẨN HÓA MÔI TRƯỜNG: Dùng ADMIN_ACCESS_TOKEN hoặc SUPABASE_SERVICE_ROLE_KEY. Tuyệt đối không dùng ADMIN_TOKEN.
 * - FAIL-CLOSED: Dừng ngay lập tức nếu thiếu credentials; cấm tự ý dùng local_snapshot trừ khi có cờ --local-test.
 * - FAIL-SAFE TOÀN BỘ: Nếu bất kỳ endpoint hoặc trang phân trang nào lỗi (HTTP != 200), toàn bộ snapshot phải FAIL.
 * - PHÂN TRANG ĐẦY ĐỦ: Lấy toàn bộ bản ghi qua pagination.total_pages cho places, comments, reports.
 * - BẢO VỆ DỮ LIỆU: Tạo minimized snapshot loại bỏ trường nhạy cảm không cần thiết, bảo vệ tệp bằng phân quyền 0600 (không tuyên bố khử sạch 100% PII vì các trường content/description/contact có thể chứa dữ liệu người dùng).
 * - ĐỐI SOÁT LIVE TARGETS: Đối chiếu trực tiếp ID 4, 6, 10 với dữ liệu live. Nếu không khớp slug/name/status thì abort ngay.
 * - ĐỊNH DANH RÕ RÀNG: Ghi rõ là "cleanup manifest/snapshot", không tuyên bố là full database backup.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');

const DEFAULT_SUPABASE_URL = 'https://foyraoimhksfvlxndwxr.supabase.co';
const DEFAULT_VERCEL_URL = 'https://vivutravinh.vercel.app';

export const EXPECTED_TARGETS = Object.freeze([
  { id: 4, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form', status: 'approved' },
  { id: 10, name: 'ádasdasd', slug: 'adasdasd', status: 'approved' },
  { id: 6, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form-mpozjzkv', status: 'draft' }
]);

/**
 * Khử sạch PII khỏi dữ liệu
 */
export function sanitizeBackupPlaces(places = []) {
  if (!Array.isArray(places)) return [];
  return places.map(p => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    category: p.category,
    area: p.area,
    address: p.address,
    coordinates: p.coordinates,
    map_link: p.map_link,
    opening_time: p.opening_time,
    closing_time: p.closing_time,
    display_hours: p.display_hours,
    contact: p.contact,
    price_raw: p.price_raw,
    description: p.description,
    note: p.note,
    status: p.status,
    operating_status: p.operating_status,
    images: Array.isArray(p.images) ? p.images : [],
    image_link: p.image_link || null,
    rating: p.rating,
    sort_order: p.sort_order,
    is_featured: Boolean(p.is_featured),
    created_at: p.created_at,
    updated_at: p.updated_at
  }));
}

export function sanitizeBackupComments(comments = []) {
  if (!Array.isArray(comments)) return [];
  return comments.map(c => ({
    id: c.id,
    place_id: c.place_id,
    content: c.content,
    rating: c.rating,
    status: c.status,
    is_hidden: c.is_hidden,
    created_at: c.created_at,
    updated_at: c.updated_at
  }));
}

export function sanitizeBackupReports(reports = []) {
  if (!Array.isArray(reports)) return [];
  return reports.map(r => ({
    id: r.id,
    place_id: r.place_id,
    reason: r.reason,
    description: r.description,
    status: r.status,
    admin_notes: r.admin_notes,
    created_at: r.created_at,
    resolved_at: r.resolved_at
  }));
}

/**
 * Đối chiếu dữ liệu live với danh sách mục tiêu kế hoạch
 */
export function verifyTargetsAgainstLive(livePlaces = [], expectedTargets = EXPECTED_TARGETS) {
  const issues = [];
  const matchedTargets = [];

  for (const expected of expectedTargets) {
    const live = livePlaces.find(p => p.id === expected.id);
    const targetIssues = [];

    if (!live) {
      targetIssues.push(`Target ID ${expected.id} không tồn tại trên CSDL live.`);
    } else {
      if (live.slug !== expected.slug) {
        targetIssues.push(`Target ID ${expected.id} lệch slug: live="${live.slug}" vs kế hoạch="${expected.slug}".`);
      }
      if (live.name !== expected.name) {
        targetIssues.push(`Target ID ${expected.id} lệch name: live="${live.name}" vs kế hoạch="${expected.name}".`);
      }
      if (live.status !== expected.status) {
        targetIssues.push(`Target ID ${expected.id} lệch status: live="${live.status}" vs kế hoạch="${expected.status}".`);
      }
    }

    const verifiedMatch = targetIssues.length === 0;
    if (!verifiedMatch) {
      issues.push(...targetIssues);
    }

    matchedTargets.push({
      id: expected.id,
      name: live ? live.name : null,
      slug: live ? live.slug : null,
      current_status: live ? live.status : null,
      verified_match: verifiedMatch,
      issues: targetIssues
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    matchedTargets
  };
}

/**
 * Thu thập toàn bộ dữ liệu phân trang qua Admin API
 */
async function fetchAllPages(endpointUrl, headers, listKey, fetchFn) {
  const items = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const sep = endpointUrl.includes('?') ? '&' : '?';
    const url = `${endpointUrl}${sep}page=${page}&limit=50&status=all`;
    const res = await fetchFn(url, { headers });

    if (!res.ok) {
      throw new Error(`BACKUP_ENDPOINT_FAILED: Lỗi đọc ${url} (HTTP ${res.status} ${res.statusText || ''})`);
    }

    const data = await res.json();
    const list = data[listKey] || data.data || [];
    items.push(...list);

    totalPages = data.pagination?.total_pages || 1;
    page++;
  }

  return { items, totalPages };
}

/**
 * Tạo Cleanup Manifest / Snapshot
 */
export async function createProductionManifest(options = {}) {
  const fetchFn = options.fetchFn || globalThis.fetch;
  const isLocalTest = Boolean(options.localTest);

  if (process.env.ADMIN_TOKEN && !process.env.ADMIN_ACCESS_TOKEN && !options.adminToken) {
    throw new Error('INVALID_ENV_VAR: Biến ADMIN_TOKEN không còn được hỗ trợ. Hãy sử dụng ADMIN_ACCESS_TOKEN hoặc SUPABASE_SERVICE_ROLE_KEY.');
  }

  const adminToken = options.adminToken !== undefined ? options.adminToken : process.env.ADMIN_ACCESS_TOKEN;
  const serviceKey = options.serviceKey !== undefined ? options.serviceKey : (options.adminToken ? null : process.env.SUPABASE_SERVICE_ROLE_KEY);
  const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const vercelUrl = options.vercelUrl || process.env.VERCEL_URL || DEFAULT_VERCEL_URL;

  // FAIL CLOSED nếu thiếu credentials (chỉ cho phép local test nếu có cờ rõ ràng)
  if (!adminToken && !serviceKey) {
    if (options.mockData) {
      // Mock data cho test runner
    } else if (isLocalTest) {
      // Cho phép local fallback
    } else {
      throw new Error('FAIL_CLOSED: Thiếu biến môi trường ADMIN_ACCESS_TOKEN hoặc SUPABASE_SERVICE_ROLE_KEY. Không thể chạy snapshot production.');
    }
  }

  let authMode = 'unknown';
  let rawPlaces = [];
  let rawComments = [];
  let rawReports = [];
  let placesPages = 1;
  let commentsPages = 1;
  let reportsPages = 1;

  if (options.mockData) {
    authMode = options.mockData.authMode || 'mock_production';
    rawPlaces = options.mockData.places || [];
    rawComments = options.mockData.comments || [];
    rawReports = options.mockData.reports || [];
  } else if (isLocalTest && !adminToken && !serviceKey) {
    authMode = 'local_snapshot_test';
    const fallbackPath = path.join(ROOT_DIR, 'data', 'data-fallback.json');
    if (fs.existsSync(fallbackPath)) {
      rawPlaces = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    }
  } else if (serviceKey) {
    authMode = 'service_role';
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    };

    const [pRes, cRes, rRes] = await Promise.all([
      fetchFn(`${supabaseUrl}/rest/v1/places?select=*&order=id.asc`, { headers }),
      fetchFn(`${supabaseUrl}/rest/v1/place_comments?select=*&order=id.asc`, { headers }),
      fetchFn(`${supabaseUrl}/rest/v1/place_reports?select=*&order=id.asc`, { headers })
    ]);

    if (!pRes.ok) throw new Error(`BACKUP_ENDPOINT_FAILED: Lỗi đọc places qua service_role (HTTP ${pRes.status})`);
    if (!cRes.ok) throw new Error(`BACKUP_ENDPOINT_FAILED: Lỗi đọc place_comments qua service_role (HTTP ${cRes.status})`);
    if (!rRes.ok) throw new Error(`BACKUP_ENDPOINT_FAILED: Lỗi đọc place_reports qua service_role (HTTP ${rRes.status})`);

    rawPlaces = await pRes.json();
    rawComments = await cRes.json();
    rawReports = await rRes.json();
  } else if (adminToken) {
    authMode = 'admin_access_token';
    const headers = {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };

    // Phân trang đầy đủ dựa trên pagination.total_pages
    const pResult = await fetchAllPages(`${vercelUrl}/api/admin-places`, headers, 'places', fetchFn);
    rawPlaces = pResult.items;
    placesPages = pResult.totalPages;

    const cResult = await fetchAllPages(`${vercelUrl}/api/admin-comments`, headers, 'comments', fetchFn);
    rawComments = cResult.items;
    commentsPages = cResult.totalPages;

    const rResult = await fetchAllPages(`${vercelUrl}/api/admin-reports`, headers, 'reports', fetchFn);
    rawReports = rResult.items;
    reportsPages = rResult.totalPages;
  }

  // Khử sạch PII
  const sanitizedPlaces = sanitizeBackupPlaces(rawPlaces);
  const sanitizedComments = sanitizeBackupComments(rawComments);
  const sanitizedReports = sanitizeBackupReports(rawReports);

  // Đối soát mục tiêu với dữ liệu live vừa đọc
  const targetVerification = verifyTargetsAgainstLive(sanitizedPlaces, options.expectedTargets || EXPECTED_TARGETS);
  if (!targetVerification.valid && !isLocalTest && !options.allowTargetMismatch) {
    throw new Error(`TARGET_VERIFICATION_ABORT: Dữ liệu live không khớp với kế hoạch:\n - ${targetVerification.issues.join('\n - ')}`);
  }

  const manifest = {
    manifest_type: 'cleanup_manifest_snapshot',
    environment: authMode.includes('test') || authMode.includes('mock') ? 'test' : 'production',
    auth_mode: authMode,
    created_at: new Date().toISOString(),
    target_records: targetVerification.matchedTargets,
    live_verification: {
      verified: targetVerification.valid,
      issues: targetVerification.issues
    },
    metadata: {
      total_places: sanitizedPlaces.length,
      total_comments: sanitizedComments.length,
      total_reports: sanitizedReports.length,
      places_pages: placesPages,
      comments_pages: commentsPages,
      reports_pages: reportsPages,
      status_breakdown: sanitizedPlaces.reduce((acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {})
    },
    places: sanitizedPlaces,
    comments: sanitizedComments,
    reports: sanitizedReports
  };

  return manifest;
}

export const DEFAULT_MAX_MANIFEST_AGE_MS = 30 * 60 * 1000; // 30 phút

/**
 * Kiểm tra tính toàn vẹn và xác thực của Manifest (dùng chung cho cả tệp và inline object)
 */
export function validateManifestData(manifest, options = {}) {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, error: 'Dữ liệu manifest rỗng hoặc không phải object' };
  }

  if (manifest.manifest_type !== 'cleanup_manifest_snapshot') {
    return { valid: false, error: `manifest_type không hợp lệ: ${manifest.manifest_type}` };
  }

  const createdAtMs = Date.parse(manifest.created_at);
  if (!manifest.created_at || isNaN(createdAtMs)) {
    return { valid: false, error: 'created_at không hợp lệ' };
  }

  // Chặn created_at nằm quá xa trong tương lai (dung sai tối đa 1 phút do clock skew)
  const now = Date.now();
  if (createdAtMs - now > 60 * 1000) {
    return { valid: false, error: 'MANIFEST_FUTURE_DATE: created_at nằm trong tương lai không hợp lệ' };
  }

  // Giới hạn tuổi manifest (tối đa 30 phút trước khi execute)
  const maxAgeMs = options.maxAgeMs !== undefined ? options.maxAgeMs : DEFAULT_MAX_MANIFEST_AGE_MS;
  const ageMs = now - createdAtMs;
  if (!options.ignoreAge && ageMs > maxAgeMs) {
    const ageMinutes = Math.round(ageMs / 60000);
    return {
      valid: false,
      error: `MANIFEST_EXPIRED: Manifest snapshot đã được tạo ${ageMinutes} phút trước (vượt quá giới hạn tối đa ${Math.round(maxAgeMs / 60000)} phút). Cần tạo snapshot mới trước khi thực thi.`
    };
  }

  const isLocal = Boolean(options.allowLocal || options.localTest);
  if (!isLocal) {
    if (manifest.environment !== 'production') {
      return { valid: false, error: `environment phải là "production" (nhận được "${manifest.environment}")` };
    }
    if (manifest.auth_mode !== 'admin_access_token' && manifest.auth_mode !== 'service_role') {
      return { valid: false, error: `auth_mode không phải production credentials: ${manifest.auth_mode}` };
    }
  }

  if (!manifest.live_verification || manifest.live_verification.verified !== true) {
    return { valid: false, error: 'live_verification.verified phải là true' };
  }

  // Bắt buộc target_records có đúng 3 phần tử, không trùng lặp, sort đúng [4, 6, 10]
  if (!Array.isArray(manifest.target_records) || manifest.target_records.length !== 3) {
    return { valid: false, error: `target_records bắt buộc phải có đúng 3 phần tử (hiện tại: ${Array.isArray(manifest.target_records) ? manifest.target_records.length : 0})` };
  }

  const ids = manifest.target_records.map(r => r.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== 3) {
    return { valid: false, error: 'target_records chứa ID trùng lặp' };
  }

  const sortedIds = [...ids].sort((a, b) => a - b);
  if (sortedIds[0] !== 4 || sortedIds[1] !== 6 || sortedIds[2] !== 10) {
    return { valid: false, error: `target_records phải chứa chính xác các ID [4, 6, 10] (hiện tại: [${sortedIds.join(', ')}])` };
  }

  // Bắt buộc verified_match === true cho từng mục tiêu
  for (const expId of [4, 6, 10]) {
    const rec = manifest.target_records.find(r => r.id === expId);
    if (!rec) {
      return { valid: false, error: `target_records thiếu mục tiêu bắt buộc ID ${expId}` };
    }
    if (rec.verified_match !== true) {
      return { valid: false, error: `target_records ID ${expId} có verified_match không phải true` };
    }
  }

  if (!Array.isArray(manifest.places) || !Array.isArray(manifest.comments) || !Array.isArray(manifest.reports)) {
    return { valid: false, error: 'places, comments hoặc reports không phải mảng' };
  }

  return {
    valid: true,
    manifest
  };
}

/**
 * Kiểm tra tính toàn vẹn và xác thực của Manifest File
 */
export function verifyManifestFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: `Tệp manifest không tồn tại: ${filePath}` };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const manifest = JSON.parse(content);
    return validateManifestData(manifest, options);
  } catch (err) {
    return { valid: false, error: `Lỗi đọc JSON manifest: ${err.message}` };
  }
}

export const createProductionBackup = createProductionManifest;
export const verifyBackupFile = verifyManifestFile;

/**
 * CLI Runner
 */
async function main() {
  const args = process.argv.slice(2);
  const isLocalTest = args.includes('--local-test');
  const verifyIdx = args.indexOf('--verify');

  if (verifyIdx !== -1) {
    const targetFile = args[verifyIdx + 1];
    if (!targetFile) {
      console.error('Lỗi: Cần truyền đường dẫn tệp manifest sau --verify');
      process.exit(1);
    }
    const check = verifyManifestFile(targetFile, { allowLocal: isLocalTest });
    if (!check.valid) {
      console.error(`❌ Xác minh manifest thất bại: ${check.error}`);
      process.exit(1);
    }
    console.log(`✅ Cleanup Manifest hợp lệ: ${targetFile}`);
    console.log(`   - Môi trường: ${check.manifest.environment}`);
    console.log(`   - Chế độ xác thực: ${check.manifest.auth_mode}`);
    console.log(`   - Thời điểm tạo: ${check.manifest.created_at}`);
    console.log(`   - Số mục tiêu dọn dẹp: ${check.manifest.target_records.length}`);
    console.log(`   - Tổng địa điểm snapshot: ${check.manifest.metadata.total_places}`);
    process.exit(0);
  }

  console.log('=== KHỞI TẠO CLEANUP MANIFEST / SNAPSHOT (G9.2) ===');
  const manifest = await createProductionManifest({ localTest: isLocalTest });

  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const safeTimestamp = manifest.created_at.replace(/[:.]/g, '-');
  const filename = `g9-cleanup-manifest-${safeTimestamp}.json`;
  const outputPath = path.join(BACKUPS_DIR, filename);

  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(outputPath, 0o600);
  } catch {}
  console.log(`✓ Đã tạo Cleanup Manifest thành công tại: ${outputPath}`);
  console.log(`  - Chế độ: ${manifest.auth_mode}`);
  console.log(`  - Mục tiêu kế hoạch: ${manifest.target_records.map(t => `#${t.id} (${t.current_status})`).join(', ')}`);
  console.log(`  - Địa điểm đã chụp: ${manifest.metadata.total_places} (qua ${manifest.metadata.places_pages} trang)`);
  console.log(`  - Bình luận: ${manifest.metadata.total_comments} (qua ${manifest.metadata.comments_pages} trang)`);
  console.log(`  - Báo sai: ${manifest.metadata.total_reports} (qua ${manifest.metadata.reports_pages} trang)`);
  console.log('=== MANIFEST ĐÃ SẴN SÀNG VÀ HỢP LỆ ===');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  });
}
