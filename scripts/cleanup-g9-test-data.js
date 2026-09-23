#!/usr/bin/env node

/**
 * scripts/cleanup-g9-test-data.js
 *
 * Dọn dữ liệu thử nghiệm có kiểm soát cho Giai đoạn G9.2 (Controlled Cleanup Tooling):
 * - Mục tiêu: Chuyển các bản ghi dữ liệu test đã xác minh sang trạng thái "archived".
 * - Tuyệt đối KHÔNG xóa cứng (zero hard delete).
 * - Chuẩn hóa biến môi trường:
 *   + Mutation và rollback qua Vercel BẮT BUỘC có ADMIN_ACCESS_TOKEN.
 *   + SUPABASE_SERVICE_ROLE_KEY chỉ dùng cho snapshot, read-back trực tiếp theo ID và audit verification.
 *   + Tuyệt đối không gửi Service Role Key làm Bearer token tới Vercel API.
 * - Fail-closed: Dừng ngay nếu thiếu credentials; không tự ý dùng local snapshot trừ khi có cờ --local-test.
 * - Dry-run fail-closed: Preflight hoặc Manifest lỗi => success=false và CLI exit 1.
 * - Read-back: Nếu có serviceKey, ưu tiên query trực tiếp đúng ID; nếu chỉ có adminToken, đọc đủ pagination.
 * - Nghiệm thu sau execute: Tách mutationSuccess, readBackSuccess, auditStatus, complete.
 * - Rollback: CLI bắt buộc --rollback --confirm --manifest=<path> --target-ids=...
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateManifestData,
  verifyManifestFile,
  verifyTargetsAgainstLive,
  EXPECTED_TARGETS
} from './backup-g9-production.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');

const FALLBACK_DEPLOYMENT_URL = 'https://vivutravinh.vercel.app';
const DEFAULT_SUPABASE_URL = process.env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';

// Danh sách các ID mục tiêu được phê duyệt dọn dẹp trong G9.2
export const TARGET_CLEANUP_PLACES = Object.freeze([
  {
    id: 4,
    name: 'Địa điểm test Google Form',
    slug: 'dia-diem-test-google-form',
    currentStatus: 'approved',
    targetStatus: 'archived',
    reason: 'Chứa từ khóa thử nghiệm "test", tạo từ form test, đang hiển thị public'
  },
  {
    id: 10,
    name: 'ádasdasd',
    slug: 'adasdasd',
    currentStatus: 'approved',
    targetStatus: 'archived',
    reason: 'Tên và slug là chuỗi ký tự gõ phím vô nghĩa, đang hiển thị public'
  },
  {
    id: 6,
    name: 'Địa điểm test Google Form',
    slug: 'dia-diem-test-google-form-mpozjzkv',
    currentStatus: 'draft',
    targetStatus: 'archived',
    reason: 'Bản nháp thử nghiệm Google Form, chứa từ khóa "test"'
  }
]);

/**
 * Tạo correlation ID chuẩn cho từng thao tác dọn dẹp
 */
export function generateCleanupCorrelationId(placeId, prefix = 'g9-2-cleanup') {
  const ts = Date.now();
  return `${prefix}-${ts}-id${placeId}`;
}

/**
 * Chuẩn hóa và kiểm tra biến môi trường (Fail-Closed)
 * Tách biệt rõ ADMIN_ACCESS_TOKEN (cho Vercel API) và SUPABASE_SERVICE_ROLE_KEY (cho Supabase DB/Audit)
 */
export function resolveCredentials(options = {}) {
  if (process.env.ADMIN_TOKEN && !process.env.ADMIN_ACCESS_TOKEN && !options.adminToken) {
    throw new Error('INVALID_ENV_VAR: Biến ADMIN_TOKEN không còn được hỗ trợ. Hãy sử dụng ADMIN_ACCESS_TOKEN hoặc SUPABASE_SERVICE_ROLE_KEY.');
  }

  const isLocalTest = Boolean(options.localTest);
  const adminToken = options.adminToken !== undefined ? options.adminToken : process.env.ADMIN_ACCESS_TOKEN;
  const serviceKey = options.serviceKey !== undefined ? options.serviceKey : process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vercelUrl = options.vercelUrl || process.env.VERCEL_URL || FALLBACK_DEPLOYMENT_URL;
  const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;

  // Nếu thao tác là mutation hoặc rollback qua Vercel API: BẮT BUỘC có ADMIN_ACCESS_TOKEN
  if (options.requireAdminToken && !adminToken && !isLocalTest && !options.mockData) {
    throw new Error('FAIL_CLOSED_NO_ADMIN_TOKEN: Thao tác mutation/rollback qua Vercel API bắt buộc có ADMIN_ACCESS_TOKEN. SUPABASE_SERVICE_ROLE_KEY chỉ dùng cho snapshot/read-back/audit.');
  }

  if (!adminToken && !serviceKey && !isLocalTest && !options.mockData) {
    throw new Error('FAIL_CLOSED: Thiếu biến môi trường ADMIN_ACCESS_TOKEN hoặc SUPABASE_SERVICE_ROLE_KEY. Dừng thực thi để đảm bảo an toàn sản xuất.');
  }

  return {
    adminToken,
    serviceKey,
    vercelUrl,
    supabaseUrl,
    isLocalTest,
    authMode: adminToken ? 'admin_access_token' : (serviceKey ? 'service_role' : (isLocalTest ? 'local_test' : 'mock'))
  };
}

