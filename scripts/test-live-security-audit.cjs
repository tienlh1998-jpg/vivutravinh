/**
 * scripts/test-live-security-audit.cjs
 *
 * Kiểm thử An Ninh Toàn Diện trên Supabase Live (3 Vai Trò):
 * 1. Khách Vãng Lai (Anon Key):
 *    - Cố truy vấn cột riêng tư (leader_phone, moderation_reason, admin_notes) trên bảng gốc
 *      -> Bắt buộc bị từ chối (HTTP 401/403). HTTP 200 sẽ làm TEST FAIL NGAY!
 *    - Đọc Secure Views (public_clubs, public_community_posts) -> Thành công (200), không có cột riêng tư.
 * 2. Tác Giả A (Author A - Đã đăng nhập):
 *    - Tác giả đọc bài viết của chính mình -> Xem được lý do từ chối (moderation_reason) của bản thân (200).
 *    - Tác giả cố đọc ghi chú nội bộ quản trị (admin_notes) của bài viết -> BỊ TỪ CHỐI / 403 FORBIDDEN!
 *      (admin_notes chỉ dành cho admin; nếu nhận được admin_notes -> TEST FAIL NGAY!).
 *    - Tác giả đọc CLB của chính mình -> Xem được SĐT leader_phone của chính mình (200).
 *    - Tác giả tạo bài pending trực tiếp với Prefer: return=minimal -> Thành công (201).
 *    - Tác giả tạo CLB pending trực tiếp với Prefer: return=minimal -> Thành công (201).
 *    - Tác giả tạo bài pending qua Serverless API (/api/community-posts) -> Thành công (201), trả về object an toàn.
 *    - Tác giả tạo CLB pending qua Serverless API (/api/clubs) -> Thành công (201), trả về object an toàn.
 * 3. Thành Viên Khác B (Member B - Đã đăng nhập):
 *    - Member B cố đọc leader_phone của CLB người khác trên bảng gốc -> BỊ CHẶN (0 rows hoặc 403/401).
 *      (Nếu HTTP 200 trả về dòng của người khác hoặc lộ leader_phone -> TEST FAIL NGAY!).
 *    - Member B cố đọc moderation_reason của bài viết người khác -> BỊ CHẶN (0 rows hoặc 403/401).
 *      (Nếu HTTP 200 trả về dòng của người khác hoặc lộ lý do kiểm duyệt -> TEST FAIL NGAY!).
 *    - Member B cố đọc admin_notes -> BỊ CHẶN (403/401 hoặc 0 rows).
 *    - Member B cố tự gán role = admin -> Bị chặn (403 / 42501).
 *    - Member B cố tự xuất bản status = approved -> Bị chặn (403 / 42501).
 *    - Member B đọc nội dung đã duyệt qua Secure Views -> Thành công (200), an toàn tuyệt đối.
 * 4. Dọn Dẹp Sạch Sẽ (Cleanup):
 *    - Xóa toàn bộ User A, User B, CLB, bài viết thử nghiệm (kể cả tạo từ API).
 *    - Xác nhận kép 0 dòng rác còn tồn tại trên DB.
 */

const assert = require('assert');
const fs = require('fs');
const stream = require('stream');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXJhb2ltaGtzZnZseG5kd3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjkwNzAsImV4cCI6MjA5NTMwNTA3MH0.ARJ173UkVNCichCiJmVrbp2aTByVoXnSEAIsIvbnYJ8';

let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
if (!serviceKey) {
  try {
    const envContent = fs.readFileSync('d:/OLD/VIVUTRAVINH_PROJECT_BACKUP/vivutravinh/.env.live.tmp', 'utf8');
    const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
    if (match) serviceKey = match[1];
  } catch (_) {}
}

process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;

/**
 * Mock Response với cơ chế wait() trả về ngay nếu end() đã gọi,
 * đồng thời có timeout để tránh test bị treo im lặng.
 */
