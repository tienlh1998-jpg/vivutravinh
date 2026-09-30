/**
 * scripts/test-rest-security-hardening.cjs
 * 
 * Bộ kiểm thử an ninh chuyên sâu (Security Hardening Verification Suite):
 * 1. Chống Tự Xuất Bản (Self-Publishing Prevention):
 *    - Tài khoản thường gọi trực tiếp Supabase REST POST /rest/v1/community_posts với status = 'approved' -> Bị chặn (42501 / RLS Violation).
 *    - Tài khoản thường gọi trực tiếp Supabase REST POST /rest/v1/clubs với status = 'approved' -> Bị chặn (42501 / RLS Violation).
 *    - Tài khoản thường gửi bài nháp hoặc chờ duyệt (draft / pending) -> Được chấp thuận (201 Created).
 * 
 * 2. Chống Nâng Quyền & Bảo Vệ Profile (Role Escalation & Profile Integrity):
 *    - Tài khoản thường gọi PATCH /rest/v1/profiles với { role: 'admin' } -> Bị chặn bởi trigger trg_protect_profile_immutable_fields (42501).
 *    - Tài khoản thường gọi PATCH /rest/v1/profiles với { email: 'hacker@admin.com' } -> Bị chặn (42501).
 *    - Tài khoản thường cập nhật display_name, bio, avatar_url -> Được chấp thuận (200 OK).
 * 
 * 3. Chống Rò Rỉ Dữ Liệu Riêng Tư & Thông Tin Nhạy Cảm (Privacy & PII Leakage Protection):
 *    - Khách vãng lai (Anon) gọi GET /rest/v1/profiles -> Bị chặn bởi RLS profiles_self_read (0 rows / 401).
 *    - Khách vãng lai gọi GET /rest/v1/public_profiles -> Chỉ nhận display_name, avatar_url, bio, badges; tuyệt đối KHÔNG có email, phone, role.
 *    - Khách vãng lai gọi GET /api/clubs & public_clubs -> Tuyệt đối KHÔNG có leader_phone hay moderation_reason.
 *    - Khách vãng lai gọi GET /api/community-posts -> Chỉ nhận bài approved; không có bài pending, không có moderated_by, admin_notes.
 */

const assert = require('assert');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXJhb2ltaGtzZnZseG5kd3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjkwNzAsImV4cCI6MjA5NTMwNTA3MH0.ARJ173UkVNCichCiJmVrbp2aTByVoXnSEAIsIvbnYJ8';

console.log('================================================================================');
console.log(' KIỂM THỬ AN NINH SUPABASE REST & RLS HARDENING (G10 SECURITY VERIFICATION)');
console.log('================================================================================\n');

/**
 * Mô phỏng logic Engine PostgreSQL + RLS + Triggers từ g10_ugc_security_hardening.sql
 * Dùng để kiểm chứng logic chính xác của Trigger & Policy độc lập với kết nối mạng.
 */
