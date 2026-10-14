/**
 * scripts/verify-feedback-view-update.cjs
 * 
 * Kiểm thử tự động trên Chrome Headless:
 * 1. Khởi động static server cục bộ.
 * 2. Mở trình duyệt đến #/feedback.
 * 3. Kiểm tra nội dung text:
 *    - Email: vivutravinh@gmail.com
 *    - Facebook: https://www.facebook.com/people/ViVu-Tr%C3%A0-Vinh-Kh%C3%A1m-ph%C3%A1-C%E1%BB%99ng-%C4%91%E1%BB%93ng/61587249012873/
 *    - Tuyệt đối KHÔNG còn khối "Kho mã nguồn mở (GitHub)" trong mục Góp ý
 *    - Note dưới form: "Tiếp nhận trực tiếp qua Email vivutravinh@gmail.com"
 * 4. Chụp ảnh visual artifact: live_verified_feedback_support.png
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const PROJECT_DIR = path.resolve(__dirname, '..');
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

  close() {
    try { this.ws.close(); } catch (_) {}
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findChromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Không tìm thấy trình duyệt Google Chrome.');
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
      const target = pages.find(p => p.type === 'page' && p.url && p.url.startsWith('http')) ||
                     pages.find(p => p.type === 'page' && !p.url?.startsWith('chrome-extension://'));
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    } catch (_) {
      await sleep(200);
    }
  }
  throw new Error('Không thể kết nối Chrome DevTools Protocol');
}

async function main() {
  console.log('================================================================================');
  console.log(' KIỂM THỬ GIAO DIỆN "GÓP Ý & HỖ TRỢ" (CHROME CDP)');
  console.log('================================================================================\n');

  const serverPort = 8840 + Math.floor(Math.random() * 50);
  const server = http.createServer((req, res) => {
    let filePath = path.join(PROJECT_DIR, req.url.split('?')[0]);
    if (filePath.endsWith(path.sep) || req.url === '/' || req.url.startsWith('/#')) {
      filePath = path.join(PROJECT_DIR, 'index.html');
    }
    const ext = path.extname(filePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise((resolve) => server.listen(serverPort, resolve));
  const baseUrl = `http://localhost:${serverPort}/`;
  console.log(`✓ Local server đang chạy tại: ${baseUrl}`);

  const chromePath = await findChromePath();
  const cdpPort = 9560 + Math.floor(Math.random() * 50);
  const userDataDir = path.join(os.tmpdir(), `vivu-feedback-test-${Date.now()}`);

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    baseUrl
  ]);

  let cdp;
  try {
    const wsUrl = await getDebuggerUrl(cdpPort);
    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    console.log('✓ Kết nối Chrome CDP thành công.');

    for (let i = 0; i < 40; i++) {
      const ready = await cdp.eval('Boolean(window.ViVuApp && window.ViVuApp.switchView)');
      if (ready) break;
      await sleep(250);
    }

    console.log('Chờ ứng dụng nạp dữ liệu xong...');
    for (let i = 0; i < 40; i++) {
      const ready = await cdp.eval(`(() => {
        const loadingEl = document.getElementById('pageLoadingSkeleton');
        const mainContentEl = document.getElementById('mainContentArea');
        if (loadingEl) loadingEl.classList.add('hidden');
        if (mainContentEl) mainContentEl.classList.remove('hidden');
        return Boolean(window.ViVuApp && window.ViVuApp.navGoFeedback);
      })()`);
      if (ready) break;
      await sleep(250);
    }

    console.log('Chuyển tới View Góp ý & Hỗ trợ qua navGoFeedback()...');
    await cdp.eval(`(() => {
      window.ViVuApp.navGoFeedback();
    })()`);
    await sleep(600);

    const check = await cdp.eval(`(() => {
      const view = document.getElementById('view-feedback');
      if (!view || view.classList.contains('hidden')) return { isVisible: false };
      const text = view.innerText;
      const html = view.innerHTML;
      return {
        isVisible: true,
        hasNewEmail: text.includes('vivutravinh@gmail.com'),
        hasOldEmail: text.includes('tienlh1998@gmail.com'),
        hasFacebookLink: html.includes('facebook.com/people/ViVu-Tr%C3%A0-Vinh-Kh%C3%A1m-ph%C3%A1-C%E1%BB%99ng-%C4%91%E1%BB%93ng/61587249012873/'),
        hasOldFacebook: text.includes('facebook.com/vivutravinh.official'),
        hasGithubCard: text.includes('Kho mã nguồn mở (GitHub)') || text.includes('github.com/tienlh1998-jpg/vivutravinh'),
        hasUpdatedNote: text.includes('Tiếp nhận trực tiếp qua Email vivutravinh@gmail.com')
      };
    })()`);

    console.log('Kết quả kiểm tra giao diện Góp ý & Hỗ trợ:', check);
    assert.strictEqual(check.isVisible, true, 'View feedback phải hiển thị');
    assert.strictEqual(check.hasNewEmail, true, 'Phải có email vivutravinh@gmail.com');
    assert.strictEqual(check.hasOldEmail, false, 'Tuyệt đối KHÔNG còn email cũ tienlh1998@gmail.com');
    assert.strictEqual(check.hasFacebookLink, true, 'Phải có link Facebook Fanpage mới đúng địa chỉ');
    assert.strictEqual(check.hasOldFacebook, false, 'Tuyệt đối KHÔNG còn link facebook cũ');
    assert.strictEqual(check.hasGithubCard, false, 'Khối Kho mã nguồn mở (GitHub) phải được gỡ bỏ hoàn toàn');
    assert.strictEqual(check.hasUpdatedNote, true, 'Ghi chú dưới form phải cập nhật email mới');
    console.log('✓ Tất cả các điều kiện kiểm tra nội dung đều ĐẠT 100%!');

    // Cuộn tới khối "Kênh Tiếp Nhận Ý Kiến & Hỗ Trợ" / Form góp ý để chụp ảnh rõ nét
    await cdp.eval(`(() => {
      const form = document.getElementById('feedbackDraftForm');
      if (form) form.scrollIntoView({ block: 'center' });
    })()`);
    await sleep(500);

    const artifactPath = path.join(ARTIFACT_DIR, 'live_verified_feedback_support.png');
    await cdp.captureScreenshot(artifactPath);
    console.log('✓ Đã chụp ảnh minh chứng giao diện mới:', artifactPath);

    console.log('\n================================================================================');
    console.log(' KIỂM THỬ GIAO DIỆN GÓP Ý & HỖ TRỢ HOÀN TOÀN THÀNH CÔNG!');
    console.log('================================================================================\n');

  } finally {
    if (cdp) cdp.close();
    chromeProc.kill('SIGTERM');
    server.close();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

main().catch(err => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