/**
 * Tìm và kiểm tra Cleanup Manifest hợp lệ gần nhất (cả tệp và inline đều dùng chung validator)
 */
export function findLatestVerifiedManifest(options = {}) {
  const isLocalTest = Boolean(options.localTest);
  const maxAgeMs = options.maxAgeMs;

  if (options.manifestPath) {
    const check = verifyManifestFile(options.manifestPath, { allowLocal: isLocalTest, maxAgeMs });
    if (!check.valid) {
      throw new Error(`MANIFEST_VERIFICATION_FAILED: Tệp manifest chỉ định không hợp lệ: ${check.error}`);
    }
    return { manifestPath: options.manifestPath, manifest: check.manifest };
  }

  if (options.manifest) {
    const check = validateManifestData(options.manifest, { allowLocal: isLocalTest, maxAgeMs });
    if (!check.valid) {
      throw new Error(`MANIFEST_VERIFICATION_FAILED: Inline manifest không hợp lệ: ${check.error}`);
    }
    return { manifestPath: 'inline_manifest', manifest: check.manifest };
  }

  if (!fs.existsSync(BACKUPS_DIR)) {
    throw new Error('NO_VERIFIED_MANIFEST_ABORT: Thư mục backups/ không tồn tại. Bắt buộc phải tạo và xác minh manifest trước khi mutation.');
  }

  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      file: f,
      fullPath: path.join(BACKUPS_DIR, f),
      mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const item of files) {
    const check = verifyManifestFile(item.fullPath, { allowLocal: isLocalTest, maxAgeMs });
    if (check.valid) {
      return { manifestPath: item.fullPath, manifest: check.manifest };
    }
  }

  throw new Error('NO_VERIFIED_MANIFEST_ABORT: Không tìm thấy tệp Cleanup Manifest Snapshot hợp lệ trong backups/. Bắt buộc phải tạo và xác minh manifest trước khi mutation.');
}

/**
 * Pre-flight: Đối soát danh sách mục tiêu live trước khi ghi bất kỳ mutation nào
 */
export async function verifyLiveTargetsPreflight(options = {}) {
  const { adminToken, serviceKey, vercelUrl, supabaseUrl, isLocalTest } = resolveCredentials(options);
  const fetchFn = options.fetchFn || globalThis.fetch;
  const expectedTargets = options.expectedTargets || EXPECTED_TARGETS;

  let livePlaces = [];

  if (options.mockLivePlaces) {
    livePlaces = options.mockLivePlaces;
  } else if (serviceKey) {
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    };
    const targetIds = expectedTargets.map(t => t.id).join(',');
    const res = await fetchFn(`${supabaseUrl}/rest/v1/places?id=in.(${targetIds})&select=id,name,slug,status`, { headers });
    if (!res.ok) {
      throw new Error(`PREFLIGHT_FETCH_FAILED: Không thể đọc danh sách mục tiêu từ Supabase (HTTP ${res.status})`);
    }
    livePlaces = await res.json();
  } else if (adminToken) {
    const headers = {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };
    const res = await fetchFn(`${vercelUrl}/api/admin-places?status=all&limit=100`, { headers });
    if (!res.ok) {
      throw new Error(`PREFLIGHT_FETCH_FAILED: Không thể đọc danh sách mục tiêu từ Admin Places API (HTTP ${res.status})`);
    }
    const body = await res.json();
    livePlaces = body.places || body.data || [];
  } else if (isLocalTest) {
    return { valid: true, issues: [], matchedTargets: expectedTargets };
  }

  const verification = verifyTargetsAgainstLive(livePlaces, expectedTargets);
  if (!verification.valid) {
    throw new Error(`LIVE_TARGET_MISMATCH_ABORT: Dữ liệu live không khớp với kế hoạch dọn dẹp:\n - ${verification.issues.join('\n - ')}`);
  }

  return verification;
}

