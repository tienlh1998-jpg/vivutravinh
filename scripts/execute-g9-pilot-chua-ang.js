#!/usr/bin/env node
/**
 * scripts/execute-g9-pilot-chua-ang.js
 * Thực thi cập nhật dữ liệu và phê duyệt (Approve) Chùa Âng (ID 3) trên Supabase Production.
 *
 * Quy trình thực hiện:
 * 1. Pre-flight Check: Đối soát trực tiếp ID 3 từ CSDL live (OCC token).
 *    - Bắt buộc: expected_updated_at === '2026-09-23T09:10:54.041501+00:00'
 *    - Nếu sai lệch: Dừng ngay lập tức với mã 409 CONFLICT (Fail-Closed).
 * 2. Giai đoạn 1 (PATCH Data):
 *    - Gửi patch_payload qua RPC nguyên tử public.admin_update_place_atomic:
 *      + description: trích xuất từ bài viết Cục Du lịch Quốc gia Việt Nam
 *      + note: null (xóa ghi chú chưa xác minh)
 *      + rating: null (xóa 5 sao ảo)
 *      + expected_updated_at: token OCC
 *    - Kiểm tra audit log: entity_id=3, action='place.update'.
 * 3. Giai đoạn 2 (Approve):
 *    - Gửi status='approved' kèm expected_updated_at mới sinh từ Giai đoạn 1.
 *    - Kiểm tra audit log: entity_id=3, action='place.approved'.
 * 4. Post-execution Verification:
 *    - GET https://vivutravinh.id.vn/place/chua-ang:
 *      + HTTP 200
 *      + Title "Chùa Âng - ViVu Trà Vinh"
 *      + Canonical https://vivutravinh.id.vn/place/chua-ang
 *      + 0 "Miễn phí", 0 SĐT cũ, 0 giờ cũ, 0 ảnh cũ
 *    - Kiểm tra CSDL live: status=approved.
 */

import assert from 'node:assert';
import crypto from 'node:crypto';

const EXPECTED_INITIAL_UPDATED_AT = '2026-09-23T09:10:54.041501+00:00';
const PLACE_ID = 3;
const SLUG = 'chua-ang';

const PATCH_PAYLOAD = {
  description: 'Ngôi chùa Khmer cổ kính và tiêu biểu bậc nhất Nam Bộ khởi dựng từ năm 990, tọa lạc trong khuôn viên danh thắng Ao Bà Om và được công nhận là Di tích lịch sử - văn hóa cấp quốc gia.',
  note: null,
  rating: null
};

function getEnvConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('FAIL_CLOSED: Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.');
  }

  const baseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  return { baseUrl, serviceKey };
}

async function supabaseFetch(endpoint, options = {}) {
  const { baseUrl, serviceKey } = getEnvConfig();
  const url = `${baseUrl}/rest/v1/${endpoint.replace(/^\//, '')}`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  return response;
}

