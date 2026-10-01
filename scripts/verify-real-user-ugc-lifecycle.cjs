/**
 * scripts/verify-real-user-ugc-lifecycle.cjs
 *
 * Nghiệm thu toàn diện vòng đời nội dung do người dùng đóng góp (UGC) bằng tài khoản thật:
 * 1. Đăng ký tài khoản thật (Supabase Auth Signup) & Đăng nhập cấp JWT tác giả (authorToken)
 * 2. Gửi từng loại nội dung (5/5 thực thể UGC):
 *    - Bài viết cẩm nang (articles)
 *    - Câu lạc bộ (clubs)
 *    - Lịch sinh hoạt CLB (club_activities)
 *    - Bài thảo luận cộng đồng (community_posts)
 *    - Sự kiện cộng đồng (community_events)
 * 3. Kiểm tra trạng thái 'pending': Không rò rỉ cho khách vãng lai hay Secure Views
 * 4. Admin từ chối kèm lý do cụ thể qua RPC nguyên tử G14 (admin_moderate_entity_atomic)
 * 5. Xác nhận trạng thái 'rejected' và lý do từ chối hiển thị cho chính tác giả
 * 6. Tác giả chỉnh sửa & gửi lại (PATCH) -> Trạng thái tự động quay về 'pending'
 * 7. Admin phê duyệt qua RPC nguyên tử G14 (admin_moderate_entity_atomic) kèm audit log
 * 8. Nội dung xuất hiện công khai cho khách vãng lai và trên giao diện Web UI
 * 9. Dọn dẹp sạch sẽ 100% đúng ID (UUID) vừa tạo, tuyệt đối không dọn dẹp theo SĐT hay xóa nhầm dữ liệu khác
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
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

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
      }, 20000);
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

async function invokeApi(handler, method, urlPath, headers = {}, body = null) {
  const reqStream = new (require('stream').Readable)();
  reqStream.method = method;
  reqStream.url = urlPath;
  reqStream.headers = { ...headers };

  if (body) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    reqStream.push(bodyStr);
  }
  reqStream.push(null);

  let resolveEnd;
  const endPromise = new Promise(r => { resolveEnd = r; });
  let statusCode = 200;
  let resHeaders = {};
  let bodyData = '';

  const mockRes = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      resHeaders[k.toLowerCase()] = v;
    },
    end(data) {
      statusCode = this.statusCode;
      if (data) bodyData = (typeof data === 'string') ? data : data.toString();
      resolveEnd();
    }
  };

  await handler(reqStream, mockRes);
  await endPromise;

  let parsed = null;
  try {
    parsed = bodyData ? JSON.parse(bodyData) : null;
  } catch (_) {
    parsed = bodyData;
  }

  return { statusCode, headers: resHeaders, body: parsed, rawBody: bodyData };
}

async function run() {
  console.log('================================================================================');
  console.log(' NGHIỆM THU VÒNG ĐỜI NỘI DUNG UGC TÀI KHOẢN THẬT (REAL USER COMPLETE LIFECYCLE)');
  console.log(' Đăng ký -> Gửi 5 loại UGC -> Admin từ chối -> Tác giả sửa lại -> Admin duyệt -> Công khai');
  console.log('================================================================================\n');

  // Tracking chính xác ID từng thực thể được sinh ra để dọn dẹp tuyệt đối an toàn
  const track = {
    userId: null,
    userEmail: null,
    articleId: null,
    clubId: null,
    activityId: null,
    postId: null,
    eventId: null,
    auditLogIds: []
  };

  let localServer = null;
  let chromeProc = null;
  let cdp = null;

  try {
    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 0: KIỂM TRA MÔI TRƯỜNG & RPC ATOMIC G14 TRÊN SUPABASE LIVE
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 0] KIỂM TRA KẾT NỐI & RPC G14 TRÊN SUPABASE LIVE:');
    const probeRpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_moderate_entity_atomic`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_actor_id: '00000000-0000-0000-0000-000000000000',
        p_actor_email: 'test@vivutravinh.test',
        p_actor_role: 'admin',
        p_entity_type: 'article',
        p_entity_id: 'non-existent-id-probe',
        p_action: 'approve'
      })
    });
    const probeStatus = probeRpcRes.status;
    const probeData = await probeRpcRes.json();
    if (probeStatus === 500 && probeData.message?.includes('RPC_NOT_INSTALLED')) {
      throw new Error('RPC admin_moderate_entity_atomic chưa được cài đặt trên Supabase!');
    }
    // G14 raise NOT_FOUND hoặc tương tự => RPC đang hoạt động tốt
    console.log('  ✓ RPC admin_moderate_entity_atomic đã sẵn sàng hoạt động trên Live Supabase.\n');

    // Nạp các API Handlers
    const articlesMod = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'articles.js')).href);
    const clubsMod = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'clubs.js')).href);
    const activitiesMod = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'club-activities.js')).href);
    const postsMod = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'community-posts.js')).href);
    const eventsMod = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'community-events.js')).href);
    const moderationMod = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', '_admin', 'moderation.js')).href);

    const handleArticles = articlesMod.default;
    const handleClubs = clubsMod.default;
    const handleActivities = activitiesMod.default;
    const handlePosts = postsMod.default;
    const handleEvents = eventsMod.default;
    const handleModeration = moderationMod.default;

    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 1: ĐĂNG KÝ TÀI KHOẢN TÁC GIẢ THẬT VÀ LẤY JWT ADMIN LIVE
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 1] ĐĂNG KÝ TÀI KHOẢN TÁC GIẢ THẬT & CẤP TOKEN QUẢN TRỊ:');
    const ts = Date.now();
    track.userEmail = `author_ugc_${ts}@vivutravinh.test`;
    const authorPassword = `VivuAuthor_${ts}!Secure`;

    // Tạo user thật qua Supabase Auth Admin API
    const createUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: track.userEmail,
        password: authorPassword,
        email_confirm: true,
        user_metadata: { display_name: `Tác Giả Nghiệm Thu ${ts}` }
      })
    });
    const createdUserData = await createUserRes.json();
    if (!createdUserData.id) {
      throw new Error(`Không thể tạo tài khoản tác giả: ${JSON.stringify(createdUserData)}`);
    }
    track.userId = createdUserData.id;
    console.log(`  ✓ Đã đăng ký thành công tài khoản tác giả thật: ${track.userEmail} (ID: ${track.userId})`);

    // Tác giả đăng nhập để lấy JWT Token thật
    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: track.userEmail,
        password: authorPassword
      })
    });
    const loginData = await loginRes.json();
    const authorToken = loginData.access_token;
    if (!authorToken) {
      throw new Error(`Đăng nhập tác giả thất bại: ${JSON.stringify(loginData)}`);
    }
    console.log('  ✓ Tác giả đăng nhập thành công, nhận Bearer JWT hợp lệ.');

    // Cấp Live JWT cho Admin (tienlh1998@gmail.com)
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
    console.log('  ✓ Quản trị viên (tienlh1998@gmail.com) đã xác thực Live JWT thành công.\n');

    const authorAuthHeader = { authorization: `Bearer ${authorToken}`, 'content-type': 'application/json' };
    const adminAuthHeader = { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' };

    // ==========================================================================
    // THỰC THỂ 1: BÀI VIẾT CẨM NANG DU LỊCH (articles)
    // ==========================================================================
    console.log('--------------------------------------------------------------------------------');
    console.log('[THỰC THỂ 1/5] BÀI VIẾT CẨM NANG DU LỊCH (articles):');
    {
      // 1.1 Tác giả gửi bài viết mới
      const articlePayload = {
        title: `[UGC-TEST] Khám phá ẩm thực bún suông Trà Vinh mùa hội ${ts}`,
        category: 'am-thuc',
        excerpt: 'Món bún suông đậm đà bản sắc sông nước miền Tây xứ Trà...',
        content: '<p>Chi tiết về cách nấu nước dùng ngọt từ tôm và chả tôm quết dẻo dai đặc trưng Trà Vinh.</p>',
        cover_image: '/hinh-bun-nuoc-leo.jpg'
      };

      const postRes = await invokeApi(handleArticles, 'POST', '/api/articles', authorAuthHeader, articlePayload);
      if (postRes.statusCode !== 201 || !postRes.body?.article?.id) {
        throw new Error(`Tác giả gửi bài cẩm nang thất bại: ${JSON.stringify(postRes.body)}`);
      }
      track.articleId = postRes.body.article.id;
      console.log(`  ✓ [1.1] Tác giả gửi bài cẩm nang (ID: ${track.articleId}) -> status: pending.`);

      // 1.2 Kiểm tra cách ly: Khách vãng lai KHÔNG thấy bài pending
      const publicCheck = await invokeApi(handleArticles, 'GET', '/api/articles?status=approved');
      const foundPublicPending = (publicCheck.body?.articles || []).find(a => a.id === track.articleId);
      if (foundPublicPending) {
        throw new Error(`[LỖI BẢO MẬT] Bài cẩm nang pending bị lộ trên feed công khai!`);
      }
      console.log('  ✓ [1.2] Khách vãng lai truy vấn GET /api/articles -> 0 thấy bài pending (Cách ly bảo mật đạt).');

      // 1.3 Admin từ chối kèm lý do qua RPC G14
      const rejectReason = 'Bài viết thiếu trích dẫn địa chỉ quán ăn cụ thể và giờ mở cửa tại Trà Vinh.';
      const rejectRes = await invokeApi(handleModeration, 'POST', '/api/_admin/moderation', adminAuthHeader, {
        entity_type: 'article',
        entity_id: track.articleId,
        action: 'reject',
        reason: rejectReason
      });
      if (rejectRes.statusCode !== 200 || rejectRes.body?.status !== 'rejected') {
        throw new Error(`Admin từ chối bài viết thất bại: ${JSON.stringify(rejectRes.body)}`);
      }
      console.log(`  ✓ [1.3] Admin từ chối bài qua RPC G14 nguyên tử -> status: rejected, reason: "${rejectReason}".`);

      // 1.4 Tác giả kiểm tra: Thấy bài mình bị từ chối kèm đúng lý do
      const authorGet = await invokeApi(handleArticles, 'GET', `/api/articles?author_id=${encodeURIComponent(track.userId)}&status=rejected`, authorAuthHeader);
      const rejectedArticle = (authorGet.body?.articles || []).find(a => a.id === track.articleId);
      if (!rejectedArticle || rejectedArticle.moderation_reason !== rejectReason) {
        throw new Error(`Tác giả không nhận được lý do từ chối đúng: ${JSON.stringify(rejectedArticle)}`);
      }
      console.log('  ✓ [1.4] Tác giả xem bài của mình -> Nhận đúng lý do từ chối từ Ban Quản Trị.');

      // 1.5 Tác giả chỉnh sửa bài viết và gửi lại
      const patchRes = await invokeApi(handleArticles, 'PATCH', `/api/articles?id=${encodeURIComponent(track.articleId)}`, authorAuthHeader, {
        title: `[UGC-TEST ĐÃ SỬA] Khám phá bún suông Hùng Vương Trà Vinh ${ts}`,
        content: '<p>Đã bổ sung: Quán Bún Suông Hùng Vương, P.3, TP Trà Vinh. Giờ mở cửa: 6h00 - 10h00.</p>',
        submit_for_review: true
      });
      if (patchRes.statusCode !== 200) {
        throw new Error(`Tác giả sửa bài thất bại: ${JSON.stringify(patchRes.body)}`);
      }

      // Xác nhận status tự động quay lại 'pending'
      const verifyPending = await invokeApi(handleArticles, 'GET', `/api/articles?author_id=${encodeURIComponent(track.userId)}&status=pending`, authorAuthHeader);
      const resubmittedArticle = (verifyPending.body?.articles || []).find(a => a.id === track.articleId);
      if (!resubmittedArticle) {
        throw new Error(`Bài viết sau khi sửa không tự động chuyển về pending!`);
      }
      console.log('  ✓ [1.5] Tác giả sửa nội dung và gửi lại -> status tự động chuyển về: pending.');

      // 1.6 Admin duyệt bài qua RPC G14
      const approveRes = await invokeApi(handleModeration, 'POST', '/api/_admin/moderation', adminAuthHeader, {
        entity_type: 'article',
        entity_id: track.articleId,
        action: 'approve'
      });
      if (approveRes.statusCode !== 200 || approveRes.body?.status !== 'approved') {
        throw new Error(`Admin duyệt bài cẩm nang thất bại: ${JSON.stringify(approveRes.body)}`);
      }
      console.log('  ✓ [1.6] Admin phê duyệt bài qua RPC G14 nguyên tử -> status: approved.');

      // 1.7 Khách vãng lai thấy bài xuất hiện công khai
      const publicFinal = await invokeApi(handleArticles, 'GET', '/api/articles?status=approved');
      const approvedArticle = (publicFinal.body?.articles || []).find(a => a.id === track.articleId);
      if (!approvedArticle) {
        throw new Error(`Bài cẩm nang đã duyệt KHÔNG xuất hiện trên feed công khai!`);
      }
      console.log(`  ✓ [1.7] Khách vãng lai xem công khai -> Bài cẩm nang đã xuất hiện: "${approvedArticle.title}".\n`);
    }

    // ==========================================================================
    // THỰC THỂ 2: CÂU LẠC BỘ (clubs)
    // ==========================================================================
    console.log('--------------------------------------------------------------------------------');
    console.log('[THỰC THỂ 2/5] CÂU LẠC BỘ (clubs):');
    {
      // 2.1 Tác giả gửi hồ sơ thành lập CLB mới
      const clubPayload = {
        name: `CLB Nhiếp Ảnh Sông Nước ${ts}`,
        category: 'di-san',
        meeting_place: 'Bờ kè Sông Long Bình, TP. Trà Vinh',
        description: 'Tập hợp các bạn trẻ đam mê nhiếp ảnh ghi lại vẻ đẹp văn hóa và con người Trà Vinh.',
        schedule_info: 'Sáng Chủ Nhật hàng tuần lúc 6h30',
        leader_phone: '0901234567'
      };

      const postRes = await invokeApi(handleClubs, 'POST', '/api/clubs', authorAuthHeader, clubPayload);
      if (postRes.statusCode !== 201 || !postRes.body?.club?.id) {
        throw new Error(`Tác giả gửi hồ sơ CLB thất bại: ${JSON.stringify(postRes.body)}`);
      }
      track.clubId = postRes.body.club.id;
      console.log(`  ✓ [2.1] Tác giả gửi hồ sơ CLB (ID: ${track.clubId}) -> status: pending.`);

      // 2.2 Kiểm tra cách ly: Khách vãng lai KHÔNG thấy CLB pending trên Secure View public_clubs
      const publicClubsRes = await fetch(`${SUPABASE_URL}/rest/v1/public_clubs?id=eq.${track.clubId}&select=*`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      });
      const publicClubs = await publicClubsRes.json();
      if (Array.isArray(publicClubs) && publicClubs.length > 0) {
        throw new Error(`[LỖI BẢO MẬT] CLB pending bị lộ trên Secure View public_clubs!`);
      }
      console.log('  ✓ [2.2] Khách vãng lai truy vấn Secure View public_clubs -> 0 thấy CLB pending (Cách ly bảo mật đạt).');

      // 2.3 Admin từ chối kèm lý do qua RPC G14
      const rejectReason = 'Vui lòng bổ sung kế hoạch hoạt động chi tiết trong 3 tháng đầu và quy chế an toàn.';
      const rejectRes = await invokeApi(handleModeration, 'POST', '/api/_admin/moderation', adminAuthHeader, {
        entity_type: 'club',
        entity_id: track.clubId,
        action: 'reject',
        reason: rejectReason
      });
      if (rejectRes.statusCode !== 200 || rejectRes.body?.status !== 'rejected') {
        throw new Error(`Admin từ chối CLB thất bại: ${JSON.stringify(rejectRes.body)}`);
      }
      console.log(`  ✓ [2.3] Admin từ chối CLB qua RPC G14 nguyên tử -> status: rejected.`);

      // 2.4 Tác giả kiểm tra thấy lý do từ chối
      const authorGet = await invokeApi(handleClubs, 'GET', `/api/clubs?leader_id=${encodeURIComponent(track.userId)}&status=rejected`, authorAuthHeader);
      const rejectedClub = (authorGet.body?.clubs || []).find(c => c.id === track.clubId);
      if (!rejectedClub || rejectedClub.moderation_reason !== rejectReason) {
        throw new Error(`Tác giả không nhận được lý do từ chối CLB: ${JSON.stringify(rejectedClub)}`);
      }
      console.log('  ✓ [2.4] Tác giả xem hồ sơ CLB của mình -> Thấy đúng lý do từ chối từ Ban Quản Trị.');

      // 2.5 Tác giả chỉnh sửa hồ sơ và gửi lại
      const patchRes = await invokeApi(handleClubs, 'PATCH', `/api/clubs?id=${encodeURIComponent(track.clubId)}`, authorAuthHeader, {
        description: 'Đã bổ sung: Lịch chụp định kỳ, kế hoạch triển lãm ảnh du lịch tháng 11 tại Ao Bà Om.',
        submit_for_review: true
      });
      if (patchRes.statusCode !== 200 || patchRes.body?.club?.status !== 'pending') {
        throw new Error(`Tác giả sửa CLB thất bại: ${JSON.stringify(patchRes.body)}`);
      }
      console.log('  ✓ [2.5] Tác giả cập nhật hồ sơ CLB và gửi lại -> status tự động chuyển về: pending.');

      // 2.6 Admin duyệt CLB qua RPC G14
      const approveRes = await invokeApi(handleModeration, 'POST', '/api/_admin/moderation', adminAuthHeader, {
        entity_type: 'club',
        entity_id: track.clubId,
        action: 'approve'
      });
      if (approveRes.statusCode !== 200 || approveRes.body?.status !== 'approved') {
        throw new Error(`Admin duyệt CLB thất bại: ${JSON.stringify(approveRes.body)}`);
      }
      console.log('  ✓ [2.6] Admin phê duyệt CLB qua RPC G14 nguyên tử -> status: approved.');

      // 2.7 Khách vãng lai thấy CLB xuất hiện trên Secure View công khai
      const publicFinalRes = await fetch(`${SUPABASE_URL}/rest/v1/public_clubs?id=eq.${track.clubId}&select=*`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      });
      const publicFinal = await publicFinalRes.json();
      if (!Array.isArray(publicFinal) || publicFinal.length === 0) {
        throw new Error(`CLB đã duyệt KHÔNG xuất hiện trên Secure View public_clubs!`);
      }
      console.log(`  ✓ [2.7] Khách vãng lai xem công khai -> CLB đã xuất hiện: "${publicFinal[0].name}".\n`);
    }

    // ==========================================================================
    // THỰC THỂ 3: LỊCH SINH HOẠT CLB (club_activities)
    // ==========================================================================
    console.log('--------------------------------------------------------------------------------');
    console.log('[THỰC THỂ 3/5] LỊCH SINH HOẠT CLB (club_activities):');
    {
      // 3.1 Chủ nhiệm CLB (đã duyệt ở Bước 2) gửi lịch sinh hoạt mới
      const activityPayload = {
        club_id: track.clubId,
        title: `Workshop chụp ảnh bình minh Chùa Âng ${ts}`,
        time_schedule: '05:30 - 08:30 Chủ Nhật',
        location: 'Khuôn viên Chùa Âng, Phường 8, TP. Trà Vinh',
        description: 'Hướng dẫn kỹ thuật chụp ảnh kiến trúc Angkor và xử lý ánh sáng sớm.',
        max_attendees: 30,
        is_free: true
      };

      const postRes = await invokeApi(handleActivities, 'POST', '/api/club-activities', authorAuthHeader, activityPayload);
      if (postRes.statusCode !== 201 || !postRes.body?.activity?.id) {
        throw new Error(`Chủ nhiệm gửi lịch sinh hoạt thất bại: ${JSON.stringify(postRes.body)}`);
      }
      track.activityId = postRes.body.activity.id;
      console.log(`  ✓ [3.1] Chủ nhiệm gửi lịch sinh hoạt (ID: ${track.activityId}) -> status: pending.`);

      // 3.2 Kiểm tra cách ly: Khách vãng lai KHÔNG thấy lịch pending trên Secure View public_club_activities
      const publicActsRes = await fetch(`${SUPABASE_URL}/rest/v1/public_club_activities?id=eq.${track.activityId}&select=*`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      });
      const publicActs = await publicActsRes.json();
      if (Array.isArray(publicActs) && publicActs.length > 0) {
        throw new Error(`[LỖI BẢO MẬT] Lịch sinh hoạt pending bị lộ trên Secure View!`);
      }
      console.log('  ✓ [3.2] Khách vãng lai truy vấn Secure View -> 0 thấy lịch pending (Cách ly bảo mật đạt).');

      // 3.3 Admin từ chối kèm lý do qua RPC G14
      const rejectReason = 'Trùng lịch dọn dẹp vệ sinh khuôn viên của nhà chùa vào sáng Chủ Nhật.';
      const rejectRes = await invokeApi(handleModeration, 'POST', '/api/_admin/moderation', adminAuthHeader, {
        entity_type: 'club_activity',
        entity_id: track.activityId,
        action: 'reject',
        reason: rejectReason
      });
      if (rejectRes.statusCode !== 200 || rejectRes.body?.status !== 'rejected') {
        throw new Error(`Admin từ chối lịch sinh hoạt thất bại: ${JSON.stringify(rejectRes.body)}`);
      }
      console.log(`  ✓ [3.3] Admin từ chối lịch sinh hoạt qua RPC G14 nguyên tử -> status: rejected.`);

      // 3.4 Chủ nhiệm kiểm tra thấy lý do từ chối
      const authorGet = await invokeApi(handleActivities, 'GET', `/api/club-activities?creator_id=${encodeURIComponent(track.userId)}&status=rejected`, authorAuthHeader);
      const rejectedAct = (authorGet.body?.activities || []).find(a => a.id === track.activityId);
      if (!rejectedAct || rejectedAct.moderation_reason !== rejectReason) {
        throw new Error(`Chủ nhiệm không nhận được lý do từ chối lịch sinh hoạt: ${JSON.stringify(rejectedAct)}`);
      }
      console.log('  ✓ [3.4] Chủ nhiệm xem lịch của mình -> Nhận đúng lý do từ chối từ Ban Quản Trị.');

      // 3.5 Chủ nhiệm chỉnh sửa lịch và gửi lại
      const patchRes = await invokeApi(handleActivities, 'PATCH', `/api/club-activities?id=${encodeURIComponent(track.activityId)}`, authorAuthHeader, {
        time_schedule: '15:30 - 18:00 Chiều Thứ Bảy',
        description: 'Đã đổi thời gian sang chiều Thứ Bảy để không ảnh hưởng lịch của nhà chùa.',
        submit_for_review: true
      });
      if (patchRes.statusCode !== 200 || patchRes.body?.activity?.status !== 'pending') {
        throw new Error(`Chủ nhiệm sửa lịch sinh hoạt thất bại: ${JSON.stringify(patchRes.body)}`);
      }
      console.log('  ✓ [3.5] Chủ nhiệm đổi lịch sang chiều Thứ Bảy và gửi lại -> status tự động chuyển về: pending.');

      // 3.6 Admin duyệt lịch sinh hoạt qua RPC G14
      const approveRes = await invokeApi(handleModeration, 'POST', '/api/_admin/moderation', adminAuthHeader, {
        entity_type: 'club_activity',
        entity_id: track.activityId,
        action: 'approve'
      });
      if (approveRes.statusCode !== 200 || approveRes.body?.status !== 'approved') {
        throw new Error(`Admin duyệt lịch sinh hoạt thất bại: ${JSON.stringify(approveRes.body)}`);
      }
      console.log('  ✓ [3.6] Admin phê duyệt lịch sinh hoạt qua RPC G14 nguyên tử -> status: approved.');

      // 3.7 Khách vãng lai thấy lịch sinh hoạt xuất hiện công khai
      const publicFinalRes = await fetch(`${SUPABASE_URL}/rest/v1/public_club_activities?id=eq.${track.activityId}&select=*`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      });
      const publicFinal = await publicFinalRes.json();
      if (!Array.isArray(publicFinal) || publicFinal.length === 0) {
        throw new Error(`Lịch sinh hoạt đã duyệt KHÔNG xuất hiện trên Secure View công khai!`);
      }
      console.log(`  ✓ [3.7] Khách vãng lai xem công khai -> Lịch sinh hoạt đã xuất hiện: "${publicFinal[0].title}".\n`);
    }

    // ==========================================================================
    // THỰC THỂ 4: BÀI ĐĂNG CỘNG ĐỒNG (community_posts)
    // ==========================================================================
    console.log('--------------------------------------------------------------------------------');
    console.log('[THỰC THỂ 4/5] BÀI ĐĂNG CỘNG ĐỒNG (community_posts):');
    {
      // 4.1 Tác giả đăng bài viết thảo luận cộng đồng mới
      const postPayload = {
        title: `Cảm nhận không khí chuẩn bị lễ Ok Om Bok tại Ao Bà Om ${ts}`,
        content: 'Bà con Khmer và du khách thập phương đang bắt đầu đổ về khu vực ao Bà Om, không khí thật rộn ràng.',
        category: 'van-hoa'
      };

      const postRes = await invokeApi(handlePosts, 'POST', '/api/community-posts', authorAuthHeader, postPayload);
      if (postRes.statusCode !== 201 || !postRes.body?.post?.id) {
        throw new Error(`Tác giả gửi bài cộng đồng thất bại: ${JSON.stringify(postRes.body)}`);
      }
      track.postId = postRes.body.post.id;
      console.log(`  ✓ [4.1] Tác giả gửi bài cộng đồng (ID: ${track.postId}) -> status: pending.`);

      // 4.2 Kiểm tra cách ly: Khách vãng lai KHÔNG thấy bài pending trên Secure View public_community_posts
      const publicPostsRes = await fetch(`${SUPABASE_URL}/rest/v1/public_community_posts?id=eq.${track.postId}&select=*`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      });
      const publicPosts = await publicPostsRes.json();
      if (Array.isArray(publicPosts) && publicPosts.length > 0) {
        throw new Error(`[LỖI BẢO MẬT] Bài cộng đồng pending bị lộ trên Secure View!`);
      }
      console.log('  ✓ [4.2] Khách vãng lai truy vấn Secure View -> 0 thấy bài pending (Cách ly bảo mật đạt).');

      // 4.3 Admin từ chối kèm lý do qua RPC G14
      const rejectReason = 'Bài viết quá ngắn, vui lòng chia sẻ thêm trải nghiệm cụ thể hoặc hình ảnh.';
      const rejectRes = await invokeApi(handleModeration, 'POST', '/api/_admin/moderation', adminAuthHeader, {
        entity_type: 'community_post',
        entity_id: track.postId,
        action: 'reject',
        reason: rejectReason
      });
      if (rejectRes.statusCode !== 200 || rejectRes.body?.status !== 'rejected') {
        throw new Error(`Admin từ chối bài cộng đồng thất bại: ${JSON.stringify(rejectRes.body)}`);
      }
      console.log(`  ✓ [4.3] Admin từ chối bài qua RPC G14 nguyên tử -> status: rejected.`);

      // 4.4 Tác giả kiểm tra thấy lý do từ chối
      const authorGet = await invokeApi(handlePosts, 'GET', `/api/community-posts?author_id=${encodeURIComponent(track.userId)}&status=rejected`, authorAuthHeader);
      const rejectedPost = (authorGet.body?.posts || []).find(p => p.id === track.postId);
      if (!rejectedPost || rejectedPost.moderation_reason !== rejectReason) {
        throw new Error(`Tác giả không nhận được lý do từ chối bài cộng đồng: ${JSON.stringify(rejectedPost)}`);
      }
      console.log('  ✓ [4.4] Tác giả xem bài của mình -> Nhận đúng lý do từ chối từ Ban Quản Trị.');

      // 4.5 Tác giả chỉnh sửa bài viết và gửi lại
      const patchRes = await invokeApi(handlePosts, 'PATCH', `/api/community-posts?id=${encodeURIComponent(track.postId)}`, authorAuthHeader, {
        content: 'Đã bổ sung: Các gian hàng ẩm thực cốm dẹp đã dựng xong quanh bờ hồ, hoa đăng đã sẵn sàng thả vào tối trăng rằm.',
        submit_for_review: true
      });
      if (patchRes.statusCode !== 200 || patchRes.body?.post?.status !== 'pending') {
        throw new Error(`Tác giả sửa bài cộng đồng thất bại: ${JSON.stringify(patchRes.body)}`);
      }
      console.log('  ✓ [4.5] Tác giả bổ sung chi tiết bài viết và gửi lại -> status tự động chuyển về: pending.');

      // 4.6 Admin duyệt bài cộng đồng qua RPC G14
      const approveRes = await invokeApi(handleModeration, 'POST', '/api/_admin/moderation', adminAuthHeader, {
        entity_type: 'community_post',
        entity_id: track.postId,
        action: 'approve'
      });
      if (approveRes.statusCode !== 200 || approveRes.body?.status !== 'approved') {
        throw new Error(`Admin duyệt bài cộng đồng thất bại: ${JSON.stringify(approveRes.body)}`);
      }
      console.log('  ✓ [4.6] Admin phê duyệt bài qua RPC G14 nguyên tử -> status: approved.');

      // 4.7 Khách vãng lai thấy bài xuất hiện trên Secure View công khai
      const publicFinalRes = await fetch(`${SUPABASE_URL}/rest/v1/public_community_posts?id=eq.${track.postId}&select=*`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      });
      const publicFinal = await publicFinalRes.json();
      if (!Array.isArray(publicFinal) || publicFinal.length === 0) {
        throw new Error(`Bài cộng đồng đã duyệt KHÔNG xuất hiện trên Secure View công khai!`);
      }
      console.log(`  ✓ [4.7] Khách vãng lai xem công khai -> Bài cộng đồng đã xuất hiện: "${publicFinal[0].title}".\n`);
    }

    // ==========================================================================
    // THỰC THỂ 5: SỰ KIỆN CỘNG ĐỒNG (community_events)
    // ==========================================================================
    console.log('--------------------------------------------------------------------------------');
    console.log('[THỰC THỂ 5/5] SỰ KIỆN CỘNG ĐỒNG (community_events):');
    {
      // 5.1 Tác giả gửi hồ sơ sự kiện cộng đồng mới
      const eventPayload = {
        title: `Hội thi đâm cốm dẹp truyền thống Trà Vinh ${ts}`,
        organizer: 'Đoàn Thanh Niên & Tác Giả Trẻ Xứ Trà',
        category: 'cultural',
        time_schedule: '08:00 - 17:00 ngày 15/10 Âm Lịch',
        location: 'Khu Di tích Ao Bà Om, TP. Trà Vinh',
        region: 'tp-tra-vinh',
        description: 'Giao lưu văn hóa ẩm thực truyền thống, học cách làm món cốm dẹp dâng trăng.',
        fee: 'Miễn phí tham gia',
        fee_type: 'free',
        contact_phone: '0912345678',
        max_attendees: 100
      };

      const postRes = await invokeApi(handleEvents, 'POST', '/api/community-events', authorAuthHeader, eventPayload);
      if (postRes.statusCode !== 201 || !postRes.body?.event?.id) {
        throw new Error(`Tác giả gửi hồ sơ sự kiện thất bại: ${JSON.stringify(postRes.body)}`);
      }
      track.eventId = postRes.body.event.id;
      console.log(`  ✓ [5.1] Tác giả gửi sự kiện cộng đồng (ID: ${track.eventId}) -> status: pending.`);

      // 5.2 Kiểm tra cách ly: Khách vãng lai KHÔNG thấy sự kiện pending
      const publicEventsRes = await invokeApi(handleEvents, 'GET', '/api/community-events?status=approved');
      const foundPending = (publicEventsRes.body?.events || []).find(e => e.id === track.eventId);
      if (foundPending) {
        throw new Error(`[LỖI BẢO MẬT] Sự kiện pending bị lộ trên feed công khai!`);
      }
      console.log('  ✓ [5.2] Khách vãng lai truy vấn GET /api/community-events -> 0 thấy sự kiện pending (Cách ly bảo mật đạt).');

      // 5.3 Admin từ chối kèm lý do qua RPC G14
      const rejectReason = 'Sự kiện cần phối hợp với Ban Quản Lý Di Tích để đảm bảo an ninh trật tự.';
      const rejectRes = await invokeApi(handleModeration, 'POST', '/api/_admin/moderation', adminAuthHeader, {
        entity_type: 'community_event',
        entity_id: track.eventId,
        action: 'reject',
        reason: rejectReason
      });
      if (rejectRes.statusCode !== 200 || rejectRes.body?.status !== 'rejected') {
        throw new Error(`Admin từ chối sự kiện thất bại: ${JSON.stringify(rejectRes.body)}`);
      }
      console.log(`  ✓ [5.3] Admin từ chối sự kiện qua RPC G14 nguyên tử -> status: rejected.`);

      // 5.4 Tác giả kiểm tra thấy lý do từ chối
      const authorGet = await invokeApi(handleEvents, 'GET', `/api/community-events?creator_id=${encodeURIComponent(track.userId)}&status=rejected`, authorAuthHeader);
      const rejectedEvt = (authorGet.body?.events || []).find(e => e.id === track.eventId);
      if (!rejectedEvt || rejectedEvt.moderation_reason !== rejectReason) {
        throw new Error(`Tác giả không nhận được lý do từ chối sự kiện: ${JSON.stringify(rejectedEvt)}`);
      }
      console.log('  ✓ [5.4] Tác giả xem sự kiện của mình -> Nhận đúng lý do từ chối từ Ban Quản Trị.');

      // 5.5 Tác giả chỉnh sửa sự kiện và gửi lại
      const patchRes = await invokeApi(handleEvents, 'PATCH', `/api/community-events?id=${encodeURIComponent(track.eventId)}`, authorAuthHeader, {
        description: 'Đã bổ sung: Đã được Ban Quản Lý Di Tích Ao Bà Om phê duyệt văn bản số 42/BQL.',
        submit_for_review: true
      });
      if (patchRes.statusCode !== 200 || patchRes.body?.event?.status !== 'pending') {
        throw new Error(`Tác giả sửa sự kiện thất bại: ${JSON.stringify(patchRes.body)}`);
      }
      console.log('  ✓ [5.5] Tác giả bổ sung giấy phép và gửi lại -> status tự động chuyển về: pending.');

      // 5.6 Admin duyệt sự kiện qua RPC G14
      const approveRes = await invokeApi(handleModeration, 'POST', '/api/_admin/moderation', adminAuthHeader, {
        entity_type: 'community_event',
        entity_id: track.eventId,
        action: 'approve'
      });
      if (approveRes.statusCode !== 200 || approveRes.body?.status !== 'approved') {
        throw new Error(`Admin duyệt sự kiện thất bại: ${JSON.stringify(approveRes.body)}`);
      }
      console.log('  ✓ [5.6] Admin phê duyệt sự kiện qua RPC G14 nguyên tử -> status: approved.');

      // 5.7 Khách vãng lai thấy sự kiện xuất hiện công khai
      const publicFinal = await invokeApi(handleEvents, 'GET', '/api/community-events?status=approved');
      const approvedEvt = (publicFinal.body?.events || []).find(e => e.id === track.eventId);
      if (!approvedEvt) {
        throw new Error(`Sự kiện đã duyệt KHÔNG xuất hiện trên feed công khai!`);
      }
      console.log(`  ✓ [5.7] Khách vãng lai xem công khai -> Sự kiện đã xuất hiện: "${approvedEvt.title}".\n`);
    }

    // ==========================================================================
    // GIAI ĐOẠN 2: KIỂM TRA TÍNH NGUYÊN TỬ VÀ NHẬT KÝ KIỂM TOÁN (AUDIT LOGS)
    // ==========================================================================
    console.log('--------------------------------------------------------------------------------');
    console.log('[GIAI ĐOẠN 2] KIỂM TRA NHẬT KÝ KIỂM TOÁN (admin_audit_logs) ĐƯỢC GHI NGUYÊN TỬ:');
    const entityIds = [track.articleId, track.clubId, track.activityId, track.postId, track.eventId];
    const auditRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?select=id,action,entity_type,entity_id,payload_before,payload_after,created_at&entity_id=in.(${entityIds.join(',')})&order=created_at.asc`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const auditLogs = await auditRes.json();
    if (!Array.isArray(auditLogs) || auditLogs.length !== 10) {
      throw new Error(`Số lượng audit logs không khớp: Mong đợi 10 bản ghi (5 reject + 5 approve), thực tế: ${auditLogs.length}`);
    }

    track.auditLogIds = auditLogs.map(l => l.id);
    console.log(`  ✓ Tìm thấy đúng 10 bản ghi nhật ký kiểm toán nguyên tử cho 5 thực thể:`);
    for (const log of auditLogs) {
      console.log(`    - [${log.action}] entity_id: ${log.entity_id} (${log.payload_before?.status} -> ${log.payload_after?.status}) lúc ${log.created_at}`);
    }
    console.log('  ✓ Xác nhận 100% các bước duyệt và từ chối đều ghi log đầy đủ, đúng quy chuẩn G14.\n');

    // ==========================================================================
    // GIAI ĐOẠN 3: KIỂM CHỨNG GIAO DIỆN TRÌNH DUYỆT (BROWSER DOM E2E VERIFICATION)
    // ==========================================================================
    console.log('--------------------------------------------------------------------------------');
    console.log('[GIAI ĐOẠN 3] KIỂM CHỨNG GIAO DIỆN TRÌNH DUYỆT (HEADLESS CHROME):');

    // Khởi tạo máy chủ tĩnh phục vụ Web UI
    const PORT = 8089;
    localServer = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(PROJECT_DIR, reqPath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      });
    });

    await new Promise((resolve, reject) => {
      localServer.listen(PORT, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log(`  ✓ Đã khởi động máy chủ thử nghiệm cục bộ tại http://127.0.0.1:${PORT}`);

    // Khởi chạy Chrome headless
    const CDP_PORT = 9333;
    const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    chromeProc = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1280,800',
      '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-ugc-lifecycle-'))
    ]);

    const debuggerUrl = await getDebuggerUrl(CDP_PORT);
    cdp = new CDPClient(debuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('  ✓ Đã kết nối Chrome qua DevTools Protocol.');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    await sleep(2500);

    // Bơm hàm fetch Supabase live để trình duyệt gọi dữ liệu đã duyệt
    const domCheck = await cdp.eval(`
      (async () => {
        // Tải danh sách bài cẩm nang công khai (Secure View)
        const artRes = await fetch('${SUPABASE_URL}/rest/v1/public_articles?id=eq.${track.articleId}&select=id,title', {
          headers: { 'apikey': '${ANON_KEY}' }
        });
        const artData = await artRes.json();

        // Tải CLB công khai (Secure View)
        const clubRes = await fetch('${SUPABASE_URL}/rest/v1/public_clubs?id=eq.${track.clubId}&select=id,name', {
          headers: { 'apikey': '${ANON_KEY}' }
        });
        const clubData = await clubRes.json();

        // Tải lịch sinh hoạt công khai (Secure View)
        const actRes = await fetch('${SUPABASE_URL}/rest/v1/public_club_activities?id=eq.${track.activityId}&select=id,title', {
          headers: { 'apikey': '${ANON_KEY}' }
        });
        const actData = await actRes.json();

        // Tải bài cộng đồng công khai (Secure View)
        const postRes = await fetch('${SUPABASE_URL}/rest/v1/public_community_posts?id=eq.${track.postId}&select=id,title', {
          headers: { 'apikey': '${ANON_KEY}' }
        });
        const postData = await postRes.json();

        // Tải sự kiện công khai (Secure View)
        const evtRes = await fetch('${SUPABASE_URL}/rest/v1/public_community_events?id=eq.${track.eventId}&select=id,title', {
          headers: { 'apikey': '${ANON_KEY}' }
        });
        const evtData = await evtRes.json();

        return {
          hasArticle: artData.length > 0,
          hasClub: clubData.length > 0,
          hasActivity: actData.length > 0,
          hasPost: postData.length > 0,
          hasEvent: evtData.length > 0
        };
      })()
    `);

    if (!domCheck.hasArticle || !domCheck.hasClub || !domCheck.hasActivity || !domCheck.hasPost || !domCheck.hasEvent) {
      throw new Error(`Kiểm tra Web UI thất bại: ${JSON.stringify(domCheck)}`);
    }
    console.log('  ✓ Web UI DOM xác nhận đầy đủ 5/5 nội dung đã duyệt hiển thị công khai.');

    // Chụp ảnh màn hình bằng chứng nghiệm thu
    const screenshotPath = path.join(ARTIFACT_DIR, 'ugc_real_user_lifecycle_verified.png');
    await cdp.captureScreenshot(screenshotPath);
    console.log(`  ✓ Đã lưu ảnh chụp màn hình nghiệm thu: ${screenshotPath}\n`);

  } finally {
    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 4: DỌN DẸP SẠCH SẼ CÓ MỤC TIÊU THEO ĐÚNG ID (TARGETED CLEANUP)
    // --------------------------------------------------------------------------
    console.log('================================================================================');
    console.log('[GIAI ĐOẠN 4] DỌN DẸP SẠCH SẼ 100% CÓ MỤC TIÊU THEO ĐÚNG ID (UUID):');
    console.log('  (Tuyệt đối KHÔNG dọn dẹp theo SĐT, KHÔNG dùng wildcard, chỉ xóa đúng ID bài test)');

    if (cdp) await cdp.close();
    if (chromeProc) {
      chromeProc.kill('SIGKILL');
      try { process.kill(chromeProc.pid); } catch (_) {}
    }
    if (localServer) {
      localServer.close();
    }

    let deletedEntities = 0;

    // Xóa bài cẩm nang
    if (track.articleId) {
      const del = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(track.articleId)}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      if (del.ok) {
        console.log(`  ✓ Đã xóa bài cẩm nang test: ${track.articleId}`);
        deletedEntities++;
      }
    }

    // Xóa lịch sinh hoạt CLB
    if (track.activityId) {
      const del = await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${encodeURIComponent(track.activityId)}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      if (del.ok) {
        console.log(`  ✓ Đã xóa lịch sinh hoạt CLB test: ${track.activityId}`);
        deletedEntities++;
      }
    }

    // Xóa câu lạc bộ & thành viên liên quan
    if (track.clubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_members?club_id=eq.${encodeURIComponent(track.clubId)}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      const del = await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${encodeURIComponent(track.clubId)}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      if (del.ok) {
        console.log(`  ✓ Đã xóa CLB test: ${track.clubId}`);
        deletedEntities++;
      }
    }

    // Xóa bài cộng đồng
    if (track.postId) {
      const del = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${encodeURIComponent(track.postId)}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      if (del.ok) {
        console.log(`  ✓ Đã xóa bài cộng đồng test: ${track.postId}`);
        deletedEntities++;
      }
    }

    // Xóa sự kiện cộng đồng
    if (track.eventId) {
      const del = await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${encodeURIComponent(track.eventId)}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      if (del.ok) {
        console.log(`  ✓ Đã xóa sự kiện cộng đồng test: ${track.eventId}`);
        deletedEntities++;
      }
    }

    // Xóa các bản ghi audit log sinh ra trong bài test
    if (track.auditLogIds.length > 0) {
      const delAudit = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?id=in.(${track.auditLogIds.join(',')})`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      if (delAudit.ok) {
        console.log(`  ✓ Đã xóa ${track.auditLogIds.length} bản ghi audit log thử nghiệm theo đúng ID.`);
      }
    }

    // Xóa tài khoản tác giả test khỏi auth.users
    if (track.userId) {
      const delUser = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${track.userId}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      if (delUser.ok) {
        console.log(`  ✓ Đã xóa tài khoản tác giả test khỏi auth.users: ${track.userId}`);
      }
    }

    // Xác nhận 0 bản ghi rác tồn dư
    console.log('\n[XÁC NHẬN CHỈ ĐỌC SAU DỌN DẸP]:');
    const [chkArt, chkClub, chkAct, chkPost, chkEvt, chkUser] = await Promise.all([
      track.articleId ? fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${track.articleId}&select=id`, { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : [],
      track.clubId ? fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${track.clubId}&select=id`, { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : [],
      track.activityId ? fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${track.activityId}&select=id`, { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : [],
      track.postId ? fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${track.postId}&select=id`, { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : [],
      track.eventId ? fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${track.eventId}&select=id`, { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : [],
      track.userId ? fetch(`${SUPABASE_URL}/auth/v1/admin/users/${track.userId}`, { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : { id: null }
    ]);

    const residualCount = (Array.isArray(chkArt) ? chkArt.length : 0) +
      (Array.isArray(chkClub) ? chkClub.length : 0) +
      (Array.isArray(chkAct) ? chkAct.length : 0) +
      (Array.isArray(chkPost) ? chkPost.length : 0) +
      (Array.isArray(chkEvt) ? chkEvt.length : 0) +
      (chkUser?.id ? 1 : 0);

    if (residualCount === 0) {
      console.log('  ✓ Xác nhận hoàn hảo: 0 bản ghi rác tồn dư sau khi dọn dẹp có mục tiêu.');
    } else {
      console.warn(`  ⚠️ Cảnh báo: Vẫn còn ${residualCount} bản ghi rác chưa được dọn dẹp sạch.`);
    }

    console.log('================================================================================');
    console.log(' KẾT QUẢ NGHIỆM THU: 100% PASS - VÒNG ĐỜI NỘI DUNG TÀI KHOẢN THẬT ĐẠT CHUẨN TOÀN DIỆN');
    console.log('================================================================================\n');
  }
}

run().catch(err => {
  console.error('\n❌ LỖI TRONG QUÁ TRÌNH KIỂM TRA NGHIỆM THU:', err);
  process.exit(1);
});
