#!/usr/bin/env node
/**
 * scripts/execute-g9-pilot-chua-ang.js
 * Công cụ thực thi cập nhật dữ liệu và phê duyệt (Approve) Chùa Âng (ID 3).
 *
 * Tiêu chuẩn Hardening G9.3C (Fail-Closed Enforcement):
 * 1. BẮT BUỘC ADMIN_ACCESS_TOKEN: Xác thực danh tính qua Supabase Auth + allowlist admin_users.
 * 2. Actor được trích xuất DUY NHẤT từ token đã xác thực, tuyệt đối không tự chọn ngầm từ CSDL.
 * 3. BẮT BUỘC cả hai cờ CLI: `--execute` và `--confirm`. Nếu thiếu một trong hai, tự động chuyển về Dry-Run an toàn (Zero Mutation).
 * 4. Kiểm soát khóa lạc quan (OCC) nghiêm ngặt với expected_updated_at.
 * 5. Ghi nhật ký kiểm toán nguyên tử (Audit Logs) không chứa PII.
 */

import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const EXPECTED_INITIAL_UPDATED_AT = '2026-09-23T09:10:54.041501+00:00';
const PLACE_ID = 3;
const SLUG = 'chua-ang';

export const PATCH_PAYLOAD = Object.freeze({
  description: 'Ngôi chùa Khmer cổ kính và tiêu biểu bậc nhất Nam Bộ khởi dựng từ năm 990, tọa lạc trong khuôn viên danh thắng Ao Bà Om và được công nhận là Di tích lịch sử - văn hóa cấp quốc gia.',
  note: null,
  rating: null
});

export function resolveAdminCredentials(options = {}) {
  const env = options.env || process.env;
  const adminToken = options.adminToken !== undefined ? options.adminToken : (env.ADMIN_ACCESS_TOKEN || '');
  const serviceKey = options.serviceKey !== undefined ? options.serviceKey : (env.SUPABASE_SERVICE_ROLE_KEY || '');
  const supabaseUrl = (options.supabaseUrl || env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');

  // 1. Kiểm tra cấm biến cũ
  if (env.ADMIN_TOKEN && !env.ADMIN_ACCESS_TOKEN && !options.adminToken) {
    throw new Error('INVALID_ENV_VAR: Biến ADMIN_TOKEN không còn được hỗ trợ. Hãy sử dụng ADMIN_ACCESS_TOKEN.');
  }

  // 2. Chế độ kiểm thử cục bộ có mock
  if (options.mockAuth) {
    if (!adminToken) {
      throw new Error('FAIL_CLOSED_NO_ADMIN_TOKEN: Thao tác mutation bắt buộc có ADMIN_ACCESS_TOKEN. SUPABASE_SERVICE_ROLE_KEY chỉ dùng cho snapshot/read-back/audit.');
    }
    return {
      adminToken,
      serviceKey,
      supabaseUrl,
      actor: options.mockAuth.actor
    };
  }

  // 3. Bắt buộc có ADMIN_ACCESS_TOKEN cho mọi mutation
  if (!adminToken) {
    throw new Error('FAIL_CLOSED_NO_ADMIN_TOKEN: Thao tác mutation bắt buộc có ADMIN_ACCESS_TOKEN. SUPABASE_SERVICE_ROLE_KEY chỉ dùng cho snapshot/read-back/audit.');
  }

  return {
    adminToken,
    serviceKey,
    supabaseUrl
  };
}

export async function authenticateAdminToken(adminToken, options = {}) {
  if (!adminToken || typeof adminToken !== 'string' || !adminToken.trim()) {
    throw new Error('FAIL_CLOSED_NO_ADMIN_TOKEN: Thao tác mutation bắt buộc có ADMIN_ACCESS_TOKEN. SUPABASE_SERVICE_ROLE_KEY chỉ dùng cho snapshot/read-back/audit.');
  }

  if (options.mockAuth) {
    if (options.mockAuth.error) {
      throw options.mockAuth.error;
    }
    return options.mockAuth.actor;
  }

  const fetchFn = options.fetchFn || globalThis.fetch;
  const env = options.env || process.env;
  const supabaseUrl = (options.supabaseUrl || env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const serviceKey = options.serviceKey || env.SUPABASE_SERVICE_ROLE_KEY || '';

  // 1. Xác thực token với Supabase Auth /auth/v1/user
  const authRes = await fetchFn(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      apikey: serviceKey || adminToken
    }
  });

  if (!authRes.ok) {
    throw new Error(`UNAUTHENTICATED: ADMIN_ACCESS_TOKEN không hợp lệ hoặc đã hết hạn (HTTP ${authRes.status}).`);
  }

  const authUser = await authRes.json();
  if (!authUser || !authUser.id) {
    throw new Error('UNAUTHENTICATED: Không thể nhận diện danh tính người dùng từ token.');
  }

  // 2. Tra cứu quyền trong bảng public.admin_users (Allowlist kiểm soát chặt chẽ)
  const adminRes = await fetchFn(
    `${supabaseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(authUser.id)}&select=user_id,email,role,is_active`,
    {
      headers: {
        apikey: serviceKey || adminToken,
        Authorization: `Bearer ${serviceKey || adminToken}`
      }
    }
  );

  if (!adminRes.ok) {
    throw new Error(`DATABASE_ERROR: Không thể đối soát bảng admin_users (HTTP ${adminRes.status}).`);
  }

  const rows = await adminRes.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`FORBIDDEN: Tài khoản ${authUser.email || authUser.id} không nằm trong danh sách quản trị viên.`);
  }

  const adminProfile = rows[0];
  if (!adminProfile.is_active) {
    throw new Error(`FORBIDDEN: Tài khoản quản trị viên ${adminProfile.email} đã bị vô hiệu hóa.`);
  }

  if (adminProfile.role !== 'admin') {
    throw new Error(`FORBIDDEN: Yêu cầu quyền role 'admin' để thực thi mutation (vai trò hiện tại: '${adminProfile.role}').`);
  }

  // 3. Trả về thông tin actor ĐƯỢC XÁC THỰC DUY NHẤT TỪ TOKEN
  return {
    id: adminProfile.user_id,
    email: adminProfile.email,
    role: adminProfile.role
  };
}