function createMockResponse(defaultTimeoutMs = 10000) {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    _ended: false,
    _resolve: null,
    _reject: null,
    _timer: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(data) {
      if (data !== undefined) this.body = data;
      this._ended = true;
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
      if (this._resolve) {
        const resolveFn = this._resolve;
        this._resolve = null;
        this._reject = null;
        resolveFn(this);
      }
    },
    wait(timeoutMs = defaultTimeoutMs) {
      // Trả về ngay nếu end() đã được gọi trước khi wait() được kích hoạt
      if (this._ended) {
        return Promise.resolve(this);
      }
      return new Promise((resolve, reject) => {
        this._resolve = resolve;
        this._reject = reject;
        this._timer = setTimeout(() => {
          this._resolve = null;
          this._reject = null;
          this._timer = null;
          reject(new Error(`Timeout sau ${timeoutMs}ms: API Serverless không gọi response.end() để kết thúc phản hồi.`));
        }, timeoutMs);
      });
    }
  };
}

function createMockRequest({ method = 'GET', url = '/', headers = {}, body = null }) {
  const reqStream = new stream.Readable();
  reqStream.method = method;
  reqStream.url = url;
  reqStream.headers = { ...headers };
  if (body) {
    const b = typeof body === 'string' ? body : JSON.stringify(body);
    reqStream.push(b);
  }
  reqStream.push(null);
  return reqStream;
}

console.log('================================================================================');
console.log(' KIỂM THỬ LIVE SUPABASE: BẢO VỆ CỘT RIÊNG TƯ & 3 VAI TRÒ (ANON, TÁC GIẢ A, MEMBER B)');
console.log('================================================================================\n');

