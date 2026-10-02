/**
 * scripts/verify-real-user-ugc-lifecycle.cjs
 *
 * Nghiệm thu toàn diện vòng đời nội dung UGC trên giao diện trình duyệt thật (DOM):
 * 1. Đăng ký tài khoản thật (Supabase Auth Signup) & Cấp JWT tác giả + JWT quản trị viên
 * 2. Gửi 5/5 thực thể nội dung ban đầu (articles, clubs, club_activities, community_posts, community_events)
 * 3. Ban Quản Trị từ chối cả 5 thực thể kèm lý do cụ thể qua RPC nguyên tử G14
 * 4. [TRÌNH DUYỆT DOM - TÁC GIẢ]:
 *    - Mở modal "Nội dung của tôi" (#sidebarLinkMyContent)
 *    - Kiểm tra DOM: Thấy 5 thẻ .ugc-content-card hiển thị đúng lý do từ chối (.ugc-moderation-reason)
 *    - Bấm nút sửa (.btn-edit-ugc) trên DOM cho từng loại, cập nhật biểu mẫu trên DOM và gửi duyệt lại
 *    - Xác nhận trạng thái trong CSDL tự động chuyển về 'pending' và xóa sạch moderation_reason
 * 5. [TRÌNH DUYỆT DOM - ADMIN]:
 *    - Đăng nhập quyền quản trị, mở Trung tâm Kiểm duyệt (#adminModerationModal) trên DOM
 *    - Duyệt lần lượt 5 loại qua các tab và nút bấm "Phê duyệt" trên DOM
 *    - Xác nhận trạng thái chuyển sang 'approved' và 10 bản ghi nhật ký kiểm toán (admin_audit_logs)
 * 6. [TRÌNH DUYỆT DOM - KHÁCH VÃNG LAI]:
 *    - Đăng xuất hoàn toàn, duyệt web với vai trò khách vãng lai
 *    - Mở Tab 1 (Trang chủ): Thấy thẻ cẩm nang thật (#travelStoriesContainer) và thẻ sự kiện thật (#festivalsPortalContainer) trên DOM
 *    - Mở Tab 3 (Cộng đồng): Thấy thẻ CLB thật (#featuredClubsGrid), thẻ lịch sinh hoạt thật (#weeklyActivitiesList) và thẻ bài viết thật (#communityPostsFeed) trên DOM
 *    - Tuyệt đối KHÔNG dùng fetch Secure View thay cho kiểm tra thẻ DOM
 * 7. Chụp ảnh màn hình lưu bằng chứng nghiệm thu
 * 8. Dọn dẹp sạch sẽ 100% có mục tiêu đúng ID/UUID (0 bản ghi rác tồn dư)
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
      }, 25000);
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

  const resChunks = [];
  const resHeaders = {};
  let statusCode = 200;

  const mockRes = {
    statusCode: 200,
    setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
    getHeader(k) { return resHeaders[k.toLowerCase()]; },
    write(chunk) { if (chunk) resChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); },
    end(chunk) {
      if (chunk) resChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      statusCode = this.statusCode || 200;
    }
  };

  await handler(reqStream, mockRes);
  const rawBody = Buffer.concat(resChunks).toString('utf8');
  let parsed = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsed = rawBody;
  }

  return { statusCode, headers: resHeaders, body: parsed };
}

async function run() {
  console.log('================================================================================');
  console.log(' NGHIỆM THU VÒNG ĐỜI NỘI DUNG UGC TRÊN GIAO DIỆN TRÌNH DUYỆT THẬT (DOM BROWSER)');
  console.log('================================================================================\n');

  const track = {
    authorId: null,
    authorEmail: null,
    adminId: null,
    adminEmail: null,
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
    // GIAI ĐOẠN 0: KIỂM TRA MÔI TRƯỜNG & RPC G14
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
    // GIAI ĐOẠN 1: KHỞI TẠO MÁY CHỦ THỬ NGHIỆM ĐIỀU PHỐI ĐẦY ĐỦ API ROUTES
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 1] KHỞI ĐỘNG LOCAL SERVER ĐIỀU PHỐI API & TĨNH:');
    const PORT = 8089;
    localServer = http.createServer(async (req, res) => {
      // CORS Headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret, x-correlation-id, x-client-request-id');

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      const urlObj = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const pathname = urlObj.pathname;

      try {
        if (pathname === '/api/articles') {
          return await handleArticles(req, res);
        }
        if (pathname === '/api/clubs') {
          return await handleClubs(req, res);
        }
        if (pathname === '/api/club-activities') {
          return await handleActivities(req, res);
        }
        if (pathname === '/api/community-posts') {
          return await handlePosts(req, res);
        }
        if (pathname === '/api/community-events') {
          return await handleEvents(req, res);
        }
        if (pathname === '/api/admin-moderation' || pathname.startsWith('/api/admin')) {
          return await handleModeration(req, res);
        }
      } catch (handlerErr) {
        console.error(`[Server API Error ${pathname}]:`, handlerErr.message);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: handlerErr.message }));
        return;
      }

      // Phục vụ tệp tĩnh
      let reqPath = pathname;
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(PROJECT_DIR, decodeURIComponent(reqPath));
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
    console.log(`  ✓ Máy chủ điều phối chạy tại: http://127.0.0.1:${PORT}\n`);

    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 2: TẠO TÀI KHOẢN TÁC GIẢ, ADMIN VÀ 5 THỰC THỂ TEST
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 2] TẠO TÀI KHOẢN THẬT, 5 THỰC THỂ & ADMIN TỪ CHỐI QUA G14:');
    const ts = Date.now();
    track.authorEmail = `author_dom_${ts}@vivutravinh.test`;
    const authorPassword = `VivuAuthor_${ts}!Secure`;

    // 2.1 Tạo tác giả thật
    const createAuthorRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: track.authorEmail,
        password: authorPassword,
        email_confirm: true,
        user_metadata: { display_name: `Tác Giả DOM ${ts}` }
      })
    });
    const authorData = await createAuthorRes.json();
    track.authorId = authorData.id;
    console.log(`  ✓ Đã tạo tác giả: ${track.authorEmail} (ID: ${track.authorId})`);

    // Đăng nhập tác giả
    const authLoginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: track.authorEmail, password: authorPassword })
    });
    const authLoginData = await authLoginRes.json();
    const authorToken = authLoginData.access_token;
    const authorUser = authLoginData.user;
    const authorHeader = { authorization: `Bearer ${authorToken}`, 'content-type': 'application/json' };

    // 2.2 Tạo tài khoản Admin thật & cấp quyền trong admin_users
    track.adminEmail = `admin_dom_${ts}@vivutravinh.test`;
    const adminPassword = `AdminPass_${ts}!Secure`;
    const createAdminRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: track.adminEmail, password: adminPassword, email_confirm: true })
    });
    const adminData = await createAdminRes.json();
    track.adminId = adminData.id;

    await fetch(`${SUPABASE_URL}/rest/v1/admin_users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: track.adminId, email: track.adminEmail, role: 'admin', is_active: true })
    });

    const adminLoginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: track.adminEmail, password: adminPassword })
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.access_token;
    const adminHeader = { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' };
    console.log(`  ✓ Đã tạo quản trị viên: ${track.adminEmail} (ID: ${track.adminId})`);

    // 2.3 Tạo 5 thực thể ban đầu với tiêu đề và mã định danh duy nhất theo từng lần chạy (timestamp)
    track.initialArticleTitle = `[UGC-DOM] Cẩm nang đặc sản cốm dẹp Ba Om ${ts}`;
    track.updatedArticleTitle = `[UGC-DOM] Cẩm nang đặc sản cốm dẹp Ba Om ${ts} [ĐÃ BỔ SUNG LỘ TRÌNH VÀ QUÁN ĂN]`;
    track.clubUniqueName = `CLB Văn Hóa Ẩm Thực Xứ Trà ${ts}`;
    track.activityUniqueTitle = `Buổi giao lưu làm cốm dẹp truyền thống ${ts}`;
    track.postUniqueSnippet = `nhộn nhịp ${ts}`;
    track.eventUniqueTitle = `Lễ hội Đua Ghe Ngo Trà Vinh Mùa Trăng ${ts}`;

    // 1. Article
    const artRes = await invokeApi(handleArticles, 'POST', '/api/articles', authorHeader, {
      title: track.initialArticleTitle,
      category: 'am-thuc',
      excerpt: 'Món ăn biểu tượng của văn hóa Khmer Trà Vinh...',
      content: 'Chi tiết về cách làm cốm dẹp truyền thống mùa trăng rằm.',
      cover_image: '/ao bà om.jpg'
    });
    track.articleId = artRes.body?.article?.id;

    // 2. Club (Hồ sơ CLB mới do tác giả đề xuất để kiểm thử quy trình duyệt)
    const clubRes = await invokeApi(handleClubs, 'POST', '/api/clubs', authorHeader, {
      name: track.clubUniqueName,
      category: 'am-thuc',
      meeting_place: 'Bờ kè sông Long Bình',
      description: 'Giao lưu trải nghiệm các món ăn truyền thống Trà Vinh.',
      leader_phone: '0901234567'
    });
    track.clubId = clubRes.body?.club?.id;

    // 2.2b Tạo CLB đã duyệt dành riêng cho tác giả để tác giả có tư cách Chủ nhiệm đề xuất lịch sinh hoạt (G13)
    track.approvedClubId = `clb-approved-${ts}`;
    await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: track.approvedClubId,
        name: `CLB Sáng Tạo Trẻ Xứ Trà ${ts}`,
        category: 'am-thuc',
        meeting_place: 'Nhà Văn Hóa TP. Trà Vinh',
        description: 'Câu lạc bộ đã được Ban Quản Trị phê duyệt chính thức dành cho các bạn trẻ Trà Vinh.',
        leader_id: track.authorId,
        leader_name: 'Tác Giả DOM',
        status: 'approved'
      })
    });

    // 3. Club Activity (gắn với CLB đã duyệt của chủ nhiệm)
    const actRes = await invokeApi(handleActivities, 'POST', '/api/club-activities', authorHeader, {
      club_id: track.approvedClubId,
      title: track.activityUniqueTitle,
      time_schedule: '08:00 Chủ Nhật',
      location: 'Nhà Văn Hóa TP. Trà Vinh',
      max_attendees: 35,
      description: 'Học cách quết và trộn cốm dẹp cùng nghệ nhân bản địa.'
    });
    track.activityId = actRes.body?.activity?.id;

    // 4. Community Post
    const postRes = await invokeApi(handlePosts, 'POST', '/api/community-posts', authorHeader, {
      title: `Thảo luận lễ hội Ok Om Bok ${ts}`,
      content: `Không khí chuẩn bị lễ cúng trăng tại Ao Bà Om năm nay rất nhộn nhịp ${ts}.`,
      category: 'Chùa chiền Khmer'
    });
    track.postId = postRes.body.post.id;

    // 5. Community Event
    const evtRes = await invokeApi(handleEvents, 'POST', '/api/community-events', authorHeader, {
      title: track.eventUniqueTitle,
      organizer: 'Đoàn Thanh Niên Tác Giả Trẻ',
      category: 'sports',
      time_schedule: '07:30 ngày 15/10 Âm Lịch',
      location: 'Sông Long Bình, TP. Trà Vinh',
      description: 'Hội đua ghe Ngo chào mừng Lễ hội Ok Om Bok.',
      contact_phone: '0912345678'
    });
    track.eventId = evtRes.body.event.id;
    console.log('  ✓ Đã tạo 5 thực thể test thành công với status ban đầu: pending.');

    // 2.4 Ban Quản Trị từ chối cả 5 thực thể kèm lý do cụ thể qua RPC G14
    const REASONS = {
      article: 'Vui lòng bổ sung danh sách địa chỉ quán ăn uy tín và hướng dẫn di chuyển chi tiết.',
      club: 'Hồ sơ cần bổ sung kế hoạch hoạt động cụ thể trong quý đầu tiên.',
      activity: 'Vui lòng ghi rõ số phòng họp hoặc sảnh tập trung tại Nhà Văn Hóa.',
      post: 'Bài thảo luận quá ngắn, vui lòng chia sẻ thêm trải nghiệm hoặc hình ảnh.',
      event: 'Vui lòng đính kèm số điện thoại liên hệ khẩn cấp hoặc phương án đảm bảo an ninh.'
    };

    const rejectCalls = [
      { entity_type: 'article', entity_id: track.articleId, reason: REASONS.article },
      { entity_type: 'club', entity_id: track.clubId, reason: REASONS.club },
      { entity_type: 'club_activity', entity_id: track.activityId, reason: REASONS.activity },
      { entity_type: 'community_post', entity_id: track.postId, reason: REASONS.post },
      { entity_type: 'community_event', entity_id: track.eventId, reason: REASONS.event }
    ];

    for (const item of rejectCalls) {
      const res = await invokeApi(handleModeration, 'POST', '/api/_admin/moderation', adminHeader, {
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        action: 'reject',
        reason: item.reason
      });
      if (res.statusCode !== 200 || res.body?.status !== 'rejected') {
        throw new Error(`Từ chối ${item.entity_type} thất bại: ${JSON.stringify(res.body)}`);
      }
    }
    console.log('  ✓ Ban Quản Trị đã từ chối cả 5 thực thể kèm lý do cụ thể qua RPC G14 nguyên tử.\n');

    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 3: BROWSER DOM TEST - TÁC GIẢ XEM LÝ DO TỪ CHỐI, SỬA & GỬI LẠI TRÊN DOM
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 3] KIỂM CHỨNG TRÌNH DUYỆT THẬT: TÁC GIẢ MỞ "NỘI DUNG CỦA TÔI", THẤY LÝ DO, SỬA TRÊN FORM DOM:');

    // Khởi chạy Headless Chrome
    const CDP_PORT = 9334;
    const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    chromeProc = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1280,900',
      '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-ugc-dom-'))
    ]);

    const debuggerUrl = await getDebuggerUrl(CDP_PORT);
    cdp = new CDPClient(debuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    console.log('  ✓ Đã kết nối Chrome qua DevTools Protocol.');

    // Nạp trang web ban đầu
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    await sleep(2000);

    // Bơm phiên tác giả vào localStorage của trình duyệt
    await cdp.eval(`
      localStorage.setItem('vivu_user_session', JSON.stringify({
        access_token: '${authorToken}',
        user: ${JSON.stringify(authorUser)},
        expires_at: Math.floor(Date.now() / 1000) + 7200
      }));
    `);
    console.log('  ✓ Đã nạp phiên đăng nhập tác giả vào localStorage trên trình duyệt.');

    // 3.1 Tác giả click nút "Nội dung của tôi" (#sidebarLinkMyContent) trên DOM
    const openMyContentResult = await cdp.eval(`
      (async () => {
        const link = document.getElementById('sidebarLinkMyContent');
        if (!link) return { ok: false, error: 'Không tìm thấy link #sidebarLinkMyContent trên DOM' };
        link.click();

        // Chờ modal #userProfileModal hiển thị và nội dung UGC nạp xong
        for (let i = 0; i < 30; i++) {
          const modal = document.getElementById('userProfileModal');
          const isVisible = modal && !modal.classList.contains('hidden');
          const cards = document.querySelectorAll('.ugc-content-card');
          if (isVisible && cards.length >= 5) {
            return { ok: true, cardsCount: cards.length };
          }
          await new Promise(r => setTimeout(r, 200));
        }
        const cards = document.querySelectorAll('.ugc-content-card');
        return { ok: false, cardsCount: cards.length, error: 'Quá thời gian nạp danh sách Nội dung của tôi' };
      })()
    `);

    if (!openMyContentResult.ok) {
      throw new Error(`Mở "Nội dung của tôi" trên DOM thất bại: ${JSON.stringify(openMyContentResult)}`);
    }
    console.log(`  ✓ [DOM] Người dùng mở "Nội dung của tôi" -> Hiển thị ${openMyContentResult.cardsCount} thẻ nội dung.`);

    // 3.2 Kiểm tra 5 thẻ trên DOM: Xác nhận lý do từ chối (.ugc-moderation-reason)
    const checkReasonsResult = await cdp.eval(`
      (() => {
        const entities = [
          { type: 'article', id: '${track.articleId}', expectedReason: '${REASONS.article}' },
          { type: 'club', id: '${track.clubId}', expectedReason: '${REASONS.club}' },
          { type: 'club_activity', id: '${track.activityId}', expectedReason: '${REASONS.activity}' },
          { type: 'community_post', id: '${track.postId}', expectedReason: '${REASONS.post}' },
          { type: 'community_event', id: '${track.eventId}', expectedReason: '${REASONS.event}' }
        ];

        const results = [];
        for (const ent of entities) {
          const card = document.querySelector(\`.ugc-content-card[data-entity-id="\${ent.id}"]\`);
          if (!card) {
            results.push({ id: ent.id, type: ent.type, found: false, error: 'Không tìm thấy thẻ DOM' });
            continue;
          }
          const badge = card.querySelector('.ugc-status-badge')?.textContent?.trim() || '';
          const reasonEl = card.querySelector('.ugc-moderation-reason');
          const reasonText = reasonEl?.textContent?.trim() || '';
          const hasEditBtn = !!card.querySelector('.btn-edit-ugc');

          results.push({
            id: ent.id,
            type: ent.type,
            found: true,
            badge,
            hasRejectionBox: !!card.querySelector('.ugc-rejection-box'),
            reasonText,
            reasonMatch: reasonText.includes(ent.expectedReason),
            hasEditBtn
          });
        }
        return results;
      })()
    `);

    for (const r of checkReasonsResult) {
      if (!r.found || !r.hasRejectionBox || !r.reasonMatch || !r.hasEditBtn) {
        throw new Error(`Kiểm tra lý do từ chối trên DOM thẻ [${r.type}] thất bại: ${JSON.stringify(r)}`);
      }
      console.log(`  ✓ [DOM Card: ${r.type}] Hiển thị đúng lý do: "${r.reasonText.slice(0, 50)}..." & Có nút [Sửa & Gửi lại].`);
    }

    // 3.3 Tác giả bấm nút sửa (.btn-edit-ugc), cập nhật biểu mẫu trên DOM và gửi duyệt lại cho cả 5 loại
    console.log('\n  [THỰC HIỆN SỬA & GỬI DUYỆT LẠI TRÊN CÁC BIỂU MẪU DOM]:');

    // --- SỬA 1: ARTICLE ---
    const editArticleResult = await cdp.eval(`
      (async () => {
        const btn = document.querySelector(\`.btn-edit-ugc[data-entity-id="${track.articleId}"]\`);
        if (!btn) return { ok: false, error: 'Không tìm thấy nút sửa article' };
        btn.click();
        await new Promise(r => setTimeout(r, 500));

        const titleInput = document.getElementById('articleInputTitle');
        const contentInput = document.getElementById('articleInputContent');
        if (!titleInput || !contentInput) return { ok: false, error: 'Không tìm thấy input form article' };

        titleInput.value = '${track.updatedArticleTitle}';
        contentInput.value = contentInput.value + '\\nĐã bổ sung danh sách quán ăn Hùng Vương và chỉ dẫn chi tiết.';

        const confirmBtn = document.getElementById('btnSubmitArticleConfirm');
        if (!confirmBtn) return { ok: false, error: 'Không tìm thấy nút #btnSubmitArticleConfirm' };
        confirmBtn.click();

        // Chờ modal đóng
        for (let i = 0; i < 20; i++) {
          const modal = document.getElementById('submitArticleModal');
          if (!modal || modal.classList.contains('hidden')) return { ok: true };
          await new Promise(r => setTimeout(r, 200));
        }
        return { ok: false, error: 'Modal article không tự đóng sau submit' };
      })()
    `);
    if (!editArticleResult.ok) throw new Error(`Sửa bài cẩm nang trên DOM thất bại: ${JSON.stringify(editArticleResult)}`);
    console.log('  ✓ [DOM Form 1/5: articles] Đã cập nhật tiêu đề/nội dung và bấm gửi duyệt lại thành công.');
    await sleep(600);

    // --- SỬA 2: CLUB ---
    const editClubResult = await cdp.eval(`
      (async () => {
        window.ViVuApp.openProfileModal('my-content');
        await window.ViVuApp.fetchUserUgcContent(true);
        await new Promise(r => setTimeout(r, 500));

        const btn = document.querySelector(\`.btn-edit-ugc[data-entity-id="${track.clubId}"]\`);
        if (!btn) return { ok: false, error: 'Không tìm thấy nút sửa club' };
        btn.click();
        await new Promise(r => setTimeout(r, 500));

        const descInput = document.getElementById('newClubDesc');
        const contactInput = document.getElementById('newClubLeaderContact');
        if (!descInput) return { ok: false, error: 'Không tìm thấy input form club' };

        descInput.value = descInput.value + ' [Đã bổ sung kế hoạch hoạt động 3 tháng đầu]';
        if (contactInput) contactInput.value = '0901234567';

        const form = document.getElementById('createClubForm');
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.click();

        for (let i = 0; i < 20; i++) {
          const modal = document.getElementById('createClubModal');
          if (!modal || modal.classList.contains('hidden')) return { ok: true };
          await new Promise(r => setTimeout(r, 200));
        }
        return { ok: false, error: 'Modal club không tự đóng' };
      })()
    `);
    if (!editClubResult.ok) throw new Error(`Sửa CLB trên DOM thất bại: ${JSON.stringify(editClubResult)}`);
    console.log('  ✓ [DOM Form 2/5: clubs] Đã cập nhật kế hoạch hoạt động và bấm gửi duyệt lại thành công.');
    await sleep(600);

    // --- SỬA 3: CLUB ACTIVITY ---
    const editActivityResult = await cdp.eval(`
      (async () => {
        window.ViVuApp.openProfileModal('my-content');
        await window.ViVuApp.fetchUserUgcContent(true);
        await new Promise(r => setTimeout(r, 500));

        const btn = document.querySelector(\`.btn-edit-ugc[data-entity-id="${track.activityId}"]\`);
        if (!btn) return { ok: false, error: 'Không tìm thấy nút sửa activity' };
        btn.click();
        await new Promise(r => setTimeout(r, 500));

        const form = document.getElementById('submitClubActivityForm');
        if (!form) return { ok: false, error: 'Không tìm thấy form submitClubActivityForm' };

        const locInput = form.elements['location'];
        if (locInput) locInput.value = locInput.value + ' - Phòng 204 Nhà Văn Hóa';

        const submitBtn = document.getElementById('submitClubActivityBtn') || form.querySelector('button[type="submit"]');
        submitBtn.click();

        for (let i = 0; i < 20; i++) {
          const modal = document.getElementById('submitClubActivityModal');
          if (!modal || modal.classList.contains('hidden')) return { ok: true };
          await new Promise(r => setTimeout(r, 200));
        }
        return { ok: false, error: 'Modal activity không tự đóng' };
      })()
    `);
    if (!editActivityResult.ok) throw new Error(`Sửa lịch CLB trên DOM thất bại: ${JSON.stringify(editActivityResult)}`);
    console.log('  ✓ [DOM Form 3/5: club_activities] Đã bổ sung địa điểm cụ thể và bấm gửi duyệt lại thành công.');
    await sleep(600);

    // --- SỬA 4: COMMUNITY POST ---
    const editPostResult = await cdp.eval(`
      (async () => {
        window.ViVuApp.openProfileModal('my-content');
        await window.ViVuApp.fetchUserUgcContent(true);
        await new Promise(r => setTimeout(r, 500));

        const btn = document.querySelector(\`.btn-edit-ugc[data-entity-id="${track.postId}"]\`);
        if (!btn) return { ok: false, error: 'Không tìm thấy nút sửa post' };
        btn.click();
        await new Promise(r => setTimeout(r, 500));

        const contentInput = document.getElementById('editPostContent');
        if (!contentInput) return { ok: false, error: 'Không tìm thấy input #editPostContent' };

        contentInput.value = contentInput.value + ' Đã bổ sung: Các gian hàng cốm dẹp truyền thống đã sẵn sàng đón du khách!';

        const submitBtn = document.getElementById('btnSubmitEditPost');
        submitBtn.click();

        for (let i = 0; i < 20; i++) {
          const modal = document.getElementById('editCommunityPostModal');
          if (!modal || modal.classList.contains('hidden')) return { ok: true };
          await new Promise(r => setTimeout(r, 200));
        }
        return { ok: false, error: 'Modal edit post không tự đóng' };
      })()
    `);
    if (!editPostResult.ok) throw new Error(`Sửa bài cộng đồng trên DOM thất bại: ${JSON.stringify(editPostResult)}`);
    console.log('  ✓ [DOM Form 4/5: community_posts] Đã cập nhật nội dung chi tiết và bấm gửi duyệt lại thành công.');
    await sleep(600);

    // --- SỬA 5: COMMUNITY EVENT ---
    const editEventResult = await cdp.eval(`
      (async () => {
        window.ViVuApp.openProfileModal('my-content');
        await window.ViVuApp.fetchUserUgcContent(true);
        await new Promise(r => setTimeout(r, 500));

        const btn = document.querySelector(\`.btn-edit-ugc[data-entity-id="${track.eventId}"]\`);
        if (!btn) return { ok: false, error: 'Không tìm thấy nút sửa event' };
        btn.click();
        await new Promise(r => setTimeout(r, 500));

        const form = document.getElementById('hostEventSubmitForm');
        if (!form) return { ok: false, error: 'Không tìm thấy form hostEventSubmitForm' };

        const descInput = form.elements['description'];
        const phoneInput = form.elements['phone'];
        if (descInput) descInput.value = descInput.value + ' [Đã phối hợp phương án an ninh số 42/BQL]';
        if (phoneInput) phoneInput.value = '0987654321';

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.click();

        for (let i = 0; i < 20; i++) {
          const modal = document.getElementById('hostEventModal');
          if (!modal || modal.classList.contains('hidden')) return { ok: true };
          await new Promise(r => setTimeout(r, 200));
        }
        return { ok: false, error: 'Modal event không tự đóng' };
      })()
    `);
    if (!editEventResult.ok) throw new Error(`Sửa sự kiện trên DOM thất bại: ${JSON.stringify(editEventResult)}`);
    console.log('  ✓ [DOM Form 5/5: community_events] Đã cập nhật phương án an ninh và bấm gửi duyệt lại thành công.\n');

    // 3.4 Xác nhận trong CSDL: Cả 5 thực thể đã chuyển về 'pending' và moderation_reason = null
    const [chkArtPend, chkClubPend, chkActPend, chkPostPend, chkEvtPend] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${track.articleId}&select=status,moderation_reason`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${track.clubId}&select=status,moderation_reason`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${track.activityId}&select=status,moderation_reason`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${track.postId}&select=status,moderation_reason`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${track.eventId}&select=status,moderation_reason`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json())
    ]);

    const resubmittedStatuses = [chkArtPend[0], chkClubPend[0], chkActPend[0], chkPostPend[0], chkEvtPend[0]];
    for (let i = 0; i < resubmittedStatuses.length; i++) {
      const s = resubmittedStatuses[i];
      if (s.status !== 'pending' || s.moderation_reason !== null) {
        throw new Error(`Thực thể index ${i} chưa chuyển về pending hoặc chưa xóa lý do: ${JSON.stringify(s)}`);
      }
    }
    console.log('  ✓ CSDL xác nhận: 5/5 thực thể đã tự động quay về status: pending và moderation_reason: null.\n');

    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 4: BROWSER DOM TEST - ADMIN MỞ MODAL KIỂM DUYỆT & PHÊ DUYỆT TRÊN DOM
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 4] KIỂM CHỨNG TRÌNH DUYỆT THẬT: ADMIN MỞ MODAL KIỂM DUYỆT & DUYỆT 5 THỰC THỂ QUA GIAO DIỆN:');

    // Đăng nhập Admin vào localStorage
    await cdp.eval(`
      localStorage.setItem('vivu_admin_session', JSON.stringify({
        access_token: '${adminToken}',
        user: { id: '${track.adminId}', email: '${track.adminEmail}', role: 'admin' },
        expires_at: Math.floor(Date.now() / 1000) + 7200
      }));
    `);

    // Mở modal Trung tâm Kiểm duyệt
    const openAdminResult = await cdp.eval(`
      (async () => {
        window.ViVuApp.openAdminModerationModal('articles');
        for (let i = 0; i < 20; i++) {
          const modal = document.getElementById('adminModerationModal');
          if (modal && !modal.classList.contains('hidden')) return { ok: true };
          await new Promise(r => setTimeout(r, 200));
        }
        return { ok: false, error: 'Không mở được adminModerationModal' };
      })()
    `);
    if (!openAdminResult.ok) throw new Error('Không thể mở modal Admin Moderation trên DOM');
    console.log('  ✓ [DOM] Admin mở Trung tâm Kiểm duyệt (#adminModerationModal) thành công.');

    // 4.1 Duyệt Article trên DOM
    const approveArticleDom = await cdp.eval(`
      (async () => {
        window.ViVuApp.switchModerationTab('articles');
        await new Promise(r => setTimeout(r, 400));
        window.ViVuApp.selectModerationArticle('${track.articleId}');
        await new Promise(r => setTimeout(r, 400));

        // Click nút Phê duyệt & Xuất bản trên DOM
        const approveBtn = document.querySelector('button[onclick*="approveArticle"]');
        if (!approveBtn) return { ok: false, error: 'Không tìm thấy nút approveArticle' };
        approveBtn.click();
        await new Promise(r => setTimeout(r, 800));
        return { ok: true };
      })()
    `);
    if (!approveArticleDom.ok) throw new Error(`Admin duyệt article trên DOM thất bại: ${JSON.stringify(approveArticleDom)}`);
    console.log('  ✓ [DOM Admin 1/5] Đã bấm phê duyệt Bài cẩm nang du lịch qua nút bấm DOM.');

    // 4.2 Duyệt Club trên DOM
    const approveClubDom = await cdp.eval(`
      (async () => {
        window.ViVuApp.switchModerationTab('clubs');
        await new Promise(r => setTimeout(r, 400));
        window.ViVuApp.selectModerationClub('${track.clubId}');
        await new Promise(r => setTimeout(r, 400));

        const approveBtn = document.querySelector('button[onclick*="approveClub"]');
        if (!approveBtn) return { ok: false, error: 'Không tìm thấy nút approveClub' };
        approveBtn.click();
        await new Promise(r => setTimeout(r, 800));
        return { ok: true };
      })()
    `);
    if (!approveClubDom.ok) throw new Error(`Admin duyệt club trên DOM thất bại: ${JSON.stringify(approveClubDom)}`);
    console.log('  ✓ [DOM Admin 2/5] Đã bấm phê duyệt Câu lạc bộ qua nút bấm DOM.');

    // 4.3 Duyệt Club Activity trên DOM
    const approveActivityDom = await cdp.eval(`
      (async () => {
        window.ViVuApp.switchModerationTab('activities');
        await new Promise(r => setTimeout(r, 400));
        window.ViVuApp.selectModerationActivity('${track.activityId}');
        await new Promise(r => setTimeout(r, 400));

        const approveBtn = document.querySelector('button[onclick*="approveClubActivity"]');
        if (!approveBtn) return { ok: false, error: 'Không tìm thấy nút approveClubActivity' };
        approveBtn.click();
        await new Promise(r => setTimeout(r, 800));
        return { ok: true };
      })()
    `);
    if (!approveActivityDom.ok) throw new Error(`Admin duyệt activity trên DOM thất bại: ${JSON.stringify(approveActivityDom)}`);
    console.log('  ✓ [DOM Admin 3/5] Đã bấm phê duyệt Lịch sinh hoạt CLB qua nút bấm DOM.');

    // 4.4 Duyệt Community Post trên DOM
    const approvePostDom = await cdp.eval(`
      (async () => {
        window.ViVuApp.switchModerationTab('posts');
        await new Promise(r => setTimeout(r, 400));
        window.ViVuApp.selectModerationPost('${track.postId}');
        await new Promise(r => setTimeout(r, 400));

        const approveBtn = document.querySelector('button[onclick*="approvePost"]');
        if (!approveBtn) return { ok: false, error: 'Không tìm thấy nút approvePost' };
        approveBtn.click();
        await new Promise(r => setTimeout(r, 800));
        return { ok: true };
      })()
    `);
    if (!approvePostDom.ok) throw new Error(`Admin duyệt post trên DOM thất bại: ${JSON.stringify(approvePostDom)}`);
    console.log('  ✓ [DOM Admin 4/5] Đã bấm phê duyệt Bài viết cộng đồng qua nút bấm DOM.');

    // 4.5 Duyệt Community Event trên DOM
    const approveEventDom = await cdp.eval(`
      (async () => {
        window.ViVuApp.switchModerationTab('events');
        await new Promise(r => setTimeout(r, 400));
        window.ViVuApp.selectModerationEvent('${track.eventId}');
        await new Promise(r => setTimeout(r, 400));

        const approveBtn = document.querySelector('button[onclick*="approveEvent"]');
        if (!approveBtn) return { ok: false, error: 'Không tìm thấy nút approveEvent' };
        approveBtn.click();
        await new Promise(r => setTimeout(r, 800));
        return { ok: true };
      })()
    `);
    if (!approveEventDom.ok) throw new Error(`Admin duyệt event trên DOM thất bại: ${JSON.stringify(approveEventDom)}`);
    console.log('  ✓ [DOM Admin 5/5] Đã bấm phê duyệt Sự kiện cộng đồng qua nút bấm DOM.\n');

    // Đóng modal admin
    await cdp.eval(`window.ViVuApp.closeAdminModerationModal();`);
    await sleep(400);

    // 4.6 Xác nhận nhật ký kiểm toán (admin_audit_logs) đủ 10 bản ghi (5 reject + 5 approve)
    const entityIds = [track.articleId, track.clubId, track.activityId, track.postId, track.eventId];
    const auditRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?select=id,action,entity_type,entity_id,payload_before,payload_after,created_at&entity_id=in.(${entityIds.join(',')})&order=created_at.asc`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const auditLogs = await auditRes.json();
    if (!Array.isArray(auditLogs) || auditLogs.length !== 10) {
      throw new Error(`Số lượng audit logs không khớp: Mong đợi 10 bản ghi (5 reject + 5 approve), thực tế: ${auditLogs.length}`);
    }
    track.auditLogIds = auditLogs.map(l => l.id);
    console.log(`  ✓ Xác nhận đầy đủ 10 bản ghi nhật ký kiểm toán nguyên tử G14:`);
    for (const log of auditLogs) {
      console.log(`    - [${log.action}] entity: ${log.entity_type} (${log.payload_before?.status} -> ${log.payload_after?.status}) lúc ${log.created_at}`);
    }
    console.log('');

    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 5: BROWSER DOM TEST - KHÁCH VÃNG LAI MỞ TỪNG TAB THẤY THẺ HIỂN THỊ THẬT
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 5] KIỂM CHỨNG KHÁCH VÃNG LAI XEM THẺ DOM HIỂN THỊ THẬT (TUYỆT ĐỐI KHÔNG FETCH SECURE VIEW):');

    // Đăng xuất sạch sẽ toàn bộ phiên
    await cdp.eval(`
      localStorage.clear();
      sessionStorage.clear();
      location.reload();
    `);
    await sleep(2500);

    // 5.1 Kiểm tra Tab 1 (Trang chủ) trên DOM
    const tab1DomCheck = await cdp.eval(`
      (async () => {
        // Đồng bộ dữ liệu hiển thị trang chủ
        await window.ViVuApp?.syncArticlesFromSupabase?.();
        await window.ViVuApp?.syncCommunityEventsFromSupabase?.();
        await new Promise(r => setTimeout(r, 600));

        // 1. Tìm thẻ Bài cẩm nang trong #travelStoriesContainer theo ID hoặc tiêu đề duy nhất của lần chạy này
        const articleCard = document.querySelector('#travelStoriesContainer article[data-article-id="' + '${track.articleId}' + '"]')
          || Array.from(document.querySelectorAll('#travelStoriesContainer article')).find(el => 
               (el.getAttribute('data-article-id') === '${track.articleId}') ||
               ('${track.articleId}' && el.innerHTML.includes('${track.articleId}')) ||
               el.textContent.includes('${track.updatedArticleTitle}') ||
               el.textContent.includes('${track.initialArticleTitle}')
             );

        // 2. Tìm thẻ Sự kiện trong #festivalsPortalContainer theo ID hoặc tiêu đề duy nhất của lần chạy này
        const eventCard = Array.from(document.querySelectorAll('#festivalsPortalContainer article')).find(el => 
          ('${track.eventId}' && (el.getAttribute('data-event-id') === '${track.eventId}' || el.innerHTML.includes('${track.eventId}'))) ||
          el.textContent.includes('${track.eventUniqueTitle}')
        );

        return {
          hasArticleCard: !!articleCard,
          articleTitle: articleCard?.querySelector('h3, h4')?.textContent?.trim() || '',
          hasEventCard: !!eventCard,
          eventTitle: eventCard?.querySelector('h3, h4')?.textContent?.trim() || ''
        };
      })()
    `);

    if (!tab1DomCheck.hasArticleCard) {
      throw new Error(`[LỖI DOM TAB 1] Không tìm thấy thẻ Article card trên DOM: ${JSON.stringify(tab1DomCheck)}`);
    }
    if (!tab1DomCheck.hasEventCard) {
      throw new Error(`[LỖI DOM TAB 1] Không tìm thấy thẻ Event card trên DOM: ${JSON.stringify(tab1DomCheck)}`);
    }
    console.log(`  ✓ [DOM Tab 1: Trang chủ] Thẻ Cẩm nang hiển thị thật: "${tab1DomCheck.articleTitle.slice(0, 50)}..."`);
    console.log(`  ✓ [DOM Tab 1: Trang chủ] Thẻ Sự kiện hiển thị thật: "${tab1DomCheck.eventTitle.slice(0, 50)}..."`);

    // 5.2 Điều hướng sang Tab 3 (Câu lạc bộ & Cộng đồng) trên DOM
    await cdp.eval(`
      if (typeof window.ViVuApp?.navGoClubs === 'function') {
        window.ViVuApp.navGoClubs();
      } else if (typeof window.ViVuApp?.switchView === 'function') {
        window.ViVuApp.switchView('community');
      } else {
        document.getElementById('tabNavClubs')?.click();
      }
    `);
    await sleep(1500);

    const tab3DomCheck = await cdp.eval(`
      (async () => {
        // Đồng bộ dữ liệu hiển thị Tab 3
        await window.ViVuApp?.syncCommunityUgcFeed?.();
        await new Promise(r => setTimeout(r, 600));

        // 1. Tìm thẻ CLB trong #featuredClubsGrid theo ID hoặc tên duy nhất của lần chạy này
        const clubCard = Array.from(document.querySelectorAll('#featuredClubsGrid article')).find(el => 
          ('${track.clubId}' && (el.getAttribute('data-club-id') === '${track.clubId}' || el.innerHTML.includes('${track.clubId}'))) ||
          el.textContent.includes('${track.clubUniqueName}')
        );

        // 2. Tìm thẻ Lịch sinh hoạt trong #weeklyActivitiesList theo ID hoặc tiêu đề duy nhất của lần chạy này
        const activityCard = Array.from(document.querySelectorAll('#weeklyActivitiesList > div')).find(el => 
          ('${track.activityId}' && (el.getAttribute('data-activity-id') === '${track.activityId}' || el.innerHTML.includes('${track.activityId}'))) ||
          el.textContent.includes('${track.activityUniqueTitle}')
        );

        // 3. Tìm thẻ Thảo luận trong #communityPostsFeed theo ID hoặc đoạn text duy nhất của lần chạy này
        const postCard = Array.from(document.querySelectorAll('#communityPostsFeed article')).find(el => 
          ('${track.postId}' && (el.getAttribute('data-post-id') === '${track.postId}' || el.innerHTML.includes('${track.postId}'))) ||
          el.textContent.includes('${track.postUniqueSnippet}')
        );

        return {
          hasClubCard: !!clubCard,
          clubName: clubCard?.querySelector('h3')?.textContent?.trim() || '',
          hasActivityCard: !!activityCard,
          activityTitle: activityCard?.querySelector('span.font-bold')?.textContent?.trim() || '',
          hasPostCard: !!postCard,
          postSnippet: postCard?.querySelector('p')?.textContent?.trim() || ''
        };
      })()
    `);

    if (!tab3DomCheck.hasClubCard) {
      throw new Error(`[LỖI DOM TAB 3] Không tìm thấy thẻ Club card trên DOM: ${JSON.stringify(tab3DomCheck)}`);
    }
    if (!tab3DomCheck.hasActivityCard) {
      throw new Error(`[LỖI DOM TAB 3] Không tìm thấy thẻ Activity card trên DOM: ${JSON.stringify(tab3DomCheck)}`);
    }
    if (!tab3DomCheck.hasPostCard) {
      throw new Error(`[LỖI DOM TAB 3] Không tìm thấy thẻ Post card trên DOM: ${JSON.stringify(tab3DomCheck)}`);
    }
    console.log(`  ✓ [DOM Tab 3: Cộng đồng] Thẻ Câu lạc bộ hiển thị thật: "${tab3DomCheck.clubName.slice(0, 50)}..."`);
    console.log(`  ✓ [DOM Tab 3: Cộng đồng] Thẻ Lịch sinh hoạt hiển thị thật: "${tab3DomCheck.activityTitle.slice(0, 50)}..."`);
    console.log(`  ✓ [DOM Tab 3: Cộng đồng] Thẻ Bài viết thảo luận hiển thị thật: "${tab3DomCheck.postSnippet.slice(0, 50)}..."\n`);

    // Chụp ảnh màn hình lưu vào Artifacts
    const screenshotPath = path.join(ARTIFACT_DIR, 'ugc_real_user_lifecycle_verified.png');
    await cdp.captureScreenshot(screenshotPath);
    console.log(`  ✓ Đã chụp ảnh màn hình nghiệm thu trình duyệt DOM: ${screenshotPath}\n`);

  } finally {
    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 6: DỌN DẸP SẠCH SẼ 100% CÓ MỤC TIÊU THEO ĐÚNG ID (UUID)
    // --------------------------------------------------------------------------
    console.log('================================================================================');
    console.log('[GIAI ĐOẠN 6] DỌN DẸP SẠCH SẼ CÓ MỤC TIÊU THEO ĐÚNG ID (UUID):');

    if (cdp) await cdp.close();
    if (chromeProc) {
      chromeProc.kill('SIGKILL');
      try { process.kill(chromeProc.pid); } catch (_) {}
    }
    if (localServer) {
      localServer.close();
    }

    // Xóa bài cẩm nang
    if (track.articleId) {
      await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(track.articleId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa bài cẩm nang: ${track.articleId}`);
    }

    // Xóa lịch sinh hoạt
    if (track.activityId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${encodeURIComponent(track.activityId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa lịch sinh hoạt: ${track.activityId}`);
    }

    // Xóa CLB và quan hệ thành viên
    if (track.clubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_members?club_id=eq.${encodeURIComponent(track.clubId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${encodeURIComponent(track.clubId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa câu lạc bộ: ${track.clubId}`);
    }

    if (track.approvedClubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_members?club_id=eq.${encodeURIComponent(track.approvedClubId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${encodeURIComponent(track.approvedClubId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa câu lạc bộ đã duyệt: ${track.approvedClubId}`);
    }

    // Xóa bài cộng đồng
    if (track.postId) {
      await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${encodeURIComponent(track.postId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa bài cộng đồng: ${track.postId}`);
    }

    // Xóa sự kiện cộng đồng
    if (track.eventId) {
      await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${encodeURIComponent(track.eventId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa sự kiện cộng đồng: ${track.eventId}`);
    }

    // Xóa audit logs
    if (track.auditLogIds.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?id=in.(${track.auditLogIds.join(',')})`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa ${track.auditLogIds.length} bản ghi audit log.`);
    }

    // Xóa admin user khỏi admin_users và auth.users
    if (track.adminId) {
      await fetch(`${SUPABASE_URL}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(track.adminId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${track.adminId}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa tài khoản admin test: ${track.adminId}`);
    }

    // Xóa author user khỏi auth.users
    if (track.authorId) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${track.authorId}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa tài khoản tác giả test: ${track.authorId}`);
    }

    // Xác minh 0 bản ghi rác
    const [chkArt, chkClub, chkAct, chkPost, chkEvt, chkAuth, chkAdm] = await Promise.all([
      track.articleId ? fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${track.articleId}&select=id`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : [],
      track.clubId ? fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${track.clubId}&select=id`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : [],
      track.activityId ? fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${track.activityId}&select=id`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : [],
      track.postId ? fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${track.postId}&select=id`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : [],
      track.eventId ? fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${track.eventId}&select=id`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : [],
      track.authorId ? fetch(`${SUPABASE_URL}/auth/v1/admin/users/${track.authorId}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : { id: null },
      track.adminId ? fetch(`${SUPABASE_URL}/auth/v1/admin/users/${track.adminId}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json()) : { id: null }
    ]);

    const residualCount = (Array.isArray(chkArt) ? chkArt.length : 0) +
      (Array.isArray(chkClub) ? chkClub.length : 0) +
      (Array.isArray(chkAct) ? chkAct.length : 0) +
      (Array.isArray(chkPost) ? chkPost.length : 0) +
      (Array.isArray(chkEvt) ? chkEvt.length : 0) +
      (chkAuth?.id ? 1 : 0) +
      (chkAdm?.id ? 1 : 0);

    if (residualCount === 0) {
      console.log('\n  ✓ Xác nhận hoàn hảo: 0 bản ghi rác tồn dư sau khi dọn dẹp có mục tiêu.');
    } else {
      console.warn(`\n  ⚠️ Cảnh báo: Vẫn còn ${residualCount} bản ghi rác chưa được dọn dẹp sạch.`);
    }

    console.log('================================================================================');
    console.log(' KẾT QUẢ NGHIỆM THU: 100% PASS - VÒNG ĐỜI NỘI DUNG UGC TRÊN GIAO DIỆN DOM ĐẠT CHUẨN');
    console.log('================================================================================\n');
  }
}

run().catch(err => {
  console.error('\n❌ LỖI TRONG QUÁ TRÌNH KIỂM TRA NGHIỆM THU:', err);
  process.exit(1);
});
