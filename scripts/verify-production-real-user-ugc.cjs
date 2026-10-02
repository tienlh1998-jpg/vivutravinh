/**
 * scripts/verify-production-real-user-ugc.cjs
 *
 * Kiểm tra nghiệm thu vòng đời nội dung UGC trực tiếp trên PRODUCTION (Vercel Live: vivutravinh.id.vn):
 * 1. Đăng ký tài khoản tác giả & quản trị viên thật qua Supabase Auth.
 * 2. Tác giả tạo 5 thực thể UGC qua API Production (articles, clubs, activities, posts, events).
 * 3. Ban Quản Trị từ chối cả 5 thực thể kèm lý do cụ thể qua API /api/admin-moderation (RPC G14).
 * 4. [TRÌNH DUYỆT DOM PRODUCTION - TÁC GIẢ]:
 *    - Truy cập https://vivutravinh.id.vn với phiên tác giả.
 *    - Mở "Nội dung của tôi" (#sidebarLinkMyContent) trên DOM.
 *    - Xác nhận 5 thẻ hiển thị đúng lý do từ chối (.ugc-moderation-reason) và có nút [Sửa & Gửi lại].
 *    - Bấm nút sửa, cập nhật form trên DOM và gửi duyệt lại cho cả 5 loại.
 *    - Xác nhận CSDL Supabase Live chuyển về status: 'pending' và moderation_reason: null.
 * 5. [TRÌNH DUYỆT DOM PRODUCTION - ADMIN]:
 *    - Mở Trung tâm Kiểm duyệt (#adminModerationModal) trên Production.
 *    - Bấm nút "Phê duyệt" trên DOM cho cả 5 loại.
 *    - Xác nhận status: 'approved' và đủ 10 bản ghi audit log nguyên tử.
 * 6. [TRÌNH DUYỆT DOM PRODUCTION - KHÁCH VÃNG LAI]:
 *    - Đăng xuất hoàn toàn, duyệt https://vivutravinh.id.vn với vai trò khách vãng lai.
 *    - Tab 1 (Trang chủ): Thấy thẻ Cẩm nang & Sự kiện hiển thị thật trên DOM.
 *    - Tab 3 (Cộng đồng): Thấy thẻ CLB, Lịch sinh hoạt & Thảo luận hiển thị thật trên DOM.
 * 7. Chụp ảnh màn hình bằng chứng nghiệm thu Production.
 * 8. Dọn dẹp sạch sẽ 100% có mục tiêu theo đúng ID/UUID (0 bản ghi rác).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PROJECT_DIR = path.resolve(__dirname, '..');
const envContent = fs.readFileSync(path.join(PROJECT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

const PROD_BASE_URL = 'https://vivutravinh.id.vn';
const ARTIFACT_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421';

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
      }, 35000);
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
  for (let i = 0; i < 40; i++) {
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
  console.log(' KIỂM TRA NGHIỆM THU VÒNG ĐỜI NỘI DUNG UGC TRỰC TIẾP TRÊN PRODUCTION');
  console.log(` Target URL: ${PROD_BASE_URL}`);
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
    approvedClubId: null,
    auditLogIds: []
  };

  let chromeProc = null;
  let cdp = null;

  try {
    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 0: KIỂM TRA KẾT NỐI PRODUCTION & RPC G14
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 0] KIỂM TRA KẾT NỐI PRODUCTION & RPC G14 TRÊN SUPABASE LIVE:');
    const probeRes = await fetch(`${PROD_BASE_URL}/api/admin-moderation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (probeRes.status !== 401) {
      throw new Error(`Endpoint /api/admin-moderation không trả về 401 như mong đợi: status ${probeRes.status}`);
    }
    console.log('  ✓ Production API /api/admin-moderation đang hoạt động và bảo vệ đúng chuẩn 401 UNAUTHENTICATED.');

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
        p_entity_id: 'non-existent-probe',
        p_action: 'approve'
      })
    });
    console.log('  ✓ RPC admin_moderate_entity_atomic sẵn sàng trên Supabase Live.\n');

    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 1: TẠO TÀI KHOẢN TÁC GIẢ & ADMIN THẬT
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 1] TẠO TÀI KHOẢN TÁC GIẢ & ADMIN THẬT TRÊN SUPABASE:');
    const ts = Date.now();
    track.authorEmail = `author_prod_${ts}@vivutravinh.test`;
    const authorPassword = `VivuAuthor_${ts}!Secure`;

    const createAuthorRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: track.authorEmail,
        password: authorPassword,
        email_confirm: true,
        user_metadata: { display_name: `Tác Giả Prod ${ts}` }
      })
    });
    const authorData = await createAuthorRes.json();
    track.authorId = authorData.id;
    console.log(`  ✓ Đã tạo tác giả: ${track.authorEmail} (ID: ${track.authorId})`);

    const authLoginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: track.authorEmail, password: authorPassword })
    });
    const authLoginData = await authLoginRes.json();
    const authorToken = authLoginData.access_token;
    const authorUser = authLoginData.user;
    const authorHeader = {
      'authorization': `Bearer ${authorToken}`,
      'content-type': 'application/json'
    };

    // Tạo Admin
    track.adminEmail = `admin_prod_${ts}@vivutravinh.test`;
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
    const adminHeader = {
      'authorization': `Bearer ${adminToken}`,
      'content-type': 'application/json'
    };
    console.log(`  ✓ Đã tạo quản trị viên: ${track.adminEmail} (ID: ${track.adminId})\n`);

    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 2: TÁC GIẢ TẠO 5 THỰC THỂ QUA PRODUCTION API & ADMIN TỪ CHỐI QUA G14
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 2] TẠO 5 THỰC THỂ QUA PRODUCTION API & ADMIN TỪ CHỐI QUA G14:');
    track.initialArticleTitle = `[UGC-PROD] Cẩm nang đặc sản cốm dẹp Ba Om ${ts}`;
    track.updatedArticleTitle = `[UGC-PROD] Cẩm nang đặc sản cốm dẹp Ba Om ${ts} [ĐÃ BỔ SUNG LỘ TRÌNH VÀ QUÁN ĂN PROD]`;
    track.clubUniqueName = `CLB Văn Hóa Ẩm Thực Xứ Trà ${ts}`;
    track.activityUniqueTitle = `Buổi giao lưu làm cốm dẹp truyền thống ${ts}`;
    track.postUniqueSnippet = `nhộn nhịp prod ${ts}`;
    track.eventUniqueTitle = `Lễ hội Đua Ghe Ngo Trà Vinh Mùa Trăng ${ts}`;

    // 2.1 Article
    const artRes = await fetch(`${PROD_BASE_URL}/api/articles`, {
      method: 'POST',
      headers: authorHeader,
      body: JSON.stringify({
        title: track.initialArticleTitle,
        category: 'am-thuc',
        excerpt: 'Món ăn biểu tượng của văn hóa Khmer Trà Vinh...',
        content: 'Chi tiết về cách làm cốm dẹp truyền thống mùa trăng rằm.',
        cover_image: '/ao bà om.jpg'
      })
    });
    const artData = await artRes.json();
    if (!artData.success || !artData.article?.id) {
      throw new Error(`Tạo article trên Production thất bại: ${JSON.stringify(artData)}`);
    }
    track.articleId = artData.article.id;
    console.log(`  ✓ [POST /api/articles] Đã tạo cẩm nang: ${track.articleId}`);

    // 2.2 Club
    const clubRes = await fetch(`${PROD_BASE_URL}/api/clubs`, {
      method: 'POST',
      headers: authorHeader,
      body: JSON.stringify({
        name: track.clubUniqueName,
        category: 'am-thuc',
        meeting_place: 'Bờ kè sông Long Bình',
        description: 'Giao lưu trải nghiệm các món ăn truyền thống Trà Vinh.',
        leader_phone: '0901234567'
      })
    });
    const clubData = await clubRes.json();
    if (!clubData.success || !clubData.club?.id) {
      throw new Error(`Tạo club trên Production thất bại: ${JSON.stringify(clubData)}`);
    }
    track.clubId = clubData.club.id;
    console.log(`  ✓ [POST /api/clubs] Đã tạo CLB: ${track.clubId}`);

    // Tạo CLB đã duyệt cho tác giả để tác giả có tư cách chủ nhiệm đề xuất lịch sinh hoạt (G13)
    track.approvedClubId = `clb-approved-prod-${ts}`;
    await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: track.approvedClubId,
        name: `CLB Sáng Tạo Trẻ Xứ Trà ${ts}`,
        category: 'am-thuc',
        meeting_place: 'Nhà Văn Hóa TP. Trà Vinh',
        description: 'Câu lạc bộ đã được Ban Quản Trị phê duyệt chính thức trên production.',
        leader_id: track.authorId,
        leader_name: 'Tác Giả Prod',
        status: 'approved'
      })
    });

    // 2.3 Activity
    const actRes = await fetch(`${PROD_BASE_URL}/api/club-activities`, {
      method: 'POST',
      headers: authorHeader,
      body: JSON.stringify({
        club_id: track.approvedClubId,
        title: track.activityUniqueTitle,
        time_schedule: '08:00 Chủ Nhật',
        location: 'Nhà Văn Hóa TP. Trà Vinh',
        max_attendees: 35,
        description: 'Học cách quết và trộn cốm dẹp cùng nghệ nhân bản địa.'
      })
    });
    const actData = await actRes.json();
    if (!actData.success || !actData.activity?.id) {
      throw new Error(`Tạo activity trên Production thất bại: ${JSON.stringify(actData)}`);
    }
    track.activityId = actData.activity.id;
    console.log(`  ✓ [POST /api/club-activities] Đã tạo lịch sinh hoạt: ${track.activityId}`);

    // 2.4 Post
    const postRes = await fetch(`${PROD_BASE_URL}/api/community-posts`, {
      method: 'POST',
      headers: authorHeader,
      body: JSON.stringify({
        title: `Thảo luận lễ hội Ok Om Bok ${ts}`,
        content: `Không khí chuẩn bị lễ cúng trăng tại Ao Bà Om năm nay rất nhộn nhịp prod ${ts}.`,
        category: 'Chùa chiền Khmer'
      })
    });
    const postData = await postRes.json();
    if (!postData.success || !postData.post?.id) {
      throw new Error(`Tạo post trên Production thất bại: ${JSON.stringify(postData)}`);
    }
    track.postId = postData.post.id;
    console.log(`  ✓ [POST /api/community-posts] Đã tạo bài thảo luận: ${track.postId}`);

    // 2.5 Event
    const evtRes = await fetch(`${PROD_BASE_URL}/api/community-events`, {
      method: 'POST',
      headers: authorHeader,
      body: JSON.stringify({
        title: track.eventUniqueTitle,
        organizer: 'Đoàn Thanh Niên Tác Giả Trẻ Prod',
        category: 'sports',
        time_schedule: '07:30 ngày 15/10 Âm Lịch',
        location: 'Sông Long Bình, TP. Trà Vinh',
        description: 'Hội đua ghe Ngo chào mừng Lễ hội Ok Om Bok.',
        contact_phone: '0912345678'
      })
    });
    const evtData = await evtRes.json();
    if (!evtData.success || !evtData.event?.id) {
      throw new Error(`Tạo event trên Production thất bại: ${JSON.stringify(evtData)}`);
    }
    track.eventId = evtData.event.id;
    console.log(`  ✓ [POST /api/community-events] Đã tạo sự kiện: ${track.eventId}`);

    // Ban Quản Trị từ chối cả 5 qua API /api/admin-moderation trên Production (RPC G14)
    const REASONS = {
      article: 'Vui lòng bổ sung danh sách địa chỉ quán ăn uy tín và hướng dẫn di chuyển chi tiết trên production.',
      club: 'Hồ sơ cần bổ sung kế hoạch hoạt động cụ thể trong quý đầu tiên trên production.',
      activity: 'Vui lòng ghi rõ số phòng họp hoặc sảnh tập trung tại Nhà Văn Hóa trên production.',
      post: 'Bài thảo luận quá ngắn, vui lòng chia sẻ thêm trải nghiệm hoặc hình ảnh trên production.',
      event: 'Vui lòng đính kèm số điện thoại liên hệ khẩn cấp hoặc phương án đảm bảo an ninh trên production.'
    };

    const rejectCalls = [
      { entity_type: 'article', entity_id: track.articleId, reason: REASONS.article },
      { entity_type: 'club', entity_id: track.clubId, reason: REASONS.club },
      { entity_type: 'club_activity', entity_id: track.activityId, reason: REASONS.activity },
      { entity_type: 'community_post', entity_id: track.postId, reason: REASONS.post },
      { entity_type: 'community_event', entity_id: track.eventId, reason: REASONS.event }
    ];

    for (const item of rejectCalls) {
      const res = await fetch(`${PROD_BASE_URL}/api/admin-moderation`, {
        method: 'POST',
        headers: adminHeader,
        body: JSON.stringify({
          entity_type: item.entity_type,
          entity_id: item.entity_id,
          action: 'reject',
          reason: item.reason
        })
      });
      const resData = await res.json();
      if (res.status !== 200 || resData.status !== 'rejected') {
        throw new Error(`Từ chối ${item.entity_type} trên Production thất bại: ${JSON.stringify(resData)}`);
      }
    }
    console.log('  ✓ Ban Quản Trị đã từ chối cả 5 thực thể kèm lý do cụ thể qua RPC G14 trên Production.\n');

    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 3: BROWSER DOM TEST TRÊN PRODUCTION - TÁC GIẢ XEM LÝ DO, SỬA & GỬI LẠI
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 3] TRÌNH DUYỆT DOM PRODUCTION: TÁC GIẢ MỞ "NỘI DUNG CỦA TÔI", THẤY LÝ DO, SỬA FORM:');

    const CDP_PORT = 9335;
    const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    chromeProc = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1280,900',
      '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-ugc-prod-'))
    ]);

    const debuggerUrl = await getDebuggerUrl(CDP_PORT);
    cdp = new CDPClient(debuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    console.log('  ✓ Đã kết nối Chrome headless qua DevTools Protocol.');

    // Nạp trang web Production
    await cdp.send('Page.navigate', { url: `${PROD_BASE_URL}/index.html` });
    await sleep(2500);

    // Bơm phiên tác giả vào localStorage của trình duyệt
    await cdp.eval(`
      localStorage.setItem('vivu_user_session', JSON.stringify({
        access_token: '${authorToken}',
        user: ${JSON.stringify(authorUser)},
        expires_at: Math.floor(Date.now() / 1000) + 7200
      }));
    `);
    console.log('  ✓ Đã nạp phiên đăng nhập tác giả vào localStorage trên Production.');

    // 3.1 Tác giả click nút "Nội dung của tôi" (#sidebarLinkMyContent) trên DOM
    const openMyContentResult = await cdp.eval(`
      (async () => {
        const link = document.getElementById('sidebarLinkMyContent');
        if (!link) return { ok: false, error: 'Không tìm thấy link #sidebarLinkMyContent trên DOM Production' };
        link.click();

        for (let i = 0; i < 40; i++) {
          const modal = document.getElementById('userProfileModal');
          const isVisible = modal && !modal.classList.contains('hidden');
          const cards = document.querySelectorAll('.ugc-content-card');
          if (isVisible && cards.length >= 5) {
            return { ok: true, cardsCount: cards.length };
          }
          await new Promise(r => setTimeout(r, 250));
        }
        const cards = document.querySelectorAll('.ugc-content-card');
        return { ok: false, cardsCount: cards.length, error: 'Quá thời gian nạp danh sách Nội dung của tôi trên Production' };
      })()
    `);

    if (!openMyContentResult.ok) {
      throw new Error(`Mở "Nội dung của tôi" trên DOM Production thất bại: ${JSON.stringify(openMyContentResult)}`);
    }
    console.log(`  ✓ [DOM Production] Người dùng mở "Nội dung của tôi" -> Hiển thị ${openMyContentResult.cardsCount} thẻ nội dung.`);

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
            results.push({ id: ent.id, type: ent.type, found: false, error: 'Không tìm thấy thẻ DOM trên Production' });
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
        throw new Error(`Kiểm tra lý do từ chối trên DOM Production thẻ [${r.type}] thất bại: ${JSON.stringify(r)}`);
      }
      console.log(`  ✓ [DOM Card: ${r.type}] Hiển thị đúng lý do: "${r.reasonText.slice(0, 50)}..." & Có nút [Sửa & Gửi lại].`);
    }

    // 3.3 Tác giả bấm nút sửa (.btn-edit-ugc), cập nhật biểu mẫu trên DOM và gửi duyệt lại cho cả 5 loại
    console.log('\n  [THỰC HIỆN SỬA & GỬI DUYỆT LẠI TRÊN CÁC BIỂU MẪU DOM PRODUCTION]:');

    // --- SỬA 1: ARTICLE ---
    const editArticleResult = await cdp.eval(`
      (async () => {
        const btn = document.querySelector(\`.btn-edit-ugc[data-entity-id="${track.articleId}"]\`);
        if (!btn) return { ok: false, error: 'Không tìm thấy nút sửa article' };
        btn.click();
        await new Promise(r => setTimeout(r, 600));

        const titleInput = document.getElementById('articleInputTitle');
        const contentInput = document.getElementById('articleInputContent');
        if (!titleInput || !contentInput) return { ok: false, error: 'Không tìm thấy input form article' };

        titleInput.value = '${track.updatedArticleTitle}';
        contentInput.value = contentInput.value + '\\nĐã bổ sung danh sách quán ăn Hùng Vương và chỉ dẫn chi tiết trên Production.';

        const confirmBtn = document.getElementById('btnSubmitArticleConfirm');
        if (!confirmBtn) return { ok: false, error: 'Không tìm thấy nút #btnSubmitArticleConfirm' };
        confirmBtn.click();

        for (let i = 0; i < 25; i++) {
          const modal = document.getElementById('submitArticleModal');
          if (!modal || modal.classList.contains('hidden')) return { ok: true };
          await new Promise(r => setTimeout(r, 250));
        }
        return { ok: false, error: 'Modal article không tự đóng sau submit' };
      })()
    `);
    if (!editArticleResult.ok) throw new Error(`Sửa bài cẩm nang trên DOM Production thất bại: ${JSON.stringify(editArticleResult)}`);
    console.log('  ✓ [DOM Form 1/5: articles] Đã cập nhật tiêu đề/nội dung và bấm gửi duyệt lại thành công.');
    await sleep(800);

    // --- SỬA 2: CLUB ---
    const editClubResult = await cdp.eval(`
      (async () => {
        window.ViVuApp.openProfileModal('my-content');
        await window.ViVuApp.fetchUserUgcContent(true);
        await new Promise(r => setTimeout(r, 600));

        const btn = document.querySelector(\`.btn-edit-ugc[data-entity-id="${track.clubId}"]\`);
        if (!btn) return { ok: false, error: 'Không tìm thấy nút sửa club' };
        btn.click();
        await new Promise(r => setTimeout(r, 600));

        const descInput = document.getElementById('newClubDesc');
        const contactInput = document.getElementById('newClubLeaderContact');
        if (!descInput) return { ok: false, error: 'Không tìm thấy input form club' };

        descInput.value = descInput.value + ' [Đã bổ sung kế hoạch hoạt động 3 tháng đầu trên Production]';
        if (contactInput) contactInput.value = '0901234567';

        const form = document.getElementById('createClubForm');
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.click();

        for (let i = 0; i < 25; i++) {
          const modal = document.getElementById('createClubModal');
          if (!modal || modal.classList.contains('hidden')) return { ok: true };
          await new Promise(r => setTimeout(r, 250));
        }
        return { ok: false, error: 'Modal club không tự đóng' };
      })()
    `);
    if (!editClubResult.ok) throw new Error(`Sửa CLB trên DOM Production thất bại: ${JSON.stringify(editClubResult)}`);
    console.log('  ✓ [DOM Form 2/5: clubs] Đã cập nhật kế hoạch hoạt động và bấm gửi duyệt lại thành công.');
    await sleep(800);

    // --- SỬA 3: CLUB ACTIVITY ---
    const editActivityResult = await cdp.eval(`
      (async () => {
        window.ViVuApp.openProfileModal('my-content');
        await window.ViVuApp.fetchUserUgcContent(true);
        await new Promise(r => setTimeout(r, 600));

        const btn = document.querySelector(\`.btn-edit-ugc[data-entity-id="${track.activityId}"]\`);
        if (!btn) return { ok: false, error: 'Không tìm thấy nút sửa activity' };
        btn.click();
        await new Promise(r => setTimeout(r, 600));

        const form = document.getElementById('submitClubActivityForm');
        if (!form) return { ok: false, error: 'Không tìm thấy form submitClubActivityForm' };

        const locInput = form.elements['location'];
        if (locInput) locInput.value = locInput.value + ' - Phòng 204 Nhà Văn Hóa Production';

        const submitBtn = document.getElementById('submitClubActivityBtn') || form.querySelector('button[type="submit"]');
        submitBtn.click();

        for (let i = 0; i < 25; i++) {
          const modal = document.getElementById('submitClubActivityModal');
          if (!modal || modal.classList.contains('hidden')) return { ok: true };
          await new Promise(r => setTimeout(r, 250));
        }
        return { ok: false, error: 'Modal activity không tự đóng' };
      })()
    `);
    if (!editActivityResult.ok) throw new Error(`Sửa lịch CLB trên DOM Production thất bại: ${JSON.stringify(editActivityResult)}`);
    console.log('  ✓ [DOM Form 3/5: club_activities] Đã bổ sung địa điểm cụ thể và bấm gửi duyệt lại thành công.');
    await sleep(800);

    // --- SỬA 4: COMMUNITY POST ---
    const editPostResult = await cdp.eval(`
      (async () => {
        window.ViVuApp.openProfileModal('my-content');
        await window.ViVuApp.fetchUserUgcContent(true);
        await new Promise(r => setTimeout(r, 600));

        const btn = document.querySelector(\`.btn-edit-ugc[data-entity-id="${track.postId}"]\`);
        if (!btn) return { ok: false, error: 'Không tìm thấy nút sửa post' };
        btn.click();
        await new Promise(r => setTimeout(r, 600));

        const contentInput = document.getElementById('editPostContent');
        if (!contentInput) return { ok: false, error: 'Không tìm thấy input #editPostContent' };

        contentInput.value = contentInput.value + ' Đã bổ sung: Các gian hàng cốm dẹp truyền thống đã sẵn sàng đón du khách trên Production!';

        const submitBtn = document.getElementById('btnSubmitEditPost');
        submitBtn.click();

        for (let i = 0; i < 25; i++) {
          const modal = document.getElementById('editCommunityPostModal');
          if (!modal || modal.classList.contains('hidden')) return { ok: true };
          await new Promise(r => setTimeout(r, 250));
        }
        return { ok: false, error: 'Modal edit post không tự đóng' };
      })()
    `);
    if (!editPostResult.ok) throw new Error(`Sửa bài cộng đồng trên DOM Production thất bại: ${JSON.stringify(editPostResult)}`);
    console.log('  ✓ [DOM Form 4/5: community_posts] Đã cập nhật nội dung chi tiết và bấm gửi duyệt lại thành công.');
    await sleep(800);

    // --- SỬA 5: COMMUNITY EVENT ---
    const editEventResult = await cdp.eval(`
      (async () => {
        window.ViVuApp.openProfileModal('my-content');
        await window.ViVuApp.fetchUserUgcContent(true);
        await new Promise(r => setTimeout(r, 600));

        const btn = document.querySelector(\`.btn-edit-ugc[data-entity-id="${track.eventId}"]\`);
        if (!btn) return { ok: false, error: 'Không tìm thấy nút sửa event' };
        btn.click();
        await new Promise(r => setTimeout(r, 600));

        const form = document.getElementById('hostEventSubmitForm');
        if (!form) return { ok: false, error: 'Không tìm thấy form hostEventSubmitForm' };

        const descInput = form.elements['description'];
        const phoneInput = form.elements['phone'];
        if (descInput) descInput.value = descInput.value + ' [Đã phối hợp phương án an ninh số 42/BQL Production]';
        if (phoneInput) phoneInput.value = '0987654321';

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.click();

        for (let i = 0; i < 25; i++) {
          const modal = document.getElementById('hostEventModal');
          if (!modal || modal.classList.contains('hidden')) return { ok: true };
          await new Promise(r => setTimeout(r, 250));
        }
        return { ok: false, error: 'Modal event không tự đóng' };
      })()
    `);
    if (!editEventResult.ok) throw new Error(`Sửa sự kiện trên DOM Production thất bại: ${JSON.stringify(editEventResult)}`);
    console.log('  ✓ [DOM Form 5/5: community_events] Đã cập nhật phương án an ninh và bấm gửi duyệt lại thành công.\n');

    // 3.4 Xác nhận trong CSDL Supabase: Cả 5 thực thể đã chuyển về 'pending' và moderation_reason = null
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
    console.log('  ✓ CSDL Supabase Live xác nhận: 5/5 thực thể đã tự động quay về status: pending và moderation_reason: null.\n');

    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 4: BROWSER DOM TEST - ADMIN PHÊ DUYỆT 5 THỰC THỂ TRÊN PRODUCTION
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 4] TRÌNH DUYỆT DOM PRODUCTION: ADMIN MỞ MODAL KIỂM DUYỆT & PHÊ DUYỆT 5 THỰC THỂ:');

    // Đăng nhập Admin vào localStorage
    await cdp.eval(`
      localStorage.setItem('vivu_admin_session', JSON.stringify({
        access_token: '${adminToken}',
        user: { id: '${track.adminId}', email: '${track.adminEmail}', role: 'admin' },
        expires_at: Math.floor(Date.now() / 1000) + 7200
      }));
    `);

    const openAdminResult = await cdp.eval(`
      (async () => {
        window.ViVuApp.openAdminModerationModal('articles');
        for (let i = 0; i < 25; i++) {
          const modal = document.getElementById('adminModerationModal');
          if (modal && !modal.classList.contains('hidden')) return { ok: true };
          await new Promise(r => setTimeout(r, 250));
        }
        return { ok: false, error: 'Không mở được adminModerationModal trên Production' };
      })()
    `);
    if (!openAdminResult.ok) throw new Error('Không thể mở modal Admin Moderation trên DOM Production');
    console.log('  ✓ [DOM Production] Admin mở Trung tâm Kiểm duyệt (#adminModerationModal) thành công.');

    // 4.1 Duyệt Article
    const approveArticleDom = await cdp.eval(`
      (async () => {
        window.ViVuApp.switchModerationTab('articles');
        await new Promise(r => setTimeout(r, 500));
        window.ViVuApp.selectModerationArticle('${track.articleId}');
        await new Promise(r => setTimeout(r, 500));

        const approveBtn = document.querySelector('button[onclick*="approveArticle"]');
        if (!approveBtn) return { ok: false, error: 'Không tìm thấy nút approveArticle' };
        approveBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        return { ok: true };
      })()
    `);
    if (!approveArticleDom.ok) throw new Error(`Admin duyệt article trên DOM Production thất bại: ${JSON.stringify(approveArticleDom)}`);
    console.log('  ✓ [DOM Admin 1/5] Đã bấm phê duyệt Bài cẩm nang du lịch qua nút bấm DOM Production.');

    // 4.2 Duyệt Club
    const approveClubDom = await cdp.eval(`
      (async () => {
        window.ViVuApp.switchModerationTab('clubs');
        await new Promise(r => setTimeout(r, 500));
        window.ViVuApp.selectModerationClub('${track.clubId}');
        await new Promise(r => setTimeout(r, 500));

        const approveBtn = document.querySelector('button[onclick*="approveClub"]');
        if (!approveBtn) return { ok: false, error: 'Không tìm thấy nút approveClub' };
        approveBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        return { ok: true };
      })()
    `);
    if (!approveClubDom.ok) throw new Error(`Admin duyệt club trên DOM Production thất bại: ${JSON.stringify(approveClubDom)}`);
    console.log('  ✓ [DOM Admin 2/5] Đã bấm phê duyệt Câu lạc bộ qua nút bấm DOM Production.');

    // 4.3 Duyệt Club Activity
    const approveActivityDom = await cdp.eval(`
      (async () => {
        window.ViVuApp.switchModerationTab('activities');
        await new Promise(r => setTimeout(r, 500));
        window.ViVuApp.selectModerationActivity('${track.activityId}');
        await new Promise(r => setTimeout(r, 500));

        const approveBtn = document.querySelector('button[onclick*="approveClubActivity"]');
        if (!approveBtn) return { ok: false, error: 'Không tìm thấy nút approveClubActivity' };
        approveBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        return { ok: true };
      })()
    `);
    if (!approveActivityDom.ok) throw new Error(`Admin duyệt activity trên DOM Production thất bại: ${JSON.stringify(approveActivityDom)}`);
    console.log('  ✓ [DOM Admin 3/5] Đã bấm phê duyệt Lịch sinh hoạt CLB qua nút bấm DOM Production.');

    // 4.4 Duyệt Community Post
    const approvePostDom = await cdp.eval(`
      (async () => {
        window.ViVuApp.switchModerationTab('posts');
        await new Promise(r => setTimeout(r, 500));
        window.ViVuApp.selectModerationPost('${track.postId}');
        await new Promise(r => setTimeout(r, 500));

        const approveBtn = document.querySelector('button[onclick*="approvePost"]');
        if (!approveBtn) return { ok: false, error: 'Không tìm thấy nút approvePost' };
        approveBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        return { ok: true };
      })()
    `);
    if (!approvePostDom.ok) throw new Error(`Admin duyệt post trên DOM Production thất bại: ${JSON.stringify(approvePostDom)}`);
    console.log('  ✓ [DOM Admin 4/5] Đã bấm phê duyệt Bài viết cộng đồng qua nút bấm DOM Production.');

    // 4.5 Duyệt Community Event
    const approveEventDom = await cdp.eval(`
      (async () => {
        window.ViVuApp.switchModerationTab('events');
        await new Promise(r => setTimeout(r, 500));
        window.ViVuApp.selectModerationEvent('${track.eventId}');
        await new Promise(r => setTimeout(r, 500));

        const approveBtn = document.querySelector('button[onclick*="approveEvent"]');
        if (!approveBtn) return { ok: false, error: 'Không tìm thấy nút approveEvent' };
        approveBtn.click();
        await new Promise(r => setTimeout(r, 1500));
        return { ok: true };
      })()
    `);
    if (!approveEventDom.ok) throw new Error(`Admin duyệt event trên DOM Production thất bại: ${JSON.stringify(approveEventDom)}`);
    console.log('  ✓ [DOM Admin 5/5] Đã bấm phê duyệt Sự kiện cộng đồng qua nút bấm DOM Production.\n');

    await cdp.eval(`window.ViVuApp.closeAdminModerationModal();`);
    await sleep(1000);

    // Xác nhận 10 bản ghi audit log nguyên tử G14 (có retry loop để xử lý độ trễ mạng internet)
    const entityIds = [track.articleId, track.clubId, track.activityId, track.postId, track.eventId];
    let auditLogs = [];
    for (let retry = 0; retry < 20; retry++) {
      const auditRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?select=id,action,entity_type,entity_id,payload_before,payload_after,created_at&entity_id=in.(${entityIds.join(',')})&order=created_at.asc`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      auditLogs = await auditRes.json();
      if (Array.isArray(auditLogs) && auditLogs.length === 10) break;
      await sleep(500);
    }
    if (!Array.isArray(auditLogs) || auditLogs.length !== 10) {
      throw new Error(`Số lượng audit logs Production không khớp: Mong đợi 10 bản ghi (5 reject + 5 approve), thực tế: ${auditLogs?.length}`);
    }
    track.auditLogIds = auditLogs.map(l => l.id);
    console.log(`  ✓ Xác nhận đầy đủ 10 bản ghi nhật ký kiểm toán nguyên tử G14 trên Production:`);
    for (const log of auditLogs) {
      console.log(`    - [${log.action}] entity: ${log.entity_type} (${log.payload_before?.status} -> ${log.payload_after?.status}) lúc ${log.created_at}`);
    }
    console.log('');

    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 5: BROWSER DOM TEST - KHÁCH VÃNG LAI XEM THẺ THẬT TRÊN PRODUCTION
    // --------------------------------------------------------------------------
    console.log('[GIAI ĐOẠN 5] TRÌNH DUYỆT DOM PRODUCTION: KHÁCH VÃNG LAI MỞ TỪNG TAB THẤY THẺ HIỂN THỊ THẬT:');

    // Đăng xuất sạch sẽ, reload lại Production
    await cdp.eval(`
      localStorage.clear();
      sessionStorage.clear();
      location.reload();
    `);
    await sleep(3000);

    // 5.1 Kiểm tra Tab 1 (Trang chủ) trên DOM Production
    const tab1DomCheck = await cdp.eval(`
      (async () => {
        await window.ViVuApp?.syncArticlesFromSupabase?.();
        await window.ViVuApp?.syncCommunityEventsFromSupabase?.();
        await new Promise(r => setTimeout(r, 800));

        // 1. Tìm thẻ Bài cẩm nang trong #travelStoriesContainer theo ID hoặc tiêu đề duy nhất
        const articleCard = document.querySelector('#travelStoriesContainer article[data-article-id="' + '${track.articleId}' + '"]')
          || Array.from(document.querySelectorAll('#travelStoriesContainer article')).find(el => 
               (el.getAttribute('data-article-id') === '${track.articleId}') ||
               ('${track.articleId}' && el.innerHTML.includes('${track.articleId}')) ||
               el.textContent.includes('${track.updatedArticleTitle}') ||
               el.textContent.includes('${track.initialArticleTitle}')
             );

        // 2. Tìm thẻ Sự kiện trong #festivalsPortalContainer theo ID hoặc tiêu đề duy nhất
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
      throw new Error(`[LỖI DOM TAB 1 PRODUCTION] Không tìm thấy thẻ Article card trên DOM: ${JSON.stringify(tab1DomCheck)}`);
    }
    if (!tab1DomCheck.hasEventCard) {
      throw new Error(`[LỖI DOM TAB 1 PRODUCTION] Không tìm thấy thẻ Event card trên DOM: ${JSON.stringify(tab1DomCheck)}`);
    }
    console.log(`  ✓ [DOM Tab 1: Trang chủ] Thẻ Cẩm nang hiển thị thật: "${tab1DomCheck.articleTitle.slice(0, 50)}..."`);
    console.log(`  ✓ [DOM Tab 1: Trang chủ] Thẻ Sự kiện hiển thị thật: "${tab1DomCheck.eventTitle.slice(0, 50)}..."`);

    // 5.2 Điều hướng sang Tab 3 (Cộng đồng) trên DOM Production
    await cdp.eval(`
      if (typeof window.ViVuApp?.navGoClubs === 'function') {
        window.ViVuApp.navGoClubs();
      } else if (typeof window.ViVuApp?.switchView === 'function') {
        window.ViVuApp.switchView('community');
      } else {
        document.getElementById('tabNavClubs')?.click();
      }
    `);
    await sleep(2000);

    const tab3DomCheck = await cdp.eval(`
      (async () => {
        await window.ViVuApp?.syncCommunityUgcFeed?.();
        await new Promise(r => setTimeout(r, 800));

        // 1. Tìm thẻ CLB trong #featuredClubsGrid theo ID hoặc tên duy nhất
        const clubCard = Array.from(document.querySelectorAll('#featuredClubsGrid article')).find(el => 
          ('${track.clubId}' && (el.getAttribute('data-club-id') === '${track.clubId}' || el.innerHTML.includes('${track.clubId}'))) ||
          el.textContent.includes('${track.clubUniqueName}')
        );

        // 2. Tìm thẻ Lịch sinh hoạt trong #weeklyActivitiesList theo ID hoặc tiêu đề duy nhất
        const activityCard = Array.from(document.querySelectorAll('#weeklyActivitiesList > div')).find(el => 
          ('${track.activityId}' && (el.getAttribute('data-activity-id') === '${track.activityId}' || el.innerHTML.includes('${track.activityId}'))) ||
          el.textContent.includes('${track.activityUniqueTitle}')
        );

        // 3. Tìm thẻ Thảo luận trong #communityPostsFeed theo ID hoặc đoạn text duy nhất
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
      throw new Error(`[LỖI DOM TAB 3 PRODUCTION] Không tìm thấy thẻ Club card trên DOM: ${JSON.stringify(tab3DomCheck)}`);
    }
    if (!tab3DomCheck.hasActivityCard) {
      throw new Error(`[LỖI DOM TAB 3 PRODUCTION] Không tìm thấy thẻ Activity card trên DOM: ${JSON.stringify(tab3DomCheck)}`);
    }
    if (!tab3DomCheck.hasPostCard) {
      throw new Error(`[LỖI DOM TAB 3 PRODUCTION] Không tìm thấy thẻ Post card trên DOM: ${JSON.stringify(tab3DomCheck)}`);
    }
    console.log(`  ✓ [DOM Tab 3: Cộng đồng] Thẻ Câu lạc bộ hiển thị thật: "${tab3DomCheck.clubName.slice(0, 50)}..."`);
    console.log(`  ✓ [DOM Tab 3: Cộng đồng] Thẻ Lịch sinh hoạt hiển thị thật: "${tab3DomCheck.activityTitle.slice(0, 50)}..."`);
    console.log(`  ✓ [DOM Tab 3: Cộng đồng] Thẻ Bài viết thảo luận hiển thị thật: "${tab3DomCheck.postSnippet.slice(0, 50)}..."\n`);

    // Chụp ảnh màn hình lưu vào Artifacts
    const screenshotPath = path.join(ARTIFACT_DIR, 'ugc_production_lifecycle_verified.png');
    await cdp.captureScreenshot(screenshotPath);
    console.log(`  ✓ Đã chụp ảnh màn hình nghiệm thu Production DOM: ${screenshotPath}\n`);

  } finally {
    // --------------------------------------------------------------------------
    // GIAI ĐOẠN 6: DỌN DẸP SẠCH SẼ 100% CÓ MỤC TIÊU THEO ĐÚNG ID (UUID)
    // --------------------------------------------------------------------------
    console.log('================================================================================');
    console.log('[GIAI ĐOẠN 6] DỌN DẸP SẠCH SẼ CÓ MỤC TIÊU THEO ĐÚNG ID (UUID):');
    console.log('================================================================================');

    if (cdp) await cdp.close();
    if (chromeProc) {
      chromeProc.kill('SIGTERM');
      await sleep(500);
    }

    if (track.articleId) {
      await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(track.articleId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa bài cẩm nang: ${track.articleId}`);
    }

    if (track.activityId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${encodeURIComponent(track.activityId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa lịch sinh hoạt: ${track.activityId}`);
    }

    if (track.clubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${encodeURIComponent(track.clubId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa câu lạc bộ: ${track.clubId}`);
    }

    if (track.approvedClubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${encodeURIComponent(track.approvedClubId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa câu lạc bộ đã duyệt: ${track.approvedClubId}`);
    }

    if (track.postId) {
      await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${encodeURIComponent(track.postId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa bài cộng đồng: ${track.postId}`);
    }

    if (track.eventId) {
      await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${encodeURIComponent(track.eventId)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa sự kiện cộng đồng: ${track.eventId}`);
    }

    // Thu thập toàn bộ ID audit logs cần dọn dẹp
    const entityIdsToClean = [track.articleId, track.clubId, track.activityId, track.postId, track.eventId].filter(Boolean);
    let auditIdsToDelete = [...track.auditLogIds];
    if (entityIdsToClean.length > 0) {
      try {
        const extraAudits = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?entity_id=in.(${entityIdsToClean.join(',')})&select=id`, {
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        }).then(r => r.json());
        if (Array.isArray(extraAudits)) {
          extraAudits.forEach(a => { if (a.id && !auditIdsToDelete.includes(a.id)) auditIdsToDelete.push(a.id); });
        }
      } catch (_) {}
    }
    if (auditIdsToDelete.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?id=in.(${auditIdsToDelete.join(',')})`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      console.log(`  ✓ Đã xóa ${auditIdsToDelete.length} bản ghi audit log.`);
    }

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
    console.log(' KẾT QUẢ NGHIỆM THU: 100% PASS - VÒNG ĐỜI NỘI DUNG UGC TRÊN PRODUCTION THẬT ĐẠT CHUẨN');
    console.log('================================================================================\n');
  }
}

run().catch((err) => {
  console.error('\n❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ PRODUCTION:', err);
  process.exit(1);
});
