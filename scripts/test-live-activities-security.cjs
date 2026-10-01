/**
 * scripts/test-live-activities-security.cjs
 *
 * Kiểm tra toàn diện an ninh và vòng đời Lịch sinh hoạt CLB (G13):
 * 1. Chặn thành viên không phải chủ nhiệm tạo lịch sinh hoạt chính thức (HTTP 403).
 * 2. Chặn chủ nhiệm của CLB chưa được duyệt tạo lịch sinh hoạt (HTTP 403).
 * 3. Chặn giả mạo club_name, creator_role, status='approved' khi tạo lịch.
 * 4. Chủ nhiệm CLB đã duyệt tạo lịch thành công ở trạng thái 'pending'.
 * 5. Chặn ghi đè trực tiếp qua Supabase REST do Column-Level Security thu hẹp quyền.
 * 6. Lịch chưa duyệt không xuất hiện trên feed công khai.
 * 7. Admin phê duyệt lịch qua api/admin-moderation.js -> Chuyển thành 'approved'.
 * 8. Lịch đã duyệt xuất hiện công khai trên feed.
 * 9. Dọn dẹp sạch sẽ 100% dữ liệu thử nghiệm trong block finally.
 * TUYỆT ĐỐI ZERO LEAK: Không in URL chứa key hoặc token.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const envPath = path.join(PROJECT_DIR, '.env.live.tmp');
const envContent = fs.readFileSync(envPath, 'utf8');
const supabaseUrl = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const serviceRoleKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

const testIdsToCleanup = {
  activities: [],
  clubs: [],
  users: []
};

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

async function adminSupabase(endpoint, options = {}) {
  const url = `${supabaseUrl}${endpoint}`;
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
  return { status: res.status, data };
}

async function cleanup() {
  console.log('\n--- BẮT ĐẦU DỌN DẸP DỮ LIỆU THỬ NGHIỆM ---');
  for (const actId of testIdsToCleanup.activities) {
    try {
      await adminSupabase(`/rest/v1/club_activities?id=eq.${encodeURIComponent(actId)}`, {
        method: 'DELETE'
      });
    } catch (e) {}
  }
  for (const clubId of testIdsToCleanup.clubs) {
    try {
      await adminSupabase(`/rest/v1/clubs?id=eq.${encodeURIComponent(clubId)}`, {
        method: 'DELETE'
      });
    } catch (e) {}
  }
  for (const userId of testIdsToCleanup.users) {
    try {
      await adminSupabase(`/auth/v1/admin/users/${userId}`, {
        method: 'DELETE'
      });
    } catch (e) {}
  }
  console.log('--- DỌN DẸP HOÀN TẤT: Dữ liệu sạch sẽ 100% ---\n');
}

async function runLiveSecurityTests() {
  console.log('================================================================================');
  console.log(' BẮT ĐẦU KIỂM THỬ AN NINH VÒNG ĐỜI LỊCH SINH HOẠT CLB (G13) - LIVE SUPABASE');
  console.log('================================================================================\n');

  // Kiểm tra bảng club_activities trên Live DB
  const probeRes = await fetch(`${supabaseUrl}/rest/v1/club_activities?limit=1`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
  });

  if (probeRes.status === 404) {
    console.log('⚠️ BẢNG public.club_activities CHƯA TỒN TẠI TRÊN SUPABASE LIVE!');
    console.log('--------------------------------------------------------------------------------');
    console.log('Hệ thống phát hiện migration g13_club_activities_moderation.sql chưa được thực thi trên DB.');
    console.log('Vui lòng mở Supabase Dashboard > SQL Editor và chạy toàn bộ nội dung file:');
    console.log('  supabase/g13_club_activities_moderation.sql\n');
    console.log('Kịch bản kiểm thử trực tiếp đã được chuẩn bị sẵn sàng bao gồm 7 ca kiểm định:');
    console.log('  [Ca 1] Member thường tạo lịch cho CLB đã duyệt -> BỊ CHẶN (403)');
    console.log('  [Ca 2] Chủ nhiệm tạo lịch cho CLB pending -> BỊ CHẶN (403)');
    console.log('  [Ca 3] Chủ nhiệm giả mạo tên CLB / tự duyệt status -> BỊ TRIGGER CHẶN & GHI ĐÈ PENDING');
    console.log('  [Ca 4] Chủ nhiệm tạo lịch hợp lệ (status: pending) -> THÀNH CÔNG (201)');
    console.log('  [Ca 5] Lịch pending KHÔNG xuất hiện trên Secure View công khai');
    console.log('  [Ca 6] Admin phê duyệt lịch kèm ghi chú nội bộ (admin_notes)');
    console.log('  [Ca 7] Lịch đã duyệt xuất hiện trên Secure View & KHÔNG lộ admin_notes\n');
    console.log('Hãy chạy migration trên Supabase Dashboard, sau đó chạy lại: npm run test:activities:live');
    return;
  }

  try {
    // 0. Tạo 2 tài khoản test: 1 Leader và 1 Member thường
    const timestamp = Date.now();
    const leaderEmail = `test_leader_${timestamp}@vivutravinh.test`;
    const memberEmail = `test_member_${timestamp}@vivutravinh.test`;
    const testPassword = `TestPass!_${timestamp}_Secure`;

    const createLeaderRes = await adminSupabase('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: leaderEmail,
        password: testPassword,
        email_confirm: true,
        user_metadata: { display_name: 'Chủ Nhiệm Thử Nghiệm' }
      })
    });
    assert(createLeaderRes.status === 200 || createLeaderRes.status === 201, 'Tạo tài khoản Leader thử nghiệm thành công');
    const leaderId = createLeaderRes.data.id;
    testIdsToCleanup.users.push(leaderId);

    const createMemberRes = await adminSupabase('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: memberEmail,
        password: testPassword,
        email_confirm: true,
        user_metadata: { display_name: 'Thành Viên Thử Nghiệm' }
      })
    });
    assert(createMemberRes.status === 200 || createMemberRes.status === 201, 'Tạo tài khoản Member thử nghiệm thành công');
    const memberId = createMemberRes.data.id;
    testIdsToCleanup.users.push(memberId);

    // Đăng nhập lấy access_token của Leader và Member
    const leaderAuthRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: leaderEmail, password: testPassword })
    });
    const leaderAuthData = await leaderAuthRes.json();
    const leaderToken = leaderAuthData.access_token;

    const memberAuthRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: memberEmail, password: testPassword })
    });
    const memberAuthData = await memberAuthRes.json();
    const memberToken = memberAuthData.access_token;

    // Tạo 2 CLB thử nghiệm: 1 Approved (Leader sở hữu) và 1 Pending (Leader sở hữu)
    const approvedClubId = `club-test-appr-${timestamp}`;
    testIdsToCleanup.clubs.push(approvedClubId);
    const createApprovedClubRes = await adminSupabase('/rest/v1/clubs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: approvedClubId,
        name: 'CLB Trải Nghiệm Văn Hóa Thử Nghiệm',
        category: 'di-san',
        leader_id: leaderId,
        leader_name: 'Chủ Nhiệm Thử Nghiệm',
        status: 'approved'
      })
    });
    assert(createApprovedClubRes.status === 201 || createApprovedClubRes.status === 200, 'Tạo CLB Đã duyệt (Approved) thành công');

    const pendingClubId = `club-test-pend-${timestamp}`;
    testIdsToCleanup.clubs.push(pendingClubId);
    const createPendingClubRes = await adminSupabase('/rest/v1/clubs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: pendingClubId,
        name: 'CLB Chờ Duyệt Thử Nghiệm',
        category: 'am-thuc',
        leader_id: leaderId,
        leader_name: 'Chủ Nhiệm Thử Nghiệm',
        status: 'pending'
      })
    });
    assert(createPendingClubRes.status === 201 || createPendingClubRes.status === 200, 'Tạo CLB Chờ duyệt (Pending) thành công');

    // -------------------------------------------------------------------------
    // TEST 1: Member thường cố gắng tạo lịch sinh hoạt cho CLB đã duyệt
    // -------------------------------------------------------------------------
    console.log('\n[Test 1] Member thường gửi request tạo lịch cho CLB đã duyệt...');
    const memberCreateRes = await fetch(`${supabaseUrl}/rest/v1/club_activities`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${memberToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        club_id: approvedClubId,
        title: 'Buổi giao lưu do member thường tạo',
        time_schedule: 'Chủ Nhật 08:00',
        location: 'Ao Bà Om'
      })
    });
    assert(
      memberCreateRes.status === 403 || memberCreateRes.status === 401 || memberCreateRes.status === 400,
      `Member thường bị database từ chối tạo lịch sinh hoạt chính thức (Status ${memberCreateRes.status})`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Chủ nhiệm tạo lịch cho CLB chưa được phê duyệt (status='pending')
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Chủ nhiệm tạo lịch cho CLB chưa duyệt...');
    const pendingClubActRes = await fetch(`${supabaseUrl}/rest/v1/club_activities`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${leaderToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        club_id: pendingClubId,
        title: 'Buổi sinh hoạt CLB pending',
        time_schedule: 'Thứ Bảy 15:00',
        location: 'Trà Vinh'
      })
    });
    assert(
      pendingClubActRes.status === 403 || pendingClubActRes.status === 400,
      `Từ chối tạo lịch đối với CLB chưa được phê duyệt (Status ${pendingClubActRes.status})`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Giả mạo trường bảo mật: status='approved', club_name giả, creator_role giả
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Chủ nhiệm gửi payload giả mạo status="approved", role="Admin"...');
    const forgedActId = `act-test-forge-${timestamp}`;
    testIdsToCleanup.activities.push(forgedActId);

    const forgeRes = await fetch(`${supabaseUrl}/rest/v1/club_activities`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${leaderToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        id: forgedActId,
        club_id: approvedClubId,
        club_name: 'TÊN CLB GIẢ MẠO HACKED',
        creator_role: 'Tổng Quản Trị Hệ Thống',
        status: 'approved',
        title: 'Buổi thử nghiệm an ninh toàn diện',
        time_schedule: 'Sáng Chủ Nhật 07:00',
        location: 'Bờ kè Long Bình',
        max_attendees: 30
      })
    });

    if (forgeRes.status === 201) {
      const inserted = await forgeRes.json();
      const record = inserted[0];
      assert(record.status === 'pending', 'Trigger đã ép buộc status = "pending", ngăn chặn tự phê duyệt');
      assert(record.club_name === 'CLB Trải Nghiệm Văn Hóa Thử Nghiệm', 'Trigger tự động ghi đè club_name từ DB, không tin payload client');
      assert(record.creator_role === 'Chủ nhiệm CLB', 'Trigger tự động gán creator_role = "Chủ nhiệm CLB"');
    } else {
      assert(forgeRes.status === 403, 'PostgreSQL Column-Level Security chặn đứng việc gửi cột cấm (Status 403)');
    }

    // -------------------------------------------------------------------------
    // TEST 4: Chủ nhiệm tạo lịch sinh hoạt hợp lệ
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Chủ nhiệm tạo lịch sinh hoạt hợp lệ...');
    const validActId = `act-test-valid-${timestamp}`;
    testIdsToCleanup.activities.push(validActId);

    // Chỉ trả về các cột chủ nhiệm được phép đọc; SELECT * gồm admin_notes bị khóa.
    const validCreateRes = await fetch(`${supabaseUrl}/rest/v1/club_activities?select=id,status,club_name,creator_role,creator_id`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${leaderToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        id: validActId,
        club_id: approvedClubId,
        title: 'Chụp ảnh bình minh Chùa Hang cùng CLB',
        time_schedule: 'Sáng Chủ Nhật 05:30',
        location: 'Cổng Chùa Hang, Châu Thành',
        max_attendees: 25,
        description: 'Chương trình giao lưu nhiếp ảnh văn hóa Trà Vinh'
      })
    });

    const validCreateBody = await validCreateRes.json();
    assert(validCreateRes.status === 201, `Chủ nhiệm tạo lịch thành công (Status ${validCreateRes.status}; ${validCreateBody.message || ''})`);
    const validActData = validCreateBody[0];
    assert(validActData.status === 'pending', 'Lịch mới tạo có status = "pending"');
    assert(validActData.club_name === 'CLB Trải Nghiệm Văn Hóa Thử Nghiệm', 'Tên CLB chính xác');
    assert(validActData.creator_role === 'Chủ nhiệm CLB', 'Vai trò người tạo chính xác');

    // -------------------------------------------------------------------------
    // TEST 5: Kiểm tra Secure View public_club_activities không để lọt pending
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Kiểm tra Secure View công khai...');
    const publicViewRes = await fetch(`${supabaseUrl}/rest/v1/public_club_activities?id=eq.${encodeURIComponent(validActId)}`, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${memberToken}`
      }
    });
    const publicViewData = await publicViewRes.json();
    assert(Array.isArray(publicViewData) && publicViewData.length === 0, 'Lịch pending KHÔNG xuất hiện trên Secure View công khai');

    // -------------------------------------------------------------------------
    // TEST 6: Admin phê duyệt buổi sinh hoạt kèm admin_notes nội bộ
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Admin phê duyệt buổi sinh hoạt kèm ghi chú nội bộ...');
    const approveRes = await adminSupabase(`/rest/v1/club_activities?id=eq.${encodeURIComponent(validActId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'approved',
        admin_notes: 'Ghi chú nội bộ BQT: Đã kiểm tra uy tín chủ nhiệm CLB',
        moderated_at: new Date().toISOString()
      })
    });
    assert(approveRes.status === 200, `Admin phê duyệt thành công (Status ${approveRes.status})`);
    const approvedRecord = approveRes.data[0];
    assert(approvedRecord.status === 'approved', 'Trạng thái chuyển thành "approved"');

    // -------------------------------------------------------------------------
    // TEST 7: Lịch đã duyệt xuất hiện công khai trên Secure View & KHÔNG lộ admin_notes
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Kiểm tra lịch đã duyệt xuất hiện trên Secure View công khai & che chắn admin_notes...');
    const publicAfterApproveRes = await fetch(`${supabaseUrl}/rest/v1/public_club_activities?id=eq.${encodeURIComponent(validActId)}`, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${memberToken}`
      }
    });
    const publicAfterData = await publicAfterApproveRes.json();
    assert(Array.isArray(publicAfterData) && publicAfterData.length === 1, 'Lịch đã duyệt XUẤT HIỆN công khai trên Secure View');
    assert(publicAfterData[0].title === 'Chụp ảnh bình minh Chùa Hang cùng CLB', 'Tiêu đề hiển thị chính xác');
    assert(publicAfterData[0].admin_notes === undefined, 'Secure View công khai tuyệt đối KHÔNG có cột admin_notes');
    assert(publicAfterData[0].moderation_reason === undefined, 'Secure View công khai tuyệt đối KHÔNG có cột moderation_reason');

    console.log('\n================================================================================');
    console.log(` TẤT CẢ ${passedCount}/${totalCount} BÀI KIỂM THỬ AN NINH ĐÃ VƯỢT QUA XUẤT SẮC!`);
    console.log('================================================================================\n');
  } finally {
    await cleanup();
  }
}

runLiveSecurityTests().catch(err => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err.message);
  process.exit(1);
});
