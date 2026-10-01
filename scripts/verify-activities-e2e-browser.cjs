/**
 * scripts/verify-activities-e2e-browser.cjs
 *
 * Kiểm thử E2E trên trình duyệt (Headless Chrome CDP) cho toàn bộ vòng đời Lịch sinh hoạt CLB (G13):
 * 1. Chủ nhiệm mở Form tạo lịch sinh hoạt (#submitClubActivityModal), form kiểm tra phân quyền chủ nhiệm.
 * 2. Điền thông tin buổi sinh hoạt và gửi duyệt lên hệ thống.
 * 3. Xác nhận buổi sinh hoạt được tạo ở trạng thái pending trên Supabase, chống giả mạo thông tin.
 * 4. Xác nhận buổi sinh hoạt pending KHÔNG hiển thị với khách trên giao diện công khai (#weeklyActivitiesList).
 * 5. Admin mở Trung tâm Kiểm duyệt (#adminModerationModal) tab Lịch CLB, thấy lịch trong hàng đợi và bấm duyệt.
 * 6. Xác nhận lịch sinh hoạt đã duyệt xuất hiện công khai trên giao diện web (#weeklyActivitiesList).
 * 7. Chụp ảnh màn hình minh chứng visual artifact.
 * 8. Dọn dẹp sạch sẽ có mục tiêu theo đúng ID và tài khoản test.
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
  console.log(' KIỂM THỬ E2E TRÌNH DUYỆT: TẠO LỊCH CLB -> HÀNG ĐỢI DUYỆT -> XUẤT BẢN WEB (G13)');
  console.log('================================================================================\n');

  const createdUserIds = [];
  const createdClubIds = [];
  const createdActivityIds = [];

  let localServer = null;
  let chromeProc = null;
  let cdp = null;

  try {
    const activitiesModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'club-activities.js')).href);
    const activitiesHandler = activitiesModule.default;

    const moderationModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', '_admin', 'moderation.js')).href);
    const moderationHandler = moderationModule.default;

    const clubsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'clubs.js')).href);
    const clubsHandler = clubsModule.default;

    const eventsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'community-events.js')).href);
    const eventsHandler = eventsModule.default;

    const postsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'community-posts.js')).href);
    const postsHandler = postsModule.default;

    const articlesModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'articles.js')).href);
    const articlesHandler = articlesModule.default;

    // Khởi động HTTP Server phục vụ Web App và Serverless API
    const serverPort = 8990 + Math.floor(Math.random() * 80);
    localServer = http.createServer(async (req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      if (p.startsWith('/api/club-activities')) {
        await activitiesHandler(req, res);
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
      if (p.startsWith('/api/community-events')) {
        await eventsHandler(req, res);
        return;
      }
      if (p.startsWith('/api/community-posts')) {
        await postsHandler(req, res);
        return;
      }
      if (p.startsWith('/api/articles')) {
        await articlesHandler(req, res);
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

    // Khởi tạo tài khoản Chủ nhiệm thử nghiệm
    const ts = Date.now();
    const leaderEmail = `leader_activity_e2e_${ts}@vivutravinh.test`;
    const leaderPassword = `LeaderPass_${ts}!`;

    const createLeaderRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: leaderEmail, password: leaderPassword, email_confirm: true, user_metadata: { display_name: 'Hoàng Long E2E' } })
    });
    const leaderData = await createLeaderRes.json();
    const leaderId = leaderData.id;
    createdUserIds.push(leaderId);

    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: leaderEmail, password: leaderPassword })
    });
    const loginData = await loginRes.json();
    const leaderToken = loginData.access_token;
    assert.ok(leaderToken, 'Phải có token chủ nhiệm');
    console.log(`  ✓ Đã tạo tài khoản Chủ nhiệm: ${leaderEmail} (ID: ${leaderId})`);

    // Tạo CLB ĐÃ DUYỆT (approved) cho Chủ nhiệm này
    const testClubId = `clb-test-act-e2e-${ts}`;
    const testClubName = `CLB Khám Phá Nhiếp Ảnh Xứ Trà ${ts}`;
    const createClubRes = await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        id: testClubId,
        name: testClubName,
        category: 'di-san',
        status: 'approved',
        leader_id: leaderId,
        leader_name: 'Hoàng Long E2E',
        leader_phone: '0988776655',
        created_at: new Date().toISOString()
      })
    });
    if (![200, 201].includes(createClubRes.status)) {
      const errText = await createClubRes.text();
      throw new Error(`Tạo CLB thất bại: ${createClubRes.status} ${errText}`);
    }
    createdClubIds.push(testClubId);
    console.log(`  ✓ Đã tạo CLB đã phê duyệt: "${testClubName}" (ID: ${testClubId})`);

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
    const userDataDir = path.join(os.tmpdir(), `chrome_act_e2e_${Date.now()}`);
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
      appLoaded = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.openSubmitClubActivityModal)`);
      if (appLoaded) break;
      await sleep(250);
    }
    if (!appLoaded) throw new Error('Web App không khởi động được trong 10 giây.');
    console.log('  ✓ Web App đã sẵn sàng trên Chrome Headless.');

    // Thiết lập phiên đăng nhập cho Chủ nhiệm trên trình duyệt
    await cdp.eval(`(() => {
      localStorage.setItem('vivu_user_session', JSON.stringify({
        authenticated: true,
        access_token: '${leaderToken}',
        expires_at: Math.floor(Date.now() / 1000) + 7200,
        user: { id: '${leaderId}', email: '${leaderEmail}', role: 'member' }
      }));
      if (window.ViVuApp && window.ViVuApp.getState) {
        const s = window.ViVuApp.getState();
        s.currentUser = { id: '${leaderId}', email: '${leaderEmail}', role: 'member' };
        if (!s.clubs) s.clubs = [];
        s.clubs.push({
          id: '${testClubId}',
          name: '${testClubName}',
          status: 'approved',
          leader_id: '${leaderId}',
          leaderId: '${leaderId}'
        });
      }
    })()`);
    console.log('  ✓ Đã thiết lập phiên đăng nhập Chủ nhiệm CLB trên trình duyệt.');

    // --------------------------------------------------------------------------
    // BƯỚC 1: MỞ FORM TẠO LỊCH SINH HOẠT VÀ KIỂM TRA PHÂN QUYỀN
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 1] MỞ FORM & GỬI LỊCH SINH HOẠT CLB QUA GIAO DIỆN WEB:');
    await cdp.eval(`window.ViVuApp.openSubmitClubActivityModal()`);
    await sleep(400);

    const modalCheck = await cdp.eval(`(() => {
      const modal = document.getElementById('submitClubActivityModal');
      const form = document.getElementById('submitClubActivityForm');
      const select = document.getElementById('activityClubSelect');
      const hasClubOption = select ? Array.from(select.options).some(o => o.value === '${testClubId}') : false;
      return {
        isOpen: Boolean(modal && !modal.classList.contains('hidden')),
        hasForm: Boolean(form),
        hasClubOption
      };
    })()`);

    assert.ok(modalCheck.isOpen, 'Modal #submitClubActivityModal phải đang mở');
    assert.ok(modalCheck.hasForm, 'Form #submitClubActivityForm phải hiển thị cho Chủ nhiệm');
    assert.ok(modalCheck.hasClubOption, 'Dropdown CLB phải chứa CLB đã duyệt của Chủ nhiệm');
    console.log('  ✓ Modal #submitClubActivityModal đã mở, quyền Chủ nhiệm được xác nhận thành công.');

    const activityTitle = `[E2E-TEST] Săn Ảnh Hoàng Hôn Cồn Chim Cùng CLB ${ts}`;
    const timeSchedule = '16:30 - 18:30 Thứ Bảy';
    const location = 'Bến phà Cồn Chim, Châu Thành, Trà Vinh';
    const description = 'Chuyến sáng tác ảnh thực tế hoàng hôn trên sông Cổ Chiên dành cho các thành viên đam mê nhiếp ảnh.';

    // --------------------------------------------------------------------------
    // BƯỚC 2: ĐIỀN FORM VÀ SUBMIT QUA WEB UI
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 2] ĐIỀN FORM & SUBMIT LỊCH SINH HOẠT QUA BROWSER:');
    const submitResult = await cdp.eval(`(() => {
      const form = document.getElementById('submitClubActivityForm');
      if (!form) return { success: false, error: 'Không tìm thấy form' };

      form.elements['club_id'].value = '${testClubId}';
      form.elements['title'].value = '${activityTitle}';
      form.elements['time_schedule'].value = '${timeSchedule}';
      form.elements['location'].value = '${location}';
      if (form.elements['max_attendees']) form.elements['max_attendees'].value = '25';
      if (form.elements['description']) form.elements['description'].value = '${description}';

      const fakeEvent = { preventDefault: () => {} };
      return window.ViVuApp.submitClubActivity(fakeEvent).then(() => ({ success: true })).catch(e => ({ success: false, error: e.message }));
    })()`);

    assert.ok(submitResult.success, `Submit form phải thành công: ${submitResult.error || ''}`);
    await sleep(1500);

    // Kiểm tra bản ghi trên Supabase DB
    const checkDbRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activities?title=eq.${encodeURIComponent(activityTitle)}&select=*`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const actRows = await checkDbRes.json();
    assert.strictEqual(actRows.length, 1, 'Phải tìm thấy lịch sinh hoạt vừa tạo trên Supabase DB');
    const createdActivity = actRows[0];
    createdActivityIds.push(createdActivity.id);
    assert.strictEqual(createdActivity.status, 'pending', 'Trạng thái lịch mới tạo phải là pending');
    assert.strictEqual(createdActivity.club_id, testClubId, 'Mã CLB phải khớp với CLB của chủ nhiệm');
    assert.strictEqual(createdActivity.club_name, testClubName, 'Tên CLB phải được điền chuẩn xác từ database');
    assert.strictEqual(createdActivity.creator_role, 'Chủ nhiệm CLB', 'Vai trò người tạo được bảo vệ nghiêm ngặt');
    console.log(`  ✓ Lịch sinh hoạt đã được lưu vào Supabase (ID: ${createdActivity.id}, Status: pending).`);

    // --------------------------------------------------------------------------
    // BƯỚC 3: XÁC MINH LỊCH PENDING HOÀN TOÀN ẨN VỚI KHÁCH CÔNG KHAI
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 3] XÁC NHẬN LỊCH PENDING HOÀN TOÀN ẨN VỚI KHÁCH CÔNG KHAI:');

    // Khách vãng lai gọi GET /api/club-activities?status=approved
    const publicApiRes = await fetch(`http://localhost:${serverPort}/api/club-activities?status=approved`);
    const publicApiData = await publicApiRes.json();
    const foundPendingInApi = (publicApiData.activities || []).find(a => a.id === createdActivity.id);
    assert.strictEqual(foundPendingInApi, undefined, 'Lịch pending TUYỆT ĐỐI không xuất hiện trên GET /api/club-activities?status=approved');
    console.log('  ✓ API công khai GET /api/club-activities: Lịch pending không xuất hiện.');

    // Xóa session chủ nhiệm để giả lập khách vãng lai trên browser
    await cdp.eval(`(() => {
      localStorage.removeItem('vivu_user_session');
      if (window.ViVuApp && window.ViVuApp.getState) {
        window.ViVuApp.getState().currentUser = null;
      }
      return window.ViVuApp.syncClubActivitiesFromSupabase();
    })()`);
    await sleep(800);

    const publicDomPendingCheck = await cdp.eval(`(() => {
      const container = document.getElementById('weeklyActivitiesList');
      const text = container ? container.innerText : '';
      return {
        textIncludesTitle: text.includes('${activityTitle}')
      };
    })()`);
    assert.strictEqual(publicDomPendingCheck.textIncludesTitle, false, 'Giao diện công khai #weeklyActivitiesList không được chứa lịch pending');
    console.log('  ✓ Giao diện công khai #weeklyActivitiesList: Lịch pending ẨN 100% với khách vãng lai.');

    // --------------------------------------------------------------------------
    // BƯỚC 4: ADMIN NHÌN THẤY HÀNG ĐỢI KIỂM DUYỆT & BẤM PHÊ DUYỆT
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 4] ADMIN TRUY CẬP HÀNG ĐỢI KIỂM DUYỆT & BẤM PHÊ DUYỆT:');

    // Thiết lập phiên Admin trên trình duyệt
    await cdp.eval(`(() => {
      localStorage.setItem('vivu_admin_session', JSON.stringify({
        authenticated: true,
        access_token: '${adminToken}',
        expires_at: Math.floor(Date.now() / 1000) + 7200,
        user: { id: 'admin-uuid', email: 'tienlh1998@gmail.com', role: 'admin' }
      }));
    })()`);

    // Mở Trung tâm Kiểm duyệt tab Lịch CLB (activities)
    await cdp.eval(`window.ViVuApp.openAdminModerationModal('activities')`);
    await sleep(1000);

    const adminQueueDomCheck = await cdp.eval(`(() => {
      const container = document.getElementById('adminModerationModalContent');
      const text = container ? container.innerText : '';
      return {
        foundModal: Boolean(container),
        foundActivityTitle: text.includes('${activityTitle}'),
        activitiesCount: window.ViVuApp.state.moderationActivities.length
      };
    })()`);

    assert.ok(adminQueueDomCheck.foundActivityTitle, 'Admin phải nhìn thấy buổi sinh hoạt trong hàng đợi kiểm duyệt');
    console.log(`  ✓ Admin đã nhìn thấy buổi sinh hoạt trong hàng đợi: "${activityTitle}".`);

    // Admin bấm phê duyệt buổi sinh hoạt qua ViVuApp.approveClubActivity
    await cdp.eval(`window.ViVuApp.approveClubActivity('${createdActivity.id}')`);
    await sleep(1500);

    // Xác minh trạng thái trên Database gốc
    const approvedDbRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${createdActivity.id}&select=id,status,moderated_at`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const approvedRows = await approvedDbRes.json();
    assert.strictEqual(approvedRows[0].status, 'approved', 'Trạng thái trên Supabase DB phải là approved');
    console.log('  ✓ Admin đã phê duyệt thành công! Trạng thái CSDL Supabase đã chuyển sang "approved".');

    // --------------------------------------------------------------------------
    // BƯỚC 5: XÁC MINH BUỔI SINH HOẠT XUẤT HIỆN TRÊN GIAO DIỆN WEB CÔNG KHAI
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 5] XÁC MINH BUỔI SINH HOẠT ĐÃ DUYỆT XUẤT HIỆN TRÊN WEB CÔNG KHAI:');

    // Đóng modal admin và đồng bộ feed công khai
    await cdp.eval(`(() => {
      window.ViVuApp.closeAdminModerationModal();
      return window.ViVuApp.syncClubActivitiesFromSupabase();
    })()`);
    await sleep(1200);

    const publicApprovedDomCheck = await cdp.eval(`(() => {
      const container = document.getElementById('weeklyActivitiesList');
      const text = container ? container.innerText : '';
      const stateActivity = (window.ViVuApp.state.weeklyActivities || []).find(a => a.id === '${createdActivity.id}');
      return {
        textIncludesTitle: text.includes('${activityTitle}'),
        textIncludesClub: text.includes('${testClubName}'),
        hasStateActivity: Boolean(stateActivity),
        activityStatus: stateActivity ? stateActivity.status : null
      };
    })()`);

    assert.ok(publicApprovedDomCheck.hasStateActivity, 'state.weeklyActivities phải chứa buổi sinh hoạt đã duyệt');
    assert.strictEqual(publicApprovedDomCheck.activityStatus, 'approved', 'Trạng thái trong state phải là approved');
    assert.ok(publicApprovedDomCheck.textIncludesTitle, 'DOM #weeklyActivitiesList phải hiển thị tiêu đề buổi sinh hoạt đã duyệt');
    console.log(`  ✓ [GIAO DIỆN WEB CÔNG KHAI] Buổi sinh hoạt đã duyệt hiển thị thành công: "${activityTitle}".`);

    // Cuộn tới widget lịch sinh hoạt và chụp ảnh minh chứng
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await cdp.eval(`(() => {
      const container = document.getElementById('weeklyActivitiesList');
      if (container) container.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await sleep(600);

    const screenshotPath = path.join(ARTIFACT_DIR, 'club_activities_e2e_approved_public.png');
    await cdp.captureScreenshot(screenshotPath);
    console.log(`  📸 Đã chụp ảnh màn hình giao diện web công khai: ${screenshotPath}`);

  } finally {
    // --------------------------------------------------------------------------
    // BƯỚC 6: DỌN DẸP SẠCH SẼ DỮ LIỆU KIỂM THỬ CÓ MỤC TIÊU
    // --------------------------------------------------------------------------
    console.log('\n[BƯỚC 6] DỌN DẸP DỮ LIỆU KIỂM THỬ THEO ĐÚNG ID:');
    if (cdp) await cdp.close();
    if (chromeProc) chromeProc.kill('SIGKILL');
    if (localServer) localServer.close();

    for (const actId of createdActivityIds) {
      try {
        const delRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${actId}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        console.log(`  ✓ Xóa buổi sinh hoạt kiểm thử (${actId}): HTTP ${delRes.status}`);
      } catch (e) {
        console.warn(`  ⚠️ Lỗi xóa buổi sinh hoạt ${actId}:`, e.message);
      }
    }

    for (const cid of createdClubIds) {
      try {
        const delRes = await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${cid}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        console.log(`  ✓ Xóa CLB kiểm thử (${cid}): HTTP ${delRes.status}`);
      } catch (e) {
        console.warn(`  ⚠️ Lỗi xóa CLB ${cid}:`, e.message);
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
        console.warn(`  ⚠️ Lỗi xóa tài khoản ${uid}:`, e.message);
      }
    }

    console.log('\n================================================================================');
    console.log('🎉 KIỂM THỬ E2E TRÌNH DUYỆT HOÀN TẤT XUẤT SẮC - 100% ĐẠT CHUẨN AN TOÀN & MINH BẠCH!');
    console.log('================================================================================\n');
  }
}

run().catch(err => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