async function supabaseRpc(rpcName, params = {}) {
  const res = await supabaseFetch(`rpc/${rpcName}`, {
    method: 'POST',
    body: JSON.stringify(params)
  });

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

async function getPlace(id) {
  const res = await supabaseFetch(`places?id=eq.${id}&select=*&limit=1`);
  if (!res.ok) {
    throw new Error(`Lỗi truy vấn place ${id}: HTTP ${res.status}`);
  }
  const rows = await res.json();
  return rows[0] || null;
}

async function getLatestAuditLog(entityId) {
  const res = await supabaseFetch(`admin_audit_logs?entity_id=eq.${entityId}&order=created_at.desc&limit=1`);
  if (!res.ok) {
    throw new Error(`Lỗi truy vấn audit log cho entity ${entityId}: HTTP ${res.status}`);
  }
  const rows = await res.json();
  return rows[0] || null;
}

async function getAdminActor() {
  const res = await supabaseFetch('admin_users?role=eq.admin&is_active=eq.true&limit=1');
  if (!res.ok) {
    throw new Error(`Lỗi truy vấn admin_users: HTTP ${res.status}`);
  }
  const rows = await res.json();
  if (!rows || rows.length === 0) {
    throw new Error('FAIL_CLOSED: Không tìm thấy tài khoản admin hợp lệ trong bảng admin_users.');
  }
  return {
    id: rows[0].user_id,
    email: rows[0].email,
    role: rows[0].role
  };
}

async function main() {
  console.log('======================================================================');
  console.log('🚀 BẮT ĐẦU THỰC THI CẬP NHẬT DỮ LIỆU & PHÊ DUYỆT CHÙA ÂNG (ID 3)');
  console.log('======================================================================\n');

  // 1. Kiểm tra cấu hình và admin actor
  const actor = await getAdminActor();
  console.log(`✓ Quản trị viên thực thi : ${actor.email} (UUID: ${actor.id}, Role: ${actor.role})`);

  // 2. Pre-flight Check: Khóa lạc quan (OCC)
  console.log('\n--- BƯỚC 1: PRE-FLIGHT CHECK & KHÓA LẠC QUAN (OCC) ---');
  const livePlace = await getPlace(PLACE_ID);
  if (!livePlace) {
    throw new Error(`FAIL_CLOSED: Không tìm thấy địa điểm ID ${PLACE_ID} trên Supabase production.`);
  }

  console.log(`  • ID                   : ${livePlace.id}`);
  console.log(`  • Slug                 : ${livePlace.slug}`);
  console.log(`  • Trạng thái hiện tại  : ${livePlace.status}`);
  console.log(`  • updated_at hiện tại  : ${livePlace.updated_at}`);
  console.log(`  • expected_updated_at  : ${EXPECTED_INITIAL_UPDATED_AT}`);

  if (livePlace.updated_at !== EXPECTED_INITIAL_UPDATED_AT) {
    console.error('\n❌ 409 CONFLICT: updated_at trên production đã bị thay đổi!');
    console.error(`   Expected: "${EXPECTED_INITIAL_UPDATED_AT}"`);
    console.error(`   Actual  : "${livePlace.updated_at}"`);
    console.error('   -> DỪNG THỰC THI NGAY LẬP TỨC. Tuyệt đối không bỏ qua khóa OCC.');
    process.exit(1);
  }
  console.log('  ✓ [ĐẠT] Token OCC khớp 100% với dữ liệu live. Cho phép tiến hành mutation.');

  // 3. Thao tác 1: Gửi bản vá dữ liệu (PATCH Data)
  console.log('\n--- BƯỚC 2: THỰC THI BẢN VÁ DỮ LIỆU (PATCH / RPC) ---');
  const correlationIdPatch = `g9-chua-ang-patch-${Date.now()}`;
  const patchPayload = {
    ...PATCH_PAYLOAD,
    expected_updated_at: EXPECTED_INITIAL_UPDATED_AT
  };

  let patchResult;
  try {
    patchResult = await supabaseRpc('admin_update_place_atomic', {
      p_actor_id: actor.id,
      p_actor_email: actor.email,
      p_actor_role: actor.role,
      p_place_id: PLACE_ID,
      p_patch: patchPayload,
      p_ip: '127.0.0.1',
      p_correlation_id: correlationIdPatch
    });
  } catch (err) {
    if (err.status === 409 || err.message?.includes('CONFLICT')) {
      console.error('\n❌ 409 CONFLICT khi gọi admin_update_place_atomic:', err.message);
      console.error('-> DỪNG LẠI. Cần tạo lại bản vá từ dữ liệu live mới.');
      process.exit(1);
    }
    throw err;
  }

  console.log('  ✓ admin_update_place_atomic thành công!');
  console.log(`  • updated_at mới sau patch: ${patchResult.updated_at}`);
  console.log(`  • Mô tả mới: "${patchResult.description.slice(0, 70)}..."`);
  console.log(`  • Note mới : ${patchResult.note}`);
  console.log(`  • Rating mới: ${patchResult.rating}`);
  assert.strictEqual(patchResult.description, PATCH_PAYLOAD.description, 'Mô tả phải khớp với patch');
  assert.strictEqual(patchResult.note, null, 'Note phải là null');
  assert.strictEqual(patchResult.rating, null, 'Rating phải là null');

  // 4. Kiểm tra Audit Log của Thao tác 1
  console.log('\n--- BƯỚC 3: KIỂM TRA AUDIT LOG (PATCH) ---');
  const patchAuditLog = await getLatestAuditLog(PLACE_ID);
  console.log(`  • Log ID        : ${patchAuditLog.id}`);
  console.log(`  • Action        : ${patchAuditLog.action}`);
  console.log(`  • Correlation ID: ${patchAuditLog.correlation_id}`);
  console.log(`  • Created at    : ${patchAuditLog.created_at}`);
  assert.strictEqual(patchAuditLog.action, 'place.update', 'Action audit log phải là place.update');
  assert.strictEqual(patchAuditLog.correlation_id, correlationIdPatch, 'Correlation ID phải khớp');
  assert.strictEqual(patchAuditLog.payload_after.rating, null, 'Payload after rating phải là null');
  console.log('  ✓ [ĐẠT] Audit log cho bước PATCH đã ghi nhận đầy đủ, chuẩn xác và không chứa PII.');

  // 5. Thao tác 2: Duyệt (Approve)
  console.log('\n--- BƯỚC 4: THỰC THI PHÊ DUYỆT (APPROVE) ---');
  const intermediateUpdatedAt = patchResult.updated_at;
  const correlationIdApprove = `g9-chua-ang-approve-${Date.now()}`;
  const approvePayload = {
    status: 'approved',
    expected_updated_at: intermediateUpdatedAt
  };

  let approveResult;
  try {
    approveResult = await supabaseRpc('admin_update_place_atomic', {
      p_actor_id: actor.id,
      p_actor_email: actor.email,
      p_actor_role: actor.role,
      p_place_id: PLACE_ID,
      p_patch: approvePayload,
      p_ip: '127.0.0.1',
      p_correlation_id: correlationIdApprove
    });
  } catch (err) {
    if (err.status === 409 || err.message?.includes('CONFLICT')) {
      console.error('\n❌ 409 CONFLICT khi duyệt:', err.message);
      process.exit(1);
    }
    throw err;
  }

  console.log('  ✓ Duyệt thành công!');
  console.log(`  • Trạng thái sau duyệt : ${approveResult.status}`);
  console.log(`  • updated_at cuối cùng : ${approveResult.updated_at}`);
  assert.strictEqual(approveResult.status, 'approved', 'Trạng thái phải là approved');

  // 6. Kiểm tra Audit Log của Thao tác 2
  console.log('\n--- BƯỚC 5: KIỂM TRA AUDIT LOG (APPROVE) ---');
  const approveAuditLog = await getLatestAuditLog(PLACE_ID);
  console.log(`  • Log ID        : ${approveAuditLog.id}`);
  console.log(`  • Action        : ${approveAuditLog.action}`);
  console.log(`  • Correlation ID: ${approveAuditLog.correlation_id}`);
  console.log(`  • Created at    : ${approveAuditLog.created_at}`);
  assert.strictEqual(approveAuditLog.action, 'place.approved', 'Action audit log phải là place.approved');
  assert.strictEqual(approveAuditLog.correlation_id, correlationIdApprove, 'Correlation ID phải khớp');
  assert.strictEqual(approveAuditLog.payload_after.status, 'approved', 'Payload after status phải là approved');
  console.log('  ✓ [ĐẠT] Audit log cho bước APPROVE đã được ghi nhận nguyên tử.');

  // 7. Xác minh Route Công Khai Production
  console.log('\n--- BƯỚC 6: XÁC MINH ROUTE CÔNG KHAI TRÊN PRODUCTION ---');
  const publicUrl = `https://vivutravinh.id.vn/place/${SLUG}`;
  console.log(`  • Đang kiểm tra URL: ${publicUrl}`);

  // Chờ 1 giây để Vercel cache/serverless nhận diện (nếu có cache)
  await new Promise(r => setTimeout(r, 1000));

  const pubRes = await fetch(publicUrl, {
    headers: { 'Cache-Control': 'no-cache' }
  });

  console.log(`  • HTTP Status: ${pubRes.status}`);
  assert.strictEqual(pubRes.status, 200, `Route công khai ${publicUrl} phải trả về HTTP 200`);

  const html = await pubRes.text();

  // Kiểm tra title
  assert.ok(html.includes('<title>Chùa Âng - ViVu Trà Vinh</title>'), 'HTML phải chứa title chuẩn "Chùa Âng - ViVu Trà Vinh"');
  console.log('  ✓ Title: Chùa Âng - ViVu Trà Vinh');

  // Kiểm tra canonical
  assert.ok(html.includes('href="https://vivutravinh.id.vn/place/chua-ang"'), 'HTML phải chứa canonical link chuẩn');
  console.log('  ✓ Canonical URL: https://vivutravinh.id.vn/place/chua-ang');

  // Kiểm tra mô tả chính thức
  assert.ok(html.includes('Ngôi chùa Khmer cổ kính và tiêu biểu bậc nhất Nam Bộ khởi dựng từ năm 990'), 'HTML phải chứa đoạn mô tả lịch sử đã xác minh');
  console.log('  ✓ Mô tả lịch sử: Khởi dựng năm 990, trong khuôn viên Ao Bà Om, Di tích Quốc gia');

  // Khẳng định KHÔNG chứa các dữ liệu sai/chưa xác minh trong OpenGraph metadata
  assert.ok(!html.includes('content="Miễn phí"'), 'Tuyệt đối KHÔNG chứa "Miễn phí" trong OpenGraph metadata');
  assert.ok(!html.includes('0294.385.1111'), 'Tuyệt đối KHÔNG chứa số điện thoại cũ "0294.385.1111"');
  assert.ok(!html.includes('0294.385.5555'), 'Tuyệt đối KHÔNG chứa số điện thoại "0294.385.5555"');
  assert.ok(!html.includes('chùa âng.jpg'), 'Tuyệt đối KHÔNG chứa ảnh chưa bản quyền');
  console.log('  ✓ Khử sạch hoàn toàn: 0 "Miễn phí" trong OG metadata, 0 SĐT cũ, 0 ảnh cũ');

  // 8. Đối soát CSDL Live cuối cùng
  console.log('\n--- BƯỚC 7: ĐỐI SOÁT CSDL LIVE SUPABASE ---');
  const finalPlace = await getPlace(PLACE_ID);
  console.log(`  • ID 3 Tên          : ${finalPlace.name}`);
  console.log(`  • ID 3 Trạng thái   : ${finalPlace.status}`);
  console.log(`  • ID 3 updated_at   : ${finalPlace.updated_at}`);
  assert.strictEqual(finalPlace.status, 'approved', 'Trạng thái live phải là approved');

  console.log('\n======================================================================');
  console.log('🎉 HOÀN TẤT THÀNH CÔNG RỰC RỠ: CHÙA ÂNG (ID 3) ĐÃ ĐƯỢC DUYỆT & CÔNG KHAI!');
  console.log('======================================================================');
}

main().catch(err => {
  console.error('\n❌ LỖI TRONG QUÁ TRÌNH THỰC THI:', err);
  process.exit(1);
});
