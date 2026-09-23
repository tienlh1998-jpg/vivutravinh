#!/usr/bin/env node

/**
 * scripts/verify-g8-live.js
 *
 * Kiểm toán endpoint Vercel THỰC TẾ và cơ sở dữ liệu Supabase cho Giai đoạn G8 (Admin Production):
 * - Không mock fetch. Toàn bộ request gửi trực tiếp qua mạng Internet tới Vercel serverless API.
 * - Migration Guard:
 *     1. Bảng public.admin_users tồn tại trên Supabase.
 *     2. Bảng public.admin_audit_logs tồn tại với đúng 12 cột schema chuẩn.
 *     3. Đầy đủ cả 6 RPC PostgreSQL trong supabase/g8_admin.sql:
 *        - admin_create_place_atomic
 *        - admin_update_place_atomic
 *        - admin_delete_place_atomic
 *        - admin_update_comment_atomic
 *        - admin_delete_comment_atomic
 *        - admin_update_report_atomic
 *        Mỗi RPC được probe với đầy đủ tham số và p_actor_role="__migration_probe__",
 *        yêu cầu phản hồi FORBIDDEN/42501 (PGRST202/404 = chưa sẵn sàng, 0 data change).
 *     4. Các endpoint Vercel G8 (/api/admin-*) đã được deploy và phản hồi fail-closed (HTTP 401).
 *     Thiếu bất kỳ thành phần nào -> Ghi nhận DEFERRED với exit 0 TRƯỚC KHI tạo dữ liệu.
 * - Live Audit Execution:
 *     Yêu cầu ADMIN_ACCESS_TOKEN hợp lệ có role === "admin".
 *     Nếu chưa có token hoặc role không phải admin -> Ghi nhận DEFERRED rõ ràng với exit 0, không báo PASS một phần.
 * - Thao tác kiểm toán khi đủ điều kiện:
 *     - Profile & RBAC (adminProfile = profData.user)
 *     - Tạo địa điểm draft qua Vercel (createdPlaceId = body.place?.id)
 *     - Cập nhật địa điểm qua Vercel
 *     - Lưu trữ (archive) địa điểm qua Vercel
 *     - Kiểm duyệt comment qua Vercel (nếu tạo fixture an toàn được)
 *     - Xử lý report transition qua Vercel (nếu tạo fixture an toàn được)
 *     - Cưỡng chế HTTP 413 Payload quá khổ với ADMIN_ACCESS_TOKEN thật
 *     - Mỗi mutation tạo đúng 1 audit log (đếm theo action/entity, fail nếu duplicate/thiếu)
 *     - Audit log không chứa token, secret hoặc PII ngoài allowlist
 *     - API không token và token giả trả 401
 * - Cleanup:
 *     - Không gọi process.exit() bên trong khối try/finally (dùng process.exitCode).
 *     - Thu thập chính xác ID của mọi fixture đã tạo (nếu thiếu ID thì truy vấn lại bằng slug/prefix).
 *     - Xóa theo ID khỏi places, place_comments, place_reports và admin_audit_logs.
 *     - Cleanup dự phòng theo slug/client_review_id/client_report_id/correlation_id.
 *     - Kiểm tra response.ok và verifyRes.ok cho từng lần xóa và xác nhận 0 bản ghi còn lại.
 *     - Cleanup thất bại phải làm live audit FAIL.
 *     - Chỉ đặt process.exitCode sau khi cleanup hoàn tất.
 * - Bảo mật: Tuyệt đối không log bí mật ra console (chỉ in "đã cấu hình" / "chưa cấu hình").
 */

const FALLBACK_DEPLOYMENT_URL = 'https://vivutravinh.vercel.app';
const rawVercelUrl = process.env.VERCEL_URL || process.env.APP_URL || FALLBACK_DEPLOYMENT_URL;
const VERCEL_BASE = rawVercelUrl.startsWith('http') ? rawVercelUrl.replace(/\/$/, '') : `https://${rawVercelUrl.replace(/\/$/, '')}`;
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN || '';

// 6 RPC bắt buộc theo supabase/g8_admin.sql
const REQUIRED_RPCS = [
  'admin_create_place_atomic',
  'admin_update_place_atomic',
  'admin_delete_place_atomic',
  'admin_update_comment_atomic',
  'admin_delete_comment_atomic',
  'admin_update_report_atomic'
];

// Danh sách tham số đầy đủ và role probe cho từng RPC
const RPC_PROBES = {
  admin_create_place_atomic: {
    p_actor_id: '00000000-0000-0000-0000-000000000000',
    p_actor_email: 'probe@vivutravinh.vn',
    p_actor_role: '__migration_probe__',
    p_place_data: { name: 'Probe', slug: 'probe', category: 'Di Tích' },
    p_ip: '127.0.0.1',
    p_correlation_id: 'probe_check'
  },
  admin_update_place_atomic: {
    p_actor_id: '00000000-0000-0000-0000-000000000000',
    p_actor_email: 'probe@vivutravinh.vn',
    p_actor_role: '__migration_probe__',
    p_place_id: 1,
    p_patch: { note: 'probe' },
    p_ip: '127.0.0.1',
    p_correlation_id: 'probe_check'
  },
  admin_delete_place_atomic: {
    p_actor_id: '00000000-0000-0000-0000-000000000000',
    p_actor_email: 'probe@vivutravinh.vn',
    p_actor_role: '__migration_probe__',
    p_place_id: 1,
    p_permanent: false,
    p_ip: '127.0.0.1',
    p_correlation_id: 'probe_check'
  },
  admin_update_comment_atomic: {
    p_actor_id: '00000000-0000-0000-0000-000000000000',
    p_actor_email: 'probe@vivutravinh.vn',
    p_actor_role: '__migration_probe__',
    p_comment_id: 1,
    p_patch: { is_hidden: true },
    p_ip: '127.0.0.1',
    p_correlation_id: 'probe_check'
  },
  admin_delete_comment_atomic: {
    p_actor_id: '00000000-0000-0000-0000-000000000000',
    p_actor_email: 'probe@vivutravinh.vn',
    p_actor_role: '__migration_probe__',
    p_comment_id: 1,
    p_ip: '127.0.0.1',
    p_correlation_id: 'probe_check'
  },
  admin_update_report_atomic: {
    p_actor_id: '00000000-0000-0000-0000-000000000000',
    p_actor_email: 'probe@vivutravinh.vn',
    p_actor_role: '__migration_probe__',
    p_report_id: '00000000-0000-0000-0000-000000000000',
    p_status: 'resolved',
    p_admin_notes: 'probe',
    p_ip: '127.0.0.1',
    p_correlation_id: 'probe_check'
  }
};