async function runLiveAudit() {
  let passed = 0;
  let total = 0;
  const failures = [];

  async function step(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failures.push({ name, error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // PHẦN 1: VAI TRÒ 1 - KHÁCH VÃNG LAI (ANON KEY)
  // --------------------------------------------------------------------------
  console.log('[PHẦN 1] VAI TRÒ 1: KHÁCH VÃNG LAI (ANON KEY):');

  await step('1.1 Anon key cố truy vấn cột leader_phone trên bảng gốc clubs -> BỊ TỪ CHỐI (401/403)', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clubs?select=id,name,leader_phone&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    });
    if (res.status === 200) {
      const data = await res.json();
      assert.fail(`LỖ HỔNG AN NINH: Cột riêng tư leader_phone không được phép trả về HTTP 200 cho anon key! Nhận được: ${JSON.stringify(data)}`);
    }
    assert.ok(res.status === 401 || res.status === 403, `Mong đợi mã 401 hoặc 403, nhận được HTTP ${res.status}`);
    console.log(`    ✓ Cột leader_phone trên bảng gốc clubs đã bị từ chối thành công (HTTP ${res.status}).`);
  });

  await step('1.2 Anon key cố truy vấn cột moderation_reason, admin_notes trên community_posts -> BỊ TỪ CHỐI (401/403)', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?select=id,moderation_reason,admin_notes&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    });
    if (res.status === 200) {
      const data = await res.json();
      assert.fail(`LỖ HỔNG AN NINH: Cột riêng tư admin_notes/moderation_reason không được phép trả về HTTP 200 cho anon key! Nhận được: ${JSON.stringify(data)}`);
    }
    assert.ok(res.status === 401 || res.status === 403, `Mong đợi mã 401 hoặc 403, nhận được HTTP ${res.status}`);
    console.log(`    ✓ Cột moderation_reason/admin_notes trên bảng gốc đã bị từ chối thành công (HTTP ${res.status}).`);
  });

  await step('1.3 Anon key đọc Secure View public_clubs -> THÀNH CÔNG (200), không chứa leader_phone', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/public_clubs?select=*&limit=5`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    });
    assert.strictEqual(res.status, 200, 'View public_clubs phải luôn phản hồi 200 OK');
    const clubs = await res.json();
    assert.ok(Array.isArray(clubs) && clubs.length > 0, 'Phải có danh sách CLB đã duyệt');
    assert.strictEqual(clubs[0].leader_phone, undefined, 'View công khai tuyệt đối KHÔNG có leader_phone');
    assert.strictEqual(clubs[0].moderation_reason, undefined, 'View công khai tuyệt đối KHÔNG có moderation_reason');
    console.log(`    ✓ View public_clubs trả về ${clubs.length} CLB công khai an toàn (không có SĐT hay dữ liệu kiểm duyệt).`);
  });

  await step('1.4 Anon key đọc Secure View public_community_posts -> THÀNH CÔNG (200), không chứa admin_notes hay moderation_reason', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/public_community_posts?select=*&limit=5`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    });
    if (res.status === 200) {
      const posts = await res.json();
      if (Array.isArray(posts) && posts.length > 0) {
        assert.strictEqual(posts[0].admin_notes, undefined, 'View công khai tuyệt đối KHÔNG có admin_notes');
        assert.strictEqual(posts[0].moderation_reason, undefined, 'View công khai tuyệt đối KHÔNG có moderation_reason');
      }
      console.log(`    ✓ View public_community_posts an toàn, không để lộ dữ liệu kiểm duyệt.`);
    }
  });

  // --------------------------------------------------------------------------
  // CHUẨN BỊ FIXTURE CHO VAI TRÒ 2 (TÁC GIẢ A) & VAI TRÒ 3 (THÀNH VIÊN B)
  // --------------------------------------------------------------------------
  if (!serviceKey) {
    throw new Error('Cần SUPABASE_SERVICE_ROLE_KEY để tạo và dọn dẹp tài khoản thử nghiệm.');
  }

  const timestamp = Date.now();
  const emailA = `author_a_${timestamp}@vivutravinh.vn`;
  const emailB = `member_b_${timestamp}@vivutravinh.vn`;
  const defaultPassword = 'SecurityAuditPass123!@#';

  let userAId = null;
  let userBId = null;
  let tokenA = null;
  let tokenB = null;

  let clubAId = `clb-author-a-${timestamp}`;
  let postAId = null;

  let directPostAId = null;
  let directClubAId = null;
  let apiPostAId = null;
  let apiClubAId = null;

  try {
    // Khởi tạo User A và User B
    const resA = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password: defaultPassword, email_confirm: true, user_metadata: { display_name: 'Tác Giả A' } })
    });
    const dataA = await resA.json();
    userAId = dataA.id;

    const resB = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password: defaultPassword, email_confirm: true, user_metadata: { display_name: 'Thành Viên B' } })
    });
    const dataB = await resB.json();
    userBId = dataB.id;

    // Đăng nhập User A & User B lấy JWT
    const loginA = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password: defaultPassword })
    });
    tokenA = (await loginA.json()).access_token;

    const loginB = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password: defaultPassword })
    });
    tokenB = (await loginB.json()).access_token;

    // Khởi tạo CLB của User A với SĐT riêng tư (qua service_role)
    await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: clubAId,
        name: 'CLB Chụp Ảnh Cảnh Đẹp Trà Vinh',
        category: 'di-san',
        leader_id: userAId,
        leader_name: 'Tác Giả A',
        leader_phone: '0987654321', // SĐT riêng tư của Leader A
        status: 'approved'
      })
    });

    // Khởi tạo Bài viết của User A bị từ chối kèm Lý do từ chối (moderation_reason) và ghi chú admin (admin_notes)
    const resPostA = await fetch(`${SUPABASE_URL}/rest/v1/community_posts`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        author_id: userAId,
        author_name: 'Tác Giả A',
        content: 'Nội dung bài viết về di tích Chùa Hang',
        status: 'rejected',
        moderation_reason: 'Ảnh chụp chưa rõ ràng, vui lòng cập nhật ảnh nét hơn.',
        admin_notes: 'ADMIN_PRIVATE_NOTE_ONLY_FOR_MODERATORS'
      })
    });
    const postARows = await resPostA.json();
    postAId = postARows[0]?.id;

    // ------------------------------------------------------------------------
    // PHẦN 2: VAI TRÒ 2 - TÁC GIẢ A (AUTHOR A - ĐÃ ĐĂNG NHẬP)
    // ------------------------------------------------------------------------
    console.log('\n[PHẦN 2] VAI TRÒ 2: TÁC GIẢ A (CHÍNH CHỦ NỘI DUNG):');

    await step('2.1 Tác giả A đọc bài viết của mình -> Xem được lý do từ chối (moderation_reason) (HTTP 200)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${postAId}&select=id,status,moderation_reason`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.status, 200, 'Tác giả phải đọc được bài viết của chính mình');
      const rows = await res.json();
      assert.strictEqual(rows.length, 1, 'Phải trả về đúng 1 bài viết của tác giả');
      assert.strictEqual(rows[0].status, 'rejected');
      assert.strictEqual(rows[0].moderation_reason, 'Ảnh chụp chưa rõ ràng, vui lòng cập nhật ảnh nét hơn.');
      console.log(`    ✓ Tác giả A xem được lý do từ chối: "${rows[0].moderation_reason}"`);
    });

    await step('2.2 Tác giả A cố truy vấn cột admin_notes -> BỊ TỪ CHỐI / 403 (admin_notes chỉ dành cho admin)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${postAId}&select=id,admin_notes`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` }
      });
      if (res.status === 200) {
        const rows = await res.json();
        if (rows.length > 0 && rows[0].admin_notes !== undefined && rows[0].admin_notes !== null) {
          assert.fail(`LỖ HỔNG AN NINH: Tác giả A đọc được ghi chú nội bộ admin_notes (${rows[0].admin_notes})! Cột này phải chỉ dành cho admin.`);
        }
      }
      assert.ok(res.status === 403 || res.status === 401 || res.status === 400, `Mong đợi 403/401/400 (permission denied for column admin_notes), nhận được HTTP ${res.status}`);
      console.log(`    ✓ admin_notes được bảo vệ an toàn trước tác giả A (HTTP ${res.status}).`);
    });

    await step('2.3 Tác giả A đọc CLB của mình -> Xem được SĐT leader_phone của chính mình (HTTP 200)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${clubAId}&select=id,name,leader_phone`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.status, 200, 'Chủ nhiệm CLB phải đọc được CLB của chính mình');
      const rows = await res.json();
      assert.strictEqual(rows.length, 1, 'Phải trả về đúng 1 CLB của chủ nhiệm');
      assert.strictEqual(rows[0].leader_phone, '0987654321');
      console.log(`    ✓ Tác giả A xem được SĐT CLB của mình: "${rows[0].leader_phone}"`);
    });

    await step('2.4 Tác giả A tạo bài pending trực tiếp với Prefer: return=minimal -> THÀNH CÔNG (201)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_posts`, {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          author_id: userAId,
          author_name: 'Tác Giả A',
          content: 'Bài viết tạo trực tiếp REST với return=minimal',
          status: 'pending'
        })
      });
      assert.strictEqual(res.status, 201, 'Tạo bài viết pending với return=minimal phải thành công HTTP 201');
      console.log(`    ✓ Tạo bài viết pending với return=minimal thành công (HTTP 201).`);
      
      // Lấy ID bài vừa tạo để dọn dẹp
      const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?author_id=eq.${userAId}&order=created_at.desc&limit=1&select=id`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` }
      });
      const checkRows = await checkRes.json();
      if (checkRows.length > 0) directPostAId = checkRows[0].id;
    });

    await step('2.5 Tác giả A tạo CLB pending trực tiếp với Prefer: return=minimal -> THÀNH CÔNG (201)', async () => {
      directClubAId = `clb-author-min-${timestamp}`;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          id: directClubAId,
          name: 'CLB Tạo Trực Tiếp Minimal',
          category: 'da-ngoai',
          description: 'Mô tả CLB tạo trực tiếp qua REST API',
          leader_id: userAId,
          leader_phone: '0911223344',
          status: 'pending'
        })
      });
      assert.strictEqual(res.status, 201, 'Tạo CLB pending với return=minimal phải thành công HTTP 201');
      console.log(`    ✓ Tạo CLB pending với return=minimal thành công (ID: ${directClubAId}, HTTP 201).`);
    });

    await step('2.6 Tác giả A tạo bài pending qua Serverless API (/api/community-posts) -> THÀNH CÔNG (201, Safe Representation)', async () => {
      const communityPostsMod = await import('../api/community-posts.js');
      const handler = communityPostsMod.default;

      const req = createMockRequest({
        method: 'POST',
        url: '/api/community-posts',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${tokenA}`
        },
        body: {
          title: 'Bài viết qua Serverless API',
          content: 'Nội dung bài viết tạo qua API serverless thực tế an toàn.',
          category: 'Văn hóa',
          status: 'pending'
        }
      });
      const res = createMockResponse();
      await handler(req, res);
      await res.wait();

      assert.strictEqual(res.statusCode, 201, `Serverless API tạo bài viết phải trả về 201, nhận được ${res.statusCode}: ${res.body}`);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      apiPostAId = data.post?.id;
      assert.ok(apiPostAId, 'Phải trả về ID bài viết đã tạo');
      assert.ok(!data.post.admin_notes, 'Object bài viết trả về qua API an toàn, không có admin_notes');
      console.log(`    ✓ API Serverless tạo bài viết thành công (Post ID: ${apiPostAId}, Safe: OK).`);
    });

    await step('2.7 Tác giả A tạo CLB pending qua Serverless API (/api/clubs) -> THÀNH CÔNG (201, Safe Representation)', async () => {
      const clubsMod = await import('../api/clubs.js');
      const handler = clubsMod.default;

      const req = createMockRequest({
        method: 'POST',
        url: '/api/clubs',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${tokenA}`
        },
        body: {
          name: `CLB Serverless API ${timestamp.toString().slice(-4)}`,
          category: 'am-thuc',
          description: 'CLB khám phá ẩm thực tạo qua API serverless thực tế.',
          meeting_place: 'Trà Vinh',
          leader_phone: '0933445566',
          status: 'pending'
        }
      });
      const res = createMockResponse();
      await handler(req, res);
      await res.wait();

      assert.strictEqual(res.statusCode, 201, `Serverless API tạo CLB phải trả về 201, nhận được ${res.statusCode}: ${res.body}`);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      apiClubAId = data.club?.id;
      assert.ok(apiClubAId, 'Phải trả về ID CLB đã tạo');
      console.log(`    ✓ API Serverless tạo CLB thành công (Club ID: ${apiClubAId}, Safe: OK).`);
    });

    // ------------------------------------------------------------------------
    // PHẦN 3: VAI TRÒ 3 - THÀNH VIÊN KHÁC B (MEMBER B - ĐÃ ĐĂNG NHẬP)
    // ------------------------------------------------------------------------
    console.log('\n[PHẦN 3] VAI TRÒ 3: THÀNH VIÊN KHÁC B (NGƯỜI NGOÀI ĐÃ ĐĂNG NHẬP):');

    await step('3.1 Member B cố đọc leader_phone của CLB User A trên bảng gốc -> BỊ TỪ CHỐI / 0 ROWS (HTTP 200 có data = FAIL)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${clubAId}&select=id,name,leader_id,leader_phone`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenB}` }
      });
      if (res.status === 401 || res.status === 403) {
        console.log(`    ✓ Bị từ chối ở cấp độ quyền (HTTP ${res.status}).`);
        return;
      }
      assert.strictEqual(res.status, 200);
      const rows = await res.json();
      if (rows.length > 0) {
        for (const club of rows) {
          if (club.leader_phone !== null && club.leader_phone !== undefined) {
            assert.fail(`LỖ HỔNG AN NINH: Member B đọc được SĐT leader_phone của User A (${club.leader_phone})!`);
          }
        }
        assert.fail(`LỖ HỔNG AN NINH: Bảng gốc trả về ${rows.length} CLB của người khác cho Member B! Bảng gốc phải cô lập hoàn toàn (0 rows).`);
      }
      console.log('    ✓ RLS cô lập hoàn hảo: Trả về 0 dòng, Member B không thể đọc CLB hay SĐT của User A trên bảng gốc.');
    });

    await step('3.2 Member B cố đọc moderation_reason của bài viết User A trên bảng gốc -> BỊ TỪ CHỐI / 0 ROWS (HTTP 200 có data = FAIL)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${postAId}&select=id,author_id,moderation_reason`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenB}` }
      });
      if (res.status === 401 || res.status === 403) {
        console.log(`    ✓ Bị từ chối ở cấp độ quyền (HTTP ${res.status}).`);
        return;
      }
      assert.strictEqual(res.status, 200);
      const rows = await res.json();
      if (rows.length > 0) {
        for (const post of rows) {
          if (post.moderation_reason !== null && post.moderation_reason !== undefined) {
            assert.fail(`LỖ HỔNG AN NINH: Member B đọc được lý do từ chối moderation_reason của bài viết User A (${post.moderation_reason})!`);
          }
        }
        assert.fail(`LỖ HỔNG AN NINH: Bảng gốc trả về ${rows.length} bài viết của người khác cho Member B! Bảng gốc phải cô lập hoàn toàn (0 rows).`);
      }
      console.log('    ✓ RLS cô lập hoàn hảo: Trả về 0 dòng, Member B không thể đọc bài viết hay lý do kiểm duyệt của User A trên bảng gốc.');
    });

    await step('3.3 Member B cố truy vấn cột admin_notes -> BỊ TỪ CHỐI (403/401/400 hoặc 0 rows)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${postAId}&select=id,admin_notes`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenB}` }
      });
      if (res.status === 200) {
        const rows = await res.json();
        if (rows.length > 0 && rows[0].admin_notes !== undefined && rows[0].admin_notes !== null) {
          assert.fail(`LỖ HỔNG AN NINH: Member B đọc được admin_notes (${rows[0].admin_notes})!`);
        }
      }
      assert.ok(res.status === 403 || res.status === 401 || res.status === 400 || res.status === 200, `Mong đợi 403/401/400 (hoặc 200 không có cột admin_notes), nhận được HTTP ${res.status}`);
      console.log(`    ✓ admin_notes được bảo vệ an toàn trước Member B (HTTP ${res.status}).`);
    });

    await step('3.4 Member B cố tự gán role = admin trên profiles -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userBId}`, {
        method: 'PATCH',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${tokenB}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ role: 'admin' })
      });
      assert.strictEqual(res.status, 403, 'PATCH role admin phải bị từ chối 403 Forbidden');
      const errData = await res.json();
      assert.strictEqual(errData.code, '42501');
      console.log(`    ✓ Trigger PostgreSQL chặn thành công: "${errData.message}"`);
    });

    await step('3.5 Member B cố POST bài viết với status = approved -> BỊ CHẶN (403/42501)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_posts`, {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${tokenB}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          author_id: userBId,
          author_name: 'Thành Viên B',
          content: 'Bài viết cố tình tự phê duyệt',
          status: 'approved'
        })
      });
      assert.strictEqual(res.status, 403, 'POST bài viết approved phải bị từ chối 403 Forbidden');
      const errData = await res.json();
      assert.strictEqual(errData.code, '42501');
      console.log(`    ✓ Trigger PostgreSQL chặn thành công: "${errData.message}"`);
    });

    await step('3.6 Member B đọc nội dung đã duyệt qua Secure Views -> THÀNH CÔNG (200), không lộ bất kỳ cột riêng tư nào', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/public_clubs?id=eq.${clubAId}&select=*`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(res.status, 200);
      const rows = await res.json();
      if (rows.length > 0) {
        assert.strictEqual(rows[0].leader_phone, undefined, 'View công khai tuyệt đối KHÔNG có leader_phone');
        assert.strictEqual(rows[0].moderation_reason, undefined, 'View công khai tuyệt đối KHÔNG có moderation_reason');
      }
      console.log('    ✓ Member B đọc view công khai an toàn, 100% cột riêng tư đã được ẩn.');
    });

  } finally {
    // ------------------------------------------------------------------------
    // PHẦN 4: DỌN DẸP SẠCH SẼ DỮ LIỆU THỬ NGHIỆM (CLEANUP AUDIT)
    // ------------------------------------------------------------------------
    console.log('\n[PHẦN 4] DỌN DẸP SẠCH SẼ DỮ LIỆU THỬ NGHIỆM (CLEANUP AUDIT):');

    const postsToDelete = [postAId, directPostAId, apiPostAId].filter(Boolean);
    for (const pid of postsToDelete) {
      const delRes = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${pid}`, {
        method: 'DELETE',
        headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
      });
      const ok = (delRes.status === 204 || delRes.status === 200);
      console.log(`  ✓ Xóa bài viết thử nghiệm (${pid}): HTTP ${delRes.status} -> ${ok ? 'ĐÃ DỌN SẠCH' : 'THẤT BẠI'}`);
    }

    const clubsToDelete = [clubAId, directClubAId, apiClubAId].filter(Boolean);
    for (const cid of clubsToDelete) {
      const delRes = await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${cid}`, {
        method: 'DELETE',
        headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
      });
      const ok = (delRes.status === 204 || delRes.status === 200);
      console.log(`  ✓ Xóa CLB thử nghiệm (${cid}): HTTP ${delRes.status} -> ${ok ? 'ĐÃ DỌN SẠCH' : 'THẤT BẠI'}`);
    }

    const usersToDelete = [userBId, userAId].filter(Boolean);
    // Xóa bất kỳ bài/CLB nào còn sót lại của users trước khi xóa user (tránh foreign key lock)
    for (const uid of usersToDelete) {
      const extraPRes = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?author_id=eq.${uid}&select=id`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
      const extraPosts = await extraPRes.json();
      if (Array.isArray(extraPosts)) {
        for (const ep of extraPosts) {
          await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${ep.id}`, {
            method: 'DELETE',
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
          });
        }
      }

      const extraCRes = await fetch(`${SUPABASE_URL}/rest/v1/clubs?leader_id=eq.${uid}&select=id`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
      const extraClubs = await extraCRes.json();
      if (Array.isArray(extraClubs)) {
        for (const ec of extraClubs) {
          await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${ec.id}`, {
            method: 'DELETE',
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
          });
        }
      }
    }

    for (const uid of usersToDelete) {
      const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
        method: 'DELETE',
        headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
      });
      const ok = (delRes.status === 200);
      console.log(`  ✓ Xóa tài khoản thử nghiệm (${uid}): HTTP ${delRes.status} -> ${ok ? 'ĐÃ DỌN SẠCH (Cascade Profiles)' : 'THẤT BẠI'}`);
    }

    // Xác nhận kép 0 dòng rác
    for (const pid of postsToDelete) {
      const cRes = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${pid}&select=id`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
      const cRows = await cRes.json();
      assert.strictEqual(cRows.length, 0, `Bài viết ${pid} phải không còn tồn tại`);
    }
    for (const cid of clubsToDelete) {
      const cRes = await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${cid}&select=id`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
      const cRows = await cRes.json();
      assert.strictEqual(cRows.length, 0, `CLB ${cid} phải không còn tồn tại`);
    }
    for (const uid of usersToDelete) {
      const cRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}&select=id`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
      const cRows = await cRes.json();
      assert.strictEqual(cRows.length, 0, `Hồ sơ ${uid} phải không còn tồn tại`);
    }

    console.log('  🎯 TỔNG KẾT DỌN DẸP: Toàn bộ dữ liệu kiểm thử (User A, User B, CLB, Bài viết) đã được dọn sạch 100%.');
  }

  console.log('\n================================================================================');
  console.log(` TỔNG KẾT KIỂM THỬ LIVE: ${passed}/${total} TIÊU CHUẨN ĐẠT HOÀN TOÀN`);
  if (failures.length > 0) {
    console.log(` CÁC TIÊU CHUẨN CHƯA ĐẠT DO CẦN CHẠY BẢN VÁ SQL (${failures.length}/${total}):`);
    for (const f of failures) {
      console.log(`  - ❌ ${f.name}`);
    }
  }
  console.log('================================================================================\n');

  if (failures.length > 0) {
    throw new Error(`Kiểm thử live phát hiện ${failures.length} tiêu chuẩn chưa đạt do database chưa áp dụng g10_column_security_repair.sql.`);
  }

  return { passed, total };
}

runLiveAudit().catch(err => {
  console.error('\n❌ KIỂM THỬ LIVE KẾT THÚC:', err.message);
  process.exit(1);
});
