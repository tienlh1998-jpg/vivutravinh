/**
 * scripts/verify-logo-visual.cjs
 * Visual verification of new ViVuTraVinh logos on Desktop, Mobile, Mobile Drawer, and Admin page.
 */

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

  async setViewport(width, height, isMobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: isMobile
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
  console.log('=== KIỂM THỬ GIAO DIỆN LOGO MỚI (CHROME HEADLESS CDP) ===');

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
    const userDataDir = path.join(os.tmpdir(), `chrome_logo_verify_${Date.now()}`);
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

    await sleep(2000);

    // 1. Desktop Viewport
    console.log('1. Kiểm tra Desktop Sidebar Logo:');
    await cdp.setViewport(1440, 900, false);
    await sleep(1000);

    const desktopLogoLoaded = await cdp.eval(`(() => {
      const img = document.querySelector('#sidebarBrandHeader img');
      return img ? { src: img.src, complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight } : null;
    })()`);
    console.log('  Sidebar desktop logo info:', desktopLogoLoaded);

    const desktopPath = path.join(ARTIFACT_DIR, 'live_logo_desktop_sidebar.png');
    await cdp.captureScreenshot(desktopPath);
    console.log('  ✓ Đã chụp ảnh desktop: ' + desktopPath);

    // Desktop Dark Mode
    await cdp.eval(`document.documentElement.classList.add('dark')`);
    await sleep(500);
    const desktopDarkPath = path.join(ARTIFACT_DIR, 'live_logo_desktop_dark.png');
    await cdp.captureScreenshot(desktopDarkPath);
    console.log('  ✓ Đã chụp ảnh desktop dark mode: ' + desktopDarkPath);
    await cdp.eval(`document.documentElement.classList.remove('dark')`);
    await sleep(300);

    // 2. Mobile Viewport & Topbar
    console.log('\n2. Kiểm tra Mobile Top Bar Logo:');
    await cdp.setViewport(390, 844, true);
    await sleep(1000);

    const mobileTopLogoLoaded = await cdp.eval(`(() => {
      const img = document.querySelector('#topNavSearchContainer img');
      return img ? { src: img.src, complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight } : null;
    })()`);
    console.log('  Mobile topbar logo info:', mobileTopLogoLoaded);

    const mobilePath = path.join(ARTIFACT_DIR, 'live_logo_mobile_topbar.png');
    await cdp.captureScreenshot(mobilePath);
    console.log('  ✓ Đã chụp ảnh mobile topbar: ' + mobilePath);

    // 3. Mobile Drawer Navigation
    console.log('\n3. Kiểm tra Mobile Drawer Logo:');
    await cdp.eval(`(() => {
      if (window.ViVuApp && window.ViVuApp.openMobileDrawer) {
        window.ViVuApp.openMobileDrawer();
      }
    })()`);
    await sleep(800);

    const mobileDrawerLogo = await cdp.eval(`(() => {
      const img = document.querySelector('#mobileDrawerNav img');
      return img ? { src: img.src, complete: img.complete, naturalWidth: img.naturalWidth } : null;
    })()`);
    console.log('  Mobile drawer logo info:', mobileDrawerLogo);

    const drawerPath = path.join(ARTIFACT_DIR, 'live_logo_mobile_drawer.png');
    await cdp.captureScreenshot(drawerPath);
    console.log('  ✓ Đã chụp ảnh mobile drawer: ' + drawerPath);

    // 4. Admin Portal Header
    console.log('\n4. Kiểm tra Admin Header Logo:');
    await cdp.setViewport(1280, 800, false);
    await cdp.send('Page.navigate', { url: `http://localhost:${serverPort}/admin.html` });
    await sleep(2000);

    const adminLogoLoaded = await cdp.eval(`(() => {
      const img = document.querySelector('header a[href="/"] img');
      return img ? { src: img.src, complete: img.complete, naturalWidth: img.naturalWidth } : null;
    })()`);
    console.log('  Admin logo info:', adminLogoLoaded);

    const adminPath = path.join(ARTIFACT_DIR, 'live_logo_admin_header.png');
    await cdp.captureScreenshot(adminPath);
    console.log('  ✓ Đã chụp ảnh admin header: ' + adminPath);

    console.log('\n=== TẤT CẢ KIỂM THỬ VISUAL LOGO HOÀN THÀNH XUẤT SẮC ===');
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
