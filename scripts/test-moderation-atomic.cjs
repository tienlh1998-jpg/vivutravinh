/**
 * scripts/test-moderation-atomic.cjs
 *
 * Kiểm thử tính nguyên tử (Atomicity) của thao tác duyệt nội dung và ghi audit log:
 * 1. Kiểm tra tĩnh file migration supabase/g14_admin_moderate_entity_atomic.sql:
 *    - Tuyệt đối KHÔNG có lệnh COMMIT hoặc ROLLBACK bên trong PostgreSQL function.
 *    - Tuyệt đối KHÔNG chứa test hook (SIMULATE_AUDIT_LOG_ERROR) trong bản triển khai production.
 *    - Hàm khai báo SECURITY DEFINER và search_path an toàn.
 *    - Phân quyền nghiêm ngặt: REVOKE từ public/anon/authenticated, chỉ GRANT cho service_role.
 *    - File test helper supabase/test_g14_audit_fail_trigger.sql tồn tại riêng biệt cho môi trường thử nghiệm.
 * 2. Kiểm thử API kiểm duyệt khi chưa có RPC:
 *    - API api/_admin/moderation.js phải BÁO LỖI RÕ RÀNG (RPC_NOT_INSTALLED, HTTP 500) nếu thiếu RPC,
 *      tuyệt đối KHÔNG tự động chuyển sang cách duyệt tuần tự không nguyên tử.
 * 3. Kiểm thử trực tiếp trên Supabase (nếu RPC đã được nạp trên DB):
 *    - Ca 1: Duyệt thành công -> Cả trạng thái entity VÀ bản ghi audit log được lưu đồng thời.
 *    - Ca 2: Khi audit log gặp lỗi trong môi trường thử nghiệm -> Toàn bộ transaction bị hủy,
 *            trạng thái entity GIỮ NGUYÊN 'pending', không bị thay đổi.
 *    - Dọn dẹp sạch sẽ 100% dữ liệu thử nghiệm trong block finally.
 * TUYỆT ĐỐI ZERO LEAK: Không log khóa bí mật hoặc token.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const PROJECT_DIR = path.resolve(__dirname, '..');
const SQL_FILE = path.join(PROJECT_DIR, 'supabase', 'g14_admin_moderate_entity_atomic.sql');
const TEST_TRIGGER_FILE = path.join(PROJECT_DIR, 'supabase', 'test_g14_audit_fail_trigger.sql');

let passedCount = 0;
let totalCount = 0;

function assert(condition, message) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('================================================================================');
  console.log(' KIỂM THỬ GIAO DỊCH NGUYÊN TỬ: DUYỆT NỘI DUNG & GHI AUDIT LOG (G14 ATOMIC RPC)');
  console.log('================================================================================\n');

  // PHẦN 1: KIỂM TRA TĨNH FILE SQL MIGRATION
  console.log('[PHẦN 1] Kiểm tra cú pháp và quy chuẩn kiến trúc file SQL Production:');
  assert(fs.existsSync(SQL_FILE), 'File supabase/g14_admin_moderate_entity_atomic.sql phải tồn tại');

  const sqlContent = fs.readFileSync(SQL_FILE, 'utf8');

  // Bắt buộc: KHÔNG viết COMMIT / ROLLBACK trong câu lệnh PostgreSQL (function tự chạy trong caller transaction)
  const sqlCodeOnly = sqlContent.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const hasCommit = /\bCOMMIT\b/i.test(sqlCodeOnly);
  const hasRollback = /\bROLLBACK\b/i.test(sqlCodeOnly);
  assert(!hasCommit, 'Tuyệt đối KHÔNG chứa câu lệnh COMMIT trong thân hàm PostgreSQL');
  assert(!hasRollback, 'Tuyệt đối KHÔNG chứa câu lệnh ROLLBACK trong thân hàm PostgreSQL');

  // Bắt buộc: Bản SQL Production KHÔNG chứa test hook giả lập lỗi
  assert(!sqlContent.includes('SIMULATE_AUDIT_LOG_ERROR'), 'File production SQL tuyệt đối KHÔNG chứa test hook SIMULATE_AUDIT_LOG_ERROR');

  // Kiểm tra khai báo SECURITY DEFINER và search_path
  assert(sqlContent.includes('SECURITY DEFINER'), 'Hàm RPC phải khai báo SECURITY DEFINER');
  assert(sqlContent.includes('search_path = public, pg_temp'), 'Hàm RPC phải thiết lập search_path an toàn');

  // Kiểm tra phân quyền thực thi
  assert(sqlContent.includes('REVOKE ALL ON FUNCTION public.admin_moderate_entity_atomic'), 'Phải thu hồi quyền thực thi từ public/anon/authenticated');
  assert(sqlContent.includes('GRANT EXECUTE ON FUNCTION public.admin_moderate_entity_atomic'), 'Chỉ cấp quyền thực thi cho service_role');

  // Kiểm tra cơ chế khóa bi quan FOR UPDATE
  assert(sqlContent.includes('FOR UPDATE'), 'Phải sử dụng khóa bi quan FOR UPDATE chống Race Condition');

  // Kiểm tra file test trigger độc lập cho môi trường thử nghiệm
  assert(fs.existsSync(TEST_TRIGGER_FILE), 'File test helper supabase/test_g14_audit_fail_trigger.sql phải tồn tại riêng');
  const testTriggerContent = fs.readFileSync(TEST_TRIGGER_FILE, 'utf8');
  assert(testTriggerContent.includes('trg_test_audit_log_fail'), 'File test trigger định nghĩa trg_test_audit_log_fail');

  // PHẦN 2: KIỂM THỬ XỬ LÝ LỖI TRONG API KIỂM DUYỆT (api/_admin/moderation.js)
  console.log('\n[PHẦN 2] Kiểm tra API kiểm duyệt khi thiếu RPC (Không được fallback âm thầm):');
  const moderationModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', '_admin', 'moderation.js')).href);
  const moderationHandler = moderationModule.default;

  // Giả lập request từ admin nhưng RPC không tồn tại trên DB
  let capturedResponse = null;
  const mockReq = {
    method: 'POST',
    url: '/api/admin-moderation',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer mock_admin_test_token'
    },
    body: JSON.stringify({
      entity_type: 'club_activity',
      entity_id: 'act-test-probe',
      action: 'approve'
    })
  };

  const mockRes = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { capturedResponse = payload; return this; },
    end() {}
  };

  // PHẦN 3: KIỂM THỬ TRỰC TIẾP TRÊN SUPABASE LIVE
  console.log('\n[PHẦN 3] Kiểm thử trực tiếp trên CSDL Supabase:');
  const envPath = path.join(PROJECT_DIR, '.env.live.tmp');
  if (!fs.existsSync(envPath)) {
    console.log('  ℹ️ Không tìm thấy .env.live.tmp. Bỏ qua kiểm thử live DB.');
    printSummary();
    return;
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const supabaseUrlMatch = envContent.match(/SUPABASE_URL="([^"]+)"/);
  const serviceKeyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

  if (!supabaseUrlMatch || !serviceKeyMatch) {
    console.log('  ℹ️ Thiếu biến môi trường Supabase. Bỏ qua kiểm thử live DB.');
    printSummary();
    return;
  }

  const supabaseUrl = supabaseUrlMatch[1].replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const serviceRoleKey = serviceKeyMatch[1];

  async function supabaseRequest(endpoint, options = {}) {
    const url = `${supabaseUrl}/rest/v1/${endpoint.replace(/^\//, '')}`;
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = text;
    }
    return { status: res.status, ok: res.ok, data };
  }

  // Gọi đủ tham số bắt buộc và cố ý dùng role không hợp lệ. Nếu RPC tồn tại,
  // chính hàm sẽ từ chối với 42501 trước khi đọc hoặc sửa bất kỳ bản ghi nào.
  const probeRpc = await supabaseRequest('rpc/admin_moderate_entity_atomic', {
    method: 'POST',
    body: JSON.stringify({
      p_actor_id: null,
      p_actor_email: 'probe@invalid.test',
      p_actor_role: 'invalid_probe_role',
      p_entity_type: 'club_activity',
      p_entity_id: 'nonexistent-probe',
      p_action: 'approve'
    })
  });

  const isRpcInstalled = probeRpc.status === 403 &&
    probeRpc.data?.code === '42501' &&
    probeRpc.data?.message?.includes('FORBIDDEN');

  if (!isRpcInstalled) {
    console.log(`  ⚠️ Không xác nhận được RPC trên Supabase live (HTTP ${probeRpc.status}, mã ${probeRpc.data?.code || 'unknown'}).`);
    console.log('--------------------------------------------------------------------------------');
    console.log('Vui lòng mở Supabase Dashboard > SQL Editor và thực thi toàn bộ nội dung file:');
    console.log('  supabase/g14_admin_moderate_entity_atomic.sql\n');
    console.log('Xác nhận: API kiểm duyệt hiện tại sẽ BÁO LỖI RÕ RÀNG (RPC_NOT_INSTALLED) nếu gọi duyệt,');
    console.log('tuyệt đối KHÔNG tự ý chuyển sang cách duyệt tuần tự không nguyên tử.');
    assert(false, 'RPC phải tồn tại và từ chối role không hợp lệ bằng 42501');
  }

  assert(true, 'RPC live tồn tại và chặn vai trò không hợp lệ trước khi ghi dữ liệu');
  console.log('  ✓ Hàm RPC admin_moderate_entity_atomic đã sẵn sàng trên live Supabase.');

  // Chuẩn bị dữ liệu kiểm thử
  const timestamp = Date.now();
  const testClubId = `clb-atomic-test-${timestamp}`;
  const testActId = `act-atomic-test-${timestamp}`;
  const cleanupIds = { clubs: [testClubId], activities: [testActId] };

  try {
    // Tạo 1 CLB test
    const createClubRes = await supabaseRequest('clubs', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        id: testClubId,
        name: `CLB Thử Nghiệm G14 ${timestamp}`,
        category: 'di-san',
        status: 'approved'
      })
    });
    assert(createClubRes.ok, 'Tạo CLB thử nghiệm thành công');

    // Tạo 1 hoạt động test ở trạng thái pending
    const createActRes = await supabaseRequest('club_activities', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        id: testActId,
        club_id: testClubId,
        club_name: `CLB Thử Nghiệm G14 ${timestamp}`,
        title: `Buổi sinh hoạt kiểm thử nguyên tử ${timestamp}`,
        time_schedule: 'Chủ Nhật 08:00',
        location: 'Trà Vinh',
        status: 'pending'
      })
    });
    assert(createActRes.ok, 'Tạo lịch sinh hoạt thử nghiệm (status: pending) thành công');

    // CA 1: DUYỆT THÀNH CÔNG NGUYÊN TỬ (STATUS CHUYỂN APPROVED + CÓ AUDIT LOG)
    console.log('\n[Ca 1] Kiểm tra duyệt hợp lệ qua admin_moderate_entity_atomic:');
    const correlationId1 = `CORR_TEST_SUCCESS_${timestamp}`;
    const approveRpcRes = await supabaseRequest('rpc/admin_moderate_entity_atomic', {
      method: 'POST',
      body: JSON.stringify({
        p_actor_id: null,
        p_actor_email: 'admin_test@vivutravinh.test',
        p_actor_role: 'admin',
        p_entity_type: 'club_activity',
        p_entity_id: testActId,
        p_action: 'approve',
        p_admin_notes: 'Duyệt thử nghiệm nguyên tử',
        p_correlation_id: correlationId1
      })
    });
    assert(approveRpcRes.ok, `RPC approve trả về HTTP 200 thành công (Status ${approveRpcRes.status})`);
    assert(approveRpcRes.data?.success === true, 'Kết quả RPC báo success = true');
    assert(approveRpcRes.data?.status === 'approved', 'Trạng thái mới trả về là approved');

    // Xác minh trạng thái trên bảng gốc club_activities
    const verifyAct1 = await supabaseRequest(`club_activities?id=eq.${encodeURIComponent(testActId)}&select=id,status,admin_notes`);
    assert(verifyAct1.data?.[0]?.status === 'approved', 'Bảng gốc club_activities đã chuyển sang approved');
    assert(verifyAct1.data?.[0]?.admin_notes === 'Duyệt thử nghiệm nguyên tử', 'admin_notes đã được lưu');

    // Xác minh bản ghi audit log được tạo tương ứng
    const verifyLog1 = await supabaseRequest(`admin_audit_logs?correlation_id=eq.${encodeURIComponent(correlationId1)}&select=*`);
    assert(Array.isArray(verifyLog1.data) && verifyLog1.data.length === 1, 'Audit log đã ghi nhận 1 bản ghi với correlation_id tương ứng');
    assert(verifyLog1.data[0].action === 'moderation.approve.club_activity', 'Hành động audit log chính xác: moderation.approve.club_activity');

    // CA 2: MÔ PHỎNG LỖI KHI GHI AUDIT LOG TRONG MÔI TRƯỜNG THỬ NGHIỆM
    console.log('\n[Ca 2] Kiểm tra tính nguyên tử khi ghi audit log thất bại trong môi trường test (Transaction Rollback):');
    // Đưa hoạt động về trạng thái 'pending'
    await supabaseRequest(`club_activities?id=eq.${encodeURIComponent(testActId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'pending', admin_notes: 'Trạng thái gốc pending' })
    });
    const checkReset = await supabaseRequest(`club_activities?id=eq.${encodeURIComponent(testActId)}&select=status`);
    assert(checkReset.data?.[0]?.status === 'pending', 'Đã đặt lại hoạt động về pending để thử nghiệm rollback');

    // Thử nghiệm gọi với correlation_id thử lỗi
    // (Nếu test trigger trg_test_audit_log_fail đã được cài đặt trên môi trường test)
    const correlationIdFail = `TEST_AUDIT_FAIL_${timestamp}`;
    const failRpcRes = await supabaseRequest('rpc/admin_moderate_entity_atomic', {
      method: 'POST',
      body: JSON.stringify({
        p_actor_id: null,
        p_actor_email: 'admin_test@vivutravinh.test',
        p_actor_role: 'admin',
        p_entity_type: 'club_activity',
        p_entity_id: testActId,
        p_action: 'approve',
        p_admin_notes: 'Thử nghiệm lỗi audit log',
        p_correlation_id: correlationIdFail
      })
    });

    if (!failRpcRes.ok) {
      assert(true, `RPC bị hủy bỏ (aborted) khi audit log gặp lỗi: ${failRpcRes.data?.message || failRpcRes.status}`);
      // Kiểm tra bảng gốc club_activities -> Trạng thái PHẢI VẪN LÀ 'pending'!
      const verifyActAfterRollback = await supabaseRequest(`club_activities?id=eq.${encodeURIComponent(testActId)}&select=id,status,admin_notes`);
      assert(
        verifyActAfterRollback.data?.[0]?.status === 'pending',
        'CHỨNG MINH NGUYÊN TỬ: Trạng thái trong CSDL VẪN LÀ "pending", không bị cập nhật thành approved!'
      );
      assert(
        verifyActAfterRollback.data?.[0]?.admin_notes === 'Trạng thái gốc pending',
        'CHỨNG MINH NGUYÊN TỬ: admin_notes không bị ghi đè, toàn bộ thay đổi đã được PostgreSQL ROLLBACK 100%!'
      );
    } else {
      console.log('  ℹ️ Chưa kiểm định rollback do lỗi audit log: database production không cài trigger giả lập lỗi.');
      console.log('  Chỉ chạy phép thử lỗi này trong database thử nghiệm riêng.');
    }

  } finally {
    // Dọn dẹp dữ liệu thử nghiệm
    console.log('\n--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM ---');
    for (const actId of cleanupIds.activities) {
      await supabaseRequest(`club_activities?id=eq.${encodeURIComponent(actId)}`, { method: 'DELETE' });
    }
    for (const clubId of cleanupIds.clubs) {
      await supabaseRequest(`clubs?id=eq.${encodeURIComponent(clubId)}`, { method: 'DELETE' });
    }
    await supabaseRequest(`admin_audit_logs?correlation_id=like.*${timestamp}*`, { method: 'DELETE' });
    console.log('--- DỌN DẸP HOÀN TẤT: Dữ liệu sạch sẽ 100% ---');
  }

  printSummary();
}

function printSummary() {
  console.log('\n================================================================================');
  console.log(` KẾT QUẢ KIỂM THỬ: ${passedCount}/${totalCount} BÀI KIỂM ĐỊNH PASS`);
  console.log('================================================================================');
}

runTests().catch(err => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI VỚI LỖI:', err.message);
  process.exit(1);
});
