const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PROJECT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
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

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: false
    });
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
  console.log('=== KIỂM THỬ NÚT ĐỀ XUẤT ĐỊA ĐIỂM MỚI TẠI HERO SPOTLIGHT ===');

  let localServer = null;
  let chromeProc = null;
  let cdp = null;

  try {
    const serverPort = 8870 + Math.floor(Math.random() * 100);
    localServer = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      let filePath = path.join(PROJECT_DIR, p === '/' ? 'index.html' : p);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise(r => localServer.listen(serverPort, r));
    console.log(`  ✓ Máy chủ kiểm thử HTTP tại cổng ${serverPort}`);

    const chromeCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromeCandidates.find(fs.existsSync);
    if (!chromeExe) throw new Error('Không tìm thấy Google Chrome.');

    const cdpPort = 9640 + Math.floor(Math.random() * 100);
    const userDataDir = path.join(os.tmpdir(), `chrome_contribute_btn_${Date.now()}`);
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
    await cdp.send('DOM.enable');

    await sleep(2500);
    await cdp.setViewport(1440, 900);

    // Bắt buộc render khối Hero rỗng (giống như trạng thái người dùng vừa dọn sạch dữ liệu)
    await cdp.eval(`(async () => {
      const ui = await import('/js/ui.js');
      ui.renderHeroSpotlight('heroSpotlightContainer', null);
    })()`);
    await sleep(500);

    // Kiểm tra nút Đề xuất địa điểm mới trong khối Spotlight
    const buttonExists = await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Đề xuất địa điểm mới'));
      return !!btn;
    })()`);
    console.log('  1. Nút "Đề xuất địa điểm mới" tồn tại trong DOM:', buttonExists);

    // Kiểm tra modal trước khi click (phải là hidden)
    const isModalHiddenBefore = await cdp.eval(`(() => {
      const modal = document.getElementById('contributeModal');
      return modal ? modal.classList.contains('hidden') : null;
    })()`);
    console.log('  2. ContributeModal đang ẩn ban đầu:', isModalHiddenBefore);

    // Click nút "Đề xuất địa điểm mới"
    const clicked = await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Đề xuất địa điểm mới'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`);
    console.log('  3. Thực hiện click nút thành công:', clicked);

    await sleep(600);

    // Kiểm tra modal sau khi click (phải hiển thị - không còn hidden)
    const isModalHiddenAfter = await cdp.eval(`(() => {
      const modal = document.getElementById('contributeModal');
      return modal ? modal.classList.contains('hidden') : null;
    })()`);
    console.log('  4. ContributeModal sau khi click (phải là false):', isModalHiddenAfter);

    if (isModalHiddenAfter === false) {
      console.log('  ✓ Nút "Đề xuất địa điểm mới" ĐÃ HOẠT ĐỘNG HOÀN HẢO! Modal đã mở.');
    } else {
      throw new Error('ContributeModal chưa mở sau khi click!');
    }

    const proofScreenshot = path.join(ARTIFACT_DIR, 'live_contribute_modal_opened_from_empty_hero.png');
    await cdp.captureScreenshot(proofScreenshot);
    console.log('  ✓ Đã chụp ảnh minh chứng modal mở:', proofScreenshot);

  } finally {
    if (cdp) await cdp.close();
    if (chromeProc) {
      try { chromeProc.kill(); } catch (_) {}
    }
    if (localServer) {
      await new Promise(r => localServer.close(r));
    }
  }
}

run().catch(err => {
  console.error('Lỗi kiểm thử:', err);
  process.exit(1);
});