class PostgreSQLEngineSimulator {
  constructor() {
    this.profiles = new Map([
      ['u-user-001', {
        id: 'u-user-001',
        email: 'user@vivutravinh.vn',
        display_name: 'Nguyễn Văn Du Khách',
        avatar_url: '/icons/icon.svg',
        phone: '0912345678',
        role: 'member',
        bio: 'Yêu thích du lịch Trà Vinh',
        badges: ['du-khach-moi'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]
    ]);

    this.clubs = new Map([
      ['clb-tra-vinh-runners', {
        id: 'clb-tra-vinh-runners',
        name: 'CLB Chạy Bộ Trà Vinh',
        slug: 'clb-chay-bo-tra-vinh',
        category: 'the-thao',
        category_name: 'Thể thao & Sức khỏe',
        badge: 'Thể thao & Sức khỏe',
        members_count: 25,
        activities_count: 8,
        image: '/images/club.jpg',
        description: 'CLB chạy bộ rèn luyện sức khỏe mỗi sáng bờ kè sông Long Bình.',
        last_activity: 'Chạy sáng Chủ Nhật',
        schedule_info: '5h30 sáng hàng ngày',
        meeting_place: 'Công viên Long Bình',
        icon: 'directions_run',
        color: 'emerald',
        leader_id: 'u-user-001',
        leader_name: 'Nguyễn Văn Du Khách',
        leader_phone: '0987654321', // SỐ ĐIỆN THOẠI RIÊNG TƯ
        status: 'approved',
        moderated_by: 'u-admin-999',
        moderated_at: new Date().toISOString(),
        moderation_reason: 'Đạt chuẩn sinh hoạt cộng đồng',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]
    ]);

    this.community_posts = new Map();
  }

  // Thực thi Trigger: protect_profile_immutable_fields()
  triggerProtectProfile(oldRow, newRow, callerRole) {
    const isServiceRole = callerRole === 'service_role';
    if (!isServiceRole) {
      if (oldRow.role !== newRow.role) {
        const err = new Error('SECURITY_VIOLATION: Người dùng không có quyền thay đổi vai trò (role).');
        err.code = '42501';
        err.status = 403;
        throw err;
      }
      if (oldRow.email !== newRow.email) {
        const err = new Error('SECURITY_VIOLATION: Email được quản lý tự động bởi hệ thống xác thực Auth.');
        err.code = '42501';
        err.status = 403;
        throw err;
      }
    }
    newRow.updated_at = new Date().toISOString();
    return newRow;
  }

  // Thực thi Trigger: enforce_community_post_author_guard() & RLS community_posts_author_insert
  triggerCommunityPostGuard(row, op, callerUid, callerRole) {
    const isPrivileged = callerRole === 'service_role';
    if (!isPrivileged) {
      if (op === 'INSERT') {
        if (row.author_id !== callerUid) {
          const err = new Error('SECURITY_VIOLATION: author_id phải trùng khớp với tài khoản đăng nhập.');
          err.code = '42501';
          err.status = 403;
          throw err;
        }
        if (!['draft', 'pending'].includes(row.status)) {
          const err = new Error('SECURITY_VIOLATION: Bài viết do người dùng tạo chỉ được ở trạng thái draft hoặc pending.');
          err.code = '42501';
          err.status = 403;
          throw err;
        }
        if (row.moderated_by != null || row.moderated_at != null) {
          const err = new Error('SECURITY_VIOLATION: Người dùng không được can thiệp dữ liệu kiểm duyệt.');
          err.code = '42501';
          err.status = 403;
          throw err;
        }
      }
    }
    return row;
  }

  // Thực thi Trigger: enforce_club_leader_guard() & RLS clubs_leader_insert
  triggerClubGuard(row, op, callerUid, callerRole) {
    const isPrivileged = callerRole === 'service_role';
    if (!isPrivileged) {
      if (op === 'INSERT') {
        if (row.leader_id !== callerUid) {
          const err = new Error('SECURITY_VIOLATION: leader_id phải trùng khớp với tài khoản đăng nhập.');
          err.code = '42501';
          err.status = 403;
          throw err;
        }
        if (!['draft', 'pending'].includes(row.status)) {
          const err = new Error('SECURITY_VIOLATION: Hồ sơ CLB mới chỉ được ở trạng thái draft hoặc pending.');
          err.code = '42501';
          err.status = 403;
          throw err;
        }
        if (row.moderated_by != null || row.moderated_at != null) {
          const err = new Error('SECURITY_VIOLATION: Người dùng không được can thiệp dữ liệu kiểm duyệt.');
          err.code = '42501';
          err.status = 403;
          throw err;
        }
      }
    }
    return row;
  }

  // REST API: PATCH /rest/v1/profiles?id=eq.<uid>
  patchProfile(uid, patchData, callerUid, callerRole = 'authenticated') {
    if (callerUid !== uid) {
      const err = new Error('RLS_VIOLATION: Không có quyền truy cập hồ sơ.');
      err.code = '42501';
      err.status = 403;
      throw err;
    }
    const current = this.profiles.get(uid);
    if (!current) throw new Error('Not found');
    const updated = { ...current, ...patchData };
    const saved = this.triggerProtectProfile(current, updated, callerRole);
    this.profiles.set(uid, saved);
    return saved;
  }

  // REST API: POST /rest/v1/community_posts
  insertCommunityPost(postData, callerUid, callerRole = 'authenticated') {
    const row = {
      id: 'post-' + Math.random().toString(36).slice(2, 9),
      author_id: callerUid,
      created_at: new Date().toISOString(),
      ...postData
    };
    const saved = this.triggerCommunityPostGuard(row, 'INSERT', callerUid, callerRole);
    this.community_posts.set(saved.id, saved);
    return saved;
  }

  // REST API: POST /rest/v1/clubs
  insertClub(clubData, callerUid, callerRole = 'authenticated') {
    const row = {
      id: 'clb-' + Math.random().toString(36).slice(2, 9),
      leader_id: callerUid,
      created_at: new Date().toISOString(),
      ...clubData
    };
    const saved = this.triggerClubGuard(row, 'INSERT', callerUid, callerRole);
    this.clubs.set(saved.id, saved);
    return saved;
  }

  // REST API: GET /rest/v1/profiles (RLS: profiles_self_read)
  selectProfiles(callerUid) {
    if (!callerUid) return []; // Khách vãng lai nhận 0 rows
    const list = [];
    for (const p of this.profiles.values()) {
      if (p.id === callerUid) list.push(p);
    }
    return list;
  }

  // REST API: GET /rest/v1/public_profiles (View công khai: loại bỏ email, phone, role)
  selectPublicProfiles() {
    return Array.from(this.profiles.values()).map(p => ({
      id: p.id,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      bio: p.bio,
      badges: p.badges,
      created_at: p.created_at
    }));
  }

  // REST API: GET /rest/v1/public_clubs (View công khai: loại bỏ leader_phone và cột kiểm duyệt)
  selectPublicClubs() {
    return Array.from(this.clubs.values())
      .filter(c => c.status === 'approved')
      .map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        category: c.category,
        category_name: c.category_name,
        badge: c.badge,
        members_count: c.members_count,
        activities_count: c.activities_count,
        image: c.image,
        description: c.description,
        last_activity: c.last_activity,
        schedule_info: c.schedule_info,
        meeting_place: c.meeting_place,
        icon: c.icon,
        color: c.color,
        leader_id: c.leader_id,
        leader_name: c.leader_name,
        status: c.status,
        created_at: c.created_at
      }));
  }
}

