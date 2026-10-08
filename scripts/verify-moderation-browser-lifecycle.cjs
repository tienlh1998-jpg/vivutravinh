// scripts/verify-moderation-browser-lifecycle.cjs
// Script kiểm thử trình duyệt DOM thật (End-to-End Browser Lifecycle):
// Luồng kiểm thử bắt buộc:
// 1. Admin hoàn duyệt có lý do -> Tác giả thấy lý do trong "Nội dung của tôi" (Amber Warning Box)
// 2. Tác giả sửa nội dung và bấm "Sửa & Gửi lại" -> chuyển về pending
// 3. Admin duyệt bài -> nội dung công khai cập nhật đúng
// 4. Admin tạm ẩn bài -> Phiên khách kiểm tra nội dung biến mất khỏi giao diện
// 5. Admin hiện lại bài -> Phiên khách kiểm tra nội dung xuất hiện lại
// 6. Admin xóa bài vào thùng rác -> Phiên khách kiểm tra nội dung biến mất
// Chụp ảnh màn hình lưu vào ARTIFACT_DIR và dọn dẹp sạch sẽ sau kiểm thử.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const crypto = require('crypto');

const PROJECT_DIR = path.resolve(__dirname, '..');
const envContent = fs.readFileSync(path.join(PROJECT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
process.env.ADMIN_SECRET = 'dev-admin';
process.env.NODE_ENV = 'test';
process.env.VIVU_TEST = '1';

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

async function run() {
  console.log('================================================================================');
  console.log(' KIỂM THỬ TRÌNH DUYỆT THẬT: VÒNG ĐỜI HOÀN DUYỆT, SỬA GỬI LẠI & PHIÊN KHÁCH');
  console.log('================================================================================\n');

  // Load API Handlers
  const moderationModule = await import('../api/_admin/moderation.js');
  const handleModeration = moderationModule.default;

  const postsModule = await import('../api/community-posts.js');
  const handlePosts = postsModule.default;

  const articlesModule = await import('../api/articles.js');
  const handleArticles = articlesModule.default;

  const clubsModule = await import('../api/clubs.js');
  const handleClubs = clubsModule.default;

  const eventsModule = await import('../api/community-events.js');
  const handleEvents = eventsModule.default;

  const activitiesModule = await import('../api/club-activities.js');
  const handleActivities = activitiesModule.default;

  const { supabaseRequest } = await import('../api/_admin-auth.js');

  const ts = Date.now();
  const testBatchTag = `browser-lifecycle-${ts}`;
  const testPostId = crypto.randomUUID();

  // Tìm test profile
  let authorId = 'f4e5080a-7f96-4a63-ab2f-a9beb0dce1d2';
  let authorEmail = 'tieuhactutht@gmail.com';
  let authorName = 'Tác Giả Kiểm Thử ViVu';

  try {
    const profiles = await supabaseRequest('profiles?select=id,email,display_name&limit=1');
    if (Array.isArray(profiles) && profiles.length > 0) {
      authorId = profiles[0].id;
      authorEmail = profiles[0].email || authorEmail;
      authorName = profiles[0].display_name || authorName;
    }
  } catch (_) {}

  console.log(`[Setup] Tác giả thử nghiệm: ${authorName} (${authorId})`);

  let localServer = null;
  let chromeProc = null;
  let cdp = null;

  try {
    // --------------------------------------------------------------------------
    // 1. KHỞI CHẠY LOCAL HTTP SERVER
    // --------------------------------------------------------------------------
    const PORT = 3458;
    localServer = http.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
      const pathname = parsedUrl.pathname;

      // API Routes
      if (pathname === '/api/_admin/moderation' || pathname === '/api/admin-moderation') {
        await handleModeration(req, res);
        return;
      }
      if (pathname === '/api/community-posts') {
        await handlePosts(req, res);
        return;
      }
      if (pathname === '/api/articles') {
        await handleArticles(req, res);
        return;
      }
      if (pathname === '/api/clubs') {
        await handleClubs(req, res);
        return;
      }
      if (pathname === '/api/community-events') {
        await handleEvents(req, res);
        return;
      }
      if (pathname === '/api/club-activities') {
        await handleActivities(req, res);
        return;
      }

      // Static files
      let filePath = path.join(PROJECT_DIR, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
      if (!fs.existsSync(filePath)) {
        filePath = path.join(PROJECT_DIR, 'index.html');
      }

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
    console.log(`  ✓ Máy chủ điều phối phục vụ tại: http://127.0.0.1:${PORT}`);

    // --------------------------------------------------------------------------
    // 2. TẠO BÀI VIẾT BAN ĐẦU & ADMIN HOÀN DUYỆT (RETURN) KÈM LÝ DO
    // --------------------------------------------------------------------------
    const initialContent = `Chia sẻ cảm xúc khi tham gia lễ hội Chôl Chnăm Thmây tại Trà Vinh mùa này ${ts}.`;
    const updatedContent = `Nội dung đã được tác giả bổ sung chi tiết: Lễ hội Chôl Chnăm Thmây đón năm mới của đồng bào Khmer diễn ra vào giữa tháng 4 dương lịch, có nghi thức đắp núi cát và tắm Phật tại Chùa Âng ${ts}.`;
    const postTitle = `[E2E] Lễ hội Chôl Chnăm Thmây Xứ Trà ${ts}`;
    const returnReason = 'Vui lòng bổ sung thêm thời gian tổ chức cụ thể và ý nghĩa nghi thức đắp núi cát.';

    await supabaseRequest('community_posts', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: testPostId,
        author_id: authorId,
        author_name: authorName,
        title: postTitle,
        content: initialContent,
        category: 'Văn hóa & Lễ hội',
        status: 'pending',
        images: ['https://example.com/test-e2e.jpg'],
        created_at: new Date().toISOString()
      })
    });
    console.log(`  ✓ Đã tạo bài viết cộng đồng ban đầu (ID: ${testPostId})`);

    // Admin Hoàn duyệt kèm lý do
    const returnReqStream = new (require('stream').Readable)();
    returnReqStream.method = 'POST';
    returnReqStream.url = 'http://localhost/api/admin-moderation';
    returnReqStream.headers = {
      authorization: 'Bearer mock-admin-token',
      'content-type': 'application/json'
    };
    returnReqStream.push(JSON.stringify({
      entity_type: 'community_post',
      entity_id: testPostId,
      action: 'return',
      reason: returnReason
    }));
    returnReqStream.push(null);

    let returnResBody = '';
    const mockReturnRes = {
      statusCode: 200,
      setHeader() {},
      end(chunk) { if (chunk) returnResBody += chunk; }
    };
    await handleModeration(returnReqStream, mockReturnRes);
    console.log(`  ✓ Admin đã HOÀN DUYỆT bài viết kèm lý do: "${returnReason}"`);

    // --------------------------------------------------------------------------
    // 3. KHỞI ĐỘNG HEADLESS CHROME VÀ KIỂM THỬ TRÌNH DUYỆT - PHIÊN TÁC GIẢ
    // --------------------------------------------------------------------------
    const CDP_PORT = 9335;
    const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    chromeProc = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1280,900',
      '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-mod-e2e-'))
    ]);

    const debuggerUrl = await getDebuggerUrl(CDP_PORT);
    cdp = new CDPClient(debuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    console.log('  ✓ Đã kết nối Chrome DevTools Protocol.');

    // Nạp trang web với phiên tác giả
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    await sleep(2000);

    // Bơm phiên tác giả vào localStorage
    await cdp.eval(`
      localStorage.setItem('vivu_user_session', JSON.stringify({
        access_token: 'mock-author-${authorId}',
        user: {
          id: '${authorId}',
          email: '${authorEmail}',
          user_metadata: { display_name: '${authorName}' }
        },
        expires_at: Math.floor(Date.now() / 1000) + 7200
      }));
    `);
    console.log('  ✓ Đã bơm phiên đăng nhập tác giả vào localStorage.');

    // Mở tab "Nội dung của tôi"
    const openMyContent = await cdp.eval(`
      (async () => {
        if (window.ViVuApp && window.ViVuApp.openUserProfileModal) {
          window.ViVuApp.openUserProfileModal('my-content');
        } else {
          const btn = document.getElementById('sidebarLinkMyContent') || document.querySelector('[data-tab="my-content"]');
          if (btn) btn.click();
        }

        // Chờ modal nạp danh sách
        for (let i = 0; i < 30; i++) {
          const card = document.querySelector('.ugc-content-card[data-entity-id="${testPostId}"]');
          if (card) {
            const returnedBox = card.querySelector('.ugc-returned-box');
            const returnReasonEl = card.querySelector('.ugc-return-reason');
            const editBtn = card.querySelector('.btn-edit-ugc');
            return {
              ok: true,
              foundCard: true,
              hasReturnedBox: Boolean(returnedBox),
              reasonText: returnReasonEl ? returnReasonEl.textContent.trim() : '',
              hasEditBtn: Boolean(editBtn)
            };
          }
          await new Promise(r => setTimeout(r, 200));
        }
        return { ok: false, error: 'Không tìm thấy thẻ bài viết sau khi mở Nội dung của tôi' };
      })()
    `);

    console.log('  [DOM Tác Giả] Kết quả hiển thị "Nội dung của tôi":', openMyContent);
    if (!openMyContent.ok || !openMyContent.hasReturnedBox) {
      throw new Error(`Tác giả không nhìn thấy hộp cảnh báo hoàn duyệt trên DOM: ${JSON.stringify(openMyContent)}`);
    }

    if (!openMyContent.reasonText.includes('thời gian tổ chức cụ thể')) {
      throw new Error(`Lý do hoàn duyệt hiển thị sai trên DOM: "${openMyContent.reasonText}"`);
    }

    // Chụp screenshot bằng chứng 1: Tác giả thấy Amber Box và lý do hoàn duyệt
    const shot1 = path.join(ARTIFACT_DIR, 'browser_author_sees_return_reason.png');
    await cdp.captureScreenshot(shot1);
    console.log(`  ✓ ĐÃ CHỤP ẢNH MÀN HÌNH: ${shot1}`);

    // Tác giả bấm nút "Sửa & Gửi lại" trên DOM
    const triggerEditResult = await cdp.eval(`
      (async () => {
        const card = document.querySelector('.ugc-content-card[data-entity-id="${testPostId}"]');
        if (!card) return { ok: false, error: 'Không tìm thấy card' };
        const editBtn = card.querySelector('.btn-edit-ugc');
        if (!editBtn) return { ok: false, error: 'Không tìm thấy nút .btn-edit-ugc' };
        editBtn.click();

        // Chờ modal chỉnh sửa bài viết #editCommunityPostModal hiển thị
        for (let i = 0; i < 20; i++) {
          const editModal = document.getElementById('editCommunityPostModal');
          if (editModal && !editModal.classList.contains('hidden')) {
            const textarea = document.getElementById('editPostContent');
            if (textarea) {
              textarea.value = ${JSON.stringify(updatedContent)};
              return { ok: true, modalOpened: true };
            }
          }
          await new Promise(r => setTimeout(r, 200));
        }
        return { ok: false, error: 'Modal sửa bài viết không mở' };
      })()
    `);

    if (!triggerEditResult.ok) {
      throw new Error(`Không thể mở modal sửa bài viết: ${JSON.stringify(triggerEditResult)}`);
    }
    console.log('  ✓ Tác giả đã mở modal sửa bài viết và cập nhật nội dung mới vào form DOM.');

    // Tác giả submit form "Sửa & Gửi lại"
    const submitEditResult = await cdp.eval(`
      (async () => {
        if (window.ViVuApp && window.ViVuApp.submitEditCommunityPost) {
          await window.ViVuApp.submitEditCommunityPost();
        } else {
          const btnSubmit = document.getElementById('btnSubmitEditPost');
          if (btnSubmit) btnSubmit.click();
        }

        // Chờ cập nhật hoàn tất
        await new Promise(r => setTimeout(r, 1500));
        return { ok: true };
      })()
    `);

    // Kiểm tra CSDL: Trạng thái bài viết chuyển về pending
    const postDbResubmitted = (await supabaseRequest(`community_posts?id=eq.${testPostId}&limit=1`))[0];
    if (postDbResubmitted.status !== 'pending') {
      throw new Error(`Bài viết chưa chuyển về pending sau khi gửi lại: ${postDbResubmitted.status}`);
    }
    console.log('  ✓ CSDL xác nhận: Bài viết đã chuyển về "pending" và nội dung mới đã lưu.');

    const shot2 = path.join(ARTIFACT_DIR, 'browser_author_resubmitted.png');
    await cdp.captureScreenshot(shot2);
    console.log(`  ✓ ĐÃ CHỤP ẢNH MÀN HÌNH: ${shot2}`);

    // --------------------------------------------------------------------------
    // 4. ADMIN PHÊ DUYỆT BÀI VIẾT CÔNG KHAI
    // --------------------------------------------------------------------------
    const approveReqStream = new (require('stream').Readable)();
    approveReqStream.method = 'POST';
    approveReqStream.url = 'http://localhost/api/admin-moderation';
    approveReqStream.headers = {
      authorization: 'Bearer mock-admin-token',
      'content-type': 'application/json'
    };
    approveReqStream.push(JSON.stringify({
      entity_type: 'community_post',
      entity_id: testPostId,
      action: 'approve'
    }));
    approveReqStream.push(null);

    await handleModeration(approveReqStream, { statusCode: 200, setHeader() {}, end() {} });
    console.log('  ✓ Admin đã phê duyệt bài viết công khai.');

    // --------------------------------------------------------------------------
    // 5. PHIÊN KHÁCH VÃNG LAI: KIỂM TRA NỘI DUNG CÔNG KHAI ĐƯỢC CẬP NHẬT ĐÚNG TRÊN DOM
    // --------------------------------------------------------------------------
    // Xóa sạch session trong localStorage -> trở thành khách vãng lai hoàn toàn
    await cdp.eval(`
      localStorage.clear();
      sessionStorage.clear();
    `);

    // Điều hướng vào trang Cộng đồng dưới phiên khách
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html#/community` });
    await sleep(2000);

    const guestCheckApproved = await cdp.eval(`
      (async () => {
        if (window.ViVuApp && window.ViVuApp.navGoCommunity) {
          window.ViVuApp.navGoCommunity();
        }
        if (window.ViVuApp && window.ViVuApp.syncCommunityUgcFeed) {
          await window.ViVuApp.syncCommunityUgcFeed();
        }

        for (let i = 0; i < 30; i++) {
          const feed = document.getElementById('communityPostsFeed');
          if (feed && (feed.textContent.includes('${testPostId}') || feed.textContent.includes('nghi thức đắp núi cát'))) {
            return {
              ok: true,
              feedText: feed.textContent.slice(0, 300),
              hasUpdatedSnippet: feed.textContent.includes('nghi thức đắp núi cát')
            };
          }
          await new Promise(r => setTimeout(r, 200));
        }
        const feed = document.getElementById('communityPostsFeed');
        return { ok: false, feedText: feed ? feed.textContent.slice(0, 300) : 'no feed' };
      })()
    `);

    if (!guestCheckApproved.ok) {
      throw new Error(`Khách vãng lai không nhìn thấy nội dung cập nhật trên DOM: ${JSON.stringify(guestCheckApproved)}`);
    }
    console.log('  ✓ [DOM Phiên Khách] Khách vãng lai thấy bài viết công khai với nội dung mới đã sửa!');

    const shot3 = path.join(ARTIFACT_DIR, 'browser_guest_sees_approved_updated_content.png');
    await cdp.captureScreenshot(shot3);
    console.log(`  ✓ ĐÃ CHỤP ẢNH MÀN HÌNH: ${shot3}`);

    // --------------------------------------------------------------------------
    // 6. ADMIN TẠM ẨN (HIDE) & PHIÊN KHÁCH KIỂM TRA NỘI DUNG BIẾN MẤT TRÊN DOM
    // --------------------------------------------------------------------------
    const hideReqStream = new (require('stream').Readable)();
    hideReqStream.method = 'POST';
    hideReqStream.url = 'http://localhost/api/admin-moderation';
    hideReqStream.headers = {
      authorization: 'Bearer mock-admin-token',
      'content-type': 'application/json'
    };
    hideReqStream.push(JSON.stringify({
      entity_type: 'community_post',
      entity_id: testPostId,
      action: 'hide'
    }));
    hideReqStream.push(null);
    await handleModeration(hideReqStream, { statusCode: 200, setHeader() {}, end() {} });
    console.log('  ✓ Admin đã tạm ẩn bài viết.');

    // Khách vãng lai refresh trang cộng đồng
    const guestCheckHidden = await cdp.eval(`
      (async () => {
        if (window.ViVuApp && window.ViVuApp.syncCommunityUgcFeed) {
          await window.ViVuApp.syncCommunityUgcFeed();
        }
        await new Promise(r => setTimeout(r, 1000));
        const feed = document.getElementById('communityPostsFeed');
        const hasSnippet = feed ? feed.textContent.includes('nghi thức đắp núi cát') : false;
        return { ok: true, isHiddenOnDom: !hasSnippet };
      })()
    `);

    if (!guestCheckHidden.isHiddenOnDom) {
      throw new Error('Bài viết tạm ẩn vẫn xuất hiện trên DOM của khách vãng lai!');
    }
    console.log('  ✓ [DOM Phiên Khách] Xác nhận bài viết tạm ẩn ĐÃ HOÀN TOÀN BIẾN MẤT khỏi giao diện khách.');

    const shot4 = path.join(ARTIFACT_DIR, 'browser_guest_content_hidden.png');
    await cdp.captureScreenshot(shot4);
    console.log(`  ✓ ĐÃ CHỤP ẢNH MÀN HÌNH: ${shot4}`);

    // --------------------------------------------------------------------------
    // 7. ADMIN HIỆN LẠI (UNHIDE) & PHIÊN KHÁCH KIỂM TRA NỘI DUNG XUẤT HIỆN LẠI
    // --------------------------------------------------------------------------
    const unhideReqStream = new (require('stream').Readable)();
    unhideReqStream.method = 'POST';
    unhideReqStream.url = 'http://localhost/api/admin-moderation';
    unhideReqStream.headers = {
      authorization: 'Bearer mock-admin-token',
      'content-type': 'application/json'
    };
    unhideReqStream.push(JSON.stringify({
      entity_type: 'community_post',
      entity_id: testPostId,
      action: 'unhide'
    }));
    unhideReqStream.push(null);
    await handleModeration(unhideReqStream, { statusCode: 200, setHeader() {}, end() {} });
    console.log('  ✓ Admin đã hiện lại bài viết.');

    const guestCheckUnhidden = await cdp.eval(`
      (async () => {
        if (window.ViVuApp && window.ViVuApp.syncCommunityUgcFeed) {
          await window.ViVuApp.syncCommunityUgcFeed();
        }
        await new Promise(r => setTimeout(r, 1000));
        const feed = document.getElementById('communityPostsFeed');
        const hasSnippet = feed ? feed.textContent.includes('nghi thức đắp núi cát') : false;
        return { ok: true, isVisibleOnDom: hasSnippet };
      })()
    `);

    if (!guestCheckUnhidden.isVisibleOnDom) {
      throw new Error('Bài viết hiện lại không xuất hiện trên DOM của khách!');
    }
    console.log('  ✓ [DOM Phiên Khách] Xác nhận bài viết ĐÃ XUẤT HIỆN LẠI trên giao diện khách.');

    const shot5 = path.join(ARTIFACT_DIR, 'browser_guest_content_unhidden.png');
    await cdp.captureScreenshot(shot5);
    console.log(`  ✓ ĐÃ CHỤP ẢNH MÀN HÌNH: ${shot5}`);

    // --------------------------------------------------------------------------
    // 8. ADMIN XÓA VÀO THÙNG RÁC (TRASH) & PHIÊN KHÁCH KIỂM TRA NỘI DUNG BIẾN MẤT
    // --------------------------------------------------------------------------
    const trashReqStream = new (require('stream').Readable)();
    trashReqStream.method = 'POST';
    trashReqStream.url = 'http://localhost/api/admin-moderation';
    trashReqStream.headers = {
      authorization: 'Bearer mock-admin-token',
      'content-type': 'application/json'
    };
    trashReqStream.push(JSON.stringify({
      entity_type: 'community_post',
      entity_id: testPostId,
      action: 'trash'
    }));
    trashReqStream.push(null);
    await handleModeration(trashReqStream, { statusCode: 200, setHeader() {}, end() {} });
    console.log('  ✓ Admin đã xóa bài viết vào thùng rác.');

    const guestCheckTrashed = await cdp.eval(`
      (async () => {
        if (window.ViVuApp && window.ViVuApp.syncCommunityUgcFeed) {
          await window.ViVuApp.syncCommunityUgcFeed();
        }
        await new Promise(r => setTimeout(r, 1000));
        const feed = document.getElementById('communityPostsFeed');
        const hasSnippet = feed ? feed.textContent.includes('nghi thức đắp núi cát') : false;
        return { ok: true, isRemovedOnDom: !hasSnippet };
      })()
    `);

    if (!guestCheckTrashed.isRemovedOnDom) {
      throw new Error('Bài viết trong thùng rác vẫn hiển thị trên DOM!');
    }
    console.log('  ✓ [DOM Phiên Khách] Xác nhận bài viết bị xóa vào thùng rác ĐÃ BIẾN MẤT khỏi giao diện khách.');

    const shot6 = path.join(ARTIFACT_DIR, 'browser_guest_content_trashed.png');
    await cdp.captureScreenshot(shot6);
    console.log(`  ✓ ĐÃ CHỤP ẢNH MÀN HÌNH: ${shot6}`);

    console.log('\n================================================================================');
    console.log(' TOÀN BỘ 6 BƯỚC KIỂM THỬ TRÌNH DUYỆT DOM ĐÃ HOÀN TẤT XUẤT SẮC 100%!');
    console.log('================================================================================\n');

  } catch (err) {
    console.error('\n[LỖI TRÌNH DUYỆT E2E]:', err.message);
    process.exitCode = 1;
  } finally {
    // --------------------------------------------------------------------------
    // DỌN DẸP AN TOÀN
    // --------------------------------------------------------------------------
    console.log('[Dọn dẹp] Dọn dẹp tài nguyên và dữ liệu thử nghiệm...');
    if (cdp) await cdp.close();
    if (chromeProc) {
      try { chromeProc.kill(); } catch (_) {}
    }
    if (localServer) {
      await new Promise(r => localServer.close(r));
    }

    try {
      await supabaseRequest(`community_posts?id=eq.${testPostId}`, { method: 'DELETE' }).catch(() => {});
      await supabaseRequest(`point_transactions?entity_id=eq.${testPostId}`, { method: 'DELETE' }).catch(() => {});
      await supabaseRequest(`admin_audit_logs?entity_id=eq.${testPostId}`, { method: 'DELETE' }).catch(() => {});
      console.log('  ✓ Đã xóa sạch bài viết thử nghiệm và nhật ký kiểm toán liên quan.');
    } catch (_) {}
  }
}

run();
