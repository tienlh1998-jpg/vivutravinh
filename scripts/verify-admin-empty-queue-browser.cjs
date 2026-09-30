/**
 * scripts/verify-admin-empty-queue-browser.cjs
 *
 * Kiểm tra thực tế trên trình duyệt (Browser Headless CDP):
 * 1. Khởi tạo localStorage với mảng rỗng '[]'.
 * 2. Đăng nhập Admin và mở Trung tâm Kiểm duyệt (#adminModerationModal).
 * 3. Kiểm tra DOM thực tế cho cả 3 tab:
 *    - Tab Bài viết: Hiển thị card "Không có bài viết nào chờ duyệt", 0% bài mock.
 *    - Tab CLB: Hiển thị card "Không có hồ sơ CLB nào chờ duyệt", 0% CLB mock.
 *    - Tab Sự kiện: Hiển thị card "Không có sự kiện nào chờ duyệt", 0% sự kiện mock.
 * 4. Chụp ảnh minh chứng visual artifact.
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
  '.svg': 'image/svg+xml'
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
  console.log(' KIỂM TRA BROWSER THỰC TẾ: HÀNG ĐỢI KIỂM DUYỆT RỖNG & ZERO MOCK FALLBACK');
  console.log('================================================================================\n');

  let localServer = null;
  let chromeProc = null;
  let cdp = null;

  try {
    const moderationModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'admin-moderation.js')).href);
    const moderationHandler = moderationModule.default;

    const eventsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'community-events.js')).href);
    const eventsHandler = eventsModule.default;

    const clubsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'clubs.js')).href);
    const clubsHandler = clubsModule.default;

    const postsModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'community-posts.js')).href);
    const postsHandler = postsModule.default;

    const serverPort = 8890 + Math.floor(Math.random() * 100);
    localServer = http.createServer(async (req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
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

    const chromeCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromeCandidates.find(fs.existsSync);
    if (!chromeExe) throw new Error('Không tìm thấy Google Chrome.');

    const cdpPort = 9660 + Math.floor(Math.random() * 100);
    const userDataDir = path.join(os.tmpdir(), `chrome_empty_queue_${Date.now()}`);
    chromeProc = spawn(chromeExe, [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      '--no-sandbox',
      '--disable-gpu',
      `--user-data-dir=${userDataDir}`,
      `http://localhost:${serverPort}/`
    ]);

    const wsUrl = await getDebuggerUrl(cdpPort);
    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    let appLoaded = false;
    for (let i = 0; i < 40; i++) {
      appLoaded = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.openAdminModerationModal)`);
      if (appLoaded) break;
      await sleep(250);
    }
    if (!appLoaded) throw new Error('Web App không khởi động được trong 10 giây.');
    console.log('  ✓ Web App đã sẵn sàng trên Chrome Headless.');

    // 1. Thiết lập LocalStorage với mảng rỗng '[]' và thiết lập phiên quản trị viên
    await cdp.eval(`(() => {
      localStorage.setItem('vivu_admin_moderation_posts', '[]');
      localStorage.setItem('vivu_admin_moderation_clubs', '[]');
      localStorage.setItem('vivu_admin_moderation_events', '[]');
      localStorage.setItem('vivu_admin_session', JSON.stringify({
        authenticated: true,
        user: { id: 'admin-uuid-test', email: 'tienlh1998@gmail.com', role: 'admin' },
        expiresAt: Date.now() + 86400000
      }));
    })()`);
    console.log('  ✓ Đã thiết lập localStorage chứa chuỗi mảng rỗng "[]" & phiên admin.');

    // 2. Mở Trung tâm Kiểm duyệt (Tab Posts)
    await cdp.eval(`window.ViVuApp.openAdminModerationModal('posts')`);
    await sleep(600);

    // 3. Kiểm tra DOM thực tế cho Tab Posts
    const postsDomResult = await cdp.eval(`(() => {
      const container = document.getElementById('adminModerationModalContent');
      if (!container) return { found: false };
      const text = container.innerText;
      return {
        found: true,
        hasEmptyNotice: text.includes('Không có bài viết nào chờ duyệt'),
        hasEmptyDesc: text.includes('Hàng đợi bài viết cộng đồng đang trống'),
        hasMockPost: text.includes('Ký sự chùa Âng') || text.includes('Quán bún nước lèo'),
        postCount: window.ViVuApp.state.moderationPosts.length
      };
    })()`);

    assert.ok(postsDomResult.hasEmptyNotice, 'DOM tab posts phải hiển thị thông báo "Không có bài viết nào chờ duyệt"');
    assert.ok(!postsDomResult.hasMockPost, 'DOM tab posts TUYỆT ĐỐI không chứa bài viết mock');
    assert.strictEqual(postsDomResult.postCount, 0, 'state.moderationPosts phải có độ dài 0');
    console.log('  ✓ [DOM Tab Posts] Hiển thị đúng card "Không có bài viết nào chờ duyệt", 0% bài viết mock.');

    // 4. Chuyển sang Tab Clubs và kiểm tra DOM
    await cdp.eval(`window.ViVuApp.switchModerationTab('clubs')`);
    await sleep(400);

    const clubsDomResult = await cdp.eval(`(() => {
      const container = document.getElementById('adminModerationModalContent');
      if (!container) return { found: false };
      const text = container.innerText;
      return {
        found: true,
        hasEmptyNotice: text.includes('Không có hồ sơ CLB nào chờ duyệt'),
        hasEmptyDesc: text.includes('Hàng đợi đề xuất thành lập CLB đang trống'),
        hasMockClub: text.includes('CLB Nhiếp ảnh Di sản Xứ Trà') || text.includes('CLB Ẩm thực Chay Khmer'),
        clubCount: window.ViVuApp.state.moderationClubs.length
      };
    })()`);

    assert.ok(clubsDomResult.hasEmptyNotice, 'DOM tab clubs phải hiển thị thông báo "Không có hồ sơ CLB nào chờ duyệt"');
    assert.ok(!clubsDomResult.hasMockClub, 'DOM tab clubs TUYỆT ĐỐI không chứa CLB mock');
    assert.strictEqual(clubsDomResult.clubCount, 0, 'state.moderationClubs phải có độ dài 0');
    console.log('  ✓ [DOM Tab Clubs] Hiển thị đúng card "Không có hồ sơ CLB nào chờ duyệt", 0% CLB mock.');

    // 5. Chuyển sang Tab Events và kiểm tra DOM
    await cdp.eval(`window.ViVuApp.switchModerationTab('events')`);
    await sleep(400);

    const eventsDomResult = await cdp.eval(`(() => {
      const container = document.getElementById('adminModerationModalContent');
      if (!container) return { found: false };
      const text = container.innerText;
      return {
        found: true,
        hasEmptyNotice: text.includes('Không có sự kiện nào chờ duyệt'),
        hasEmptyDesc: text.includes('Hàng đợi sự kiện & workshop đang trống'),
        eventCount: window.ViVuApp.state.moderationEvents.length
      };
    })()`);

    assert.ok(eventsDomResult.hasEmptyNotice, 'DOM tab events phải hiển thị thông báo "Không có sự kiện nào chờ duyệt"');
    assert.strictEqual(eventsDomResult.eventCount, 0, 'state.moderationEvents phải có độ dài 0');
    console.log('  ✓ [DOM Tab Events] Hiển thị đúng card "Không có sự kiện nào chờ duyệt", 0% sự kiện mock.');

    // 6. Chụp ảnh màn hình minh chứng
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    const screenshotPath = path.join(ARTIFACT_DIR, 'admin_moderation_empty_queue.png');
    await cdp.captureScreenshot(screenshotPath);
    console.log(`  📸 Đã chụp ảnh giao diện hàng đợi rỗng: ${screenshotPath}`);

  } finally {
    if (cdp) await cdp.close();
    if (chromeProc) chromeProc.kill('SIGKILL');
    if (localServer) localServer.close();
  }

  console.log(`\n================================================================================`);
  console.log(` TỔNG KẾT: GIAO DIỆN HÀNG ĐỢI RỖNG ĐÃ ĐƯỢC XÁC THỰC HOÀN HẢO TRÊN TRÌNH DUYỆT!`);
  console.log(`================================================================================`);
}

run().catch(err => {
  console.error('\n❌ KIỂM TRA BROWSER THẤT BẠI:', err);
  process.exit(1);
});
