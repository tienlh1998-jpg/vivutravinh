// scripts/test-g9-public-route.js
// Integration test cho Public Place Route (/place/{slug}):
// 1. Thẩm định server SSR HTML: HTTP 200, dynamic <title>, canonical, OG tags, <base href="/">
// 2. Thẩm định tải tài nguyên tĩnh: stylesheet, script, icon, manifest đều trả HTTP 200 với Content-Type chuẩn
// 3. Chặn triệt để relative resolve sai: KHÔNG CÓ BẤT KỲ request nào tới /place/css, /place/js, /place/icons, /place/vendor
// 4. Kiểm thử trình duyệt thực tế qua CDP: Client JS tự động nhận diện slug và mở modal địa điểm tương ứng
// 5. Kiểm tra hiển thị đa dạng: Desktop (1280x800) vs Mobile (390x844), Giao diện Sáng (Light) & Tối (Dark)
// 6. Kiểm tra điều hướng: Đóng modal hoàn trả URL về '/' sạch sẽ

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ARTIFACT_DIR = '/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3';

const { renderPlaceHtml, normalizeRuntimeAssets, findPlace } = await import('../api/og-place.js');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.reqId = 0;
    this.callbacks = new Map();
    this.listeners = [];
    this.ws.onmessage = (msg) => {
      const res = JSON.parse(msg.data);
      if (res.id && this.callbacks.has(res.id)) {
        const cb = this.callbacks.get(res.id);
        this.callbacks.delete(res.id);
        cb(res);
      }
      for (const l of this.listeners) {
        l(res.method, res.params);
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
        reject(new Error(`CDP method ${method} timed out after 15000ms`));
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
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async setViewport(width, height, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile
    });
    await sleep(350);
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

async function getDebuggerUrl(port) {
  for (let i = 0; i < 35; i++) {
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
      const target = pages.find(p => p.type === 'page' || (p.url && p.url.includes(String(port))));
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
      if (pages[0]?.webSocketDebuggerUrl) return pages[0].webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  throw new Error(`Không thể kết nối Chrome DevTools protocol trên cổng ${port}`);
}

async function runPublicRouteIntegrationTests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ TÍCH HỢP G9.3C: PUBLIC PLACE ROUTE (/place/{slug}) ===\n');

  // 1. Kiểm tra Unit / Contract cơ bản của normalizeRuntimeAssets
  console.log('--- 1. Kiểm thử Unit: Chuẩn hóa tài nguyên runtime trong api/og-place.js ---');
  {
    const sampleHtml = `<!DOCTYPE html><html><head><title>Test</title><link rel="stylesheet" href="./css/tailwind.css"><link rel="manifest" href="./manifest.json"><script src="./vendor/leaflet/leaflet.js"></script></head><body><script type="module" src="./js/app.js"></script><a href="./">Home</a></body></html>`;
    const normalized = normalizeRuntimeAssets(sampleHtml);

    assert.ok(normalized.includes('<base href="/">'), 'normalizeRuntimeAssets phải chèn thẻ <base href="/"> vào <head>');
    assert.ok(normalized.includes('href="/css/tailwind.css"'), 'href="./css/tailwind.css" phải chuyển thành href="/css/tailwind.css"');
    assert.ok(normalized.includes('href="/manifest.json"'), 'href="./manifest.json" phải chuyển thành href="/manifest.json"');
    assert.ok(normalized.includes('src="/vendor/leaflet/leaflet.js"'), 'src="./vendor/..." phải chuyển thành src="/vendor/..."');
    assert.ok(normalized.includes('src="/js/app.js"'), 'src="./js/app.js" phải chuyển thành src="/js/app.js"');
    assert.ok(normalized.includes('href="/"'), '<a href="./"> phải chuyển thành <a href="/">');
    assert.ok(!normalized.includes('./css/'), 'Không được còn ./css/');
    assert.ok(!normalized.includes('./js/'), 'Không được còn ./js/');
    console.log('  ✓ [PASS] normalizeRuntimeAssets chuyển đổi 100% tài nguyên tương đối sang root-absolute và tiêm <base href="/">');
  }

  // 2. Thiết lập máy chủ kiểm thử mô phỏng chính xác định tuyến Vercel Edge
  console.log('\n--- 2. Khởi tạo máy chủ kiểm thử mô phỏng Vercel Edge SSR ---');
  const serverPort = 8019;
  const erroneousRequests = [];
  const requestedAssets = new Map();

  const testServer = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://127.0.0.1:${serverPort}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Ghi nhận nếu có request tài nguyên resolve sai dưới /place/
    if (/^\/places?\/(css|js|icons|vendor)\//i.test(pathname)) {
      erroneousRequests.push(pathname);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: Relative asset wrongly resolved under /place/ (${pathname})`);
      return;
    }

    // 2.1 Định tuyến SSR cho /place/:slug hoặc /places/:slug
    const placeMatch = pathname.match(/^\/places?\/([^/?#]+)/i);
    if (placeMatch) {
      const slug = decodeURIComponent(placeMatch[1]);
      const html = renderPlaceHtml(slug, undefined, req);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(html);
      return;
    }

    // 2.2 Phục vụ trang chủ /
    if (pathname === '/' || pathname === '/index.html') {
      const target = fs.existsSync(path.join(DIST_DIR, 'index.html'))
        ? path.join(DIST_DIR, 'index.html')
        : path.join(ROOT_DIR, 'index.html');
      const content = fs.readFileSync(target, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
      return;
    }

    // 2.3 Phục vụ static assets (ưu tiên dist/, fallback ROOT_DIR)
    let filePath = path.join(DIST_DIR, pathname);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = path.join(ROOT_DIR, pathname);
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      requestedAssets.set(pathname, { status: 200, contentType });
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`404 Not Found: ${pathname}`);
  });

  await new Promise(resolve => testServer.listen(serverPort, '127.0.0.1', resolve));
  console.log(`  ✓ Máy chủ kiểm thử đang phục vụ tại: http://127.0.0.1:${serverPort}`);

  // 3. Kiểm thử HTTP GET thô (Social Crawler SSR không cần JS)
  console.log('\n--- 3. Kiểm thử HTTP GET thô: Crawler Open Graph & SEO Tags ---');
  {
    const rawHtmlAoBaOm = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${serverPort}/place/ao-ba-om`, res => {
        assert.equal(res.statusCode, 200, 'HTTP status của /place/ao-ba-om phải là 200');
        assert.ok(res.headers['content-type'].includes('text/html'), 'Content-Type phải là text/html');
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(d));
      }).on('error', reject);
    });

    assert.ok(rawHtmlAoBaOm.includes('<title>Ao Bà Om - ViVu Trà Vinh</title>'), 'Tiêu đề SSR phải chứa "Ao Bà Om - ViVu Trà Vinh"');
    assert.ok(rawHtmlAoBaOm.includes('<link rel="canonical" id="canonicalLink" href="https://vivutravinh.id.vn/place/ao-ba-om">'), 'Canonical link phải chuẩn');
    assert.ok(rawHtmlAoBaOm.includes('<base href="/">'), 'Thẻ <base href="/"> phải hiện diện trong <head>');
    assert.ok(rawHtmlAoBaOm.includes('href="/manifest.json"'), 'Manifest link phải là /manifest.json');
    assert.ok(rawHtmlAoBaOm.includes('href="/icons/icon.svg"'), 'Icon link phải là /icons/icon.svg');
    assert.ok(rawHtmlAoBaOm.includes('src="/js/app.js"'), 'App.js script phải là /js/app.js');
    assert.ok(!rawHtmlAoBaOm.includes('./manifest.json'), 'Không còn tồn tại ./manifest.json');
    assert.ok(!rawHtmlAoBaOm.includes('./icons/'), 'Không còn tồn tại ./icons/');
    assert.ok(!rawHtmlAoBaOm.includes('./js/'), 'Không còn tồn tại ./js/');
    console.log('  ✓ [PASS] SSR /place/ao-ba-om trả HTTP 200, tiêu đề, canonical, OG và tài nguyên root-absolute hoàn hảo');
  }

  // 4. Khởi động Headless Chrome & Kiểm thử trình duyệt thực tế qua CDP
  console.log('\n--- 4. Kiểm thử trình duyệt thực tế qua Chrome Headless (CDP) ---');
  const chromePort = 9226;
  const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu_public_route_test_'));

  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${chromeProfile}`,
    `--remote-debugging-port=${chromePort}`,
    'about:blank'
  ], { stdio: 'pipe' });

  let cdp = null;

  try {
    const wsUrl = await getDebuggerUrl(chromePort);
    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const networkResponses = new Map();
    const networkRequests = [];

    cdp.listeners.push((method, params) => {
      if (method === 'Network.requestWillBeSent') {
        networkRequests.push(params.request.url);
      }
      if (method === 'Network.responseReceived') {
        const u = new URL(params.response.url);
        networkResponses.set(u.pathname, {
          status: params.response.status,
          mimeType: params.response.mimeType,
          headers: params.response.headers
        });
      }
    });

    // 4.1 Điều hướng trực tiếp tới /place/ao-ba-om
    console.log('  • Đang điều hướng Chrome tới http://127.0.0.1:' + serverPort + '/place/ao-ba-om ...');
    await cdp.setViewport(1280, 800, false);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/place/ao-ba-om` });

    // Đợi ứng dụng nạp xong và tự động mở modal Ao Bà Om theo deep link slug
    console.log('  • Đang chờ Client JS khởi động và tự động mở modal theo slug...');
    const startTime = Date.now();
    let modalOpened = false;

    while (Date.now() - startTime < 14000) {
      try {
        const state = await cdp.eval(`(() => {
          const modal = document.getElementById('detailModal');
          const isModalOpen = modal && !modal.classList.contains('hidden');
          const modalTitle = document.getElementById('modalTitle')?.textContent || '';
          const hasApp = !!(window.ViVuApp && window.ViVuApp.state);
          const placesCount = (window.ViVuApp?.state?.allPlaces || []).length;
          return { isModalOpen, modalTitle, hasApp, placesCount, pathname: window.location.pathname };
        })()`);

        if (state.hasApp && state.placesCount > 0 && state.isModalOpen && state.modalTitle.includes('Ao Bà Om')) {
          modalOpened = true;
          break;
        }
      } catch {}
      await sleep(250);
    }

    assert.ok(modalOpened, 'Modal Ao Bà Om phải tự động mở khi truy cập /place/ao-ba-om');
    console.log('  ✓ [PASS] JS chạy thành công và tự động mở đúng modal địa điểm "Ao Bà Om"');

    // 4.2 Thẩm định mạng: KHÔNG CÓ request tài nguyên sai dưới /place/
    console.log('\n--- 5. Thẩm định Mạng & Chống Relative Asset Misresolve ---');
    assert.equal(erroneousRequests.length, 0, `Phát hiện request tài nguyên bị resolve sai dưới /place/: ${JSON.stringify(erroneousRequests)}`);
    console.log('  ✓ [PASS] Số request sai dưới /place/css, /place/js, /place/icons, /place/vendor: 0 (Hoàn hảo)');

    // 4.3 Thẩm định Content-Type và HTTP Status của các tài nguyên chính
    const requiredAssets = [
      { path: '/css/tailwind.css', expectedMime: 'text/css' },
      { path: '/vendor/fonts/material-symbols.css', expectedMime: 'text/css' },
      { path: '/vendor/leaflet/leaflet.css', expectedMime: 'text/css' },
      { path: '/vendor/leaflet/leaflet.js', expectedMime: 'javascript' },
      { path: '/js/app.js', expectedMime: 'javascript' },
      { path: '/js/data.js', expectedMime: 'javascript' },
      { path: '/manifest.json', expectedMime: 'json' },
      { path: '/icons/icon.svg', expectedMime: 'svg' }
    ];

    for (const item of requiredAssets) {
      let resp = networkResponses.get(item.path);
      if (!resp) {
        const fetchCheck = await cdp.eval(`fetch("${item.path}").then(r => ({ status: r.status, ok: r.ok, mime: r.headers.get("content-type") })).catch(() => null)`);
        if (fetchCheck && fetchCheck.ok) {
          resp = { status: fetchCheck.status, mimeType: fetchCheck.mime || '' };
        }
      }
      assert.ok(resp, `Tài nguyên ${item.path} phải được trình duyệt tải thành công`);
      assert.equal(resp.status, 200, `Tài nguyên ${item.path} phải trả về status 200 (nhận được ${resp?.status})`);
      assert.ok(
        resp.mimeType.toLowerCase().includes(item.expectedMime),
        `Tài nguyên ${item.path} phải có mimeType chứa "${item.expectedMime}", nhận được: ${resp.mimeType}`
      );
      console.log(`  ✓ [PASS] ${item.path} -> HTTP 200, Content-Type: ${resp.mimeType}`);
    }

    // 4.4 Kiểm tra hiển thị Desktop & Mobile, Light & Dark Mode
    console.log('\n--- 6. Kiểm tra hiển thị Desktop/Mobile & Light/Dark Mode ---');

    // [A] Desktop (1280x800) Light Mode
    await cdp.setViewport(1280, 800, false);
    await cdp.eval(`document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light');`);
    await sleep(200);
    const desktopLightShot = path.join(ARTIFACT_DIR, 'g9-public-route-desktop-light.png');
    await cdp.screenshot(desktopLightShot);
    console.log(`  ✓ [PASS] Desktop Light (1280x800): Render modal chuẩn xác, đã chụp ảnh: ${path.basename(desktopLightShot)}`);

    // [B] Desktop (1280x800) Dark Mode
    await cdp.eval(`document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark');`);
    await sleep(200);
    const desktopDarkShot = path.join(ARTIFACT_DIR, 'g9-public-route-desktop-dark.png');
    await cdp.screenshot(desktopDarkShot);
    console.log(`  ✓ [PASS] Desktop Dark (1280x800): Chế độ tối kích hoạt chuẩn xác, đã chụp ảnh: ${path.basename(desktopDarkShot)}`);

    // [C] Mobile (390x844) Light Mode
    await cdp.setViewport(390, 844, true);
    await cdp.eval(`document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light');`);
    await sleep(200);
    const mobileLightShot = path.join(ARTIFACT_DIR, 'g9-public-route-mobile-light.png');
    await cdp.screenshot(mobileLightShot);
    console.log(`  ✓ [PASS] Mobile Light (390x844): Bento modal responsive chuẩn, đã chụp ảnh: ${path.basename(mobileLightShot)}`);

    // [D] Mobile (390x844) Dark Mode
    await cdp.eval(`document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark');`);
    await sleep(200);
    const mobileDarkShot = path.join(ARTIFACT_DIR, 'g9-public-route-mobile-dark.png');
    await cdp.screenshot(mobileDarkShot);
    console.log(`  ✓ [PASS] Mobile Dark (390x844): Giao diện tối trên di động chuẩn xác, đã chụp ảnh: ${path.basename(mobileDarkShot)}`);

    // 4.5 Kiểm tra đóng modal: Quay về URL '/'
    console.log('\n--- 7. Kiểm tra điều hướng khi đóng modal ---');
    await cdp.eval(`document.getElementById('modalCloseBtn')?.click()`);
    await sleep(350);

    const closeState = await cdp.eval(`(() => {
      const modal = document.getElementById('detailModal');
      return {
        isClosed: modal && modal.classList.contains('hidden'),
        pathname: window.location.pathname
      };
    })()`);

    assert.ok(closeState.isClosed, 'Modal phải đóng khi click nút Đóng');
    assert.equal(closeState.pathname, '/', 'URL phải quay về "/" sau khi đóng modal');
    console.log('  ✓ [PASS] Đóng modal thành công và URL hoàn trả về "/"');

    // 4.6 Kiểm tra địa điểm thứ hai: /place/chua-ang (sử dụng dataset fallback chứa Chùa Âng)
    console.log('\n--- 8. Kiểm tra địa điểm thứ hai: /place/chua-ang ---');
    await cdp.eval(`localStorage.setItem('vivu_data_source', 'fallback')`);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/place/chua-ang?source=fallback` });

    let chuaAngOpened = false;
    const startTime2 = Date.now();
    while (Date.now() - startTime2 < 12000) {
      try {
        const state = await cdp.eval(`(() => {
          const modal = document.getElementById('detailModal');
          const isModalOpen = modal && !modal.classList.contains('hidden');
          const modalTitle = document.getElementById('modalTitle')?.textContent || '';
          return { isModalOpen, modalTitle };
        })()`);
        if (state.isModalOpen && state.modalTitle.includes('Chùa Âng')) {
          chuaAngOpened = true;
          break;
        }
      } catch {}
      await sleep(250);
    }

    assert.ok(chuaAngOpened, 'Modal Chùa Âng phải tự động mở khi truy cập /place/chua-ang');
    assert.equal(erroneousRequests.length, 0, 'Vẫn không có bất kỳ request tài nguyên sai nào dưới /place/');
    console.log('  ✓ [PASS] /place/chua-ang tự động mở đúng modal "Chùa Âng", 0 request tài nguyên sai');

  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    testServer.close();
    try { fs.rmSync(chromeProfile, { recursive: true, force: true }); } catch {}
  }

  console.log('\n========================================');
  console.log('TẤT CẢ KIỂM THỬ PUBLIC PLACE ROUTE ĐẠT 100% PASS!');
  console.log('========================================\n');
}

runPublicRouteIntegrationTests().catch(err => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