/**
 * Read-back verification fail-closed:
 * - Nếu có SUPABASE_SERVICE_ROLE_KEY, ưu tiên query trực tiếp đúng ID.
 * - Nếu chỉ có ADMIN_ACCESS_TOKEN, đọc đủ pagination qua các trang.
 * - HTTP không OK => fail-stop.
 * - JSON lỗi => fail-stop.
 * - Không tìm thấy đúng target ID => fail-stop.
 * - status null/undefined => fail-stop.
 * - status khác target => fail-stop.
 * Chỉ thành công khi tìm đúng MỘT bản ghi và status khớp chính xác!
 */
export async function performReadBackVerification(placeId, expectedStatus, options = {}) {
  const { adminToken, serviceKey, vercelUrl, supabaseUrl, isLocalTest } = resolveCredentials(options);
  const fetchFn = options.fetchFn || globalThis.fetch;

  if (options.readBackFn) {
    try {
      const res = await options.readBackFn(placeId);
      if (!res || typeof res !== 'object') {
        return { success: false, error: `READBACK_EMPTY: Đọc lại bản ghi ID ${placeId} trả về rỗng hoặc không hợp lệ.` };
      }
      if (res.status === null || res.status === undefined) {
        return { success: false, error: `READBACK_STATUS_NULL: Trạng thái bản ghi ID ${placeId} bị null/undefined sau cập nhật.` };
      }
      if (res.status !== expectedStatus) {
        return { success: false, error: `READBACK_STATUS_MISMATCH: Bản ghi ID ${placeId} có status "${res.status}", không khớp với "${expectedStatus}".` };
      }
      return { success: true, place: res };
    } catch (err) {
      return { success: false, error: `READBACK_FUNCTION_ERROR: ${err.message}` };
    }
  }

  let readBackPlace = null;

  // 1. Ưu tiên query trực tiếp đúng ID nếu có SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey) {
    let res;
    try {
      res = await fetchFn(`${supabaseUrl}/rest/v1/places?id=eq.${placeId}&select=id,name,slug,status`, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
      return { success: false, error: `READBACK_NETWORK_ERROR: Lỗi mạng khi đọc lại ID ${placeId}: ${err.message}` };
    }

    if (!res.ok) {
      return { success: false, error: `READBACK_HTTP_ERROR: Đọc lại bản ghi ID ${placeId} từ Supabase thất bại (HTTP ${res.status}).` };
    }

    let rows;
    try {
      rows = await res.json();
    } catch (err) {
      return { success: false, error: `READBACK_JSON_ERROR: Không thể parse JSON khi đọc lại ID ${placeId}: ${err.message}` };
    }

    const list = Array.isArray(rows) ? rows : (Array.isArray(rows?.places) ? rows.places : []);
    if (list.length !== 1 || list[0]?.id !== placeId) {
      return { success: false, error: `READBACK_TARGET_NOT_FOUND: Không tìm thấy đúng một bản ghi ID ${placeId} trên Supabase (tìm thấy ${list.length}).` };
    }
    readBackPlace = list[0];
  } else if (adminToken) {
    // 2. Nếu chỉ có ADMIN_ACCESS_TOKEN: đọc đầy đủ qua pagination, không giới hạn 100 bản ghi trang đầu
    let page = 1;
    let totalPages = 1;
    const matchedItems = [];

    while (page <= totalPages) {
      let res;
      try {
        res = await fetchFn(`${vercelUrl}/api/admin-places?status=all&limit=50&page=${page}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (err) {
        return { success: false, error: `READBACK_NETWORK_ERROR: Lỗi mạng khi đọc lại ID ${placeId} trang ${page}: ${err.message}` };
      }

      if (!res.ok) {
        return { success: false, error: `READBACK_HTTP_ERROR: Đọc lại bản ghi ID ${placeId} từ Admin API thất bại (HTTP ${res.status}).` };
      }

      let body;
      try {
        body = await res.json();
      } catch (err) {
        return { success: false, error: `READBACK_JSON_ERROR: Không thể parse JSON khi đọc lại ID ${placeId}: ${err.message}` };
      }

      const places = body.places || body.data || [];
      const found = places.filter(p => p.id === placeId);
      matchedItems.push(...found);

      totalPages = body.pagination?.total_pages || 1;
      page++;
    }

    if (matchedItems.length !== 1) {
      return { success: false, error: `READBACK_TARGET_NOT_FOUND: Không tìm thấy đúng một bản ghi ID ${placeId} trên Admin API (tìm thấy ${matchedItems.length}).` };
    }
    readBackPlace = matchedItems[0];
  } else if (isLocalTest) {
    return { success: true, place: { id: placeId, status: expectedStatus } };
  }

  if (!readBackPlace || readBackPlace.id !== placeId) {
    return { success: false, error: `READBACK_TARGET_NOT_FOUND: Không tìm thấy bản ghi ID ${placeId}.` };
  }

  if (readBackPlace.status === null || readBackPlace.status === undefined) {
    return { success: false, error: `READBACK_STATUS_NULL: Trạng thái bản ghi ID ${placeId} bị null/undefined sau cập nhật.` };
  }

  if (readBackPlace.status !== expectedStatus) {
    return { success: false, error: `READBACK_STATUS_MISMATCH: Bản ghi ID ${placeId} có status "${readBackPlace.status}", không khớp với "${expectedStatus}".` };
  }

  return { success: true, place: readBackPlace };
}

/**
 * Kiểm tra xác minh Audit Logs theo correlation_id:
 * - Đúng entity_id, action và đúng 1 log/mutation.
 * - Thiếu bất kỳ log nào => AUDIT_VERIFICATION_FAILED hoặc DEFERRED; không bao giờ báo VERIFIED.
 */
export async function verifyAuditLogsForMutations(mutations = [], options = {}) {
  const { serviceKey, supabaseUrl } = resolveCredentials(options);
  const fetchFn = options.fetchFn || globalThis.fetch;

  if (!serviceKey) {
    return {
      status: 'AUDIT_VERIFICATION_DEFERRED',
      message: 'Thiếu SUPABASE_SERVICE_ROLE_KEY; không thể truy vấn trực tiếp bảng admin_audit_logs để xác minh.',
      logs: []
    };
  }

  try {
    const auditRes = await fetchFn(`${supabaseUrl}/rest/v1/admin_audit_logs?entity_type=eq.place&order=created_at.desc&limit=50`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!auditRes.ok) {
      return {
        status: 'AUDIT_VERIFICATION_FAILED',
        message: `Truy vấn admin_audit_logs thất bại (HTTP ${auditRes.status})`,
        logs: []
      };
    }

    const allLogs = await auditRes.json();
    const verificationResults = [];
    let allVerified = true;

    for (const m of mutations) {
      const matched = allLogs.filter(l => l.correlation_id === m.correlationId && String(l.entity_id) === String(m.id));
      if (matched.length !== 1) {
        allVerified = false;
        verificationResults.push({
          id: m.id,
          correlationId: m.correlationId,
          verified: false,
          error: matched.length === 0
            ? 'Không tìm thấy audit log khớp correlation_id'
            : `Tìm thấy ${matched.length} audit logs trùng lặp cho correlation_id`
        });
        continue;
      }

      const log = matched[0];
      const expectedAction = m.expectedAction || (m.targetStatus === 'archived' ? 'place.archive' : (m.targetStatus === 'approved' ? 'place.approved' : null));
      const actionMatches = expectedAction ? log.action === expectedAction : true;

      if (!actionMatches) {
        allVerified = false;
        verificationResults.push({
          id: m.id,
          correlationId: m.correlationId,
          verified: false,
          error: `Audit log có action "${log.action}", kỳ vọng "${expectedAction}"`
        });
      } else {
        verificationResults.push({
          id: m.id,
          correlationId: m.correlationId,
          verified: true,
          action: log.action,
          actor_email: log.actor_email
        });
      }
    }

    if (!allVerified) {
      return {
        status: 'AUDIT_VERIFICATION_FAILED',
        message: 'Xác minh audit log thất bại: có mutation thiếu audit log hoặc thông tin không khớp.',
        details: verificationResults
      };
    }

    return {
      status: 'AUDIT_VERIFIED',
      message: `Đã xác minh đầy đủ ${mutations.length}/${mutations.length} audit logs tương ứng với từng correlation_id.`,
      details: verificationResults
    };
  } catch (err) {
    return {
      status: 'AUDIT_VERIFICATION_FAILED',
      message: `Lỗi khi xác minh audit logs: ${err.message}`,
      logs: []
    };
  }
}

/**
 * Thực thi dọn dẹp (Dry-run hoặc Mutation có kiểm soát)
 */
export async function executeCleanup(options = {}) {
  const isDryRun = Boolean(options.dryRun);
  const targets = options.targets || TARGET_CLEANUP_PLACES;
  const fetchFn = options.fetchFn || globalThis.fetch;

  // 1. DRY-RUN MODE: Fail-closed (preflight và manifest đều phải hợp lệ mới success=true)
  if (isDryRun) {
    let manifestInfo = null;
    try {
      manifestInfo = findLatestVerifiedManifest(options);
    } catch (manifestErr) {
      return {
        success: false,
        dryRun: true,
        error: `DRY_RUN_MANIFEST_FAILED: ${manifestErr.message}`,
        manifestCompatibility: { valid: false, error: manifestErr.message },
        results: []
      };
    }

    let preflight = null;
    try {
      preflight = await verifyLiveTargetsPreflight(options);
    } catch (preflightErr) {
      return {
        success: false,
        dryRun: true,
        error: `DRY_RUN_PREFLIGHT_FAILED: ${preflightErr.message}`,
        manifestCompatibility: {
          valid: true,
          path: manifestInfo.manifestPath,
          createdAt: manifestInfo.manifest?.created_at
        },
        results: []
      };
    }

    // Chỉ success=true khi cả manifest và preflight đều hợp lệ
    const results = [];
    for (const item of targets) {
      const liveMatched = preflight.matchedTargets.find(l => l.id === item.id);
      results.push({
        id: item.id,
        name: liveMatched ? liveMatched.name : item.name,
        slug: liveMatched ? liveMatched.slug : item.slug,
        currentStatus: liveMatched ? liveMatched.current_status : null,
        targetStatus: item.targetStatus || 'archived',
        action: 'DRY_RUN_SKIP',
        success: true,
        correlationId: generateCleanupCorrelationId(item.id)
      });
    }

    return {
      success: true,
      dryRun: true,
      manifestCompatibility: {
        valid: true,
        path: manifestInfo.manifestPath,
        createdAt: manifestInfo.manifest.created_at,
        targetsCount: manifestInfo.manifest.target_records?.length
      },
      results
    };
  }

  // 2. MUTATION MODE: Bắt buộc fail-closed ADMIN_ACCESS_TOKEN cho Vercel API
  const creds = resolveCredentials({ ...options, requireAdminToken: true });
  const { adminToken, vercelUrl, isLocalTest } = creds;

  // 3. Yêu cầu có Cleanup Manifest hợp lệ (qua validateManifestData)
  let manifestInfo;
  try {
    manifestInfo = findLatestVerifiedManifest({
      manifestPath: options.manifestPath,
      manifest: options.manifest,
      localTest: isLocalTest,
      maxAgeMs: options.maxAgeMs
    });
  } catch (err) {
    throw new Error(`MUTATION_ABORT_NO_MANIFEST: ${err.message}`);
  }

  const manifestPath = manifestInfo.manifestPath;

  // 4. Pre-flight đối soát live targets trước khi mutation bản ghi đầu tiên
  await verifyLiveTargetsPreflight({
    ...options,
    adminToken,
    vercelUrl,
    isLocalTest
  });

  // 5. Thực thi mutation tuần tự kèm Fail-Stop và Read-Back Verification Fail-Closed
  const results = [];
  const mutatedTargets = [];
  let unmutatedTargets = [...targets];

  for (const item of targets) {
    const correlationId = generateCleanupCorrelationId(item.id);
    const targetStatus = item.targetStatus || 'archived';

    // Contract chuẩn: gửi id và status trong JSON body, Bearer token là ADMIN_ACCESS_TOKEN
    let res;
    try {
      res = await fetchFn(`${vercelUrl}/api/admin-places`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken || ''}`,
          'Content-Type': 'application/json',
          'x-correlation-id': correlationId
        },
        body: JSON.stringify({
          id: item.id,
          status: targetStatus
        })
      });
    } catch (networkErr) {
      const rollbackCmd = mutatedTargets.length > 0
        ? `node scripts/cleanup-g9-test-data.js --rollback --confirm --manifest=${manifestPath} --target-ids=${mutatedTargets.map(m => m.id).join(',')}`
        : 'Không có bản ghi nào đã bị thay đổi.';

      return {
        success: false,
        mutationSuccess: false,
        readBackSuccess: false,
        auditStatus: 'AUDIT_VERIFICATION_FAILED',
        complete: false,
        error: `NETWORK_ERROR: ${networkErr.message}`,
        failedTarget: { id: item.id, error: networkErr.message, correlationId },
        mutatedTargets,
        unmutatedTargets,
        rollbackCommand: rollbackCmd,
        results
      };
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error?.message || errBody.error || errBody.message || `HTTP ${res.status}`;
      const failure = {
        id: item.id,
        name: item.name,
        slug: item.slug,
        targetStatus,
        error: errMsg,
        httpStatus: res.status,
        correlationId
      };

      results.push({
        id: item.id,
        name: item.name,
        slug: item.slug,
        currentStatus: item.currentStatus || item.status,
        targetStatus,
        action: 'MUTATION_FAILED',
        httpStatus: res.status,
        success: false,
        error: errMsg,
        correlationId
      });

      const rollbackCmd = mutatedTargets.length > 0
        ? `node scripts/cleanup-g9-test-data.js --rollback --confirm --manifest=${manifestPath} --target-ids=${mutatedTargets.map(m => m.id).join(',')}`
        : 'Không có bản ghi nào đã bị thay đổi.';

      return {
        success: false,
        mutationSuccess: false,
        readBackSuccess: false,
        auditStatus: 'AUDIT_VERIFICATION_FAILED',
        complete: false,
        error: `MUTATION_FAILED: Lỗi cập nhật ID ${item.id} (${errMsg})`,
        failedTarget: failure,
        mutatedTargets,
        unmutatedTargets,
        rollbackCommand: rollbackCmd,
        results
      };
    }

    // Read-back verification fail-closed
    const rbCheck = await performReadBackVerification(item.id, targetStatus, options);
    if (!rbCheck.success) {
      const failure = {
        id: item.id,
        name: item.name,
        targetStatus,
        error: rbCheck.error
      };
      mutatedTargets.push(item);
      unmutatedTargets = unmutatedTargets.filter(t => t.id !== item.id);

      const rollbackCmd = `node scripts/cleanup-g9-test-data.js --rollback --confirm --manifest=${manifestPath} --target-ids=${mutatedTargets.map(m => m.id).join(',')}`;
      return {
        success: false,
        mutationSuccess: false,
        readBackSuccess: false,
        auditStatus: 'AUDIT_VERIFICATION_FAILED',
        complete: false,
        error: rbCheck.error,
        failedTarget: failure,
        mutatedTargets,
        unmutatedTargets,
        rollbackCommand: rollbackCmd,
        results
      };
    }

    mutatedTargets.push(item);
    unmutatedTargets = unmutatedTargets.filter(t => t.id !== item.id);

    results.push({
      id: item.id,
      name: item.name,
      slug: item.slug,
      currentStatus: item.currentStatus || item.status,
      targetStatus,
      action: 'MUTATION_EXECUTED',
      httpStatus: res.status,
      success: true,
      error: null,
      correlationId
    });
  }

  // 6. Xác minh Audit Logs từng mutation
  const auditVerification = await verifyAuditLogsForMutations(
    results.map(r => ({ id: r.id, correlationId: r.correlationId, targetStatus: r.targetStatus, expectedAction: 'place.archive' })),
    options
  );

  const mutationSuccess = mutatedTargets.length === targets.length && unmutatedTargets.length === 0;
  const readBackSuccess = mutationSuccess;
  const auditStatus = auditVerification.status;
  const complete = mutationSuccess && readBackSuccess && auditStatus === 'AUDIT_VERIFIED';

  return {
    success: mutationSuccess && readBackSuccess,
    mutationSuccess,
    readBackSuccess,
    auditStatus,
    complete,
    mutatedTargets,
    unmutatedTargets,
    results,
    manifestPath,
    auditVerification
  };
}

