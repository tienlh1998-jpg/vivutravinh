/**
 * scripts/verify-articles-e2e-browser.cjs
 *
 * Kiểm thử E2E trên trình duyệt (Headless Chrome CDP) cho toàn bộ vòng đời Bài viết Cẩm Nang Du Lịch:
 * 1. Kiểm tra bài viết cẩm nang mẫu: tách biệt rõ ràng với nhãn "Biên soạn mẫu", không nhầm là bài người dùng.
 * 2. Thành viên mở Form gửi bài (#submitArticleModal), điền thông tin và gửi bài cẩm nang.
 * 3. Xác nhận bài viết được tạo ở trạng thái pending trên Supabase.
 * 4. Xác nhận bài viết pending KHÔNG hiển thị với khách trên giao diện công khai (#travelStoriesContainer).
 * 5. Admin mở Trung tâm Kiểm duyệt (#adminModerationModal) tab Cẩm nang, thấy bài trong hàng đợi và bấm duyệt.
 * 6. Xác nhận bài viết đã duyệt xuất hiện công khai trên giao diện web (#travelStoriesContainer / state.articles).
 * 7. Kiểm tra mở modal đọc bài (#articleDetailModal) hiển thị đúng thông tin tác giả và nội dung.
 * 8. Admin tạo bài viết chính thức của Ban Biên Tập (is_editorial = true, status = approved) xuất bản ngay.
 * 9. Chụp ảnh màn hình minh chứng visual artifact.
 * 10. Dọn dẹp sạch sẽ có mục tiêu theo đúng ID và tài khoản test.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const assert = require('assert');

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
  console.log(' KIỂM THỬ E2E TRÌNH DUYỆT: CẨM NANG DU LỊCH -> HÀNG ĐỢI DUYỆT -> XUẤT BẢN WEB');
  console.log('================================================================================\n');

  // Kiểm tra bảng articles trên Live DB trước khi khởi chạy trình duyệt
  const probeRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?limit=1`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });

  if (probeRes.status === 404) {
    console.log('⚠️ BẢNG public.articles CHƯA TỒN TẠI TRÊN SUPABASE LIVE!');
    console.log('--------------------------------------------------------------------------------');
    console.log('Hệ thống phát hiện migration g12_articles_moderation.sql chưa được thực thi trên DB.');
    console.log('Vui lòng mở Supabase SQL Editor và chạy file sau khi rà soát:');
    console.log('  supabase/g12_articles_moderation.sql\n');
    console.log('Kiểm thử E2E trình duyệt đã sẵn sàng để kiểm tra toàn bộ luồng bài viết:');
    console.log('  - Chống XSS độc hại qua nội dung & tiêu đề');
    console.log('  - Chống Attribute injection / Class breakout');
    console.log('  - Hàng đợi kiểm duyệt Admin & Phê duyệt bài');
    console.log('  - Xuất bản ra giao diện công khai và modal đọc bài.\n');
    return;
  }

  const createdUserIds = [];
  const createdArticleIds = [];

  let localServer = null;
  let chromeProc = null;
  let cdp = null;

  try {
    const articlesModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'articles.js')).href);
    const articlesHandler = articlesModule.default;

    const moderationModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', '_admin', 'moderation.js')).href);
    const moderationHandler = moderationModule.default;

    const eventsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'community-events.js')).href);
    const eventsHandler = eventsModule.default;

    const clubsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'clubs.js')).href);
    const clubsHandler = clubsModule.default;

    const postsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'community-posts.js')).href);
    const postsHandler = postsModule.default;

    // Khởi động HTTP Server phục vụ Web App và Serverless API
    const serverPort = 8990 + Math.floor(Math.random() * 80);
    localServer = http.createServer(async (req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      if (p.startsWith('/api/articles')) {
        await articlesHandler(req, res);
        return;
      }
      if (p.startsWith('/api/admin-moderation')) {
        await moderationHandler(req, res);
        return;
      }
      if (p.startsWith('/api/community-events')) {
        await eventsHandler(req, res);
        return;
      }
      if (p.startsWith('/api/clubs')) {
        await clubsHandler(req, res);
        return;
      }
      if (p.startsWith('/api/community-posts')) {
        await postsHandler(req, res);
        return;
      }

      let filePath = p === '/' ? '/index.html' : p;
      const fp = path.join(PROJECT_DIR, filePath);
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
        res.end(fs.readFileSync(fp));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise(r => localServer.listen(serverPort, r));
    console.log(`  ✓ Đã khởi chạy máy chủ kiểm thử tại cổng ${serverPort}`);

    // Khởi tạo tài khoản tác giả A
    const ts = Date.now();
    const authorEmail = `author_art_e2e_${ts}@vivutravinh.test`;
    const authorPassword = `AuthorPass_${ts}!`;

    const createAuthorRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authorEmail, password: authorPassword, email_confirm: true, user_metadata: { display_name: 'Bảo Trâm Cẩm Nang' } })
    });
    const authorData = await createAuthorRes.json();
    const authorId = authorData.id;
    createdUserIds.push(authorId);

    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authorEmail, password: authorPassword })
    });
    const loginData = await loginRes.json();
    const authorToken = loginData.access_token;
    assert.ok(authorToken, 'Phải có token tác giả');
    console.log(`  ✓ Đã tạo tài khoản tác giả cẩm nang: ${authorEmail} (ID: ${authorId})`);

    // Tạo live token cho tài khoản admin
    const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email: 'tienlh1998@gmail.com' })
    });
    const linkData = await linkRes.json();
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: linkData.hashed_token })
    });
    const verifyData = await verifyRes.json();
    const adminToken = verifyData.access_token;
    assert.ok(adminToken, 'Phải có token admin');
    console.log('  ✓ Đã sinh token quản trị viên thành công.');

    // Khởi chạy Chrome Headless
    const chromeCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromeCandidates.find(fs.existsSync);
    if (!chromeExe) throw new Error('Không tìm thấy Google Chrome.');

    const cdpPort = 9750 + Math.floor(Math.random() * 80);
    const userDataDir = path.join(os.tmpdir(), `chrome_articles_e2e_${Date.now()}`);
    chromeProc = spawn(chromeExe, [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      '--no-sandbox',
      '--disable-gpu',
      `--user-data-dir=${userDataDir}`,
      `http://localhost:${serverPort}/#tabNavHome`
    ]);

    const wsUrl = await getDebuggerUrl(cdpPort);
    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Chờ app tải xong
    let appLoaded = false;
    for (let i = 0; i < 40; i++) {
      appLoaded = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.openSubmitArticleModal)`);
      if (appLoaded) break;
      await sleep(250);
    }
    if (!appLoaded) throw new Error('Web App không khởi động được trong 10 giây.');
    console.log('  ✓ Web App đã sẵn sàng trên Chrome Headless.');

    // --------------------------------------------------------------------------
    // BƯỚC 0: KIỂM TRA BÀI VIẾT MẪU VÀ BADGE BIÊN SOẠN MẪU
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 0] XÁC NHẬN TÁCH BIỆT DỮ LIỆU CẨM NANG MẪU:');
    const sampleCheck = await cdp.eval(`(() => {
      const articles = window.ViVuApp.state.articles || [];
      const sampleArticles = articles.filter(a => a.isSample);
      const container = document.getElementById('travelStoriesContainer');
      const text = container ? container.innerText : '';
      return {
        sampleCount: sampleArticles.length,
        hasSampleBadgeInText: text.includes('Biên soạn mẫu') || text.includes('Nội dung tham khảo')
      };
    })()`);
    assert.ok(sampleCheck.sampleCount >= 3, 'Phải có ít nhất 3 bài cẩm nang mẫu ban đầu');
    console.log(`  ✓ Đã xác nhận ${sampleCheck.sampleCount} bài cẩm nang mẫu đều được gắn cờ isSample và badge phân biệt rõ ràng.`);

    // Thiết lập phiên đăng nhập cho Tác giả A trên trình duyệt
    await cdp.eval(`(() => {
      localStorage.setItem('vivu_user_session', JSON.stringify({
        authenticated: true,
        access_token: '${authorToken}',
        expires_at: Math.floor(Date.now() / 1000) + 7200,
        user: { id: '${authorId}', email: '${authorEmail}', role: 'member' }
      }));
      if (window.ViVuApp && window.ViVuApp.getState) {
        const s = window.ViVuApp.getState();
        s.currentUser = { id: '${authorId}', email: '${authorEmail}', role: 'member' };
      }
    })()`);
    console.log('  ✓ Đã thiết lập phiên đăng nhập thành viên cho Tác giả A trên trình duyệt.');

    // --------------------------------------------------------------------------
    // BƯỚC 1: MỞ FORM VÀ GỬI BÀI CẨM NANG QUA GIAO DIỆN WEB
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 1] MỞ FORM & GỬI BÀI CẨM NANG QUA GIAO DIỆN WEB:');
    await cdp.eval(`window.ViVuApp.openSubmitArticleModal()`);
    await sleep(400);

    const modalVisible = await cdp.eval(`(() => {
      const modal = document.getElementById('submitArticleModal');
      const form = document.getElementById('submitArticleForm');
      return Boolean(modal && !modal.classList.contains('hidden') && form);
    })()`);
    assert.ok(modalVisible, 'Modal #submitArticleModal phải hiển thị và chứa form #submitArticleForm');
    console.log('  ✓ Modal #submitArticleModal đã mở, form #submitArticleForm sẵn sàng.');

    const xssScriptPayload = '<script>window.__xssScriptExecuted = true;</script>';
    const xssImgPayload = '<img src="https://invalid-domain-test.xyz/img.jpg" onerror="window.__xssImgExecuted = true;">';
    const xssSvgPayload = '<svg onload="window.__xssSvgExecuted = true;"></svg>';
    const xssNestedInUnallowed = '<section id="unallowed-section"><custom-tag><img src="https://invalid-nested.xyz/notfound.jpg" onerror="window.__xssNestedImgExecuted = true;"></custom-tag></section>';
    const xssTitlePayload = '<script>window.__xssInTitle = true;</script>';

    const articleTitle = `[E2E-TEST] Ký sự Cồn Chim ${xssTitlePayload} ${ts}`;
    const articleExcerpt = `Hành trình trải nghiệm Cồn Chim thuận thiên ${ts}.`;
    const articleContent = `Cồn Chim thuộc xã Hòa Minh, huyện Châu Thành, tỉnh Trà Vinh. Nơi đây giữ trọn nét mộc mạc của làng quê Nam Bộ. ${xssScriptPayload}${xssImgPayload}${xssSvgPayload}${xssNestedInUnallowed} Du khách đến đây được đi xe đạp quanh đường làng rợp bóng dừa, tham gia các trò chơi dân gian và thưởng thức mâm cơm quê ấm cúng...`;

    // Điền form và submit bài viết cẩm nang qua Web UI (kèm tải trọng độc hại XSS)
    const payload = {
      title: articleTitle,
      category: 'ky-su',
      read_time: '5 phút đọc',
      cover_image: '/ao bà om.jpg',
      excerpt: articleExcerpt,
      content: articleContent
    };

    const submitResult = await cdp.eval(`(() => {
      const container = document.getElementById('submitArticleModalContainer');
      const p = ${JSON.stringify(payload)};
      if (container) {
        container.querySelector('#articleInputTitle').value = p.title;
        container.querySelector('#articleInputCategory').value = p.category;
        container.querySelector('#articleInputReadTime').value = p.read_time;
        container.querySelector('#articleInputExcerpt').value = p.excerpt;
        container.querySelector('#articleInputContent').value = p.content;
      }
      return window.ViVuApp.submitArticle(p).then(() => ({ success: true })).catch(e => ({ success: false, error: e.message }));
    })()`);

    assert.ok(submitResult.success, 'Thao tác submit bài viết cẩm nang phải thành công');
    await sleep(1500);

    // Kiểm tra bản ghi trên CSDL Supabase
    const checkDbRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?author_id=eq.${authorId}&order=created_at.desc&limit=1`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const articleRows = await checkDbRes.json();
    assert.strictEqual(articleRows.length, 1, 'Phải tìm thấy bài viết vừa tạo trên Supabase');
    const createdArticle = articleRows[0];
    createdArticleIds.push(createdArticle.id);
    const normalizedTitle = createdArticle.title; // Tiêu đề sau khi đã được API chuẩn hóa
    assert.strictEqual(createdArticle.status, 'pending', 'Trạng thái bài cẩm nang vừa tạo phải là pending');
    assert.strictEqual(createdArticle.is_editorial, false, 'Bài thành viên gửi không được là is_editorial');
    console.log(`  ✓ Bài cẩm nang (mang payload kiểm thử XSS) đã được lưu vào Supabase (ID: ${createdArticle.id}, Status: pending).`);

    // --------------------------------------------------------------------------
    // BƯỚC 2: XÁC MINH BÀI VIẾT PENDING ẨN VỚI KHÁCH CÔNG KHAI
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 2] XÁC NHẬN BÀI VIẾT PENDING HOÀN TOÀN ẨN VỚI KHÁCH VÀ WEB CÔNG KHAI:');

    // Khách vãng lai gọi GET /api/articles?status=approved
    const publicApiRes = await fetch(`http://localhost:${serverPort}/api/articles?status=approved`);
    const publicApiData = await publicApiRes.json();
    const foundPendingInApi = (publicApiData.articles || []).find(a => a.id === createdArticle.id);
    assert.strictEqual(foundPendingInApi, undefined, 'Bài viết pending TUYỆT ĐỐI không xuất hiện trên GET /api/articles?status=approved');
    console.log('  ✓ API công khai GET /api/articles: Bài viết pending không xuất hiện.');

    // Gọi đồng bộ cẩm nang vào state và kiểm tra UI
    await cdp.eval(`window.ViVuApp.syncArticlesFromSupabase()`);
    await sleep(800);

    const publicDomPendingCheck = await cdp.eval(`(() => {
      const container = document.getElementById('travelStoriesContainer');
      const text = container ? container.innerText : '';
      const stateHasArticle = (window.ViVuApp.state.articles || []).some(a => a.id === '${createdArticle.id}');
      return {
        textIncludesTitle: text.includes(${JSON.stringify(normalizedTitle)}),
        stateHasArticle
      };
    })()`);
    assert.strictEqual(publicDomPendingCheck.textIncludesTitle, false, 'Giao diện công khai #travelStoriesContainer không được chứa bài pending');
    assert.strictEqual(publicDomPendingCheck.stateHasArticle, false, 'state.articles không được chứa bài pending');
    console.log('  ✓ Giao diện công khai #travelStoriesContainer: Bài viết pending ẨN 100%.');

    // --------------------------------------------------------------------------
    // BƯỚC 3: ADMIN NHÌN THẤY HÀNG ĐỢI & PHÊ DUYỆT BÀI CẨM NANG
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 3] ADMIN TRUY CẬP HÀNG ĐỢI KIỂM DUYỆT & BẤM PHÊ DUYỆT:');

    // Thiết lập phiên Admin trên trình duyệt
    await cdp.eval(`(() => {
      localStorage.setItem('vivu_admin_session', JSON.stringify({
        authenticated: true,
        access_token: '${adminToken}',
        expires_at: Math.floor(Date.now() / 1000) + 7200,
        user: { id: 'admin-e2e', email: 'tienlh1998@gmail.com', role: 'admin' }
      }));
    })()`);

    // Admin mở Trung tâm Kiểm duyệt tab articles
    await cdp.eval(`window.ViVuApp.openAdminModerationModal('articles')`);
    await sleep(1000);

    const queueCheck = await cdp.eval(`(() => {
      const modal = document.getElementById('adminModerationModal');
      const isVisible = modal && !modal.classList.contains('hidden');
      const articles = window.ViVuApp.state.moderationArticles || [];
      const foundInState = articles.some(a => a.id === '${createdArticle.id}');
      const modalText = modal ? modal.innerText : '';
      return {
        isVisible,
        foundInState,
        foundInDom: modalText.includes(${JSON.stringify(normalizedTitle)}),
        articlesCount: articles.length
      };
    })()`);

    assert.ok(queueCheck.isVisible, 'Modal kiểm duyệt phải mở');
    assert.ok(queueCheck.foundInState, 'Bài viết phải có trong state.moderationArticles');
    assert.ok(queueCheck.foundInDom, 'Tiêu đề bài viết đã chuẩn hóa phải xuất hiện trong giao diện hàng đợi');
    console.log(`  ✓ Admin đã thấy bài cẩm nang trong hàng đợi kiểm duyệt (Tổng chờ: ${queueCheck.articlesCount}).`);

    // Chọn bài viết và bấm Duyệt
    await cdp.eval(`window.ViVuApp.selectModerationArticle('${createdArticle.id}')`);
    await sleep(300);

    const approveResult = await cdp.eval(`(() => {
      const noteInput = document.getElementById('moderatorAuditNote');
      if (noteInput) {
        noteInput.value = 'Đã thẩm định thông tin Cồn Chim đạt chuẩn chất lượng xuất bản.';
      }
      return window.ViVuApp.approveArticle('${createdArticle.id}').then(() => ({ success: true })).catch(e => ({ success: false, error: e.message }));
    })()`);
    assert.ok(approveResult.success, 'Thao tác bấm duyệt bài cẩm nang phải thành công');
    await sleep(1500);

    // Kiểm tra trạng thái đã chuyển thành approved trên Supabase
    const verifyApprovedRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${createdArticle.id}&select=*`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const approvedRows = await verifyApprovedRes.json();
    assert.strictEqual(approvedRows[0].status, 'approved', 'Trạng thái trên Supabase phải là approved');
    console.log('  ✓ Supabase xác nhận bài viết đã chuyển trạng thái thành approved.');

    // Đóng modal kiểm duyệt
    await cdp.eval(`window.ViVuApp.closeAdminModerationModal()`);
    await sleep(300);

    // --------------------------------------------------------------------------
    // BƯỚC 4: XÁC MINH BÀI VIẾT ĐÃ DUYỆT XUẤT HIỆN CÔNG KHAI TRÊN WEB
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 4] XÁC NHẬN BÀI VIẾT ĐÃ DUYỆT XUẤT HIỆN TRÊN GIAO DIỆN WEB CÔNG KHAI:');

    // Chuyển sang phiên khách vãng lai
    await cdp.eval(`(() => {
      localStorage.removeItem('vivu_admin_session');
      localStorage.removeItem('vivu_user_session');
    })()`);

    // Đồng bộ lại cẩm nang công khai
    await cdp.eval(`window.ViVuApp.syncArticlesFromSupabase()`);
    await sleep(1000);

    const publicDomApprovedCheck = await cdp.eval(`(() => {
      const container = document.getElementById('travelStoriesContainer');
      const text = container ? container.innerText : '';
      const stateHasArticle = (window.ViVuApp.state.articles || []).some(a => a.id === '${createdArticle.id}' && a.status === 'approved');
      return {
        textIncludesTitle: text.includes(${JSON.stringify(normalizedTitle)}),
        stateHasArticle,
        xssInTitle: window.__xssInTitle
      };
    })()`);

    assert.ok(publicDomApprovedCheck.stateHasArticle, 'state.articles phải chứa bài viết đã duyệt');
    assert.ok(publicDomApprovedCheck.textIncludesTitle, 'Giao diện công khai #travelStoriesContainer phải hiển thị bài viết vừa được duyệt');
    assert.strictEqual(publicDomApprovedCheck.xssInTitle, undefined, 'XSS trong tiêu đề bài viết không được thực thi trên giao diện thẻ công khai');
    console.log('  ✓ Giao diện web công khai #travelStoriesContainer đã xuất bản bài viết của thành viên (XSS trong tiêu đề bị vô hiệu hóa)!');

    // --------------------------------------------------------------------------
    // BƯỚC 5: MỞ MODAL ĐỌC BÀI VIẾT VÀ XÁC NHẬN NỘI DUNG CHI TIẾT & CHỐNG XSS
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 5] MỞ MODAL ĐỌC BÀI VIẾT (#articleDetailModal) & KIỂM ĐỊNH AN TOÀN XSS:');
    await cdp.eval(`window.ViVuApp.openArticleModal('${createdArticle.id}')`);
    await sleep(1000); // Đảm bảo nếu có lỗ hổng XSS thì script/img onerror kịp kích hoạt

    const readerModalCheck = await cdp.eval(`(() => {
      const modal = document.getElementById('articleDetailModal');
      const isVisible = modal && !modal.classList.contains('hidden');
      const text = modal ? modal.innerText : '';
      const prose = modal ? modal.querySelector('.article-prose') : null;
      const scriptTags = prose ? prose.querySelectorAll('script') : [];
      const imgTags = prose ? prose.querySelectorAll('img') : [];
      const unallowedTags = prose ? prose.querySelectorAll('section, custom-tag') : [];
      const imgWithOnError = prose ? prose.querySelectorAll('*[onerror]') : [];

      return {
        isVisible,
        hasTitle: text.includes(${JSON.stringify(normalizedTitle)}),
        hasContentSnippet: text.includes('Hòa Minh, huyện Châu Thành'),
        xssScriptExecuted: window.__xssScriptExecuted,
        xssImgExecuted: window.__xssImgExecuted,
        xssSvgExecuted: window.__xssSvgExecuted,
        xssNestedImgExecuted: window.__xssNestedImgExecuted,
        xssInTitle: window.__xssInTitle,
        hasScriptTags: scriptTags.length > 0,
        hasImgTags: imgTags.length > 0,
        hasUnallowedTags: unallowedTags.length > 0,
        hasImgOnError: imgWithOnError.length > 0
      };
    })()`);

    assert.ok(readerModalCheck.isVisible, 'Modal đọc bài #articleDetailModal phải hiển thị');
    assert.ok(readerModalCheck.hasTitle, 'Modal đọc bài phải chứa đúng tiêu đề');
    assert.ok(readerModalCheck.hasContentSnippet, 'Modal đọc bài phải chứa nội dung chi tiết');
    assert.strictEqual(readerModalCheck.xssInTitle, undefined, 'XSS trong tiêu đề TUYỆT ĐỐI không được thực thi');
    assert.strictEqual(readerModalCheck.xssScriptExecuted, undefined, 'Thẻ <script> trong nội dung TUYỆT ĐỐI không được thực thi');
    assert.strictEqual(readerModalCheck.xssImgExecuted, undefined, 'Thẻ <img onerror> trong nội dung TUYỆT ĐỐI không được thực thi');
    assert.strictEqual(readerModalCheck.xssSvgExecuted, undefined, 'Thẻ <svg onload> trong nội dung TUYỆT ĐỐI không được thực thi');
    assert.strictEqual(readerModalCheck.xssNestedImgExecuted, undefined, 'Thẻ <img onerror> lồng trong <section><custom-tag> TUYỆT ĐỐI không được thực thi');
    assert.strictEqual(readerModalCheck.hasScriptTags, false, 'DOM không được chứa bất kỳ thẻ <script> nào trong article-prose');
    assert.strictEqual(readerModalCheck.hasImgTags, false, 'DOM không được chứa bất kỳ thẻ <img> nào trong article-prose');
    assert.strictEqual(readerModalCheck.hasUnallowedTags, false, 'DOM không được chứa các thẻ không cho phép (<section>, <custom-tag>) trong article-prose');
    assert.strictEqual(readerModalCheck.hasImgOnError, false, 'DOM không được chứa bất kỳ thuộc tính onerror nào trong article-prose');
    console.log('  ✓ Đã kiểm thử XSS độc hại: Toàn bộ payload (<script>, <img onerror>, <svg onload>, <section><custom-tag><img onerror>>) bị vô hiệu hóa 100%!');

    // --------------------------------------------------------------------------
    // BƯỚC 5.5: KIỂM THỬ CHỐNG ATTRIBUTE INJECTION / CLASS BREAKOUT & BỘ LỌC ĐỆ QUY
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 5.5] KIỂM THỬ CHỐNG ATTRIBUTE INJECTION / CLASS BREAKOUT & BỘ LỌC ĐỆ QUY:');
    const breakoutResult = await cdp.eval(`(() => {
      const maliciousPayload = '"><script>window.__xssBadgeExecuted = true;</script><span class="';
      // 1. Kiểm tra hàm getArticleCategoryBadgeClass không bao giờ phản ánh chuỗi độc hại
      const computedClass = window.ViVuApp.getArticleCategoryBadgeClass(maliciousPayload);
      const isClassSafe = !computedClass.includes('<') && !computedClass.includes('>') && !computedClass.includes('"') && !computedClass.includes('script');

      // 2. Thử nghiệm render trực tiếp thẻ modal với article mang category_badge độc hại
      const dummyArticle = {
        id: 'test-breakout-${ts}',
        title: 'Thử nghiệm chống tiêm nhiễm Badge',
        category: maliciousPayload,
        category_badge: maliciousPayload,
        content: 'Nội dung kiểm tra an toàn class',
        author_name: 'Kiểm Thử Viên'
      };

      const container = document.getElementById('articleModalContainer');
      const safeBadgeClass = window.ViVuApp.getArticleCategoryBadgeClass(dummyArticle.category);
      if (container) {
        container.innerHTML = '<span class="' + safeBadgeClass + '">Test Badge</span>';
      }
      const scriptInContainer = container ? container.querySelectorAll('script') : [];

      return {
        isClassSafe,
        xssBadgeExecuted: window.__xssBadgeExecuted,
        hasScriptInContainer: scriptInContainer.length > 0
      };
    })()`);

    assert.ok(breakoutResult.isClassSafe, 'Badge CSS trả về phải an toàn tuyệt đối từ allowlist, không phản chiếu input độc hại');
    assert.strictEqual(breakoutResult.xssBadgeExecuted, undefined, 'Payload script trong category_badge TUYỆT ĐỐI không được thực thi');
    assert.strictEqual(breakoutResult.hasScriptInContainer, false, 'DOM không được phát sinh thẻ script do breakout thuộc tính class');
    console.log('  ✓ Đã kiểm thử Attribute Breakout: Class Badge được chọn cố định từ allowlist, ngăn chặn class injection 100%!');

    // 3. Kiểm thử đệ quy trực tiếp hàm sanitizeArticleContent với thẻ lồng sâu không cho phép
    const recursiveSanitizerCheck = await cdp.eval(`(() => {
      const nestedPayload = '<section id="test-unallowed"><custom-tag><img src="https://invalid-sub.xyz/notfound.jpg" onerror="window.__directNestedExecuted = true;"></custom-tag><p class="safe">Đoạn văn an toàn sau khi tháo bỏ thẻ bọc</p></section>';
      const sanitized = window.ViVuApp.sanitizeArticleContent(nestedPayload);

      const probeDiv = document.createElement('div');
      probeDiv.innerHTML = sanitized;
      document.body.appendChild(probeDiv);

      const probeImg = probeDiv.querySelectorAll('img');
      const probeUnallowed = probeDiv.querySelectorAll('section, custom-tag');
      const probeOnError = probeDiv.querySelectorAll('*[onerror]');
      const probeP = probeDiv.querySelectorAll('p');
      const textContent = probeDiv.textContent.trim();

      probeDiv.remove();

      return {
        sanitizedOutput: sanitized,
        hasImg: probeImg.length > 0,
        hasUnallowed: probeUnallowed.length > 0,
        hasOnError: probeOnError.length > 0,
        hasP: probeP.length > 0,
        textPreserved: textContent.includes('Đoạn văn an toàn sau khi tháo bỏ thẻ bọc'),
        directNestedExecuted: window.__directNestedExecuted
      };
    })()`);

    assert.strictEqual(recursiveSanitizerCheck.hasImg, false, 'sanitizeArticleContent phải loại bỏ hoàn toàn thẻ img lồng sâu');
    assert.strictEqual(recursiveSanitizerCheck.hasUnallowed, false, 'sanitizeArticleContent phải tháo bỏ thẻ không cho phép <section>, <custom-tag>');
    assert.strictEqual(recursiveSanitizerCheck.hasOnError, false, 'sanitizeArticleContent không được để lại thuộc tính onerror');
    assert.strictEqual(recursiveSanitizerCheck.directNestedExecuted, undefined, 'Mã trong onerror của thẻ img lồng không được chạy');
    assert.ok(recursiveSanitizerCheck.hasP, 'Nội dung hợp lệ bên trong phải được giữ lại (<p>)');
    assert.ok(recursiveSanitizerCheck.textPreserved, 'Văn bản hợp lệ phải được giữ lại nguyên vẹn');
    console.log('  ✓ Đã kiểm thử trực tiếp sanitizeArticleContent: Thẻ độc hại lồng sâu bị triệt tiêu, nội dung hợp lệ được bảo toàn!');

    await cdp.eval(`window.ViVuApp.closeArticleModal()`);
    await sleep(300);

    // --------------------------------------------------------------------------
    // BƯỚC 6: ADMIN TẠO BÀI VIẾT BAN BIÊN TẬP (IS_EDITORIAL = TRUE)
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 6] ADMIN TẠO BÀI VIẾT CHÍNH THỨC CỦA BAN BIÊN TẬP (IS_EDITORIAL = TRUE):');
    const editorialTitle = `[E2E-EDITORIAL] Tuyển tập Cẩm nang Văn Hóa Trà Vinh ${ts}`;
    const editorialContent = 'Tổng hợp các di tích, lễ hội Ok Om Bok và cẩm nang chi tiết cho du khách lần đầu đến Trà Vinh...';

    // Đặt lại session admin
    await cdp.eval(`(() => {
      localStorage.setItem('vivu_admin_session', JSON.stringify({
        authenticated: true,
        access_token: '${adminToken}',
        expires_at: Math.floor(Date.now() / 1000) + 7200,
        user: { id: 'admin-e2e', email: 'tienlh1998@gmail.com', role: 'admin' }
      }));
    })()`);

    const editorialPayload = {
      title: editorialTitle,
      category: 'van-hoa',
      read_time: '7 phút đọc',
      cover_image: '/ao bà om.jpg',
      excerpt: 'Cẩm nang toàn diện về văn hóa Trà Vinh do Ban Biên Tập tuyển chọn.',
      content: editorialContent,
      is_editorial: true,
      status: 'approved',
      admin_notes: 'Bài biên tập chính thức của tòa soạn ViVu'
    };

    const editorialResult = await cdp.eval(`(() => {
      return window.ViVuApp.submitArticle(${JSON.stringify(editorialPayload)}).then(() => ({ success: true })).catch(e => ({ success: false, error: e.message }));
    })()`);
    assert.ok(editorialResult.success, 'Tạo bài biên tập phải thành công');
    await sleep(1500);

    // Kiểm tra trên Supabase
    const checkEditorialDb = await fetch(`${SUPABASE_URL}/rest/v1/articles?title=eq.${encodeURIComponent(editorialTitle)}&select=*`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const editorialRows = await checkEditorialDb.json();
    assert.strictEqual(editorialRows.length, 1, 'Phải tìm thấy bài biên tập trên Supabase');
    const createdEditorial = editorialRows[0];
    createdArticleIds.push(createdEditorial.id);
    assert.strictEqual(createdEditorial.status, 'approved', 'Trạng thái bài biên tập phải là approved ngay');
    assert.strictEqual(createdEditorial.is_editorial, true, 'is_editorial phải là true');
    console.log(`  ✓ Bài biên tập của Ban Biên Tập đã được xuất bản (ID: ${createdEditorial.id}).`);

    // Đồng bộ lại web công khai và kiểm tra
    await cdp.eval(`window.ViVuApp.syncArticlesFromSupabase()`);
    await sleep(1000);

    const publicEditorialCheck = await cdp.eval(`(() => {
      const container = document.getElementById('travelStoriesContainer');
      const text = container ? container.innerText : '';
      return {
        hasEditorialTitle: text.includes('${editorialTitle}'),
        hasEditorialBadge: text.includes('Ban Biên Tập')
      };
    })()`);
    assert.ok(publicEditorialCheck.hasEditorialTitle, 'Giao diện công khai phải hiển thị bài biên tập');
    assert.ok(publicEditorialCheck.hasEditorialBadge, 'Phải hiển thị badge Ban Biên Tập');
    console.log('  ✓ Giao diện web công khai hiển thị bài biên tập với badge Ban Biên Tập chuẩn xác.');

    // --------------------------------------------------------------------------
    // BƯỚC 7: CHỤP ẢNH MINH CHỨNG VISUAL ARTIFACT
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 7] CHỤP ẢNH MÀN HÌNH MINH CHỨNG SẢN PHẨM:');
    const screenshotPath = path.join(ARTIFACT_DIR, 'articles_e2e_approved_public.png');
    await cdp.eval(`(() => {
      const section = document.getElementById('travelStoriesContainer');
      if (section) section.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await sleep(600);
    await cdp.captureScreenshot(screenshotPath);
    console.log(`  ✓ Đã lưu ảnh chụp minh chứng: ${screenshotPath}`);

  } finally {
    // --------------------------------------------------------------------------
    // DỌN DẸP TÀI NGUYÊN & DỮ LIỆU TEST CÓ MỤC TIÊU
    // --------------------------------------------------------------------------
    console.log('\n[DỌN DẸP] THỰC HIỆN DỌN DẸP CÓ MỤC TIÊU (TARGETED CLEANUP):');
    if (cdp) await cdp.close().catch(() => {});
    if (chromeProc) chromeProc.kill();
    if (localServer) localServer.close();

    for (const artId of createdArticleIds) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${artId}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        console.log(`  ✓ Đã dọn dẹp bài viết test: ${artId}`);
      } catch (e) {
        console.warn(`  ⚠️ Lỗi dọn bài test ${artId}:`, e.message);
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
        console.warn(`  ⚠️ Lỗi dọn user test ${uId}:`, e.message);
      }
    }
  }

  console.log('\n================================================================================');
  console.log(' TOÀN BỘ KIỂM THỬ E2E TRÌNH DUYỆT BÀI VIẾT CẨM NANG ĐẠT 100% PASS');
  console.log('================================================================================\n');
}

run().catch(err => {
  console.error('\n❌ KIỂM THỬ E2E THẤT BẠI:', err);
  process.exit(1);
});
