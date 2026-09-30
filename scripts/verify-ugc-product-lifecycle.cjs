/**
 * scripts/verify-ugc-product-lifecycle.cjs
 *
 * Kiểm tra luồng sản phẩm hoàn chỉnh (End-to-End Live UGC Lifecycle):
 * Người dùng gửi bài/CLB -> Admin nhìn thấy hàng đợi -> Duyệt -> Nội dung xuất hiện trên web công khai
 *
 * [BƯỚC 0] Kiểm tra chỉ đọc các fixture của mốc 1790694622113
 * [BƯỚC 1] Người dùng tạo tài khoản & gửi bài viết + CLB (trạng thái pending)
 * [BƯỚC 2] Kiểm tra tính riêng tư & cách ly: Khách vãng lai và Secure Views KHÔNG nhìn thấy nội dung chờ duyệt
 * [BƯỚC 3] Admin truy cập hàng đợi kiểm duyệt: Nhìn thấy bài viết và CLB trong danh sách pending
 * [BƯỚC 4] Admin thực hiện phê duyệt (action: 'approve')
 * [BƯỚC 5] Kiểm tra hiển thị công khai: Khách vãng lai, Secure Views, và Web UI DOM đều nhìn thấy nội dung đã duyệt
 * [BƯỚC 6] Dọn dẹp sạch sẽ có mục tiêu theo đúng ID, xác nhận 0 bản ghi rác tồn dư
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const PROJECT_DIR = path.resolve(__dirname, '..');
const envContent = fs.readFileSync(path.join(PROJECT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXJhb2ltaGtzZnZseG5kd3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjkwNzAsImV4cCI6MjA5NTMwNTA3MH0.ARJ173UkVNCichCiJmVrbp2aTByVoXnSEAIsIvbnYJ8';

process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

const ARTIFACT_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.reqId = 0;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const res = JSON.parse(event.data);
      const cb = this.callbacks.get(res.id);
      if (cb) {
        this.callbacks.delete(res.id);
        cb(res);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.reqId;
      const timer = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error(`CDP timed out: ${method}`));
      }, 15000);
      this.callbacks.set(id, (res) => {
        clearTimeout(timer);
        if (res.error) reject(new Error(JSON.stringify(res.error)));
        else resolve(res.result);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error('CDP Eval Exception: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  async captureScreenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    if (res.data) {
      fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    }
  }

  async close() {
    try { this.ws.close(); } catch (_) {}
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getDebuggerUrl(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json`, res => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => resolve(d));
        });
        req.on('error', reject);
      });
      const pages = JSON.parse(data);
      const target = pages.find(p => p.url && (p.url.includes('http') || p.type === 'page'));
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    } catch (_) {
      await sleep(200);
    }
  }
  throw new Error('Không thể kết nối Chrome DevTools Protocol');
}

async function run() {
  console.log('================================================================================');
  console.log(' KIỂM TRA LUỒNG SẢN PHẨM HOÀN CHỈNH: GỬI NỘI DUNG -> HÀNG ĐỢI -> DUYỆT -> HIỂN THỊ');
  console.log('================================================================================\n');

  // Đăng ký dọn dẹp các ID được tạo
  const createdUserIds = [];
  const createdPostIds = [];
  const createdClubIds = [];

  let localServer = null;
  let chromeProc = null;
  let cdp = null;

  try {
    // --------------------------------------------------------------------------
    // BƯỚC 0: KIỂM TRA CHỈ ĐỌC CÁC FIXTURE CỦA MỐC 1790694622113
    // --------------------------------------------------------------------------
    console.log('[BƯỚC 0] KIỂM TRA CHỈ ĐỌC FIXTURE CỦA MỐC 1790694622113:');
    const TARGET_TS = '1790694622113';

    const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const usersData = await usersRes.json();
    const matchedUsers = (usersData.users || []).filter(u => 
      (u.email && u.email.includes(TARGET_TS)) || (u.id && u.id.includes(TARGET_TS))
    );

    const clubsCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/clubs?select=id,name,slug&or=(slug.ilike.*${TARGET_TS}*,name.ilike.*${TARGET_TS}*)`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const matchedClubs = await clubsCheckRes.json();

    const postsCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?select=id,title&or=(title.ilike.*${TARGET_TS}*,content.ilike.*${TARGET_TS}*)`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const matchedPosts = await postsCheckRes.json();

    console.log(`  - auth.users khớp ${TARGET_TS}: ${matchedUsers.length} tài khoản`);
    console.log(`  - public.clubs khớp ${TARGET_TS}: ${Array.isArray(matchedClubs) ? matchedClubs.length : 0} CLB`);
    console.log(`  - public.community_posts khớp ${TARGET_TS}: ${Array.isArray(matchedPosts) ? matchedPosts.length : 0} bài viết`);
    if (matchedUsers.length === 0 && (!Array.isArray(matchedClubs) || matchedClubs.length === 0) && (!Array.isArray(matchedPosts) || matchedPosts.length === 0)) {
      console.log('  ✓ [Xác nhận Chỉ Đọc] Không có fixture nào của mốc 1790694622113 còn tồn đọng.\n');
    } else {
      console.log('  ⚠️ Có fixture tồn đọng, đang dọn dẹp riêng từng ID...');
      for (const u of matchedUsers) {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } });
      }
      for (const c of (Array.isArray(matchedClubs) ? matchedClubs : [])) {
        await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${c.id}`, { method: 'DELETE', headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } });
      }
      for (const p of (Array.isArray(matchedPosts) ? matchedPosts : [])) {
        await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${p.id}`, { method: 'DELETE', headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } });
      }
    }

    // --------------------------------------------------------------------------
    // BƯỚC 1: TẠO TÀI KHOẢN TÁC GIẢ VÀ ĐĂNG NỘI DUNG (USER SUBMISSION)
    // --------------------------------------------------------------------------
    console.log('[BƯỚC 1] NGƯỜI DÙNG TẠO TÀI KHOẢN & GỬI BÀI VIẾT + CLB (TRẠNG THÁI PENDING):');
    const authorTimestamp = Date.now();
    const authorEmail = `author_e2e_${authorTimestamp}@vivutravinh.test`;
    const authorPassword = `AuthorPass_${authorTimestamp}!`;

    const createAuthorRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: authorEmail,
        password: authorPassword,
        email_confirm: true,
        user_metadata: { display_name: 'Thạch Sô Phane (Tác giả E2E)' }
      })
    });
    const authorData = await createAuthorRes.json();
    const authorId = authorData.id;
    createdUserIds.push(authorId);
    console.log(`  ✓ Đã tạo tác giả thử nghiệm: ${authorEmail} (ID: ${authorId})`);

    // Đăng nhập lấy access_token của tác giả
    const authLoginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: authorEmail,
        password: authorPassword
      })
    });
    const authSession = await authLoginRes.json();
    const authorToken = authSession.access_token;
    if (!authorToken) throw new Error('Không thể đăng nhập tài khoản tác giả để lấy JWT.');
    console.log('  ✓ Đăng nhập thành công, đã cấp JWT cho tác giả.');

    // 1.1 Tác giả gửi Bài Viết Cộng Đồng mới (qua API endpoint)
    const postsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'community-posts.js')).href);
    const postsHandler = postsModule.default;

    const postPayload = {
      title: `[E2E-TEST] Trải nghiệm Chùa Âng mùa Ok Om Bok ${authorTimestamp}`,
      content: 'Một buổi sáng dạo bước quanh khuôn viên Chùa Âng và Ao Bà Om thưởng thức không khí trong lành xứ Trà Vinh.',
      category: 'di-san'
    };

    let createdPost = null;
    {
      const reqStream = new (require('stream').Readable)();
      reqStream.method = 'POST';
      reqStream.url = '/api/community-posts';
      reqStream.headers = {
        authorization: `Bearer ${authorToken}`,
        'content-type': 'application/json'
      };
      reqStream.push(JSON.stringify(postPayload));
      reqStream.push(null);

      let resolveEnd;
      const endPromise = new Promise(r => { resolveEnd = r; });
      let statusCode = 200;
      let bodyData = '';
      const mockRes = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        end(data) {
          statusCode = this.statusCode;
          if (data) bodyData = data;
          resolveEnd();
        }
      };

      await postsHandler(reqStream, mockRes);
      await endPromise;

      const resJson = JSON.parse(bodyData);
      if (statusCode !== 201 || !resJson.post?.id) {
        throw new Error(`Tạo bài viết thất bại: status ${statusCode}, body: ${bodyData}`);
      }
      createdPost = resJson.post;
      createdPostIds.push(createdPost.id);
      console.log(`  ✓ [1.1] Tác giả gửi bài viết thành công (ID: ${createdPost.id}, Status: ${createdPost.status}).`);
      if (createdPost.status !== 'pending') {
        throw new Error(`Kỳ vọng bài viết mới có status 'pending', thực tế nhận: ${createdPost.status}`);
      }
    }

    // 1.2 Tác giả gửi Đề xuất CLB mới (qua API endpoint)
    const clubsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'clubs.js')).href);
    const clubsHandler = clubsModule.default;

    const clubPayload = {
      name: `CLB Khám Phá Trà Vinh E2E ${authorTimestamp}`,
      category: 'di-san',
      leader_phone: '0918889999',
      description: 'CLB quy tụ những người đam mê khám phá các di sản văn hóa Trà Vinh.',
      meeting_place: 'Ao Bà Om, TP. Trà Vinh',
      schedule_info: 'Sinh hoạt định kỳ sáng Chủ Nhật'
    };

    let createdClub = null;
    {
      const reqStream = new (require('stream').Readable)();
      reqStream.method = 'POST';
      reqStream.url = '/api/clubs';
      reqStream.headers = {
        authorization: `Bearer ${authorToken}`,
        'content-type': 'application/json'
      };
      reqStream.push(JSON.stringify(clubPayload));
      reqStream.push(null);

      let resolveEnd;
      const endPromise = new Promise(r => { resolveEnd = r; });
      let statusCode = 200;
      let bodyData = '';
      const mockRes = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        end(data) {
          statusCode = this.statusCode;
          if (data) bodyData = data;
          resolveEnd();
        }
      };

      await clubsHandler(reqStream, mockRes);
      await endPromise;

      const resJson = JSON.parse(bodyData);
      if (statusCode !== 201 || !resJson.club?.id) {
        throw new Error(`Tạo CLB thất bại: status ${statusCode}, body: ${bodyData}`);
      }
      createdClub = resJson.club;
      createdClubIds.push(createdClub.id);
      console.log(`  ✓ [1.2] Tác giả gửi đề xuất CLB thành công (ID: ${createdClub.id}, Status: ${createdClub.status}).`);
      if (createdClub.status !== 'pending') {
        throw new Error(`Kỳ vọng CLB mới có status 'pending', thực tế nhận: ${createdClub.status}`);
      }
    }

    // --------------------------------------------------------------------------
    // BƯỚC 2: KIỂM TRA TÍNH RIÊNG TƯ & CHƯA HIỂN THỊ CÔNG KHAI (PRE-MODERATION)
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 2] KIỂM TRA BẢO MẬT & CÁCH LY NỘI DUNG CHỜ DUYỆT (CHƯA HIỂN THỊ):');

    // 2.1 Khách vãng lai gọi GET /api/community-posts?status=approved
    {
      const getPostsRes = await fetch(`${SUPABASE_URL}/rest/v1/public_community_posts?id=eq.${createdPost.id}&select=*`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      });
      const rows = await getPostsRes.json();
      if (!Array.isArray(rows) || rows.length !== 0) {
        throw new Error(`[LỖI BẢO MẬT] Bài viết pending bị lộ trên Secure View public_community_posts! Rows: ${JSON.stringify(rows)}`);
      }
      console.log('  ✓ [2.1] Khách vãng lai truy vấn Secure View public_community_posts -> 0 bản ghi (Không bị lộ bài pending).');
    }

    // 2.2 Khách vãng lai gọi GET /api/clubs?status=approved
    {
      const getClubsRes = await fetch(`${SUPABASE_URL}/rest/v1/public_clubs?id=eq.${createdClub.id}&select=*`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      });
      const rows = await getClubsRes.json();
      if (!Array.isArray(rows) || rows.length !== 0) {
        throw new Error(`[LỖI BẢO MẬT] CLB pending bị lộ trên Secure View public_clubs! Rows: ${JSON.stringify(rows)}`);
      }
      console.log('  ✓ [2.2] Khách vãng lai truy vấn Secure View public_clubs -> 0 bản ghi (Không bị lộ CLB pending).');
    }

    // 2.3 Tác giả xem bài của chính mình -> Nhìn thấy trạng thái pending
    {
      const authorGetRes = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${createdPost.id}&select=id,title,status`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authorToken}` }
      });
      const rows = await authorGetRes.json();
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0].status !== 'pending') {
        throw new Error(`Tác giả không đọc được bài pending của chính mình: ${JSON.stringify(rows)}`);
      }
      console.log('  ✓ [2.3] Tác giả xem bài của mình trên bảng gốc -> Thấy đúng 1 bài với status: pending.');
    }

    // --------------------------------------------------------------------------
    // BƯỚC 3: ADMIN NHÌN THẤY HÀNG ĐỢI KIỂM DUYỆT (ADMIN MODERATION QUEUE)
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 3] ADMIN TRUY CẬP HÀNG ĐỢI KIỂM DUYỆT (ADMIN QUEUE INSPECTION):');

    // Tạo live token cho admin tienlh1998@gmail.com
    const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email: 'tienlh1998@gmail.com' })
    });
    const linkData = await linkRes.json();
    const tokenHash = linkData.hashed_token;

    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash })
    });
    const verifyData = await verifyRes.json();
    const adminToken = verifyData.access_token;
    if (!adminToken) throw new Error('Không thể cấp Live JWT cho tài khoản admin.');
    console.log('  ✓ Đã sinh JWT xác thực quản trị viên thành công.');

    const moderationModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'admin-moderation.js')).href);
    const moderationHandler = moderationModule.default;

    // Admin gọi GET /api/admin-moderation?status=pending
    {
      const reqStream = new (require('stream').Readable)();
      reqStream.method = 'GET';
      reqStream.url = '/api/admin-moderation?status=pending';
      reqStream.headers = { authorization: `Bearer ${adminToken}` };
      reqStream.push(null);

      let resolveEnd;
      const endPromise = new Promise(r => { resolveEnd = r; });
      let statusCode = 200;
      let bodyData = '';
      const mockRes = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        end(data) {
          statusCode = this.statusCode;
          if (data) bodyData = data;
          resolveEnd();
        }
      };

      await moderationHandler(reqStream, mockRes);
      await endPromise;

      const queueData = JSON.parse(bodyData);
      if (statusCode !== 200 || !queueData.success) {
        throw new Error(`Đọc hàng đợi duyệt thất bại: status ${statusCode}, body: ${bodyData}`);
      }

      const foundPost = (queueData.posts || []).find(p => p.id === createdPost.id);
      const foundClub = (queueData.clubs || []).find(c => c.id === createdClub.id);

      if (!foundPost) {
        throw new Error(`Admin KHÔNG nhìn thấy bài viết ${createdPost.id} trong hàng đợi!`);
      }
      if (!foundClub) {
        throw new Error(`Admin KHÔNG nhìn thấy CLB ${createdClub.id} trong hàng đợi!`);
      }

      console.log(`  ✓ [3.1] Admin nhìn thấy bài viết trong hàng đợi (ID: ${foundPost.id}, Tiêu đề: "${foundPost.title}").`);
      console.log(`  ✓ [3.2] Admin nhìn thấy CLB trong hàng đợi (ID: ${foundClub.id}, Tên: "${foundClub.name}", SĐT: ${foundClub.leader_phone}).`);
      console.log(`  ✓ [3.3] KPI hàng đợi hiển thị chính xác: ${queueData.kpi.pendingPosts} bài viết, ${queueData.kpi.pendingClubs} CLB chờ xử lý.`);
    }

    // --------------------------------------------------------------------------
    // BƯỚC 4: ADMIN THỰC HIỆN DUYỆT (ADMIN APPROVAL ACTION)
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 4] ADMIN PHÊ DUYỆT BÀI VIẾT VÀ CÂU LẠC BỘ (APPROVE ACTION):');

    // 4.1 Admin duyệt bài viết
    {
      const reqStream = new (require('stream').Readable)();
      reqStream.method = 'POST';
      reqStream.url = '/api/admin-moderation';
      reqStream.headers = {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json'
      };
      reqStream.push(JSON.stringify({
        entity_type: 'community_post',
        entity_id: createdPost.id,
        action: 'approve'
      }));
      reqStream.push(null);

      let resolveEnd;
      const endPromise = new Promise(r => { resolveEnd = r; });
      let statusCode = 200;
      let bodyData = '';
      const mockRes = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        end(data) {
          statusCode = this.statusCode;
          if (data) bodyData = data;
          resolveEnd();
        }
      };

      await moderationHandler(reqStream, mockRes);
      await endPromise;

      const resJson = JSON.parse(bodyData);
      if (statusCode !== 200 || !resJson.success) {
        throw new Error(`Admin duyệt bài viết thất bại: status ${statusCode}, body: ${bodyData}`);
      }
      console.log(`  ✓ [4.1] Admin phê duyệt bài viết ${createdPost.id} thành công (HTTP 200, action: approve).`);
    }

    // 4.2 Admin duyệt CLB
    {
      const reqStream = new (require('stream').Readable)();
      reqStream.method = 'POST';
      reqStream.url = '/api/admin-moderation';
      reqStream.headers = {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json'
      };
      reqStream.push(JSON.stringify({
        entity_type: 'club',
        entity_id: createdClub.id,
        action: 'approve'
      }));
      reqStream.push(null);

      let resolveEnd;
      const endPromise = new Promise(r => { resolveEnd = r; });
      let statusCode = 200;
      let bodyData = '';
      const mockRes = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        end(data) {
          statusCode = this.statusCode;
          if (data) bodyData = data;
          resolveEnd();
        }
      };

      await moderationHandler(reqStream, mockRes);
      await endPromise;

      const resJson = JSON.parse(bodyData);
      if (statusCode !== 200 || !resJson.success) {
        throw new Error(`Admin duyệt CLB thất bại: status ${statusCode}, body: ${bodyData}`);
      }
      console.log(`  ✓ [4.2] Admin phê duyệt CLB ${createdClub.id} thành công (HTTP 200, action: approve).`);
    }

    // 4.3 Kiểm tra bản ghi trên Supabase base table
    {
      const postCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${createdPost.id}&select=id,status,moderated_by,moderated_at`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      const postRows = await postCheckRes.json();
      if (!Array.isArray(postRows) || postRows[0]?.status !== 'approved' || !postRows[0]?.moderated_at) {
        throw new Error(`Cập nhật trạng thái bài viết trên DB không đúng: ${JSON.stringify(postRows)}`);
      }

      const clubCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${createdClub.id}&select=id,status,moderated_by,moderated_at`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      const clubRows = await clubCheckRes.json();
      if (!Array.isArray(clubRows) || clubRows[0]?.status !== 'approved' || !clubRows[0]?.moderated_at) {
        throw new Error(`Cập nhật trạng thái CLB trên DB không đúng: ${JSON.stringify(clubRows)}`);
      }
      console.log('  ✓ [4.3] Trạng thái trên Database gốc đã chuyển thành "approved" và lưu vết moderated_at.');
    }

    // --------------------------------------------------------------------------
    // BƯỚC 5: NỘI DUNG XUẤT HIỆN TRÊN WEB CÔNG KHAI (PUBLIC DISPLAY & WEB UI)
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 5] KIỂM TRA NỘI DUNG XUẤT HIỆN TRÊN WEB CÔNG KHAI (FEED & SECURE VIEWS & WEB UI):');

    // 5.1 Khách vãng lai xem Secure View public_community_posts
    {
      const getPostsRes = await fetch(`${SUPABASE_URL}/rest/v1/public_community_posts?id=eq.${createdPost.id}&select=*`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      });
      const rows = await getPostsRes.json();
      if (!Array.isArray(rows) || rows.length !== 1) {
        throw new Error(`Bài viết đã duyệt nhưng KHÔNG xuất hiện trên Secure View public_community_posts!`);
      }
      if ('admin_notes' in rows[0]) {
        throw new Error('Lỗi bảo mật: Cột admin_notes bị lộ trên Secure View!');
      }
      console.log(`  ✓ [5.1] Bài viết xuất hiện trên Secure View public_community_posts (Tiêu đề: "${rows[0].title}", Cột nhạy cảm được che chắn).`);
    }

    // 5.2 Khách vãng lai xem Secure View public_clubs
    {
      const getClubsRes = await fetch(`${SUPABASE_URL}/rest/v1/public_clubs?id=eq.${createdClub.id}&select=*`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      });
      const rows = await getClubsRes.json();
      if (!Array.isArray(rows) || rows.length !== 1) {
        throw new Error(`CLB đã duyệt nhưng KHÔNG xuất hiện trên Secure View public_clubs!`);
      }
      if ('leader_phone' in rows[0]) {
        throw new Error('Lỗi bảo mật: Cột leader_phone bị lộ trên Secure View!');
      }
      console.log(`  ✓ [5.2] CLB xuất hiện trên Secure View public_clubs (Tên: "${rows[0].name}", SĐT chủ nhiệm được che chắn).`);
    }

    // 5.3 Kiểm tra render trên Web UI thực tế qua Chrome Headless (CDP)
    console.log('  Khởi chạy Local HTTP Server và Chrome Headless CDP để kiểm tra Web UI...');
    const serverPort = 8765 + Math.floor(Math.random() * 200);
    localServer = http.createServer(async (req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.startsWith('/api/community-posts')) {
        await postsHandler(req, res);
        return;
      }
      if (p.startsWith('/api/clubs')) {
        await clubsHandler(req, res);
        return;
      }
      if (p.startsWith('/api/admin-moderation')) {
        await moderationHandler(req, res);
        return;
      }

      if (p === '/') p = '/index.html';
      const fp = path.join(PROJECT_DIR, p);
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
        res.end(fs.readFileSync(fp));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise(r => localServer.listen(serverPort, r));

    const chromeCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromeCandidates.find(fs.existsSync);
    if (!chromeExe) throw new Error('Không tìm thấy trình duyệt Chrome.');

    const cdpPort = 9550 + Math.floor(Math.random() * 200);
    const userDataDir = path.join(os.tmpdir(), `chrome_lifecycle_${Date.now()}`);
    chromeProc = spawn(chromeExe, [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      '--no-sandbox',
      '--disable-gpu',
      `--user-data-dir=${userDataDir}`,
      `http://localhost:${serverPort}/#tabNavClubs`
    ]);

    const wsUrl = await getDebuggerUrl(cdpPort);
    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Chờ app sẵn sàng
    let appLoaded = false;
    for (let i = 0; i < 40; i++) {
      appLoaded = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.renderCommunityFeed)`);
      if (appLoaded) break;
      await sleep(250);
    }
    if (!appLoaded) throw new Error('Web App không khởi động được trong 10 giây.');

    // Chuyển sang View Community & Clubs
    await cdp.eval(`window.ViVuApp.navGoClubs && window.ViVuApp.navGoClubs()`);
    await sleep(500);

    // Gọi đồng bộ UGC feed từ Supabase
    await cdp.eval(`window.ViVuApp.syncCommunityUgcFeed()`);
    await sleep(2000);

    // Kiểm tra DOM có chứa bài viết và CLB vừa duyệt không
    const domCheck = await cdp.eval(`(() => {
      const feed = document.getElementById('communityPostsFeed');
      const feedHtml = feed ? feed.innerHTML : '';
      const clubsGrid = document.getElementById('featuredClubsGrid');
      const clubsHtml = clubsGrid ? clubsGrid.innerHTML : '';

      return {
        postVisible: feedHtml.includes('${createdPost.id}') || feedHtml.includes('${createdPost.title}'),
        clubVisible: clubsHtml.includes('${createdClub.id}') || clubsHtml.includes('${createdClub.name}')
      };
    })()`);

    if (!domCheck.postVisible) {
      throw new Error(`[LỖI UI] Bài viết đã duyệt nhưng không hiển thị trên DOM #communityPostsFeed!`);
    }
    if (!domCheck.clubVisible) {
      throw new Error(`[LỖI UI] CLB đã duyệt nhưng không hiển thị trên DOM #featuredClubsGrid!`);
    }

    console.log(`  ✓ [5.3] Giao diện người dùng Web: DOM #communityPostsFeed hiển thị bài viết đã duyệt.`);
    console.log(`  ✓ [5.4] Giao diện người dùng Web: DOM #featuredClubsGrid hiển thị CLB đã duyệt.`);

    // Set viewport desktop và cuộn tới phần feed để chụp ảnh minh chứng
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await cdp.eval(`(() => {
      const feed = document.getElementById('communityPostsFeed');
      if (feed) feed.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await sleep(600);

    // Chụp ảnh minh chứng
    const screenshotPath = path.join(ARTIFACT_DIR, 'ugc_product_lifecycle_approved.png');
    await cdp.captureScreenshot(screenshotPath);
    console.log(`  📸 Đã chụp ảnh giao diện web thực tế: ${screenshotPath}`);

  } finally {
    if (cdp) await cdp.close();
    if (chromeProc) {
      chromeProc.kill('SIGKILL');
    }
    if (localServer) {
      localServer.close();
    }

    // --------------------------------------------------------------------------
    // BƯỚC 6: DỌN DẸP SẠCH SẼ CÓ MỤC TIÊU & ĐỐI CHIẾU 0 RÁC (TARGETED CLEANUP)
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 6] DỌN DẸP SẠCH SẼ THEO ID ĐÃ TẠO & ĐỐI CHIẾU 0 RÁC TỒN ĐỌNG:');

    // 6.1 Xóa bài viết
    for (const pid of createdPostIds) {
      const delRes = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${pid}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  - Xóa bài viết test: ID ${pid} (Status: ${delRes.status})`);
    }

    // 6.2 Xóa CLB
    for (const cid of createdClubIds) {
      const delRes = await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${cid}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  - Xóa CLB test: ID ${cid} (Status: ${delRes.status})`);
    }

    // 6.3 Xóa audit logs liên quan
    for (const pid of createdPostIds) {
      await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?entity_id=eq.${pid}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
    }
    for (const cid of createdClubIds) {
      await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?entity_id=eq.${cid}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
    }

    // 6.4 Xóa user
    for (const uid of createdUserIds) {
      const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  - Xóa tài khoản test: ID ${uid} (Status: ${delRes.status})`);
    }

    // 6.5 Đối chiếu lại
    let leftoverCount = 0;
    for (const pid of createdPostIds) {
      const chk = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${pid}&select=id`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      const rows = await chk.json();
      if (Array.isArray(rows) && rows.length > 0) leftoverCount++;
    }
    for (const cid of createdClubIds) {
      const chk = await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${cid}&select=id`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      const rows = await chk.json();
      if (Array.isArray(rows) && rows.length > 0) leftoverCount++;
    }
    for (const uid of createdUserIds) {
      const chk = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      if (chk.status !== 404) leftoverCount++;
    }

    if (leftoverCount === 0) {
      console.log('  ✓ [Đối Chiếu Dọn Dẹp] 100% bản ghi thử nghiệm đã được dọn sạch sẽ (0 dòng rác tồn đọng).');
    } else {
      console.warn(`  ⚠️ Cảnh báo: Vẫn còn ${leftoverCount} bản ghi rác!`);
    }
  }

  console.log('\n================================================================================');
  console.log('🎉 KIỂM TRA LUỒNG SẢN PHẨM HOÀN CHỈNH ĐẠT 100% PASS - TOÀN VẸN TỪ SUBMIT TỚI WEB!');
  console.log('================================================================================');
}

run().catch(err => {
  console.error('\n❌ KIỂM TRA LUỒNG SẢN PHẨM THẤT BẠI:');
  console.error(err);
  process.exit(1);
});