/**
 * Hoàn tác (rollback) trạng thái các địa điểm từ manifest đã xác minh
 * Bắt buộc: ADMIN_ACCESS_TOKEN, manifest hợp lệ, chỉ cho phép status approved hoặc draft
 */
export async function executeRollback(options = {}) {
  const creds = resolveCredentials({ ...options, requireAdminToken: true });
  const { adminToken, vercelUrl, isLocalTest } = creds;
  const fetchFn = options.fetchFn || globalThis.fetch;

  let manifest = options.manifest;
  let manifestPath = options.manifestPath || options.backupFile;

  if (!manifest) {
    const manifestInfo = findLatestVerifiedManifest({
      manifestPath,
      localTest: isLocalTest,
      maxAgeMs: options.maxAgeMs
    });
    manifest = manifestInfo.manifest;
    manifestPath = manifestInfo.manifestPath;
  }

  const rollbackMap = {};
  for (const t of (manifest.target_records || [])) {
    rollbackMap[t.id] = t.current_status || t.status;
  }
  for (const p of (manifest.places || [])) {
    if (rollbackMap[p.id] === undefined) {
      rollbackMap[p.id] = p.status;
    }
  }

  const targetIds = options.targetIds || Object.keys(rollbackMap).map(Number);
  const results = [];
  const rolledBackMutations = [];
  let allSuccess = true;

  for (const id of targetIds) {
    const restoreStatus = rollbackMap[id];
    if (!restoreStatus) {
      results.push({
        id,
        success: false,
        error: `Không tìm thấy trạng thái ban đầu của ID ${id} trong snapshot manifest.`
      });
      allSuccess = false;
      continue;
    }

    if (restoreStatus !== 'approved' && restoreStatus !== 'draft') {
      results.push({
        id,
        success: false,
        error: `Trạng thái khôi phục "${restoreStatus}" không hợp lệ. Chỉ chấp nhận approved hoặc draft.`
      });
      allSuccess = false;
      continue;
    }

    const correlationId = generateCleanupCorrelationId(id, 'g9-2-rollback');

    try {
      const res = await fetchFn(`${vercelUrl}/api/admin-places`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken || ''}`,
          'Content-Type': 'application/json',
          'x-correlation-id': correlationId
        },
        body: JSON.stringify({
          id,
          status: restoreStatus,
          is_rollback: true
        })
      });

      const body = await res.json().catch(() => ({}));
      const success = res.ok;
      if (!success) {
        allSuccess = false;
        results.push({
          id,
          restoredStatus: restoreStatus,
          httpStatus: res.status,
          success: false,
          error: body.error?.message || body.error || body.message || `HTTP ${res.status}`,
          correlationId
        });
        continue;
      }

      // Read-back verification sau rollback
      const rbCheck = await performReadBackVerification(id, restoreStatus, options);
      if (!rbCheck.success) {
        allSuccess = false;
        results.push({
          id,
          restoredStatus: restoreStatus,
          httpStatus: res.status,
          success: false,
          error: `Rollback read-back thất bại: ${rbCheck.error}`,
          correlationId
        });
        continue;
      }

      rolledBackMutations.push({
        id,
        correlationId,
        targetStatus: restoreStatus,
        expectedAction: restoreStatus === 'approved' ? 'place.approved' : 'place.update'
      });

      results.push({
        id,
        restoredStatus: restoreStatus,
        httpStatus: res.status,
        success: true,
        error: null,
        correlationId
      });
    } catch (err) {
      allSuccess = false;
      results.push({
        id,
        restoredStatus: restoreStatus,
        success: false,
        error: err.message,
        correlationId
      });
    }
  }

  // Xác minh Audit Logs sau rollback nếu có service role
  const auditVerification = await verifyAuditLogsForMutations(rolledBackMutations, options);

  const rollbackSuccess = allSuccess && results.every(r => r.success);
  const readBackSuccess = rollbackSuccess;
  const auditStatus = auditVerification.status;
  const complete = rollbackSuccess && readBackSuccess && auditStatus === 'AUDIT_VERIFIED';

  return {
    success: rollbackSuccess,
    rollbackSuccess,
    readBackSuccess,
    auditStatus,
    complete,
    results,
    manifestPath,
    auditVerification
  };
}

/**
 * In bảng Before/After
 */
export function printComparisonTable(results = []) {
  console.log('\n┌──────┬───────────────────────────────┬───────────────────────────────┬────────────┬────────────┬─────────┐');
  console.log('│  ID  │ Tên địa điểm                  │ Slug                          │ Trước      │ Đề xuất    │ Trạng thái');
  console.log('├──────┼───────────────────────────────┼───────────────────────────────┼────────────┼────────────┼─────────┤');
  for (const r of results) {
    const idStr = String(r.id).padEnd(4);
    const nameStr = (r.name || '').slice(0, 29).padEnd(29);
    const slugStr = (r.slug || '').slice(0, 29).padEnd(29);
    const curStr = (r.currentStatus || '').padEnd(10);
    const tgtStr = (r.targetStatus || '').padEnd(10);
    const stStr = r.success ? '✓ OK     ' : '✗ FAILED ';
    console.log(`│ ${idStr} │ ${nameStr} │ ${slugStr} │ ${curStr} │ ${tgtStr} │ ${stStr}│`);
  }
  console.log('└──────┴───────────────────────────────┴───────────────────────────────┴────────────┴────────────┴─────────┘\n');
}

/**
 * CLI Runner
 */
async function main() {
  const args = process.argv.slice(2);
  const isRollback = args.includes('--rollback');
  const isExecute = args.includes('--execute');
  const isDryRun = args.includes('--dry-run') || (!isRollback && !isExecute);
  const isLocalTest = args.includes('--local-test');

  const manifestArg = args.find(a => a.startsWith('--manifest=') || a.startsWith('--backup='));
  const manifestPath = manifestArg ? manifestArg.split('=')[1] : null;

  console.log('=== QUY TRÌNH DỌN DỮ LIỆU THỬ NGHIỆM G9.2 (CONTROLLED CLEANUP) ===');

  if (isRollback) {
    console.log('🔄 Đang kiểm tra điều kiện HOÀN TÁC (ROLLBACK)...');
    if (!args.includes('--confirm')) {
      console.error('❌ Thao tác bị từ chối: Bắt buộc truyền thêm cờ --confirm để xác nhận thực thi rollback.');
      process.exit(1);
    }

    if (!manifestPath) {
      console.error('❌ Thao tác bị từ chối: Bắt buộc truyền --manifest=<path> để chỉ định tệp snapshot đã xác minh.');
      process.exit(1);
    }

    const targetsArg = args.find(a => a.startsWith('--target-ids='));
    if (!targetsArg) {
      console.error('❌ Thao tác bị từ chối: Bắt buộc truyền --target-ids=<id1,id2> để chỉ định các bản ghi cần hoàn tác.');
      process.exit(1);
    }
    const targetIds = targetsArg.split('=')[1].split(',').map(Number);

    const outcome = await executeRollback({
      manifestPath,
      targetIds,
      localTest: isLocalTest
    });

    console.log('Kết quả rollback:');
    console.table(outcome.results);
    if (!outcome.success) {
      console.error('⚠️ Rollback có bản ghi thất bại!');
      process.exit(1);
    }
    console.log('✅ Rollback hoàn tất thành công!');
    console.log(`- Trạng thái Audit Logs: ${outcome.auditStatus} (${outcome.auditVerification.message || ''})`);
    return;
  }

  if (isDryRun) {
    console.log('🔍 Đang chạy ở chế độ MÔ PHỎNG (DRY-RUN) — Không có mutation nào được ghi.');
    const outcome = await executeCleanup({ dryRun: true, localTest: isLocalTest, manifestPath });
    if (!outcome.success) {
      console.error(`\n❌ DRY-RUN THẤT BẠI (FAIL-CLOSED): ${outcome.error}`);
      process.exit(1);
    }
    printComparisonTable(outcome.results);
    if (outcome.manifestCompatibility) {
      console.log('Thông tin tương thích Manifest Snapshot:');
      console.log(outcome.manifestCompatibility);
    }
    console.log('Để thực thi thật sau khi đã được phê duyệt, chạy:');
    console.log('  node scripts/cleanup-g9-test-data.js --execute --confirm --manifest=<path>\n');
    return;
  }

  if (isExecute) {
    if (!args.includes('--confirm')) {
      console.error('❌ Thao tác bị từ chối: Bắt buộc truyền thêm cờ --confirm để xác nhận thực thi mutation.');
      process.exit(1);
    }

    console.log('1. Đang kiểm tra credentials và tệp Cleanup Manifest...');
    const outcome = await executeCleanup({
      dryRun: false,
      manifestPath,
      localTest: isLocalTest
    });

    if (!outcome.mutationSuccess || !outcome.readBackSuccess) {
      console.error(`\n❌ THỰC THI BỊ DỪNG LẠI (FAIL-STOP): ${outcome.error}`);
      console.error(`- Bản ghi thất bại: ID ${outcome.failedTarget?.id} (${outcome.failedTarget?.error})`);
      console.error(`- Bản ghi đã mutation: ${outcome.mutatedTargets.map(m => m.id).join(', ') || 'Không có'}`);
      console.error(`- Bản ghi chưa mutation: ${outcome.unmutatedTargets.map(u => u.id).join(', ') || 'Không có'}`);
      console.error(`- Lệnh hoàn tác khẩn cấp:\n  ${outcome.rollbackCommand}\n`);
      process.exit(1);
    }

    printComparisonTable(outcome.results);

    if (outcome.auditStatus === 'AUDIT_VERIFICATION_FAILED') {
      console.error(`\n❌ XÁC MINH NHẬT KÝ KIỂM TOÁN THẤT BẠI: ${outcome.auditVerification.message}`);
      console.error('Trạng thái nghiệm thu G9.2: complete = false (AUDIT_VERIFICATION_FAILED).');
      process.exit(1);
    }

    if (outcome.auditStatus === 'AUDIT_VERIFICATION_DEFERRED') {
      console.log('⚠️ Thao tác cập nhật đã ghi thành công, nhưng ĐANG CHỜ XÁC MINH AUDIT:');
      console.log(`   ${outcome.auditVerification.message}`);
      console.log('   Trạng thái nghiệm thu G9.2: complete = false (CHỜ XÁC MINH AUDIT).');
      return;
    }

    if (outcome.complete) {
      console.log('✅ Toàn bộ các địa điểm thử nghiệm đã được lưu trữ (archived) và kiểm toán đầy đủ thành công!');
      console.log('   Trạng thái nghiệm thu G9.2: COMPLETE (100% AUDIT VERIFIED).');
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Lỗi thực thi cleanup:', err.message || err);
    process.exit(1);
  });
}
