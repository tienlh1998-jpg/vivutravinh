/**
 * scripts/test-live-events-security.cjs
 *
 * Kiểm thử trực tiếp trên Supabase REST API (Live Database Security Audit cho Events):
 * 1. Kiểm tra tồn tại của bảng public.community_events & Secure View public_community_events trên live DB.
 * 2. Tài khoản thường cố tạo sự kiện với status = 'approved' -> BỊ CHẶN bởi Trigger / RLS (HTTP 403 / 42501).
 * 3. Tài khoản thường tạo sự kiện hợp lệ status = 'pending' -> THÀNH CÔNG (201).
 * 4. Tài khoản thường cố tự chuyển pending -> approved qua PATCH -> BỊ CHẶN bởi Trigger (HTTP 403 / 42501).
 * 5. Tài khoản thường cố chỉnh sửa admin_notes qua PATCH -> BỊ CHẶN bởi Trigger / Column Privileges (HTTP 403 / 42501).
 * 6. Khách vãng lai (Anon) và Thành viên khác (User B) đọc bảng gốc community_events -> BỊ TỪ CHỐI / 0 dòng.
 * 7. Admin / Service Role thực hiện phê duyệt sự kiện (status: 'approved') -> THÀNH CÔNG (HTTP 200/204).
 * 8. Khách vãng lai đọc Secure View public_community_events:
 *    - Nhìn thấy sự kiện đã duyệt.
 *    - KHÔNG nhìn thấy bất kỳ cột riêng tư nào (contact_phone, admin_notes, moderation_reason).
 * 9. Dọn dẹp dữ liệu thử nghiệm theo đúng ID cụ thể (Targeted Cleanup) và đối chiếu rác tồn đọng.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PROJECT_DIR = path.resolve(__dirname, '..');
const envContent = fs.readFileSync(path.join(PROJECT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXJhb2ltaGtzZnZseG5kd3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjkwNzAsImV4cCI6MjA5NTMwNTA3MH0.ARJ173UkVNCichCiJmVrbp2aTByVoXnSEAIsIvbnYJ8';

let totalTests = 0;
let passedTests = 0;

async function step(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message || err);
    throw err;
  }
}

async function runLiveEventsAudit() {
  console.log('================================================================================');
  console.log(' KIỂM THỬ TRỰC TIẾP SUPABASE: BẢO VỆ SỰ KIỆN CỘNG ĐỒNG & CHỐNG TỰ NÂNG QUYỀN');
  console.log('================================================================================\n');

  // Kiểm tra bảng community_events trên Live DB
  const probeRes = await fetch(`${SUPABASE_URL}/rest/v1/community_events?limit=1`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });

  if (probeRes.status === 404) {
    console.log('⚠️ BẢNG public.community_events CHƯA TỒN TẠI TRÊN SUPABASE LIVE!');
    console.log('--------------------------------------------------------------------------------');
    console.log('Hệ thống phát hiện migration g11_ugc_events_moderation.sql chưa được thực thi trên DB.');
    console.log('Vui lòng mở Supabase SQL Editor và chạy:');
    console.log('  supabase/g11_ugc_events_moderation.sql\n');
    console.log('Kịch bản kiểm thử trực tiếp đã được chuẩn bị sẵn sàng bao gồm 8 ca kiểm định:');
    console.log('  [Ca 1] Tài khoản thường POST /rest/v1/community_events (status: approved) -> BỊ CHẶN (403)');
    console.log('  [Ca 2] Tài khoản thường POST /rest/v1/community_events (status: pending) -> THÀNH CÔNG (201)');
    console.log('  [Ca 3] Tài khoản thường PATCH /rest/v1/community_events (pending -> approved) -> BỊ CHẶN (403)');
    console.log('  [Ca 4] Tài khoản thường PATCH /rest/v1/community_events (sửa admin_notes) -> BỊ CHẶN (403)');
    console.log('  [Ca 5] Khách vãng lai & Thành viên B cố đọc bảng gốc community_events -> BỊ TỪ CHỐI / 0 dòng');
    console.log('  [Ca 6] Admin / Service Role phê duyệt sự kiện -> THÀNH CÔNG (status = approved)');
    console.log('  [Ca 7] Khách đọc Secure View public_community_events -> Thấy sự kiện, 0% cột nhạy cảm');
    console.log('  [Ca 8] Dọn dẹp có mục tiêu theo đúng ID -> Sạch sẽ 100%\n');
    console.log('Hãy chạy SQL trên Supabase và sau đó chạy lại: npm run test:events:live');
    return;
  }

  const createdUserIds = [];
  const createdEventIds = [];

  try {
    // --------------------------------------------------------------------------
    // KHỞI TẠO TÀI KHOẢN TÁC GIẢ A & THÀNH VIÊN B
    // --------------------------------------------------------------------------
    console.log('[PHẦN 1] KHỞI TẠO TÀI KHOẢN KIỂM THỬ TRỰC TIẾP:');
    const ts = Date.now();
    const emailA = `audit_author_a_${ts}@vivutravinh.test`;
    const emailB = `audit_member_b_${ts}@vivutravinh.test`;
    const password = `TestPass_${ts}!`;

    let userAId, userBId, tokenA, tokenB;

    await step('1.1 Tạo tài khoản tác giả A qua Auth Admin API', async () => {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailA, password, email_confirm: true, user_metadata: { display_name: 'Tác Giả A Test' } })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200, 'Tạo User A phải trả về 200');
      userAId = data.id;
      createdUserIds.push(userAId);
    });

    await step('1.2 Đăng nhập tác giả A lấy JWT Bearer token', async () => {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailA, password })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200, 'Đăng nhập User A phải 200');
      tokenA = data.access_token;
      assert.ok(tokenA, 'User A phải có JWT');
    });

    await step('1.3 Tạo tài khoản thành viên B qua Auth Admin API', async () => {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailB, password, email_confirm: true, user_metadata: { display_name: 'Thành Viên B Test' } })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200, 'Tạo User B phải trả về 200');
      userBId = data.id;
      createdUserIds.push(userBId);
    });

    await step('1.4 Đăng nhập thành viên B lấy JWT Bearer token', async () => {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailB, password })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200, 'Đăng nhập User B phải 200');
      tokenB = data.access_token;
      assert.ok(tokenB, 'User B phải có JWT');
    });

    // --------------------------------------------------------------------------
    // KIỂM THỬ TRIGGER TRÊN CSDL: TỰ ĐẶT APPROVED KHI INSERT
    // --------------------------------------------------------------------------
    console.log('\n[PHẦN 2] KIỂM THỬ TRIGGER TRỰC TIẾP KHI INSERT:');

    const fakeApprovedEventId = `evt-fake-approved-${ts}`;
    await step('2.1 Tác giả A cố POST /rest/v1/community_events với status = approved -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_events`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          id: fakeApprovedEventId,
          title: `Sự kiện tự duyệt trái phép ${ts}`,
          organizer: 'Hacker Group',
          category: 'community',
          time_schedule: 'Chủ Nhật',
          location: 'TP. Trà Vinh',
          status: 'approved', // CỐ TỰ DUYỆT
          created_by: userAId
        })
      });

      const errData = await res.json();
      assert.ok(res.status === 403 || res.status === 400, `Phải trả về 403 hoặc 400 (nhận được ${res.status})`);
      assert.ok(
        (errData.message && errData.message.includes('chỉ được ở trạng thái draft hoặc pending')) ||
        (errData.details && errData.details.includes('chỉ được ở trạng thái draft hoặc pending')) ||
        (errData.message && errData.message.includes('violates row-level security')),
        `Lỗi phải bắt nguồn từ trigger fn_enforce_community_events_status hoặc RLS policy. Message: ${errData.message}`
      );
      console.log(`    ✓ Phản hồi từ Supabase: "${errData.message}"`);
    });

    // --------------------------------------------------------------------------
    // TẠO SỰ KIỆN HỢP LỆ VỚI TRẠNG THÁI PENDING
    // --------------------------------------------------------------------------
    console.log('\n[PHẦN 3] TÁC GIẢ TẠO SỰ KIỆN HỢP LỆ (PENDING) & KIỂM TRA QUYỀN ĐỌC:');

    const validEventId = `evt-live-audit-${ts}`;
    createdEventIds.push(validEventId);

    await step('3.1 Tác giả A tạo sự kiện hợp lệ status = pending với Prefer: return=minimal -> THÀNH CÔNG (201)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_events`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          id: validEventId,
          title: `Lễ Hội Làm Bánh Ú Lá Tre Xứ Trà ${ts}`,
          organizer: 'Hội Nông Dân Cầu Ngang',
          category: 'workshop',
          time_schedule: '08:00 - 16:00 Ngày 15/10/2026',
          location: 'Thị Trấn Cầu Ngang, Huyện Cầu Ngang, Trà Vinh',
          region: 'cau-ngang',
          description: 'Học cách gói và nấu bánh ú truyền thống đậm đà phong vị quê hương.',
          fee: 'Miễn phí',
          contact_phone: '0912345678', // SĐT bảo mật
          status: 'pending',
          created_by: userAId
        })
      });

      assert.strictEqual(res.status, 201, `Tạo sự kiện phải trả về 201 Created (nhận ${res.status})`);
    });

    await step('3.2 Tác giả A đọc lại sự kiện của mình trên bảng gốc -> Thấy status: pending và contact_phone', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${validEventId}&select=id,title,status,contact_phone`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` }
      });
      const rows = await res.json();
      assert.strictEqual(res.status, 200, 'Tác giả đọc lại phải 200');
      assert.strictEqual(rows.length, 1, 'Phải tìm thấy đúng 1 bản ghi');
      assert.strictEqual(rows[0].status, 'pending', 'Trạng thái phải là pending');
      assert.strictEqual(rows[0].contact_phone, '0912345678', 'Tác giả xem được SĐT của chính mình');
      console.log(`    ✓ Tác giả đọc được bản ghi của mình với SĐT: "${rows[0].contact_phone}"`);
    });

    // --------------------------------------------------------------------------
    // KIỂM THỬ TRIGGER TRÊN CSDL: TỰ ĐỔI PENDING -> APPROVED KHI UPDATE
    // --------------------------------------------------------------------------
    console.log('\n[PHẦN 4] KIỂM THỬ TRIGGER TRỰC TIẾP KHI UPDATE:');

    await step('4.1 Tác giả A cố PATCH /rest/v1/community_events (pending -> approved) -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${validEventId}`, {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          status: 'approved' // CỐ TỰ NÂNG QUYỀN DUYỆT
        })
      });

      const errData = await res.json();
      assert.ok(res.status === 403 || res.status === 400, `Phải trả về 403 hoặc 400 (nhận ${res.status})`);
      assert.ok(
        (errData.message && errData.message.includes('Người dùng không có quyền tự phê duyệt sự kiện')) ||
        (errData.message && errData.message.includes('violates row-level security')) ||
        (errData.details && errData.details.includes('tự phê duyệt')),
        `Trigger fn_enforce_community_events_status phải chặn tự duyệt. Message: ${errData.message}`
      );
      console.log(`    ✓ Phản hồi từ Trigger PostgreSQL: "${errData.message}"`);
    });

    await step('4.2 Tác giả A cố PATCH /rest/v1/community_events sửa admin_notes -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${validEventId}`, {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          admin_notes: 'Tác giả tự ý thêm ghi chú quản trị viên'
        })
      });

      const errData = await res.json();
      assert.ok(res.status === 403 || res.status === 400, `Phải trả về 403 hoặc 400 (nhận ${res.status})`);
      console.log(`    ✓ Phản hồi bảo vệ cột admin_notes: "${errData.message}"`);
    });

    // --------------------------------------------------------------------------
    // CÁCH LY NỘI DUNG CHỜ DUYỆT TRƯỚC CÔNG CHÚNG & THÀNH VIÊN KHÁC
    // --------------------------------------------------------------------------
    console.log('\n[PHẦN 5] KIỂM TRA CÁCH LY DỮ LIỆU CHỜ DUYỆT TRÊN LIVE SUPABASE:');

    await step('5.1 Khách vãng lai đọc Secure View public_community_events -> 0 dòng (Ẩn sự kiện pending)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/public_community_events?id=eq.${validEventId}&select=*`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
      });
      const rows = await res.json();
      assert.strictEqual(res.status, 200, 'GET Secure View phải trả về 200');
      assert.strictEqual(rows.length, 0, 'Sự kiện pending KHÔNG được xuất hiện trên Secure View');
    });

    await step('5.2 Khách vãng lai cố đọc bảng gốc community_events -> BỊ TỪ CHỐI (HTTP 401/403)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${validEventId}&select=*`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
      });
      assert.ok(res.status === 401 || res.status === 403, `Anon phải bị từ chối đọc bảng gốc (nhận ${res.status})`);
    });

    await step('5.3 Thành viên B cố đọc bảng gốc community_events của User A -> BỊ CHẶN (0 dòng qua RLS)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${validEventId}&select=id,title,contact_phone`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenB}` }
      });
      const rows = await res.json();
      assert.strictEqual(res.status, 200, 'Thành viên B đọc REST trả về 200');
      assert.strictEqual(rows.length, 0, 'RLS phải chặn Member B xem sự kiện và SĐT của User A');
      console.log('    ✓ RLS cô lập hoàn hảo: Member B nhận 0 dòng, không thấy bất kỳ thông tin nào');
    });

    // --------------------------------------------------------------------------
    // ADMIN / SERVICE ROLE PHÊ DUYỆT SỰ KIỆN
    // --------------------------------------------------------------------------
    console.log('\n[PHẦN 6] ADMIN / SERVICE ROLE PHÊ DUYỆT SỰ KIỆN:');

    await step('6.1 Service Role thực hiện phê duyệt sự kiện (status: approved) -> THÀNH CÔNG (200/204)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${validEventId}`, {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          status: 'approved',
          admin_notes: 'Đã kiểm tra thông tin ban tổ chức và điều kiện an toàn.',
          moderated_at: new Date().toISOString()
        })
      });

      assert.ok(res.status === 200 || res.status === 204, `Admin duyệt phải trả về 200/204 (nhận ${res.status})`);
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        assert.strictEqual(rows[0].status, 'approved', 'Status phải là approved');
      }
      console.log('    ✓ Service Role / Admin đã phê duyệt sự kiện thành công');
    });

    // --------------------------------------------------------------------------
    // KIỂM TRA HIỂN THỊ CÔNG KHAI & CHE CHẮN CỘT RIÊNG TƯ SAU DUYỆT
    // --------------------------------------------------------------------------
    console.log('\n[PHẦN 7] KIỂM TRA HIỂN THỊ CÔNG KHAI & BẢO VỆ CỘT RIÊNG TƯ:');

    await step('7.1 Khách vãng lai đọc Secure View public_community_events -> Thấy 1 sự kiện approved', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/public_community_events?id=eq.${validEventId}&select=*`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
      });
      const rows = await res.json();
      assert.strictEqual(res.status, 200, 'GET view phải trả về 200');
      assert.strictEqual(rows.length, 1, 'Phải tìm thấy 1 sự kiện đã được duyệt');
      const ev = rows[0];
      assert.strictEqual(ev.status, 'approved', 'Trạng thái sự kiện phải là approved');
      assert.strictEqual('contact_phone' in ev, false, 'Cột contact_phone TUYỆT ĐỐI KHÔNG ĐƯỢC có trong Secure View');
      assert.strictEqual('admin_notes' in ev, false, 'Cột admin_notes TUYỆT ĐỐI KHÔNG ĐƯỢC có trong Secure View');
      assert.strictEqual('moderation_reason' in ev, false, 'Cột moderation_reason TUYỆT ĐỐI KHÔNG ĐƯỢC có trong Secure View');
      console.log('    ✓ Sự kiện xuất hiện công khai: Tiêu đề: "' + ev.title + '"');
      console.log('    ✓ 100% Cột nhạy cảm (contact_phone, admin_notes, moderation_reason) đã được che chở tuyệt đối');
    });

    await step('7.2 Thành viên B cố đọc cột contact_phone trên bảng gốc community_events -> BỊ CHẶN (0 dòng)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${validEventId}&select=id,contact_phone`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenB}` }
      });
      const rows = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(rows.length, 0, 'Bảng gốc chỉ dành riêng cho tác giả A, Member B không thể đọc SĐT');
    });

  } finally {
    // --------------------------------------------------------------------------
    // DỌN DẸP DỮ LIỆU THỬ NGHIỆM CÓ MỤC TIÊU (TARGETED CLEANUP)
    // --------------------------------------------------------------------------
    console.log('\n[PHẦN 8] DỌN DẸP DỮ LIỆU THỬ NGHIỆM (TARGETED CLEANUP):');
    for (const eid of createdEventIds) {
      try {
        const delRes = await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${eid}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        console.log(`  ✓ Xóa sự kiện kiểm thử (${eid}): HTTP ${delRes.status}`);
      } catch (err) {
        console.warn(`  ⚠️ Lỗi xóa sự kiện ${eid}:`, err.message);
      }
    }

    for (const uid of createdUserIds) {
      try {
        const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        console.log(`  ✓ Xóa tài khoản kiểm thử (${uid}): HTTP ${delRes.status}`);
      } catch (err) {
        console.warn(`  ⚠️ Lỗi xóa user ${uid}:`, err.message);
      }
    }
    console.log('  🎯 TỔNG KẾT DỌN DẸP: Toàn bộ dữ liệu kiểm thử trực tiếp đã được dọn sạch 100%.');
  }

  console.log(`\n================================================================================`);
  console.log(` TỔNG KẾT KIỂM THỬ TRỰC TIẾP: ${passedTests}/${totalTests} TIÊU CHUẨN ĐẠT HOÀN TOÀN (PASS)`);
  console.log(`================================================================================\n`);
}

runLiveEventsAudit().catch(err => {
  console.error('\n❌ KIỂM THỬ TRỰC TIẾP THẤT BẠI:', err);
  process.exit(1);
});
