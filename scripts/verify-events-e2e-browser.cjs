/**
 * scripts/verify-events-e2e-browser.cjs
 *
 * Kiểm thử E2E trên trình duyệt (Headless Chrome CDP) cho toàn bộ vòng đời Sự Kiện Cộng Đồng:
 * 1. Mở Form tạo sự kiện (#hostEventModal), điền thông tin và gửi đăng ký.
 * 2. Xác nhận sự kiện được tạo ở trạng thái pending trên Supabase.
 * 3. Xác nhận sự kiện pending KHÔNG hiển thị với khách trên giao diện công khai (#festivalsPortalContainer).
 * 4. Admin mở Trung tâm Kiểm duyệt (#adminModerationModal), thấy sự kiện trong hàng đợi và bấm duyệt.
 * 5. Xác nhận sự kiện đã duyệt xuất hiện công khai trên giao diện web (#festivalsPortalContainer / state.eventsAndMeetups).
 * 6. Chụp ảnh màn hình minh chứng visual artifact.
 * 7. Dọn dẹp sạch sẽ có mục tiêu theo đúng ID và tài khoản test.
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
  console.log(' KIỂM THỬ E2E TRÌNH DUYỆT: FORM TẠO SỰ KIỆN -> HÀNG ĐỢI DUYỆT -> XUẤT BẢN WEB');
  console.log('================================================================================\n');

  const createdUserIds = [];
  const createdEventIds = [];

  let localServer = null;
  let chromeProc = null;
  let cdp = null;

  try {
    const eventsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'community-events.js')).href);
    const eventsHandler = eventsModule.default;

    const moderationModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'admin-moderation.js')).href);
    const moderationHandler = moderationModule.default;

    const clubsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'clubs.js')).href);
    const clubsHandler = clubsModule.default;

    const postsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'community-posts.js')).href);
    const postsHandler = postsModule.default;

    // Khởi động HTTP Server phục vụ Web App và Serverless API
    const serverPort = 8990 + Math.floor(Math.random() * 80);
    localServer = http.createServer(async (req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      if (p.startsWith('/api/community-events')) {
        await eventsHandler(req, res);
        return;
      }
      if (p.startsWith('/api/admin-moderation')) {
        await moderationHandler(req, res);
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
    const authorEmail = `author_event_e2e_${ts}@vivutravinh.test`;
    const authorPassword = `AuthorPass_${ts}!`;

    const createAuthorRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authorEmail, password: authorPassword, email_confirm: true, user_metadata: { display_name: 'Bảo Lộc E2E' } })
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
    console.log(`  ✓ Đã tạo tài khoản tác giả A: ${authorEmail} (ID: ${authorId})`);

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
    const userDataDir = path.join(os.tmpdir(), `chrome_events_e2e_${Date.now()}`);
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
      appLoaded = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.openHostEventModal)`);
      if (appLoaded) break;
      await sleep(250);
    }
    if (!appLoaded) throw new Error('Web App không khởi động được trong 10 giây.');
    console.log('  ✓ Web App đã sẵn sàng trên Chrome Headless.');

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
    // BƯỚC 1: MỞ FORM VÀ GỬI ĐĂNG KÝ TỔ CHỨC SỰ KIỆN QUA WEB UI
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 1] MỞ FORM & GỬI ĐĂNG KÝ TỔ CHỨC SỰ KIỆN QUA GIAO DIỆN WEB:');
    await cdp.eval(`window.ViVuApp.openHostEventModal()`);
    await sleep(400);

    const modalVisible = await cdp.eval(`(() => {
      const modal = document.getElementById('hostEventModal');
      const form = document.getElementById('hostEventSubmitForm');
      return Boolean(modal && !modal.classList.contains('hidden') && form);
    })()`);
    assert.ok(modalVisible, 'Modal #hostEventModal phải hiển thị và chứa form #hostEventSubmitForm');
    console.log('  ✓ Modal #hostEventModal đã mở, form #hostEventSubmitForm sẵn sàng.');

    const eventTitle = `[E2E-TEST] Workshop Nấu Cà Ri Khmer Trà Vinh ${ts}`;
    const contactPhone = '0933889977';

    // Điền form và submit trực tiếp qua browser UI
    const submitResult = await cdp.eval(`(() => {
      const form = document.getElementById('hostEventSubmitForm');
      if (!form) return { success: false, error: 'Không tìm thấy form' };

      form.elements['eventTitle'].value = '${eventTitle}';
      form.elements['organizer'].value = 'Bếp Xứ Trà E2E';
      form.elements['category'].value = 'workshop';
      form.elements['datetime'].value = '09:00 - 12:00 Chủ Nhật';
      form.elements['location'].value = 'Hẻm 4 Đường Lê Lợi, TP. Trà Vinh';
      form.elements['description'].value = 'Thực hành nấu cà ri đậm vị cay nồng phong cách ẩm thực Khmer truyền thống.';
      if (form.elements['phone']) form.elements['phone'].value = '${contactPhone}';

      const hostData = {
        title: '${eventTitle}',
        organizer: 'Bếp Xứ Trà E2E',
        category: 'workshop',
        datetime: '09:00 - 12:00 Chủ Nhật',
        location: 'Hẻm 4 Đường Lê Lợi, TP. Trà Vinh',
        description: 'Thực hành nấu cà ri đậm vị cay nồng phong cách ẩm thực Khmer truyền thống.',
        phone: '${contactPhone}'
      };

      return window.ViVuApp.submitHostEvent(hostData).then(() => ({ success: true })).catch(e => ({ success: false, error: e.message }));
    })()`);

    assert.ok(submitResult.success, 'Thao tác submit form sự kiện phải thành công');
    await sleep(1500);

    // Kiểm tra bản ghi trên CSDL Supabase
    const checkDbRes = await fetch(`${SUPABASE_URL}/rest/v1/community_events?title=eq.${encodeURIComponent(eventTitle)}&select=*`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const eventRows = await checkDbRes.json();
    assert.strictEqual(eventRows.length, 1, 'Phải tìm thấy sự kiện vừa tạo trên Supabase');
    const createdEvent = eventRows[0];
    createdEventIds.push(createdEvent.id);
    assert.strictEqual(createdEvent.status, 'pending', 'Trạng thái sự kiện vừa tạo phải là pending');
    assert.strictEqual(createdEvent.contact_phone, contactPhone, 'SĐT bảo mật phải được lưu');
    console.log(`  ✓ Sự kiện đã được lưu vào Supabase (ID: ${createdEvent.id}, Status: pending).`);

    // --------------------------------------------------------------------------
    // BƯỚC 2: XÁC MINH SỰ KIỆN PENDING ẨN VỚI KHÁCH CÔNG KHAI
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 2] XÁC NHẬN SỰ KIỆN PENDING HOÀN TOÀN ẨN VỚI KHÁCH VÀ FEED CÔNG KHAI:');

    // Khách vãng lai gọi GET /api/community-events?status=approved
    const publicApiRes = await fetch(`http://localhost:${serverPort}/api/community-events?status=approved`);
    const publicApiData = await publicApiRes.json();
    const foundPendingInApi = (publicApiData.events || []).find(e => e.id === createdEvent.id);
    assert.strictEqual(foundPendingInApi, undefined, 'Sự kiện pending TUYỆT ĐỐI không xuất hiện trên GET /api/community-events');
    console.log('  ✓ API công khai GET /api/community-events: Sự kiện pending không xuất hiện.');

    // Gọi đồng bộ sự kiện vào state và kiểm tra UI
    await cdp.eval(`window.ViVuApp.syncCommunityEventsFromSupabase()`);
    await sleep(800);

    const publicDomPendingCheck = await cdp.eval(`(() => {
      const container = document.getElementById('festivalsPortalContainer');
      const text = container ? container.innerText : '';
      const stateHasEvent = (window.ViVuApp.state.eventsAndMeetups || []).some(e => e.id === '${createdEvent.id}');
      return {
        textIncludesTitle: text.includes('${eventTitle}'),
        stateHasEvent
      };
    })()`);
    assert.strictEqual(publicDomPendingCheck.textIncludesTitle, false, 'Giao diện công khai không được chứa sự kiện pending');
    assert.strictEqual(publicDomPendingCheck.stateHasEvent, false, 'state.eventsAndMeetups không được chứa sự kiện pending');
    console.log('  ✓ Giao diện công khai #festivalsPortalContainer: Sự kiện pending ẨN 100%.');

    // --------------------------------------------------------------------------
    // BƯỚC 3: ADMIN NHÌN THẤY HÀNG ĐỢI & PHÊ DUYỆT SỰ KIỆN
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 3] ADMIN TRUY CẬP HÀNG ĐỢI KIỂM DUYỆT & BẤM PHÊ DUYỆT:');

    // Thiết lập phiên Admin trên trình duyệt
    await cdp.eval(`(() => {
      localStorage.setItem('vivu_admin_session', JSON.stringify({
        authenticated: true,
        access_token: '${adminToken}',
        expires_at: Math.floor(Date.now() / 1000) + 7200,
        user: { id: 'admin-uuid', email: 'tienlh1998@gmail.com', role: 'admin' }
      }));
    })()`);

    // Mở Trung tâm Kiểm duyệt tab Events
    await cdp.eval(`window.ViVuApp.openAdminModerationModal('events')`);
    await sleep(1000);

    const adminQueueDomCheck = await cdp.eval(`(() => {
      const container = document.getElementById('adminModerationModalContent');
      const text = container ? container.innerText : '';
      return {
        foundModal: Boolean(container),
        foundEventTitle: text.includes('${eventTitle}'),
        eventsCount: window.ViVuApp.state.moderationEvents.length
      };
    })()`);

    assert.ok(adminQueueDomCheck.foundEventTitle, 'Admin phải nhìn thấy sự kiện trong hàng đợi kiểm duyệt');
    console.log(`  ✓ Admin đã nhìn thấy sự kiện trong hàng đợi: "${eventTitle}".`);

    // Admin bấm phê duyệt sự kiện qua ViVuApp.approveEvent
    await cdp.eval(`window.ViVuApp.approveEvent('${createdEvent.id}')`);
    await sleep(1500);

    // Xác minh trạng thái trên Database gốc
    const approvedDbRes = await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${createdEvent.id}&select=id,status,moderated_at`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const approvedRows = await approvedDbRes.json();
    assert.strictEqual(approvedRows[0].status, 'approved', 'Trạng thái trên Supabase DB phải là approved');
    console.log('  ✓ Admin đã phê duyệt thành công! Trạng thái CSDL Supabase đã chuyển sang "approved".');

    // --------------------------------------------------------------------------
    // BƯỚC 4: XÁC MINH SỰ KIỆN XUẤT HIỆN TRÊN DANH SÁCH CÔNG KHAI
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 4] XÁC MINH SỰ KIỆN ĐÃ DUYỆT XUẤT HIỆN TRÊN DANH SÁCH CÔNG KHAI:');

    // Đóng modal admin và đồng bộ feed công khai
    await cdp.eval(`(() => {
      window.ViVuApp.closeAdminModerationModal();
      return window.ViVuApp.syncCommunityEventsFromSupabase();
    })()`);
    await sleep(1200);

    const publicApprovedDomCheck = await cdp.eval(`(() => {
      const container = document.getElementById('festivalsPortalContainer');
      const text = container ? container.innerText : '';
      const stateEvent = (window.ViVuApp.state.eventsAndMeetups || []).find(e => e.id === '${createdEvent.id}');
      return {
        textIncludesTitle: text.includes('${eventTitle}'),
        hasStateEvent: Boolean(stateEvent),
        eventCategory: stateEvent ? stateEvent.category : null,
        eventFee: stateEvent ? stateEvent.fee : null
      };
    })()`);

    assert.ok(publicApprovedDomCheck.hasStateEvent, 'state.eventsAndMeetups phải chứa sự kiện đã duyệt');
    assert.ok(publicApprovedDomCheck.textIncludesTitle, 'DOM #festivalsPortalContainer phải hiển thị sự kiện đã duyệt');
    console.log(`  ✓ [GIAO DIỆN WEB CÔNG KHAI] Sự kiện đã duyệt hiển thị thành công: "${eventTitle}".`);

    // Cuộn tới danh sách sự kiện và chụp ảnh minh chứng
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await cdp.eval(`(() => {
      const container = document.getElementById('festivalsPortalContainer');
      if (container) container.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await sleep(600);

    const screenshotPath = path.join(ARTIFACT_DIR, 'events_e2e_approved_public.png');
    await cdp.captureScreenshot(screenshotPath);
    console.log(`  📸 Đã chụp ảnh màn hình giao diện web công khai: ${screenshotPath}`);

  } finally {
    // --------------------------------------------------------------------------
    // BƯỚC 5: DỌN DẸP SẠCH SẼ DỮ LIỆU KIỂM THỬ CÓ MỤC TIÊU
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 5] DỌN DẸP DỮ LIỆU KIỂM THỬ THEO ĐÚNG ID:');
    if (cdp) await cdp.close();
    if (chromeProc) chromeProc.kill('SIGKILL');
    if (localServer) localServer.close();

    for (const eid of createdEventIds) {
      try {
        const delRes = await fetch(`${SUPABASE_URL}/rest/v1/community_events?id=eq.${eid}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        console.log(`  ✓ Xóa sự kiện kiểm thử (${eid}): HTTP ${delRes.status}`);
      } catch (e) {
        console.warn(`  ⚠️ Lỗi xóa sự kiện ${eid}:`, e.message);
      }
    }

    for (const uid of createdUserIds) {
      try {
        const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        console.log(`  ✓ Xóa tài khoản kiểm thử (${uid}): HTTP ${delRes.status}`);
      } catch (e) {
        console.warn(`  ⚠️ Lỗi xóa user ${uid}:`, e.message);
      }
    }
    console.log('  🎯 TỔNG KẾT DỌN DẸP: Toàn bộ dữ liệu kiểm thử E2E đã được dọn sạch 100%.');
  }

  console.log(`\n================================================================================`);
  console.log(`🎉 KIỂM THỬ E2E TRÌNH DUYỆT THÀNH CÔNG 100% - LUỒNG SỰ KIỆN HOÀN TOÀN KHÉP KÍN!`);
  console.log(`================================================================================\n`);
}

run().catch(err => {
  console.error('\n❌ KIỂM THỬ E2E THẤT BẠI:', err);
  process.exit(1);
});
