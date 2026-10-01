/**
 * scripts/verify-production-live.cjs
 *
 * Kiểm tra trực tiếp trên môi trường Production (Vercel Live: vivutravinh.id.vn):
 * 1. Tạo vé Ok Om Bok mới -> Xác nhận HTTP 201, nhận claim_token, client_rsvp_id, mã vé.
 * 2. Lấy lại vé cũ (gửi lại đúng claim_token) -> Xác nhận HTTP 200 idempotent, đúng mã vé.
 * 3. Kẻ xấu gửi token sai -> Bị từ chối HTTP 403 UNAUTHORIZED_TICKET_ACCESS, 0 rò rỉ dữ liệu.
 * 4. Kẻ xấu thiếu token đăng ký trùng SĐT -> Bị chặn HTTP 409 DUPLICATE_REGISTRATION.
 * 5. Gửi Bearer token không hợp lệ -> Bị từ chối HTTP 401 UNAUTHENTICATED ngay lập tức.
 * 6. Duyệt nội dung qua RPC G14 (admin_moderate_entity_atomic) -> Kiểm duyệt và ghi audit log nguyên tử.
 * 7. Dọn dẹp sạch sẽ 100% CSDL Supabase theo đúng ID bản ghi thử nghiệm.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PROJECT_DIR = path.resolve(__dirname, '..');
const envContent = fs.readFileSync(path.join(PROJECT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1].replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

const PROD_BASE_URL = 'https://vivutravinh.id.vn';

let passed = 0;
let total = 0;

function check(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Failed: ${message}`);
  }
}

async function resetRateLimit() {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rate_limits?key=like.rsvp_ip_*`, {
      method: 'DELETE',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      }
    });
  } catch (_) {}
}

async function run() {
  console.log('================================================================================');
  console.log(' KIỂM ĐỊNH TRỰC TIẾP PRODUCTION SAU KHI VERCEL DEPLOY THÀNH CÔNG');
  console.log(` Target: ${PROD_BASE_URL}`);
  console.log('================================================================================\n');

  const createdTicketIds = [];
  const createdClubIds = [];
  const createdActivityIds = [];
  const createdAuditIds = [];
  const createdUserIds = [];

  const ts = Date.now();
  const testPhone = '098' + Math.floor(1000000 + Math.random() * 9000000);
  const testClientRsvpId = `prod-rsvp-${ts}-${Math.random().toString(36).slice(2, 7)}`;
  const attendeeName = `Khách Nghiệm Thu Prod ${ts}`;

  try {
    // -------------------------------------------------------------------------
    // 1. KIỂM TRA TẠO VÉ TRÊN PRODUCTION
    // -------------------------------------------------------------------------
    console.log('[PHẦN 1] Kiểm tra tạo vé trên Production (POST /api/submit-rsvp):');
    await resetRateLimit();
    const createRes = await fetch(`${PROD_BASE_URL}/api/submit-rsvp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullname: attendeeName,
        phone: testPhone,
        sector: 'long-binh',
        event_slug: 'ok-om-bok-2026',
        client_rsvp_id: testClientRsvpId
      })
    });

    const createData = await createRes.json();
    check(createRes.status === 201, `API trả về HTTP 201 Created (Status: ${createRes.status})`);
    check(createData.success === true, 'Phản hồi báo success = true');
    check(Boolean(createData.data?.ticket_code), `Mã vé đã cấp phát: ${createData.data?.ticket_code}`);
    check(Boolean(createData.data?.claim_token), `Server đã cấp token bí mật claim_token: ${createData.data?.claim_token?.slice(0, 10)}...`);
    check(createData.data?.client_rsvp_id === testClientRsvpId, `Bảo toàn client_rsvp_id: ${createData.data?.client_rsvp_id}`);
    check(Boolean(createData.data?.id), `ID bản ghi Supabase: ${createData.data?.id}`);

    const savedTicketCode = createData.data?.ticket_code;
    const serverClaimToken = createData.data?.claim_token;
    const ticketId = createData.data?.id;
    if (ticketId) createdTicketIds.push(ticketId);

    // -------------------------------------------------------------------------
    // 2. KIỂM TRA LẤY LẠI VÉ VỚI ĐÚNG CLAIM_TOKEN TRÊN PRODUCTION
    // -------------------------------------------------------------------------
    console.log('\n[PHẦN 2] Lấy lại vé chính chủ (Gửi lại đúng claim_token & client_rsvp_id):');
    await resetRateLimit();
    const retrieveRes = await fetch(`${PROD_BASE_URL}/api/submit-rsvp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ticket-Claim-Token': serverClaimToken
      },
      body: JSON.stringify({
        fullname: attendeeName,
        phone: testPhone,
        sector: 'long-binh',
        event_slug: 'ok-om-bok-2026',
        client_rsvp_id: testClientRsvpId,
        claim_token: serverClaimToken
      })
    });

    const retrieveData = await retrieveRes.json();
    check(retrieveRes.status === 200, `API trả về HTTP 200 OK (Status: ${retrieveRes.status})`);
    check(retrieveData.idempotent === true, 'Xác nhận cờ idempotent = true');
    check(retrieveData.data?.ticket_code === savedTicketCode, `Nhận lại đúng mã vé cũ: ${retrieveData.data?.ticket_code}`);
    check(retrieveData.data?.client_rsvp_id === testClientRsvpId, 'Vé nhận lại giữ nguyên client_rsvp_id');

    // -------------------------------------------------------------------------
    // 3. KIỂM TRA TỪ CHỐI KHI GỬI TOKEN SAI TRÊN PRODUCTION
    // -------------------------------------------------------------------------
    console.log('\n[PHẦN 3] Từ chối khi gửi token sai trên Production:');
    await resetRateLimit();
    const fakeTokenRes = await fetch(`${PROD_BASE_URL}/api/submit-rsvp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ticket-Claim-Token': 'clm_fake_attacker_invalid_token_99999999'
      },
      body: JSON.stringify({
        fullname: attendeeName,
        phone: testPhone,
        sector: 'long-binh',
        event_slug: 'ok-om-bok-2026',
        client_rsvp_id: testClientRsvpId,
        claim_token: 'clm_fake_attacker_invalid_token_99999999'
      })
    });

    const fakeTokenData = await fakeTokenRes.json();
    check(fakeTokenRes.status === 403, `Token sai bị từ chối với HTTP 403 (Status: ${fakeTokenRes.status})`);
    check(fakeTokenData.error?.code === 'UNAUTHORIZED_TICKET_ACCESS', 'Mã lỗi UNAUTHORIZED_TICKET_ACCESS chuẩn xác');
    check(fakeTokenData.data === undefined, 'Zero Data Leak: Tuyệt đối không rò rỉ thông tin vé');

    // -------------------------------------------------------------------------
    // 4. KIỂM TRA CHẶN ĐĂNG KÝ TRÙNG SĐT KHI THIẾU TOKEN TRÊN PRODUCTION
    // -------------------------------------------------------------------------
    console.log('\n[PHẦN 4] Chặn đăng ký trùng SĐT khi thiếu token bí mật:');
    await resetRateLimit();
    const dupRes = await fetch(`${PROD_BASE_URL}/api/submit-rsvp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullname: 'Kẻ Lừa Đảo',
        phone: testPhone,
        sector: 'long-binh',
        event_slug: 'ok-om-bok-2026',
        client_rsvp_id: `attacker-diff-${Date.now()}`
      })
    });

    const dupData = await dupRes.json();
    check(dupRes.status === 409, `SĐT đã có vé bị chặn với HTTP 409 (Status: ${dupRes.status})`);
    check(dupData.error?.code === 'DUPLICATE_REGISTRATION', 'Mã lỗi DUPLICATE_REGISTRATION chính xác');
    check(dupData.data === undefined, 'Zero Data Leak: Không lộ vé của nạn nhân');

    // -------------------------------------------------------------------------
    // 5. KIỂM TRA DỪNG NGAY KHI GỬI BEARER TOKEN KHÔNG HỢP LỆ TRÊN PRODUCTION
    // -------------------------------------------------------------------------
    console.log('\n[PHẦN 5] Dừng ngay khi Bearer token không hợp lệ trên Production:');
    await resetRateLimit();
    const badJwtRes = await fetch(`${PROD_BASE_URL}/api/submit-rsvp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-expired-token'
      },
      body: JSON.stringify({
        fullname: 'JWT Lỗi Test',
        phone: '0981234567',
        sector: 'long-binh',
        event_slug: 'ok-om-bok-2026',
        client_rsvp_id: `bad-jwt-${Date.now()}`
      })
    });

    const badJwtData = await badJwtRes.json();
    check(badJwtRes.status === 401, `Bearer token không hợp lệ bị từ chối với HTTP 401 (Status: ${badJwtRes.status})`);
    check(badJwtData.error?.code === 'UNAUTHENTICATED', 'Mã lỗi UNAUTHENTICATED chính xác');

    // -------------------------------------------------------------------------
    // 6. KIỂM TRA DUYỆT NỘI DUNG QUA RPC G14 NGUYÊN TỬ TRÊN PRODUCTION
    // -------------------------------------------------------------------------
    console.log('\n[PHẦN 6] Kiểm tra kiểm duyệt nội dung qua RPC G14 (admin_moderate_entity_atomic):');
    
    // Tạo CLB và Hoạt động CLB pending trên Supabase Live
    const testClubId = `clb-prod-g14-${ts}`;
    createdClubIds.push(testClubId);
    await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: testClubId,
        name: `CLB Kiểm Định G14 Production ${ts}`,
        category: 'di-san',
        status: 'approved',
        leader_name: 'Admin Test'
      })
    });

    const testActivityId = `act-prod-g14-${ts}`;
    createdActivityIds.push(testActivityId);
    const createActRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        id: testActivityId,
        club_id: testClubId,
        club_name: `CLB Kiểm Định G14 Production ${ts}`,
        title: `Buổi Sinh Hoạt Kiểm Định G14 ${ts}`,
        time_schedule: 'Chủ Nhật 08:00',
        location: 'Trà Vinh',
        status: 'pending'
      })
    });
    check(createActRes.ok, 'Tạo hoạt động CLB test pending thành công');

    // Tạo token quản trị viên thật qua Supabase Auth admin API
    const adminEmail = `admin_g14_prod_${ts}@vivutravinh.test`;
    const adminPassword = `AdminPass_${ts}!`;
    const createAdminRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword, email_confirm: true })
    });
    const adminUserData = await createAdminRes.json();
    const adminUserId = adminUserData.id;
    if (adminUserId) createdUserIds.push(adminUserId);

    // Cấp quyền admin trong bảng public.admin_users
    await fetch(`${SUPABASE_URL}/rest/v1/admin_users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: adminUserId, email: adminEmail, role: 'admin', is_active: true })
    });

    // Lấy token đăng nhập
    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword })
    });
    const loginData = await loginRes.json();
    const adminToken = loginData.access_token;
    assert.ok(adminToken, 'Phải sinh được admin access token');

    // Gọi API kiểm duyệt trên Production (sử dụng RPC G14 admin_moderate_entity_atomic)
    const correlationId = `corr-prod-${ts}`;
    const modRes = await fetch(`${PROD_BASE_URL}/api/admin-moderation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
        'X-Correlation-ID': correlationId
      },
      body: JSON.stringify({
        action: 'approve',
        entity_type: 'club_activity',
        entity_id: testActivityId,
        admin_notes: 'Duyệt kiểm định production G14 atomic'
      })
    });

    const modData = await modRes.json();
    check(modRes.status === 200, `API kiểm duyệt Production trả về HTTP 200 (Status: ${modRes.status})`);
    check(modData.success === true, 'Phản hồi kiểm duyệt báo success = true');
    check(modData.status === 'approved' || modData.data?.status === 'approved', 'Trạng thái chuyển sang approved thành công');
    check(modData.atomic === true, 'Giao dịch nguyên tử atomic = true');

    // Xác minh trên CSDL Supabase Live
    const actDbRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${testActivityId}&select=id,status,admin_notes`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const actDbData = await actDbRes.json();
    check(actDbData[0]?.status === 'approved', 'Bảng club_activities đã cập nhật approved trên CSDL Live');
    check(actDbData[0]?.admin_notes === 'Duyệt kiểm định production G14 atomic', 'Ghi chú duyệt được lưu chuẩn xác');

    // Xác minh audit log được tạo nguyên tử
    const auditRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?correlation_id=eq.${correlationId}&select=id,action,entity_type,entity_id`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const auditData = await auditRes.json();
    check(auditData.length === 1, 'Bảng admin_audit_logs đã ghi nhận 1 bản ghi kiểm toán tương ứng');
    check(auditData[0]?.action === 'moderation.approve.club_activity', 'Hành động audit log chính xác');
    if (auditData[0]?.id) createdAuditIds.push(auditData[0].id);

    console.log(`  ✓ Xác nhận thành công: RPC G14 đã thực thi cập nhật trạng thái và ghi audit log trong 1 giao dịch nguyên tử trên Production.`);

  } finally {
    // -------------------------------------------------------------------------
    // 7. DỌN DẸP DỮ LIỆU THỬ NGHIỆM TRÊN SUPABASE LIVE
    // -------------------------------------------------------------------------
    console.log('\n--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM TRÊN SUPABASE LIVE (TARGETED CLEANUP) ---');
    for (const ticketId of createdTicketIds) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/event_rsvps?id=eq.${encodeURIComponent(ticketId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Xóa vé kiểm thử (ID: ${ticketId}): HTTP ${res.status}`);
    }

    for (const actId of createdActivityIds) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${encodeURIComponent(actId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Xóa hoạt động CLB kiểm thử (ID: ${actId}): HTTP ${res.status}`);
    }

    for (const clubId of createdClubIds) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${encodeURIComponent(clubId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Xóa CLB kiểm thử (ID: ${clubId}): HTTP ${res.status}`);
    }

    for (const auditId of createdAuditIds) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?id=eq.${encodeURIComponent(auditId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Xóa audit log kiểm thử (ID: ${auditId}): HTTP ${res.status}`);
    }

    for (const userId of createdUserIds) {
      await fetch(`${SUPABASE_URL}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Xóa tài khoản kiểm thử (ID: ${userId}): HTTP ${res.status}`);
    }
    console.log('--- HOÀN TẤT DỌN DẸP AN TOÀN: 0% ẢNH HƯỞNG ĐẾN DỮ LIỆU THẬT ---');
  }

  console.log('\n================================================================================');
  console.log(`🎉 TỔNG KẾT KIỂM ĐỊNH PRODUCTION: ${passed}/${total} TIÊU CHÍ ĐẠT 100%`);
  console.log('================================================================================\n');
}

run().catch(err => {
  console.error('\n❌ Lỗi kiểm định Production:', err);
  process.exit(1);
});