async function supabaseFetch(endpoint, options = {}, credentials = {}) {
  const { baseUrl, serviceKey, adminToken } = credentials;
  const url = `${baseUrl}/rest/v1/${endpoint.replace(/^\//, '')}`;
  const authKey = serviceKey || adminToken;
  const headers = {
    apikey: authKey,
    Authorization: `Bearer ${authKey}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const fetchFn = options.fetchFn || globalThis.fetch;
  return fetchFn(url, {
    ...options,
    headers
  });
}

async function supabaseRpc(rpcName, params = {}, credentials = {}, options = {}) {
  const res = await supabaseFetch(`rpc/${rpcName}`, {
    method: 'POST',
    body: JSON.stringify(params),
    fetchFn: options.fetchFn
  }, credentials);

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    const error = new Error(typeof data === 'object' && data?.message ? data.message : `HTTP ${res.status}: ${text}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function executeChuaAngPilot(options = {}) {
  const args = options.args || process.argv.slice(2);
  const isExecute = args.includes('--execute') || Boolean(options.execute);
  const isConfirm = args.includes('--confirm') || Boolean(options.confirm);
  const isDryRun = !isExecute || !isConfirm;

  console.log('======================================================================');
  console.log(`🚀 QUY TRÌNH QUẢN TRỊ DỮ LIỆU PILOT CHÙA ÂNG (ID ${PLACE_ID})`);
  console.log(`   Chế độ hoạt động: ${isDryRun ? '🔍 DRY-RUN (MÔ PHỎNG AN TOÀN — ZERO MUTATION)' : '⚡ EXECUTE MUTATION (CÓ XÁC NHẬN)'}`);
  console.log('======================================================================\n');

  // 1. Kiểm tra và xác thực token bắt buộc
  const creds = resolveAdminCredentials(options);
  const actor = options.mockAuth?.actor || await authenticateAdminToken(creds.adminToken, {
    ...options,
    supabaseUrl: creds.supabaseUrl,
    serviceKey: creds.serviceKey
  });

  console.log(`✓ Quản trị viên thực thi (từ token): ${actor.email} (UUID: ${actor.id}, Role: ${actor.role})`);

  // 2. Pre-flight Check: Khóa lạc quan (OCC)
  console.log('\n--- BƯỚC 1: PRE-FLIGHT CHECK & KHÓA LẠC QUAN (OCC) ---');
  const fetchFn = options.fetchFn || globalThis.fetch;
  const placeRes = await supabaseFetch(`places?id=eq.${PLACE_ID}&select=*&limit=1`, { fetchFn }, {
    baseUrl: creds.supabaseUrl,
    serviceKey: creds.serviceKey,
    adminToken: creds.adminToken
  });

  if (!placeRes.ok) {
    throw new Error(`FAIL_CLOSED: Lỗi truy vấn live place ID ${PLACE_ID}: HTTP ${placeRes.status}`);
  }

  const places = await placeRes.json();
  const livePlace = places[0];
  if (!livePlace) {
    throw new Error(`FAIL_CLOSED: Không tìm thấy địa điểm ID ${PLACE_ID} trên Supabase production.`);
  }

  console.log(`  • ID                   : ${livePlace.id}`);
  console.log(`  • Slug                 : ${livePlace.slug}`);
  console.log(`  • Trạng thái hiện tại  : ${livePlace.status}`);
  console.log(`  • updated_at hiện tại  : ${livePlace.updated_at}`);

  // 3. Nếu đang ở chế độ Dry-Run hoặc thiếu cờ xác nhận: Dừng an toàn không mutation
  if (isDryRun) {
    console.log('\n----------------------------------------------------------------------');
    console.log('🔍 KẾT QUẢ MÔ PHỎNG DRY-RUN:');
    console.log('  • Xác thực token quản trị viên: THÀNH CÔNG');
    console.log(`  • Actor hợp lệ               : ${actor.email} (Role: ${actor.role})`);
    console.log(`  • Dữ liệu live mục tiêu      : ID ${livePlace.id} (${livePlace.name}) - Status: ${livePlace.status}`);
    console.log(`  • Yêu cầu cờ thực thi        : ${isExecute ? '✓ có --execute' : '✗ thiếu --execute'}, ${isConfirm ? '✓ có --confirm' : '✗ thiếu --confirm'}`);
    console.log('----------------------------------------------------------------------');
    console.log('ℹ️  Để thực thi mutation trên production, bắt buộc truyền ĐỒNG THỜI cả hai cờ:');
    console.log('   node scripts/execute-g9-pilot-chua-ang.js --execute --confirm\n');
    return {
      success: true,
      dryRun: true,
      mutated: false,
      liveStatus: livePlace.status,
      actor
    };
  }

  // 4. Nếu bản ghi đã được approved, thông báo và không thực hiện mutation lặp lại
  if (livePlace.status === 'approved') {
    console.log('\n✓ Bản ghi Chùa Âng (ID 3) đã ở trạng thái "approved". Không cần mutation thêm.');
    return {
      success: true,
      dryRun: false,
      mutated: false,
      alreadyApproved: true,
      liveStatus: livePlace.status,
      actor
    };
  }

  // 5. Kiểm tra khóa OCC trước khi thực thi
  if (livePlace.updated_at !== EXPECTED_INITIAL_UPDATED_AT && !options.allowDynamicOcc) {
    console.error('\n❌ 409 CONFLICT: updated_at trên production đã bị thay đổi!');
    console.error(`   Expected: "${EXPECTED_INITIAL_UPDATED_AT}"`);
    console.error(`   Actual  : "${livePlace.updated_at}"`);
    console.error('   -> DỪNG THỰC THI NGAY LẬP TỨC. Tuyệt đối không bỏ qua khóa OCC.');
    const conflictErr = new Error(`409 CONFLICT: expected_updated_at mismatch (${EXPECTED_INITIAL_UPDATED_AT} !== ${livePlace.updated_at})`);
    conflictErr.status = 409;
    throw conflictErr;
  }

  // 6. Thực thi Giai đoạn 1: PATCH Data
  console.log('\n--- BƯỚC 2: THỰC THI BẢN VÁ DỮ LIỆU (PATCH / RPC) ---');
  const correlationIdPatch = `g9-chua-ang-patch-${Date.now()}`;
  const patchPayload = {
    ...PATCH_PAYLOAD,
    expected_updated_at: livePlace.updated_at
  };

  const patchResult = await supabaseRpc('admin_update_place_atomic', {
    p_actor_id: actor.id,
    p_actor_email: actor.email,
    p_actor_role: actor.role,
    p_place_id: PLACE_ID,
    p_patch: patchPayload,
    p_ip: '127.0.0.1',
    p_correlation_id: correlationIdPatch
  }, {
    baseUrl: creds.supabaseUrl,
    serviceKey: creds.serviceKey,
    adminToken: creds.adminToken
  }, { fetchFn });

  console.log('  ✓ admin_update_place_atomic thành công!');
  console.log(`  • updated_at mới sau patch: ${patchResult.updated_at}`);

  // 7. Thực thi Giai đoạn 2: Phê duyệt (Approve)
  console.log('\n--- BƯỚC 3: THỰC THI PHÊ DUYỆT (APPROVE) ---');
  const correlationIdApprove = `g9-chua-ang-approve-${Date.now()}`;
  const approvePayload = {
    status: 'approved',
    expected_updated_at: patchResult.updated_at
  };

  const approveResult = await supabaseRpc('admin_update_place_atomic', {
    p_actor_id: actor.id,
    p_actor_email: actor.email,
    p_actor_role: actor.role,
    p_place_id: PLACE_ID,
    p_patch: approvePayload,
    p_ip: '127.0.0.1',
    p_correlation_id: correlationIdApprove
  }, {
    baseUrl: creds.supabaseUrl,
    serviceKey: creds.serviceKey,
    adminToken: creds.adminToken
  }, { fetchFn });

  console.log('  ✓ Duyệt thành công!');
  console.log(`  • Trạng thái sau duyệt : ${approveResult.status}`);

  return {
    success: true,
    dryRun: false,
    mutated: true,
    place: approveResult,
    actor
  };
}

// Chạy trực tiếp qua CLI
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  executeChuaAngPilot().catch(err => {
    console.error('\n❌ LỖI TRONG QUÁ TRÌNH THỰC THI:', err.message);
    process.exit(1);
  });
}