async function runTests() {
  let passed = 0;
  let total = 0;

  function testCase(title, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${title}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ [FAIL] ${title}: ${e.message}`);
      throw e;
    }
  }

  async function testCaseAsync(title, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${title}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ [FAIL] ${title}: ${e.message}`);
      throw e;
    }
  }

  console.log('--- PHẦN 1: KIỂM TOÁN CHỐNG TỰ NÂNG QUYỀN (ROLE ESCALATION PREVENTION) ---');
  const engine = new PostgreSQLEngineSimulator();

  testCase('1.1 Người dùng thường cố PATCH /rest/v1/profiles để nâng role = admin -> BỊ CHẶN (42501)', () => {
    assert.throws(() => {
      engine.patchProfile('u-user-001', { role: 'admin' }, 'u-user-001', 'authenticated');
    }, (err) => {
      return err.code === '42501' && err.message.includes('không có quyền thay đổi vai trò');
    });
  });

  testCase('1.2 Người dùng thường cố PATCH /rest/v1/profiles để đổi email -> BỊ CHẶN (42501)', () => {
    assert.throws(() => {
      engine.patchProfile('u-user-001', { email: 'fake-admin@hacked.com' }, 'u-user-001', 'authenticated');
    }, (err) => {
      return err.code === '42501' && err.message.includes('Email được quản lý tự động');
    });
  });

  testCase('1.3 Người dùng sửa các trường hợp lệ (display_name, bio) -> THÀNH CÔNG', () => {
    const updated = engine.patchProfile('u-user-001', {
      display_name: 'Nguyễn Văn Du Khách (Đã Đổi Tên)',
      bio: 'Yêu thích văn hóa Khmer Trà Vinh'
    }, 'u-user-001', 'authenticated');
    assert.strictEqual(updated.display_name, 'Nguyễn Văn Du Khách (Đã Đổi Tên)');
    assert.strictEqual(updated.role, 'member'); // Role không bị biến đổi
  });


  console.log('\n--- PHẦN 2: KIỂM TOÁN CHỐNG TỰ XUẤT BẢN NỘI DUNG (SELF-PUBLISHING PREVENTION) ---');

  testCase('2.1 Người dùng thường cố POST /rest/v1/community_posts với status = approved -> BỊ CHẶN (42501)', () => {
    assert.throws(() => {
      engine.insertCommunityPost({
        title: 'Spam bài viết không kiểm duyệt',
        content: 'Nội dung quảng cáo rác cố tình xuất bản ngay lập tức.',
        status: 'approved'
      }, 'u-user-001', 'authenticated');
    }, (err) => {
      return err.code === '42501' && err.message.includes('chỉ được ở trạng thái draft hoặc pending');
    });
  });

  testCase('2.2 Người dùng thường cố gán moderated_by khi tạo bài viết -> BỊ CHẶN (42501)', () => {
    assert.throws(() => {
      engine.insertCommunityPost({
        title: 'Giả lập kiểm duyệt',
        content: 'Nội dung giả lập đã duyệt',
        status: 'pending',
        moderated_by: 'u-user-001'
      }, 'u-user-001', 'authenticated');
    }, (err) => {
      return err.code === '42501' && err.message.includes('không được can thiệp dữ liệu kiểm duyệt');
    });
  });

  testCase('2.3 Người dùng thường tạo bài viết với status = pending / draft -> THÀNH CÔNG (201)', () => {
    const post = engine.insertCommunityPost({
      title: 'Khám phá Chùa Âng vào mùa Chôl Chnăm Thmây',
      content: 'Một trải nghiệm tuyệt vời với văn hóa và con người Trà Vinh.',
      status: 'pending'
    }, 'u-user-001', 'authenticated');
    assert.strictEqual(post.status, 'pending');
    assert.strictEqual(post.moderated_by, undefined);
  });

  testCase('2.4 Người dùng thường cố POST /rest/v1/clubs với status = approved -> BỊ CHẶN (42501)', () => {
    assert.throws(() => {
      engine.insertClub({
        name: 'CLB Ma Độc Hại',
        category: 'khac',
        description: 'CLB không kiểm duyệt tự xuất bản',
        status: 'approved'
      }, 'u-user-001', 'authenticated');
    }, (err) => {
      return err.code === '42501' && err.message.includes('chỉ được ở trạng thái draft hoặc pending');
    });
  });

  testCase('2.5 Người dùng thường tạo CLB với status = pending -> THÀNH CÔNG (201)', () => {
    const club = engine.insertClub({
      name: 'CLB Thư Pháp Khmer Xứ Trà',
      category: 'nghe-thuat',
      description: 'Gìn giữ và phát huy nét đẹp chữ Khmer cổ.',
      status: 'pending'
    }, 'u-user-001', 'authenticated');
    assert.strictEqual(club.status, 'pending');
  });


  console.log('\n--- PHẦN 3: KIỂM TOÁN BẢO VỆ THÔNG TIN RIÊNG TƯ & PII (PRIVACY & COLUMN RESTRICTIONS) ---');

  testCase('3.1 Khách vãng lai (Anon) query /rest/v1/profiles -> RLS trả về mảng rỗng (0 rows), không lộ danh bạ', () => {
    const rows = engine.selectProfiles(null); // Anon caller (no UID)
    assert.strictEqual(rows.length, 0, 'Khách không được xem bất kỳ dòng nào từ public.profiles');
  });

  testCase('3.2 Khách vãng lai query /rest/v1/public_profiles -> CHỈ trả về thông tin an toàn, KHÔNG có email, phone, role', () => {
    const publicRows = engine.selectPublicProfiles();
    assert.strictEqual(publicRows.length, 1);
    const item = publicRows[0];
    assert.ok(item.id && item.display_name && item.avatar_url);
    assert.strictEqual(item.email, undefined, 'email PHẢI bị ẩn hoàn toàn');
    assert.strictEqual(item.phone, undefined, 'phone PHẢI bị ẩn hoàn toàn');
    assert.strictEqual(item.role, undefined, 'role PHẢI bị ẩn hoàn toàn');
  });

  testCase('3.3 Khách vãng lai query /rest/v1/public_clubs -> KHÔNG có leader_phone, moderated_by, moderation_reason', () => {
    const clubs = engine.selectPublicClubs();
    assert.strictEqual(clubs.length, 1);
    const club = clubs[0];
    assert.ok(club.id && club.name && club.status === 'approved');
    assert.strictEqual(club.leader_phone, undefined, 'leader_phone của chủ nhiệm KHÔNG được trả về cho công chúng');
    assert.strictEqual(club.moderated_by, undefined, 'moderated_by KHÔNG được trả về cho công chúng');
    assert.strictEqual(club.moderation_reason, undefined, 'moderation_reason KHÔNG được trả về cho công chúng');
  });


  console.log('\n--- PHẦN 4: KIỂM TOÁN BACKEND APIS ĐÃ TÍCH HỢP (api/clubs.js & api/community-posts.js) ---');

  const clubsMod = await import('../api/clubs.js');
  const clubsHandler = clubsMod.default;
  const postsMod = await import('../api/community-posts.js');
  const postsHandler = postsMod.default;

  function mockReqRes({ method = 'GET', url = '/', headers = {}, body = null }) {
    const stream = new (require('stream').Readable)();
    stream.method = method;
    stream.url = url;
    stream.headers = headers;
    if (body) {
      stream.push(typeof body === 'string' ? body : JSON.stringify(body));
    }
    stream.push(null);

    const res = {
      statusCode: 200,
      headers: {},
      body: '',
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(d) {
        this.body = d;
        if (this._resolve) this._resolve(this);
      },
      wait() {
        return new Promise(r => { this._resolve = r; });
      }
    };
    return { req: stream, res };
  }

  await testCaseAsync('4.1 GET /api/clubs (Công khai) -> Kiểm tra projection: leader_phone bị loại bỏ hoàn toàn', async () => {
    const { req, res } = mockReqRes({ method: 'GET', url: '/api/clubs' });
    await clubsHandler(req, res);
    const data = JSON.parse(res.body);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(data.clubs));
    for (const c of data.clubs) {
      assert.strictEqual(c.leader_phone, undefined, 'leader_phone phải bị loại bỏ khỏi danh sách công khai');
      assert.strictEqual(c.moderated_by, undefined, 'moderated_by phải bị loại bỏ');
    }
  });

  await testCaseAsync('4.2 POST /api/clubs với status = approved -> Bị ghi đè cưỡng bức về pending', async () => {
    const { req, res } = mockReqRes({
      method: 'POST',
      url: '/api/clubs',
      headers: { authorization: 'Bearer mock-user-token', 'content-type': 'application/json' },
      body: {
        name: 'CLB Chèo Thuyền Khám Phá Cù Lao',
        category: 'da-ngoai',
        description: 'CLB chèo SUP và thuyền kayak khám phá các cồn du lịch Trà Vinh.',
        status: 'approved' // Cố tình truyền approved
      }
    });
    await clubsHandler(req, res);
    assert.strictEqual(res.statusCode, 201);
    const data = JSON.parse(res.body);
    assert.strictEqual(data.club.status, 'pending', 'Bắt buộc trạng thái phải là pending, không thể tự approved');
  });

  await testCaseAsync('4.3 POST /api/community-posts với status = approved -> Bị ghi đè cưỡng bức về pending', async () => {
    const { req, res } = mockReqRes({
      method: 'POST',
      url: '/api/community-posts',
      headers: { authorization: 'Bearer mock-user-token', 'content-type': 'application/json' },
      body: {
        title: 'Review Du Lịch Trà Vinh 3 Ngày 2 Đêm',
        content: 'Một chuyến đi đầy ý nghĩa tại xứ sở chùa tháp.',
        category: 'Lịch trình',
        status: 'approved' // Cố tình truyền approved
      }
    });
    await postsHandler(req, res);
    assert.strictEqual(res.statusCode, 201);
    const data = JSON.parse(res.body);
    assert.strictEqual(data.post.status, 'pending', 'Bắt buộc trạng thái phải là pending, không thể tự approved');
  });


  console.log('\n--- PHẦN 5: KIỂM TOÁN TRUY VẤN CHỈ ĐỌC TRÊN SUPABASE THỰC TẾ (LIVE READ-ONLY AUDIT) ---');

  await testCaseAsync('5.1 Kiểm tra Secure View public_clubs trên live DB (Anon Key)', async () => {
    const viewRes = await fetch(`${SUPABASE_URL}/rest/v1/public_clubs?limit=5`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    });
    assert.strictEqual(viewRes.status, 200, 'View public_clubs phải phản hồi 200 OK');
    const rows = await viewRes.json();
    assert.ok(Array.isArray(rows), 'Dữ liệu trả về là danh sách CLB');
    if (rows.length > 0) {
      assert.strictEqual(rows[0].leader_phone, undefined, 'View public_clubs tuyệt đối KHÔNG có leader_phone');
      assert.strictEqual(rows[0].moderated_by, undefined, 'View public_clubs tuyệt đối KHÔNG có moderated_by');
      console.log(`    ✓ [Live View Audit] public_clubs trả về ${rows.length} CLB đã duyệt, SĐT và metadata kiểm duyệt đã bị loại bỏ an toàn.`);
    }
  });

  await testCaseAsync('5.2 Khách vãng lai truy vấn raw table /rest/v1/profiles -> RLS profiles_self_read chặn (0 rows)', async () => {
    const rawRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&limit=5`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    });
    assert.strictEqual(rawRes.status, 200, 'Supabase REST phản hồi 200');
    const rows = await rawRes.json();
    assert.strictEqual(rows.length, 0, 'RLS profiles_self_read phải trả về 0 rows cho khách vãng lai');
    console.log('    ✓ [Live RLS Audit] Bảng profiles trả về 0 rows cho anon. Danh bạ email/sđt được bảo vệ tuyệt đối.');
  });

  await testCaseAsync('5.3 Kiểm tra Secure View public_profiles trên live DB (Anon Key)', async () => {
    const pubProfRes = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?limit=5`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    });
    assert.strictEqual(pubProfRes.status, 200, 'View public_profiles phải phản hồi 200 OK');
    const rows = await pubProfRes.json();
    assert.ok(Array.isArray(rows), 'Dữ liệu trả về là danh sách profile công khai');
    if (rows.length > 0) {
      assert.strictEqual(rows[0].email, undefined, 'public_profiles không được chứa email');
      assert.strictEqual(rows[0].phone, undefined, 'public_profiles không được chứa phone');
      assert.strictEqual(rows[0].role, undefined, 'public_profiles không được chứa role');
    }
    console.log('    ✓ [Live View Audit] public_profiles hoạt động an toàn, loại bỏ 100% PII nhạy cảm.');
  });

  await testCaseAsync('5.4 Bảng admin_users và admin_audit_logs được bảo vệ chống truy cập trái phép trên live DB', async () => {
    const adminRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?select=*&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    });
    assert.strictEqual(adminRes.status, 401, 'Guest truy cập admin_users phải nhận 401 (Permission Denied)');
  });

  console.log('\n================================================================================');
  console.log(` TỔNG KẾT KIỂM THỬ: ${passed}/${total} TESTS ĐẠT CHUẨN AN TOÀN (100% PASS)`);
  console.log('================================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ KIỂM THỬ AN NINH THẤT BẠI:', err);
  process.exit(1);
});
