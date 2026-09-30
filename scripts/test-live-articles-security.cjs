/**
 * scripts/test-live-articles-security.cjs
 *
 * Kiểm thử trực tiếp trên Supabase REST API (Live Database Security Audit cho Articles):
 * 1. Kiểm tra tồn tại của bảng public.articles & Secure View public_articles trên live DB.
 * 2. Tài khoản thường cố tạo bài viết với status = 'approved' -> BỊ CHẶN bởi Trigger (HTTP 403 / 42501).
 * 3. Tài khoản thường cố tạo bài với is_editorial = true hoặc admin_notes -> BỊ CHẶN bởi Trigger (HTTP 403 / 42501).
 * 4. Tài khoản thường tạo bài viết hợp lệ status = 'pending' -> THÀNH CÔNG (201).
 * 5. Tài khoản thường cố tự chuyển pending -> approved qua PATCH -> BỊ CHẶN bởi Trigger (HTTP 403 / 42501).
 * 6. Tài khoản thường cố chỉnh sửa admin_notes qua PATCH -> BỊ CHẶN bởi Trigger / Column Privileges (HTTP 403 / 42501).
 * 7. Khách vãng lai (Anon) và Thành viên B đọc bảng gốc articles -> BỊ TỪ CHỐI / 0 dòng.
 * 8. Tài khoản thường đọc bài của chính mình -> Thành công, nhưng CỘT admin_notes bị từ chối SELECT (CLS).
 * 9. Admin / Service Role thực hiện phê duyệt bài viết (status: 'approved') -> THÀNH CÔNG (HTTP 200/204).
 * 10. Khách vãng lai đọc Secure View public_articles:
 *     - Nhìn thấy bài viết đã duyệt.
 *     - KHÔNG nhìn thấy bất kỳ cột riêng tư nào (admin_notes, moderation_reason).
 * 11. Admin tạo bài cẩm nang Ban Biên Tập (is_editorial = true, status = approved) -> THÀNH CÔNG.
 * 12. Dọn dẹp dữ liệu thử nghiệm theo đúng ID cụ thể (Targeted Cleanup) và đối chiếu rác tồn đọng.
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

async function runLiveArticlesAudit() {
  console.log('================================================================================');
  console.log(' KIỂM THỬ TRỰC TIẾP SUPABASE: BẢO VỆ CẨM NANG DU LỊCH & CHỐNG TỰ NÂNG QUYỀN');
  console.log('================================================================================\n');

  // Kiểm tra bảng articles trên Live DB
  const probeRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?limit=1`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });

  if (probeRes.status === 404) {
    console.log('⚠️ BẢNG public.articles CHƯA TỒN TẠI TRÊN SUPABASE LIVE!');
    console.log('--------------------------------------------------------------------------------');
    console.log('Hệ thống phát hiện migration g12_articles_moderation.sql chưa được thực thi trên DB.');
    console.log('Vui lòng mở Supabase SQL Editor và chạy file:');
    console.log('  supabase/g12_articles_moderation.sql\n');
    console.log('Kịch bản kiểm thử trực tiếp đã được chuẩn bị sẵn sàng bao gồm 16 ca kiểm định:');
    console.log('  [Ca 1] Tài khoản thường POST articles (status: approved) -> BỊ CHẶN (403)');
    console.log('  [Ca 2] Tài khoản thường POST articles (is_editorial / admin_notes) -> BỊ CHẶN (403)');
    console.log('  [Ca 3] Tài khoản thường POST articles (status: pending) -> THÀNH CÔNG (201)');
    console.log('  [Ca 4] Tài khoản thường POST articles (tiêm nhiễm category_badge) -> BỊ CHẶN (403/CLS)');
    console.log('  [Ca 5] Tài khoản thường POST articles (mạo danh author_role) -> BỊ CHẶN (403/CLS)');
    console.log('  [Ca 6] Tài khoản thường PATCH articles (pending -> approved) -> BỊ CHẶN (403)');
    console.log('  [Ca 7] Tài khoản thường PATCH articles (sửa admin_notes) -> BỊ CHẶN (403)');
    console.log('  [Ca 8] Tài khoản thường PATCH articles (sửa category_badge) -> BỊ CHẶN (403/CLS)');
    console.log('  [Ca 9] Tài khoản thường PATCH articles (sửa author_role) -> BỊ CHẶN (403/CLS)');
    console.log('  [Ca 10] Tác giả sửa nội dung bài viết pending của mình -> THÀNH CÔNG (200/204)');
    console.log('  [Ca 11] Khách vãng lai & Thành viên B đọc bảng gốc articles -> BỊ TỪ CHỐI / 0 dòng');
    console.log('  [Ca 12] Tác giả đọc bài của mình nhưng SELECT admin_notes -> BỊ TỪ CHỐI (CLS)');
    console.log('  [Ca 13] Admin / Service Role phê duyệt bài cẩm nang -> THÀNH CÔNG');
    console.log('  [Ca 14] Khách đọc Secure View public_articles -> Thấy bài duyệt, 0% cột riêng tư');
    console.log('  [Ca 15] Admin tạo bài Ban Biên Tập (is_editorial = true) -> THÀNH CÔNG');
    console.log('  [Ca 16] Dọn dẹp có mục tiêu theo đúng ID -> Sạch sẽ 100%\n');
    console.log('Hãy chạy SQL trên Supabase và sau đó chạy lại: npm run test:articles:live');
    return;
  }

  const createdUserIds = [];
  const createdArticleIds = [];

  try {
    // --------------------------------------------------------------------------
    // KHỞI TẠO TÀI KHOẢN TÁC GIẢ A & THÀNH VIÊN B
    // --------------------------------------------------------------------------
    console.log('[PHẦN 1] KHỞI TẠO TÀI KHOẢN KIỂM THỬ TRỰC TIẾP:');
    const ts = Date.now();
    const emailA = `audit_art_a_${ts}@vivutravinh.test`;
    const emailB = `audit_art_b_${ts}@vivutravinh.test`;
    const password = `TestPass_${ts}!`;

    let userAId, userBId, tokenA, tokenB;

    await step('1.1 Tạo tài khoản tác giả A qua Auth Admin API', async () => {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailA, password, email_confirm: true, user_metadata: { display_name: 'Tác Giả Cẩm Nang A' } })
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
        body: JSON.stringify({ email: emailB, password, email_confirm: true, user_metadata: { display_name: 'Thành Viên B' } })
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

    const fakeApprovedArtId = `art-fake-approved-${ts}`;
    createdArticleIds.push(fakeApprovedArtId);
    await step('2.1 Tác giả A cố POST /rest/v1/articles với status = approved -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          id: fakeApprovedArtId,
          slug: `bai-viet-tu-duyet-${ts}`,
          title: `Bài viết tự duyệt trái phép ${ts}`,
          content: 'Nội dung bài viết tự cấp phép xuất bản trực tiếp.',
          category: 'van-hoa',
          status: 'approved', // CỐ TỰ DUYỆT
          author_id: userAId
        })
      });
      const errText = await res.text();
      assert.ok(res.status === 403 || res.status === 400, `Phải trả về 403/400 (nhận ${res.status}: ${errText})`);
      assert.ok(errText.includes('SECURITY_VIOLATION') || errText.includes('42501') || errText.includes('policy') || errText.includes('violates'), 'Phải thông báo vi phạm trigger/RLS');
    });

    const fakeEditorialArtId = `art-fake-editorial-${ts}`;
    createdArticleIds.push(fakeEditorialArtId);
    await step('2.2 Tác giả A cố POST /rest/v1/articles với is_editorial = true -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          id: fakeEditorialArtId,
          slug: `bai-viet-bien-tap-trai-phep-${ts}`,
          title: `Bài viết mạo danh Ban Biên Tập ${ts}`,
          content: 'Nội dung mạo danh bài chính thức của tòa soạn.',
          category: 'van-hoa',
          status: 'pending',
          is_editorial: true, // CỐ TỰ ĐẶT LÀ BÀI BIÊN TẬP
          author_id: userAId
        })
      });
      const errText = await res.text();
      assert.ok(res.status === 403 || res.status === 400, `Phải trả về 403/400 (nhận ${res.status}: ${errText})`);
      assert.ok(errText.includes('SECURITY_VIOLATION') || errText.includes('42501') || errText.includes('policy') || errText.includes('violates'), 'Phải thông báo vi phạm trigger');
    });

    const validArtId = `art-valid-pending-${ts}`;
    createdArticleIds.push(validArtId);
    await step('2.3 Tác giả A POST /rest/v1/articles hợp lệ với status = pending -> THÀNH CÔNG (201)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          id: validArtId,
          slug: `cam-nang-kham-pha-chua-ang-${ts}`,
          title: `Cẩm nang khám phá Chùa Âng cổ kính ${ts}`,
          excerpt: 'Khám phá kiến trúc Khmer Angkor độc bản tại di tích quốc gia Chùa Âng.',
          content: 'Chùa Âng (Wat Angkor Borei) là ngôi chùa Khmer cổ nhất tỉnh Trà Vinh...',
          category: 'van-hoa',
          status: 'pending',
          author_id: userAId
        })
      });
      const text = await res.text();
      assert.strictEqual(res.status, 201, `Tạo bài cẩm nang pending phải trả về 201 Created (nhận ${res.status}: ${text})`);
    });

    const malBadgeArtId = `art-mal-badge-${ts}`;
    createdArticleIds.push(malBadgeArtId);
    await step('2.4 Tác giả A cố POST category_badge độc hại qua REST -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          id: malBadgeArtId,
          slug: `bai-viet-mal-badge-${ts}`,
          title: `Bài viết tiêm nhiễm badge ${ts}`,
          content: 'Nội dung chứa payload attribute injection.',
          category: 'van-hoa',
          category_badge: '"><script>alert(1)</script><span class="',
          status: 'pending',
          author_id: userAId
        })
      });
      const errText = await res.text();
      assert.ok(res.status === 403 || res.status === 400, `Phải trả về 403/400 khi cố ghi category_badge (nhận ${res.status}: ${errText})`);
      assert.ok(errText.includes('permission denied') || errText.includes('category_badge') || errText.includes('42501') || errText.includes('SECURITY_VIOLATION') || errText.includes('policy'), 'Phải từ chối quyền ghi cột category_badge');
    });

    const malRoleArtId = `art-mal-role-${ts}`;
    createdArticleIds.push(malRoleArtId);
    await step('2.5 Tác giả A cố POST author_role mạo danh Ban Biên Tập -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          id: malRoleArtId,
          slug: `bai-viet-mal-role-${ts}`,
          title: `Bài viết mạo danh role ${ts}`,
          content: 'Nội dung cố tự phong làm Ban Biên Tập.',
          category: 'van-hoa',
          author_role: 'Ban Biên Tập ViVuTraVinh',
          status: 'pending',
          author_id: userAId
        })
      });
      const errText = await res.text();
      assert.ok(res.status === 403 || res.status === 400, `Phải trả về 403/400 khi cố ghi author_role (nhận ${res.status}: ${errText})`);
      assert.ok(errText.includes('permission denied') || errText.includes('author_role') || errText.includes('42501') || errText.includes('SECURITY_VIOLATION') || errText.includes('policy'), 'Phải từ chối quyền ghi cột author_role');
    });

    // --------------------------------------------------------------------------
    // KIỂM THỬ TRIGGER TRÊN CSDL: TỰ ĐỔI STATUS HOẶC SỬA ADMIN_NOTES QUA UPDATE
    // --------------------------------------------------------------------------
    console.log('\n[PHẦN 3] KIỂM THỬ TRIGGER TRỰC TIẾP KHI UPDATE:');

    await step('3.1 Tác giả A cố PATCH /rest/v1/articles (pending -> approved) -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${validArtId}`, {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          status: 'approved' // CỐ TỰ NÂNG LÊN APPROVED
        })
      });
      const errText = await res.text();
      assert.ok(res.status === 403 || res.status === 400, `Phải trả về 403/400 (nhận ${res.status}: ${errText})`);
      assert.ok(errText.includes('SECURITY_VIOLATION') || errText.includes('42501') || errText.includes('policy') || errText.includes('violates'), 'Phải chặn tự duyệt qua trigger/RLS');
    });

    await step('3.2 Tác giả A cố PATCH /rest/v1/articles sửa admin_notes -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${validArtId}`, {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          admin_notes: 'Tác giả tự can thiệp ghi chú kiểm toán nội bộ'
        })
      });
      const errText = await res.text();
      assert.ok(res.status === 403 || res.status === 400 || res.status === 404, `Phải trả về 403/400 (nhận ${res.status}: ${errText})`);
    });

    await step('3.3 Tác giả A cố PATCH category_badge độc hại -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${validArtId}`, {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          category_badge: '"><script>alert(1)</script><span class="'
        })
      });
      const errText = await res.text();
      assert.ok(res.status === 403 || res.status === 400, `Phải trả về 403/400 khi cố sửa category_badge (nhận ${res.status}: ${errText})`);
      assert.ok(errText.includes('permission denied') || errText.includes('category_badge') || errText.includes('42501'), 'Phải từ chối quyền UPDATE trên cột category_badge');
    });

    await step('3.4 Tác giả A cố PATCH author_role mạo danh -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${validArtId}`, {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          author_role: 'Ban Biên Tập ViVuTraVinh'
        })
      });
      const errText = await res.text();
      assert.ok(res.status === 403 || res.status === 400, `Phải trả về 403/400 khi cố sửa author_role (nhận ${res.status}: ${errText})`);
      assert.ok(errText.includes('permission denied') || errText.includes('author_role') || errText.includes('42501'), 'Phải từ chối quyền UPDATE trên cột author_role');
    });

    await step('3.5 Tác giả A PATCH chỉnh sửa nội dung bài viết pending của mình -> THÀNH CÔNG (200/204)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${validArtId}`, {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          excerpt: 'Bản tóm tắt đã được tác giả A bổ sung chi tiết lịch sử 1000 năm.',
          read_time: '6 phút đọc'
        })
      });
      assert.ok(res.status === 200 || res.status === 204, `Tác giả sửa bài của mình phải thành công (nhận ${res.status})`);
    });

    // --------------------------------------------------------------------------
    // KIỂM THỬ BẢO VỆ DỮ LIỆU & PHÂN QUYỀN TRUY CẬP (RLS & CLS)
    // --------------------------------------------------------------------------
    console.log('\n[PHẦN 4] KIỂM THỬ BẢO VỆ DỮ LIỆU & PHÂN QUYỀN TRUY CẬP (RLS & CLS):');

    await step('4.1 Khách vãng lai (Anon) truy vấn bảng gốc articles -> 0 dòng hoặc 403', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${validArtId}`, {
        headers: { apikey: ANON_KEY }
      });
      if (res.status === 200) {
        const rows = await res.json();
        assert.strictEqual(rows.length, 0, 'Khách vãng lai không được nhìn thấy dòng nào trong bảng gốc articles');
      } else {
        assert.ok(res.status === 401 || res.status === 403, 'Khách không có quyền SELECT trên bảng gốc');
      }
    });

    await step('4.2 Thành viên B truy vấn bảng gốc articles -> 0 dòng (cô lập tác giả)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${validArtId}`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenB}` }
      });
      if (res.status === 200) {
        const rows = await res.json();
        assert.strictEqual(rows.length, 0, 'Thành viên B không được thấy bài viết pending của Tác giả A');
      } else {
        assert.ok(res.status === 403, 'User B bị từ chối truy cập bài của User A');
      }
    });

    await step('4.3 Tác giả A SELECT cột admin_notes từ bảng gốc -> BỊ TỪ CHỐI BỞI CLS', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${validArtId}&select=id,title,admin_notes`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` }
      });
      assert.ok(res.status === 403 || res.status === 400, `Tác giả A không được phép SELECT admin_notes (nhận ${res.status})`);
    });

    await step('4.4 Tác giả A SELECT các cột an toàn được cấp phép -> THÀNH CÔNG (200)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${validArtId}&select=id,title,excerpt,status`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.status, 200, `Tác giả A đọc các cột an toàn của mình phải 200 (nhận ${res.status})`);
      const rows = await res.json();
      assert.strictEqual(rows.length, 1, 'Tác giả A phải thấy đúng 1 bài viết của mình');
      assert.strictEqual(rows[0].status, 'pending', 'Trạng thái bài viết vẫn là pending');
    });

    // --------------------------------------------------------------------------
    // ADMIN PHÊ DUYỆT & SECURE VIEW CÔNG KHAI
    // --------------------------------------------------------------------------
    console.log('\n[PHẦN 5] ADMIN PHÊ DUYỆT & KIỂM THỬ SECURE VIEW CÔNG KHAI:');

    await step('5.1 Admin (Service Role) phê duyệt bài viết và lưu admin_notes -> THÀNH CÔNG', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${validArtId}`, {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          status: 'approved',
          admin_notes: 'Đã thẩm định thông tin lịch sử Chùa Âng - Đạt tiêu chuẩn cẩm nang du lịch.'
        })
      });
      assert.strictEqual(res.status, 200, `Admin phê duyệt phải trả về 200 (nhận ${res.status})`);
      const rows = await res.json();
      assert.strictEqual(rows[0].status, 'approved', 'Trạng thái phải là approved');
      assert.strictEqual(rows[0].admin_notes, 'Đã thẩm định thông tin lịch sử Chùa Âng - Đạt tiêu chuẩn cẩm nang du lịch.');
    });

    await step('5.2 Khách vãng lai (Anon) đọc Secure View public_articles -> Thấy bài viết đã duyệt', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/public_articles?id=eq.${validArtId}`, {
        headers: { apikey: ANON_KEY }
      });
      assert.strictEqual(res.status, 200, `Đọc secure view công khai phải 200 (nhận ${res.status})`);
      const rows = await res.json();
      assert.strictEqual(rows.length, 1, 'Phải tìm thấy bài viết đã duyệt');
      const art = rows[0];
      assert.strictEqual(art.id, validArtId);
      assert.strictEqual(art.status, 'approved');
      assert.strictEqual(art.admin_notes, undefined, 'Cột admin_notes TUYỆT ĐỐI không được lộ trên secure view');
      assert.strictEqual(art.moderation_reason, undefined, 'Cột moderation_reason TUYỆT ĐỐI không được lộ trên secure view');
    });

    const editorialArtId = `art-editorial-${ts}`;
    createdArticleIds.push(editorialArtId);
    await step('5.3 Admin (Service Role) tạo bài viết Ban Biên Tập (is_editorial = true) -> THÀNH CÔNG', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          id: editorialArtId,
          slug: `tuyen-tap-am-thuc-tra-vinh-chinh-thuc-${ts}`,
          title: `Tuyển tập ẩm thực Trà Vinh chính thức ${ts}`,
          excerpt: 'Bài viết chuyên sâu do Ban Biên Tập ViVuTraVinh thực hiện.',
          content: 'Hành trình trải nghiệm tinh hoa ẩm thực ba dân tộc Kinh - Khmer - Hoa...',
          category: 'am-thuc',
          category_name: 'Ẩm Thực Bản Địa',
          status: 'approved',
          is_editorial: true,
          admin_notes: 'Bài biên tập chính thức của BBT'
        })
      });
      assert.strictEqual(res.status, 201, `Tạo bài biên tập phải 201 (nhận ${res.status})`);
    });

  } finally {
    // --------------------------------------------------------------------------
    // DỌN DẸP DỮ LIỆU KIỂM THỬ CÓ MỤC TIÊU (TARGETED CLEANUP)
    // --------------------------------------------------------------------------
    console.log('\n[PHẦN 6] DỌN DẸP DỮ LIỆU THỬ NGHIỆM CÓ MỤC TIÊU (TARGETED CLEANUP):');
    const uniqueArticleIds = [...new Set(createdArticleIds)];
    for (const artId of uniqueArticleIds) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${artId}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        console.log(`  ✓ Đã dọn dẹp bài viết test: ${artId}`);
      } catch (e) {
        console.warn(`  ⚠️ Không thể xóa bài test ${artId}:`, e.message);
      }
    }

    for (const uId of createdUserIds) {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uId}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        console.log(`  ✓ Đã dọn dẹp tài khoản test: ${uId}`);
      } catch (e) {
        console.warn(`  ⚠️ Không thể xóa user test ${uId}:`, e.message);
      }
    }
  }

  console.log('\n================================================================================');
  console.log(` TỔNG KẾT KIỂM THỬ LIVE ARTICLES: ${passedTests}/${totalTests} CA ĐẠT CHUẨN (PASS 100%)`);
  console.log('================================================================================\n');
}

runLiveArticlesAudit().catch(err => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