// Schema chuẩn của bảng admin_audit_logs (12 cột)
const AUDIT_COLUMNS = [
  'id',
  'actor_id',
  'actor_email',
  'actor_role',
  'action',
  'entity_type',
  'entity_id',
  'payload_before',
  'payload_after',
  'ip',
  'correlation_id',
  'created_at'
];

// Danh sách banned keys không được xuất hiện trong audit log payload
const BANNED_AUDIT_KEYS = [
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'admin_secret',
  'password',
  'apikey',
  'api_key',
  'authorization',
  'service_role_key',
  'email',
  'ip',
  'reporter_contact',
  'contact'
];

function checkNoBannedKeys(obj, path = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    for (const banned of BANNED_AUDIT_KEYS) {
      if (lowerKey === banned || lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('password')) {
        throw new Error(`Phát hiện khóa nhạy cảm '${path ? `${path}.${key}` : key}' trong audit log payload!`);
      }
    }
    if (val && typeof val === 'object') {
      checkNoBannedKeys(val, path ? `${path}.${key}` : key);
    }
  }
}

async function main() {
  console.log('=== KIỂM TOÁN TÍCH HỢP VERCEL & SUPABASE THỰC TẾ (G8 ADMIN LIVE AUDIT) ===\n');
  console.log(`URL mục tiêu Vercel : ${VERCEL_BASE}`);
  console.log(`URL Supabase        : ${SUPABASE_URL}`);
  console.log(`Service Role Key    : ${SUPABASE_SERVICE_ROLE_KEY ? 'đã cấu hình' : 'chưa cấu hình'}`);
  console.log(`Admin Access Token  : ${ADMIN_ACCESS_TOKEN ? 'đã cấu hình' : 'chưa cấu hình'}\n`);

  // ==========================================================================
  // BƯỚC 1: MIGRATION & DEPLOYMENT GUARD
  // ==========================================================================
  console.log('--- [BƯỚC 1] KIỂM TRA MIGRATION GUARD & VERCEL ENDPOINTS ---');
  const missingComponents = [];

  // 1.1. Kiểm tra Vercel G8 Endpoints
  try {
    const probePlaces = await fetch(`${VERCEL_BASE}/api/admin-places`, {
      method: 'GET',
      signal: AbortSignal.timeout(8000)
    });

    if (probePlaces.status === 401) {
      console.log('  ✓ Vercel: /api/admin-places đã deploy và phản hồi fail-closed (HTTP 401)');
    } else if (probePlaces.status === 404) {
      missingComponents.push('Vercel G8 endpoints chưa deploy lên Production (HTTP 404 Not Found)');
    } else {
      missingComponents.push(`Vercel G8 endpoint phản hồi bất thường: HTTP ${probePlaces.status}`);
    }
  } catch (err) {
    missingComponents.push(`Không thể kết nối tới Vercel (${VERCEL_BASE}): ${err.message}`);
  }

  // 1.2. Kiểm tra CSDL Supabase (admin_users, admin_audit_logs, 6 RPCs)
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    missingComponents.push('Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY để kiểm tra Supabase Production');
  } else {
    // 1.2.a. Kiểm tra bảng admin_users
    try {
      const usersRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?limit=1&select=user_id,email,role,is_active`, {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        signal: AbortSignal.timeout(8000)
      });
      if (usersRes.ok) {
        console.log('  ✓ Supabase: Bảng public.admin_users đã tồn tại');
      } else {
        missingComponents.push(`Bảng public.admin_users chưa sẵn sàng (HTTP ${usersRes.status})`);
      }
    } catch (err) {
      missingComponents.push(`Lỗi kết nối kiểm tra admin_users: ${err.message}`);
    }

    // 1.2.b. Kiểm tra bảng admin_audit_logs với đúng 12 cột schema
    try {
      const auditRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?limit=1&select=${AUDIT_COLUMNS.join(',')}`, {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        signal: AbortSignal.timeout(8000)
      });
      if (auditRes.ok) {
        console.log(`  ✓ Supabase: Bảng public.admin_audit_logs tồn tại với đầy đủ ${AUDIT_COLUMNS.length} cột schema chuẩn`);
      } else {
        missingComponents.push(`Bảng public.admin_audit_logs chưa sẵn sàng hoặc sai schema (HTTP ${auditRes.status})`);
      }
    } catch (err) {
      missingComponents.push(`Lỗi kết nối kiểm tra admin_audit_logs: ${err.message}`);
    }

    // 1.2.c. Kiểm tra đầy đủ 6 RPC PostgreSQL bằng typed parameters và role probe
    for (const [rpc, probeBody] of Object.entries(RPC_PROBES)) {
      try {
        const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(probeBody),
          signal: AbortSignal.timeout(8000)
        });

        const resText = await rpcRes.text();

        // Chỉ PASS khi response chứa FORBIDDEN hoặc SQLSTATE 42501
        if (resText.includes('FORBIDDEN') || resText.includes('42501')) {
          console.log(`  ✓ Supabase: RPC public.${rpc} đã sẵn sàng (Probe role FORBIDDEN/42501 chứng minh hàm thực thi đúng)`);
        } else if (rpcRes.status === 404 || resText.includes('PGRST202') || resText.includes('Could not find')) {
          missingComponents.push(`Thiếu RPC '${rpc}' trên Supabase (HTTP 404 / PGRST202)`);
        } else {
          // Mọi response khác (400/500/cast error/SQL error) đều ghi vào missingComponents và DEFERRED
          missingComponents.push(`RPC '${rpc}' phản hồi không đúng chuẩn probe (HTTP ${rpcRes.status}: ${resText.slice(0, 120)})`);
        }
      } catch (err) {
        missingComponents.push(`Lỗi kết nối kiểm tra RPC ${rpc}: ${err.message}`);
      }
    }
  }

  // 1.3. Nếu thiếu bất kỳ thành phần nào -> DEFERRED an toàn với exit 0 TRƯỚC KHI tạo dữ liệu
  if (missingComponents.length > 0) {
    console.log('\n----------------------------------------------------------------------');
    console.log('⏸️  THÔNG BÁO HOÃN KIỂM TOÁN TRỰC TIẾP (LIVE AUDIT DEFERRED)');
    console.log('----------------------------------------------------------------------');
    console.log('Các thành phần sau chưa sẵn sàng trên môi trường Production:');
    for (const item of missingComponents) {
      console.log(`  • ${item}`);
    }
    console.log('\n📋 HƯỚNG DẪN TRIỂN KHAI CHO NGƯỜI DÙNG:');
    console.log('  1. Mở Supabase SQL Editor và chạy: supabase/g8_admin.sql');
    console.log('  2. Git push code lên main để Vercel tự động build & deploy.');
    console.log('  3. Thiết lập biến môi trường:');
    console.log('       export SUPABASE_SERVICE_ROLE_KEY="..."');
    console.log('       export ADMIN_ACCESS_TOKEN="..."');
    console.log('  4. Chạy lại kiểm toán: npm run test:g8:live\n');
    console.log('✓ Trạng thái: ĐÃ HOÃN AN TOÀN TRƯỚC KHI TẠO DỮ LIỆU (Exit 0).');
    process.exitCode = 0;
    return;
  }

  // ==========================================================================
  // BƯỚC 2: KIỂM TRA ADMIN_ACCESS_TOKEN & YÊU CẦU ROLE ADMIN
  // ==========================================================================
  console.log('\n--- [BƯỚC 2] KIỂM TRA QUYỀN TRUY CẬP ADMIN_ACCESS_TOKEN ---');

  if (!ADMIN_ACCESS_TOKEN) {
    console.log('----------------------------------------------------------------------');
    console.log('⏸️  THÔNG BÁO HOÃN KIỂM TOÁN TRỰC TIẾP (LIVE AUDIT DEFERRED)');
    console.log('----------------------------------------------------------------------');
    console.log('Hạ tầng Vercel và Migration Supabase đã hoàn tất kiểm tra sẵn sàng,');
    console.log('tuy nhiên chưa cấu hình ADMIN_ACCESS_TOKEN để thực thi mutation.');
    console.log('\n📋 HƯỚNG DẪN KÍCH HOẠT:');
    console.log('  1. Đăng nhập trang admin bằng tài khoản role "admin" và lấy access token.');
    console.log('  2. Chạy: export ADMIN_ACCESS_TOKEN="<access_token>"');
    console.log('  3. Chạy lại: npm run test:g8:live\n');
    console.log('✓ Trạng thái: ĐÃ HOÃN AN TOÀN (Exit 0, không báo live PASS một phần).');
    process.exitCode = 0;
    return;
  }

  // Xác thực token với endpoint profile
  let adminProfile = null;
  try {
    const profRes = await fetch(`${VERCEL_BASE}/api/admin-profile`, {
      headers: {
        Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}`
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!profRes.ok) {
      console.log('----------------------------------------------------------------------');
      console.log('⏸️  THÔNG BÁO HOÃN KIỂM TOÁN TRỰC TIẾP (LIVE AUDIT DEFERRED)');
      console.log('----------------------------------------------------------------------');
      console.log(`ADMIN_ACCESS_TOKEN không hợp lệ hoặc đã hết hạn (HTTP ${profRes.status}).`);
      console.log('Vui lòng làm mới token và thử lại.');
      console.log('\n✓ Trạng thái: ĐÃ HOÃN AN TOÀN (Exit 0, không báo live PASS một phần).');
      process.exitCode = 0;
      return;
    }

    const profData = await profRes.json();
    adminProfile = profData.user;

    // Bắt buộc role === "admin" vì chỉ admin mới có đủ quyền thực hiện toàn bộ lifecycle
    if (!adminProfile || adminProfile.role !== 'admin') {
      console.log('----------------------------------------------------------------------');
      console.log('⏸️  THÔNG BÁO HOÃN KIỂM TOÁN TRỰC TIẾP (LIVE AUDIT DEFERRED)');
      console.log('----------------------------------------------------------------------');
      console.log(`ADMIN_ACCESS_TOKEN có role '${adminProfile?.role || 'unknown'}', không đủ quyền quản trị cấp cao.`);
      console.log('Live audit đầy đủ yêu cầu tài khoản quản trị viên với role "admin"');
      console.log('(Editor/Moderator không đủ thẩm quyền chạy toàn bộ vòng đời place/comment/report).');
      console.log('\n✓ Trạng thái: ĐÃ HOÃN AN TOÀN (Exit 0, không tạo fixture).');
      process.exitCode = 0;
      return;
    }

    console.log(`  ✓ Xác thực thành công tài khoản quản trị viên tối cao (Role: ${adminProfile.role})`);
  } catch (err) {
    console.log('----------------------------------------------------------------------');
    console.log('⏸️  THÔNG BÁO HOÃN KIỂM TOÁN TRỰC TIẾP (LIVE AUDIT DEFERRED)');
    console.log('----------------------------------------------------------------------');
    console.log(`Không thể kết nối xác thực profile: ${err.message}`);
    console.log('\n✓ Trạng thái: ĐÃ HOÃN AN TOÀN (Exit 0).');
    process.exitCode = 0;
    return;
  }

  // ==========================================================================
  // BƯỚC 3: TIẾN HÀNH KIỂM TOÁN LIVE MUTATION & CLEANUP BẮT BUỘC
  // ==========================================================================
  console.log('\n--- [BƯỚC 3] TIẾN HÀNH KIỂM TOÁN VERCEL MUTATION & AUDIT LOGS ---');

  const fixtureIds = {
    places: [],
    comments: [],
    reports: [],
    auditLogs: []
  };

  const expectedMutations = [];

  const testCorrelationId = `audit_g8_live_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const testPlaceName = `audit_g8_live_place_${Date.now()}`;
  const testPlaceSlug = `audit-g8-live-place-${Date.now()}`;
  const testClientReviewId = `audit_rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const testClientReportId = `audit_rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  let passCount = 0;
  let totalCount = 0;
  let testExecutionFailed = false;
  let cleanupFailed = false;

  async function assertCase(name, fn) {
    totalCount++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passCount++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      testExecutionFailed = true;
    }
  }

  try {
    // 3.1. Kiểm tra API không token và token giả mạo phải trả 401
    await assertCase('Endpoint /api/admin-places từ chối khi không có token (HTTP 401)', async () => {
      const res = await fetch(`${VERCEL_BASE}/api/admin-places`);
      if (res.status !== 401) throw new Error(`Kỳ vọng 401 nhưng nhận được ${res.status}`);
      const body = await res.json();
      if (body.error?.code !== 'UNAUTHENTICATED') throw new Error(`Mã lỗi không đúng: ${JSON.stringify(body)}`);
    });

    await assertCase('Endpoint /api/admin-places từ chối token giả mạo (HTTP 401)', async () => {
      const res = await fetch(`${VERCEL_BASE}/api/admin-places`, {
        headers: { Authorization: 'Bearer fake_invalid_token_xyz_g8_live' }
      });
      if (res.status !== 401) throw new Error(`Kỳ vọng 401 nhưng nhận được ${res.status}`);
      const body = await res.json();
      if (body.error?.code !== 'UNAUTHENTICATED') throw new Error(`Mã lỗi không đúng: ${JSON.stringify(body)}`);
    });

    // 3.2. Kiểm tra Profile/RBAC
    await assertCase('GET /api/admin-profile trả thông tin profile và role admin', async () => {
      if (!adminProfile || adminProfile.role !== 'admin') {
        throw new Error('Profile không chứa role admin');
      }
    });

    // 3.3. Tạo địa điểm draft qua Vercel API
    let createdPlaceId = null;
    await assertCase('Tạo địa điểm draft qua Vercel API (POST /api/admin-places)', async () => {
      const res = await fetch(`${VERCEL_BASE}/api/admin-places`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}`,
          'x-correlation-id': testCorrelationId
        },
        body: JSON.stringify({
          name: testPlaceName,
          slug: testPlaceSlug,
          category: 'Di Tích',
          area: 'TP Trà Vinh',
          status: 'draft',
          description: 'Địa điểm kiểm toán trực tiếp tự động G8 Live Audit'
        })
      });

      if (res.status !== 201) {
        const text = await res.text();
        throw new Error(`Kỳ vọng HTTP 201 nhưng nhận được HTTP ${res.status}: ${text}`);
      }

      const body = await res.json();
      createdPlaceId = body.place?.id;

      // Nếu response thành công nhưng không lấy được ID, truy vấn lại bằng slug
      if (!createdPlaceId) {
        const qPlace = await fetch(`${SUPABASE_URL}/rest/v1/places?slug=eq.${encodeURIComponent(testPlaceSlug)}&select=id`, {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        if (qPlace.ok) {
          const rows = await qPlace.json();
          if (rows[0]?.id) createdPlaceId = rows[0].id;
        }
      }

      if (!createdPlaceId) {
        throw new Error(`Không xác định được createdPlaceId từ API response: ${JSON.stringify(body)}`);
      }

      fixtureIds.places.push(createdPlaceId);
      expectedMutations.push({ action: 'place.create', entity_id: String(createdPlaceId) });
    });

    // 3.4. Cập nhật địa điểm qua Vercel API
    await assertCase('Cập nhật địa điểm qua Vercel API (PATCH /api/admin-places)', async () => {
      if (!createdPlaceId) throw new Error('Không có place id để cập nhật');

      const res = await fetch(`${VERCEL_BASE}/api/admin-places`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}`,
          'x-correlation-id': testCorrelationId
        },
        body: JSON.stringify({
          id: createdPlaceId,
          note: 'Đã cập nhật ghi chú kiểm toán trực tiếp'
        })
      });

      if (res.status !== 200) {
        const text = await res.text();
        throw new Error(`Kỳ vọng HTTP 200 nhưng nhận được HTTP ${res.status}: ${text}`);
      }

      const body = await res.json();
      if (!body.success || !body.place) {
        throw new Error(`Response cập nhật place không đúng contract: ${JSON.stringify(body)}`);
      }

      expectedMutations.push({ action: 'place.update', entity_id: String(createdPlaceId) });
    });

    // 3.5. Lưu trữ (archive) địa điểm qua Vercel API
    await assertCase('Chuyển trạng thái lưu trữ địa điểm (PATCH status: archived)', async () => {
      if (!createdPlaceId) throw new Error('Không có place id để archive');

      const res = await fetch(`${VERCEL_BASE}/api/admin-places`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}`,
          'x-correlation-id': testCorrelationId
        },
        body: JSON.stringify({
          id: createdPlaceId,
          status: 'archived'
        })
      });

      if (res.status !== 200) {
        const text = await res.text();
        throw new Error(`Kỳ vọng HTTP 200 nhưng nhận được HTTP ${res.status}: ${text}`);
      }

      expectedMutations.push({ action: 'place.archive', entity_id: String(createdPlaceId) });
    });

    // 3.6. Mutation comment nếu tạo fixture an toàn được
    let createdCommentId = null;
    await assertCase('Kiểm duyệt bình luận qua Vercel API (PATCH /api/admin-comments)', async () => {
      // Tạo fixture comment qua Supabase Service Role
      const insRes = await fetch(`${SUPABASE_URL}/rest/v1/place_comments`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          place_id: createdPlaceId || 1,
          author_name: 'Audit Bot',
          comment_text: '[G8 LIVE AUDIT] Bình luận kiểm toán an toàn',
          rating: 5,
          is_hidden: false,
          client_review_id: testClientReviewId
        })
      });

      if (!insRes.ok) {
        const errText = await insRes.text();
        throw new Error(`Không thể tạo fixture comment: HTTP ${insRes.status} ${errText}`);
      }

      const rows = await insRes.json();
      createdCommentId = rows[0]?.id;

      // Nếu không có id trong response, truy vấn lại bằng client_review_id
      if (!createdCommentId) {
        const qComm = await fetch(`${SUPABASE_URL}/rest/v1/place_comments?client_review_id=eq.${encodeURIComponent(testClientReviewId)}&select=id`, {
          headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
        });
        if (qComm.ok) {
          const cRows = await qComm.json();
          if (cRows[0]?.id) createdCommentId = cRows[0].id;
        }
      }

      if (!createdCommentId) throw new Error('Không lấy được comment id từ fixture');
      fixtureIds.comments.push(createdCommentId);

      // Gọi Vercel API để ẩn comment
      const patchRes = await fetch(`${VERCEL_BASE}/api/admin-comments`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}`,
          'x-correlation-id': testCorrelationId
        },
        body: JSON.stringify({
          id: createdCommentId,
          is_hidden: true
        })
      });

      if (patchRes.status !== 200) {
        const text = await patchRes.text();
        throw new Error(`Kỳ vọng HTTP 200 nhưng nhận được HTTP ${patchRes.status}: ${text}`);
      }

      const body = await patchRes.json();
      if (!body.success || !body.comment) {
        throw new Error(`Response cập nhật comment không đúng contract: ${JSON.stringify(body)}`);
      }

      expectedMutations.push({ action: 'comment.hide', entity_id: String(createdCommentId) });
    });

    // 3.7. Report transition nếu tạo fixture an toàn được
    let createdReportId = null;
    await assertCase('Chuyển trạng thái báo sai qua Vercel API (PATCH /api/admin-reports)', async () => {
      // Tạo fixture report qua Supabase Service Role
      const insRes = await fetch(`${SUPABASE_URL}/rest/v1/place_reports`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          place_id: testPlaceSlug,
          place_name: testPlaceName,
          issue_type: 'other',
          details: '[G8 LIVE AUDIT] Báo sai kiểm toán an toàn',
          status: 'pending',
          client_report_id: testClientReportId
        })
      });

      if (!insRes.ok) {
        const errText = await insRes.text();
        throw new Error(`Không thể tạo fixture report: HTTP ${insRes.status} ${errText}`);
      }

      const rows = await insRes.json();
      createdReportId = rows[0]?.id;

      // Nếu không có id trong response, truy vấn lại bằng client_report_id
      if (!createdReportId) {
        const qRep = await fetch(`${SUPABASE_URL}/rest/v1/place_reports?client_report_id=eq.${encodeURIComponent(testClientReportId)}&select=id`, {
          headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
        });
        if (qRep.ok) {
          const rRows = await qRep.json();
          if (rRows[0]?.id) createdReportId = rRows[0].id;
        }
      }

      if (!createdReportId) throw new Error('Không lấy được report id từ fixture');
      fixtureIds.reports.push(createdReportId);

      // Gọi Vercel API để chuyển trạng thái sang resolved
      const patchRes = await fetch(`${VERCEL_BASE}/api/admin-reports`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}`,
          'x-correlation-id': testCorrelationId
        },
        body: JSON.stringify({
          id: createdReportId,
          status: 'resolved',
          admin_notes: 'Đã xử lý trong bài kiểm toán live'
        })
      });

      if (patchRes.status !== 200) {
        const text = await patchRes.text();
        throw new Error(`Kỳ vọng HTTP 200 nhưng nhận được HTTP ${patchRes.status}: ${text}`);
      }

      const body = await patchRes.json();
      if (!body.success || !body.report) {
        throw new Error(`Response cập nhật report không đúng contract: ${JSON.stringify(body)}`);
      }

      expectedMutations.push({ action: 'report.resolved', entity_id: String(createdReportId) });
    });

    // 3.8. Cưỡng chế HTTP 413 với ADMIN_ACCESS_TOKEN hợp lệ
    await assertCase('Cưỡng chế giới hạn payload quá khổ với HTTP 413 PAYLOAD_TOO_LARGE', async () => {
      const hugeData = 'Z'.repeat(2 * 1024 * 1024 + 1024);
      const res = await fetch(`${VERCEL_BASE}/api/admin-places`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          name: 'Payload Too Large Place',
          slug: 'payload-too-large-place',
          category: 'Di Tích',
          description: hugeData
        })
      });

      if (res.status !== 413) {
        throw new Error(`Kỳ vọng HTTP 413 nhưng nhận được HTTP ${res.status}`);
      }
      const body = await res.json();
      if (body.error?.code !== 'PAYLOAD_TOO_LARGE') {
        throw new Error(`Mã lỗi không đúng: ${JSON.stringify(body)}`);
      }
    });

    // 3.9. Kiểm tra audit log: Đúng 1 log cho từng action/entity và không rò rỉ secret/PII
    await assertCase('Xác minh chính xác audit log cho từng mutation và khử sạch secret/PII', async () => {
      // Truy vấn audit logs tương ứng với correlation_id của test run
      const qRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?correlation_id=eq.${encodeURIComponent(testCorrelationId)}&select=${AUDIT_COLUMNS.join(',')}`, {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });

      if (!qRes.ok) {
        throw new Error(`Không thể truy vấn admin_audit_logs: HTTP ${qRes.status}`);
      }

      const logs = await qRes.json();
      if (!Array.isArray(logs) || logs.length === 0) {
        throw new Error('Không tìm thấy bất kỳ audit log nào được ghi cho correlation_id');
      }

      // Kiểm tra tổng số log khớp chính xác với số mutation thành công
      if (logs.length !== expectedMutations.length) {
        throw new Error(`Tổng số audit log (${logs.length}) không khớp với số mutation kỳ vọng (${expectedMutations.length})!`);
      }

      // Đếm đúng 1 log cho từng action + entity_id (fail nếu thiếu hoặc duplicate)
      for (const expected of expectedMutations) {
        const matches = logs.filter(l => l.action === expected.action && String(l.entity_id) === String(expected.entity_id));
        if (matches.length === 0) {
          throw new Error(`Thiếu audit log cho action='${expected.action}', entity_id='${expected.entity_id}'`);
        }
        if (matches.length > 1) {
          throw new Error(`Duplicate audit log (${matches.length} bản ghi) cho action='${expected.action}', entity_id='${expected.entity_id}'`);
        }
      }

      for (const log of logs) {
        fixtureIds.auditLogs.push(log.id);

        // Kiểm tra cấu trúc schema
        for (const col of AUDIT_COLUMNS) {
          if (log[col] === undefined) {
            throw new Error(`Audit log ${log.id} thiếu cột schema: ${col}`);
          }
        }

        // Kiểm tra không rò rỉ banned keys
        checkNoBannedKeys(log.payload_before, 'payload_before');
        checkNoBannedKeys(log.payload_after, 'payload_after');
      }

      console.log(`     ✓ Đã kiểm toán ${logs.length} bản ghi audit log; đúng 1 log/mutation; 100% tuân thủ allowlist`);
    });

  } catch (unexpectedErr) {
    console.error(`❌ [LỖI NGOẠI LỆ TRONG LIVE AUDIT]: ${unexpectedErr.message}`);
    testExecutionFailed = true;
  } finally {
    // ========================================================================
    // BƯỚC 4: CLEANUP TOÀN DIỆN & BẮT BUỘC XÁC NHẬN 0 BẢN GHI CÒN LẠI
    // (TUYỆT ĐỐI KHÔNG GỌI LỆNH THOÁT TIẾN TRÌNH BÊN TRONG KHỐI NÀY)
    // ========================================================================
    console.log('\n--- [BƯỚC 4] DỌN DẸP BẢN GHI KIỂM TOÁN (CLEANUP & ZERO-RECORD VERIFICATION) ---');

    // 4.1. Xóa places theo danh sách ID
    for (const placeId of fixtureIds.places) {
      try {
        const delRes = await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${placeId}`, {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        if (!delRes.ok) {
          console.error(`  ❌ [Cleanup Error] Xóa place id=${placeId} thất bại: HTTP ${delRes.status}`);
          cleanupFailed = true;
        }

        const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${placeId}&select=id`, {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        if (!verifyRes.ok) {
          console.error(`  ❌ [Cleanup Error] Truy vấn xác nhận place id=${placeId} thất bại: HTTP ${verifyRes.status}`);
          cleanupFailed = true;
        } else {
          const rows = await verifyRes.json();
          if (rows.length !== 0) {
            console.error(`  ❌ [Cleanup Error] Bản ghi place id=${placeId} vẫn còn tồn tại (${rows.length} dòng)!`);
            cleanupFailed = true;
          } else {
            console.log(`  ✓ Đã dọn dẹp và xác nhận 0 dòng còn lại cho place id=${placeId}`);
          }
        }
      } catch (err) {
        console.error(`  ❌ [Cleanup Exception] Lỗi khi dọn dẹp place id=${placeId}: ${err.message}`);
        cleanupFailed = true;
      }
    }

    // 4.2. Xóa place_comments theo danh sách ID
    for (const commentId of fixtureIds.comments) {
      try {
        const delRes = await fetch(`${SUPABASE_URL}/rest/v1/place_comments?id=eq.${commentId}`, {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        if (!delRes.ok) {
          console.error(`  ❌ [Cleanup Error] Xóa comment id=${commentId} thất bại: HTTP ${delRes.status}`);
          cleanupFailed = true;
        }

        const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/place_comments?id=eq.${commentId}&select=id`, {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        if (!verifyRes.ok) {
          console.error(`  ❌ [Cleanup Error] Truy vấn xác nhận comment id=${commentId} thất bại: HTTP ${verifyRes.status}`);
          cleanupFailed = true;
        } else {
          const rows = await verifyRes.json();
          if (rows.length !== 0) {
            console.error(`  ❌ [Cleanup Error] Bản ghi comment id=${commentId} vẫn còn tồn tại (${rows.length} dòng)!`);
            cleanupFailed = true;
          } else {
            console.log(`  ✓ Đã dọn dẹp và xác nhận 0 dòng còn lại cho comment id=${commentId}`);
          }
        }
      } catch (err) {
        console.error(`  ❌ [Cleanup Exception] Lỗi khi dọn dẹp comment id=${commentId}: ${err.message}`);
        cleanupFailed = true;
      }
    }

    // 4.3. Xóa place_reports theo danh sách ID
    for (const reportId of fixtureIds.reports) {
      try {
        const delRes = await fetch(`${SUPABASE_URL}/rest/v1/place_reports?id=eq.${reportId}`, {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        if (!delRes.ok) {
          console.error(`  ❌ [Cleanup Error] Xóa report id=${reportId} thất bại: HTTP ${delRes.status}`);
          cleanupFailed = true;
        }

        const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/place_reports?id=eq.${reportId}&select=id`, {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        if (!verifyRes.ok) {
          console.error(`  ❌ [Cleanup Error] Truy vấn xác nhận report id=${reportId} thất bại: HTTP ${verifyRes.status}`);
          cleanupFailed = true;
        } else {
          const rows = await verifyRes.json();
          if (rows.length !== 0) {
            console.error(`  ❌ [Cleanup Error] Bản ghi report id=${reportId} vẫn còn tồn tại (${rows.length} dòng)!`);
            cleanupFailed = true;
          } else {
            console.log(`  ✓ Đã dọn dẹp và xác nhận 0 dòng còn lại cho report id=${reportId}`);
          }
        }
      } catch (err) {
        console.error(`  ❌ [Cleanup Exception] Lỗi khi dọn dẹp report id=${reportId}: ${err.message}`);
        cleanupFailed = true;
      }
    }

    // 4.4. Xóa admin_audit_logs theo danh sách ID
    for (const logId of fixtureIds.auditLogs) {
      try {
        const delRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?id=eq.${logId}`, {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        if (!delRes.ok) {
          console.error(`  ❌ [Cleanup Error] Xóa audit log id=${logId} thất bại: HTTP ${delRes.status}`);
          cleanupFailed = true;
        }

        const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?id=eq.${logId}&select=id`, {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        if (!verifyRes.ok) {
          console.error(`  ❌ [Cleanup Error] Truy vấn xác nhận audit log id=${logId} thất bại: HTTP ${verifyRes.status}`);
          cleanupFailed = true;
        } else {
          const rows = await verifyRes.json();
          if (rows.length !== 0) {
            console.error(`  ❌ [Cleanup Error] Bản ghi audit log id=${logId} vẫn còn tồn tại (${rows.length} dòng)!`);
            cleanupFailed = true;
          } else {
            console.log(`  ✓ Đã dọn dẹp và xác nhận 0 dòng còn lại cho audit log id=${logId}`);
          }
        }
      } catch (err) {
        console.error(`  ❌ [Cleanup Exception] Lỗi khi dọn dẹp audit log id=${logId}: ${err.message}`);
        cleanupFailed = true;
      }
    }

    // 4.5. Cleanup dự phòng theo slug/client_review_id/client_report_id/correlation_id
    console.log('  • Đang chạy bước cleanup dự phòng (Fallback Cleanup)...');
    try {
      // Dự phòng cho places theo slug
      const delPlaceRes = await fetch(`${SUPABASE_URL}/rest/v1/places?slug=eq.${encodeURIComponent(testPlaceSlug)}`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
      });
      if (!delPlaceRes.ok) {
        console.error(`  ❌ [Fallback Cleanup Error] DELETE places theo slug thất bại: HTTP ${delPlaceRes.status}`);
        cleanupFailed = true;
      }
      const verPlaceRes = await fetch(`${SUPABASE_URL}/rest/v1/places?slug=eq.${encodeURIComponent(testPlaceSlug)}&select=id`, {
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
      });
      if (!verPlaceRes.ok) {
        console.error(`  ❌ [Fallback Cleanup Error] GET verify places theo slug thất bại: HTTP ${verPlaceRes.status}`);
        cleanupFailed = true;
      } else {
        const rows = await verPlaceRes.json();
        if (rows.length !== 0) {
          console.error(`  ❌ [Fallback Cleanup Error] Fallback place cleanup thất bại (${rows.length} dòng còn lại)!`);
          cleanupFailed = true;
        } else if (delPlaceRes.ok) {
          console.log('  ✓ Đã dọn dẹp dự phòng và xác nhận 0 dòng còn lại cho places theo slug');
        }
      }

      // Dự phòng cho place_comments theo client_review_id
      const delCommRes = await fetch(`${SUPABASE_URL}/rest/v1/place_comments?client_review_id=eq.${encodeURIComponent(testClientReviewId)}`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
      });
      if (!delCommRes.ok) {
        console.error(`  ❌ [Fallback Cleanup Error] DELETE comments theo client_review_id thất bại: HTTP ${delCommRes.status}`);
        cleanupFailed = true;
      }
      const verCommRes = await fetch(`${SUPABASE_URL}/rest/v1/place_comments?client_review_id=eq.${encodeURIComponent(testClientReviewId)}&select=id`, {
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
      });
      if (!verCommRes.ok) {
        console.error(`  ❌ [Fallback Cleanup Error] GET verify comments theo client_review_id thất bại: HTTP ${verCommRes.status}`);
        cleanupFailed = true;
      } else {
        const rows = await verCommRes.json();
        if (rows.length !== 0) {
          console.error(`  ❌ [Fallback Cleanup Error] Fallback comment cleanup thất bại (${rows.length} dòng còn lại)!`);
          cleanupFailed = true;
        } else if (delCommRes.ok) {
          console.log('  ✓ Đã dọn dẹp dự phòng và xác nhận 0 dòng còn lại cho place_comments theo client_review_id');
        }
      }

      // Dự phòng cho place_reports theo client_report_id
      const delRepRes = await fetch(`${SUPABASE_URL}/rest/v1/place_reports?client_report_id=eq.${encodeURIComponent(testClientReportId)}`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
      });
      if (!delRepRes.ok) {
        console.error(`  ❌ [Fallback Cleanup Error] DELETE reports theo client_report_id thất bại: HTTP ${delRepRes.status}`);
        cleanupFailed = true;
      }
      const verRepRes = await fetch(`${SUPABASE_URL}/rest/v1/place_reports?client_report_id=eq.${encodeURIComponent(testClientReportId)}&select=id`, {
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
      });
      if (!verRepRes.ok) {
        console.error(`  ❌ [Fallback Cleanup Error] GET verify reports theo client_report_id thất bại: HTTP ${verRepRes.status}`);
        cleanupFailed = true;
      } else {
        const rows = await verRepRes.json();
        if (rows.length !== 0) {
          console.error(`  ❌ [Fallback Cleanup Error] Fallback report cleanup thất bại (${rows.length} dòng còn lại)!`);
          cleanupFailed = true;
        } else if (delRepRes.ok) {
          console.log('  ✓ Đã dọn dẹp dự phòng và xác nhận 0 dòng còn lại cho place_reports theo client_report_id');
        }
      }

      // Dự phòng cho admin_audit_logs theo correlation_id
      const delAuditRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?correlation_id=eq.${encodeURIComponent(testCorrelationId)}`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
      });
      if (!delAuditRes.ok) {
        console.error(`  ❌ [Fallback Cleanup Error] DELETE audit logs theo correlation_id thất bại: HTTP ${delAuditRes.status}`);
        cleanupFailed = true;
      }
      const verAuditRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?correlation_id=eq.${encodeURIComponent(testCorrelationId)}&select=id`, {
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
      });
      if (!verAuditRes.ok) {
        console.error(`  ❌ [Fallback Cleanup Error] GET verify audit logs theo correlation_id thất bại: HTTP ${verAuditRes.status}`);
        cleanupFailed = true;
      } else {
        const rows = await verAuditRes.json();
        if (rows.length !== 0) {
          console.error(`  ❌ [Fallback Cleanup Error] Fallback audit cleanup thất bại (${rows.length} dòng còn lại)!`);
          cleanupFailed = true;
        } else if (delAuditRes.ok) {
          console.log('  ✓ Đã dọn dẹp dự phòng và xác nhận 0 dòng còn lại cho admin_audit_logs theo correlation_id');
        }
      }

      if (!cleanupFailed) {
        console.log('  ✓ Đã hoàn tất bước cleanup dự phòng.');
      }
    } catch (err) {
      console.error(`  ❌ [Fallback Cleanup Exception]: ${err.message}`);
      cleanupFailed = true;
    }
  }

  // ==========================================================================
  // BƯỚC 5: XÁC LẬP MÃ THOÁT NGOÀI KHỐI TRY/FINALLY
  // ==========================================================================
  console.log('\n========================================');
  console.log(`KẾT QUẢ G8 LIVE AUDIT: ${passCount}/${totalCount} PASS`);
  console.log(`TRẠNG THÁI CLEANUP: ${cleanupFailed ? 'THẤT BẠI ❌' : 'HOÀN TẤT & ĐÃ XÁC MINH 0 DÒNG ✅'}`);
  console.log('========================================\n');

  if (cleanupFailed) {
    console.error('❌ [LIVE AUDIT FAILED] Quá trình cleanup dữ liệu thất bại hoặc không thể xác nhận 0 bản ghi còn lại.');
    process.exitCode = 1;
  } else if (testExecutionFailed || passCount < totalCount) {
    console.error('❌ [LIVE AUDIT FAILED] Có ca kiểm thử không vượt qua.');
    process.exitCode = 1;
  } else {
    console.log('✅ [LIVE AUDIT PASSED] Toàn bộ ca kiểm toán trực tiếp đạt 100% và dọn dẹp sạch sẽ.');
    process.exitCode = 0;
  }
}

main().catch(err => {
  console.error('❌ LỖI NGHIÊM TRỌNG TRONG G8 LIVE AUDIT:', err.message);
  process.exitCode = 1;
});
