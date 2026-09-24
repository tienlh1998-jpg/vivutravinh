// scripts/test-g9-public-route.js
// Integration test cho Public Place Route (/place/{slug}):
// 1. Thẩm định server SSR HTML qua api/og-place.js:
//    - Ca Approved: HTTP 200, dynamic <title>, canonical, OG tags, <base href="/">
//    - Ca Draft/Hidden: HTTP 404, neutral not-found page, tuyệt đối không phát tán metadata địa điểm chưa duyệt
// 2. Thẩm định tài nguyên runtime: stylesheet, script, icon, manifest đều trả HTTP 200 với Content-Type chuẩn
// 3. Chặn triệt để relative resolve sai: KHÔNG CÓ BẤT KỲ request nào tới /place/css, /place/js, /place/icons, /place/vendor
// 4. Mock Supabase REST theo schema production (không dùng data-fixture legacy):
//    - Ca Approved (ao-ba-om): Client JS mở modal hiển thị bản ghi đã duyệt, địa chỉ mới, images rỗng -> placeholder SVG,
//      khẳng định KHÔNG CÓ: 0294.385.5555, 07:00, "Miễn phí", ảnh cũ
//    - Ca Draft (chua-ang): Route direct không mở modal, URL hoàn trả về "/", hiển thị toast an toàn
//    - Ca Supabase Mất Mạng: Khi rơi xuống fallback, client direct route từ chối mở dữ liệu stale, hiển thị "Không thể tải thông tin đã xác minh"
// 5. Chụp 4 ảnh nghiệm thu phản ánh dữ liệu production-shaped (Desktop & Mobile, Light & Dark)
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
const ogHandler = (await import('../api/og-place.js')).default;

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

// Dữ liệu mock Supabase theo đúng schema production G9.3C (production-shaped)
const mockApprovedAoBaOm = {
  id: 1,
  slug: 'ao-ba-om',
  name: 'Ao Bà Om',
  category: 'Điểm Check-in / Sống Ảo',
  area: 'TP. Trà Vinh',
  address: 'Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long',
  map_link: 'https://www.google.com/maps?q=9.9347,106.3449',
  price_raw: null,
  description: 'Danh thắng nổi tiếng bậc nhất Trà Vinh với hàng cây cổ thụ trăm tuổi soi bóng xuống mặt hồ phẳng lặng.',
  note: 'Nên đi buổi sáng hoặc chiều mát để chụp ảnh đẹp hơn.',
  contact: null,
  coordinates: '9.9347,106.3449',
  contributor: 'Admin',
  rating: 5,
  opening_time: null,
  closing_time: null,
  display_hours: null,
  operating_status: 'Normal',
  status: 'approved',
  images: [],
  image_link: null,
  sort_order: 1,
  is_featured: true,
  created_at: '2026-05-27T02:13:13.148216+00:00',
  updated_at: '2026-09-23T08:21:45.916Z'
};

const mockDraftChuaAng = {
  id: 3,
  slug: 'chua-ang',
  name: 'Chùa Âng',
  category: 'Du Lịch Tâm Linh',
  area: 'TP. Trà Vinh',
  address: 'Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long',
  map_link: 'https://www.google.com/maps?q=9.9322,106.3364',
  price_raw: null,
  description: 'Ngôi chùa Khmer cổ kính, nổi bật với kiến trúc truyền thống và không gian yên bình.',
  note: 'Giữ trang phục lịch sự khi tham quan.',
  contact: null,
  coordinates: '9.9322,106.3364',
  contributor: 'Admin',
  rating: 5,
  opening_time: null,
  closing_time: null,
  display_hours: null,
  operating_status: 'Normal',
  status: 'draft',
  images: [],
  image_link: null,
  sort_order: 3,
  is_featured: true,
  created_at: '2026-05-27T02:13:13.148216+00:00',
  updated_at: '2026-05-27T04:38:31.731583+00:00'
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

  // 1. Kiểm tra Unit: normalizeRuntimeAssets trong api/og-place.js
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

  // 2. Thiết lập máy chủ kiểm thử mô phỏng Vercel Edge SSR + Supabase REST endpoint
  console.log('\n--- 2. Khởi tạo máy chủ kiểm thử mô phỏng Vercel Edge SSR & Supabase REST ---');
  const serverPort = 8019;
  const erroneousRequests = [];
  const requestedAssets = new Map();

  let serverNetworkErrorMode = false;
  let mockDatabase = [mockApprovedAoBaOm, mockDraftChuaAng];

  const testServer = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://127.0.0.1:${serverPort}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Ghi nhận nếu có request tài nguyên resolve sai dưới /place/
    if (/^\/places?\/(css|js|icons|vendor)\//i.test(pathname)) {
      erroneousRequests.push(pathname);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: Relative asset wrongly resolved under /place/ (${pathname})`);
      return;
    }

    // 2.1 Giả lập Supabase REST API (/rest/v1/places)
    if (pathname === '/rest/v1/places') {
      console.log(`    [TEST-SERVER] /rest/v1/places called! errorMode=${serverNetworkErrorMode}`);
      if (serverNetworkErrorMode) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: 'Simulated Supabase server connection error' }));
        return;
      }

      const qStatus = parsedUrl.searchParams.get('status');
      const qSlug = parsedUrl.searchParams.get('slug');

      let results = [...mockDatabase];

      // Lọc status=eq.approved
      if (qStatus && qStatus.startsWith('eq.')) {
        const expectedStatus = qStatus.slice(3).toLowerCase();
        results = results.filter(p => p.status.toLowerCase() === expectedStatus);
      }

      // Lọc slug=eq.{slug}
      if (qSlug && qSlug.startsWith('eq.')) {
        const expectedSlug = qSlug.slice(3).toLowerCase();
        results = results.filter(p => p.slug.toLowerCase() === expectedSlug);
      }

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(JSON.stringify(results));
      return;
    }

    // Bọc res.end để tiêm cấu hình test server vào toàn bộ phản hồi HTML phục vụ cho Chrome
    const originalEnd = res.end;
    res.end = function(chunk, encoding, callback) {
      if (chunk) {
        let str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : (typeof chunk === 'string' ? chunk : null);
        if (str && str.includes('</head>')) {
          const injectedConfig = `<script>
            window.VIVUTRAVINH_CONFIG = Object.assign(window.VIVUTRAVINH_CONFIG || {}, {
              dataSource: 'supabase',
              supabaseUrl: 'http://127.0.0.1:${serverPort}',
              supabaseAnonKey: 'test-anon-key'
            });
          </script>`;
          str = str.replace(/(<head[^>]*>)/i, `$1\n    ${injectedConfig}`);
          chunk = Buffer.isBuffer(chunk) ? Buffer.from(str, 'utf8') : str;
        }
      }
      return originalEnd.call(this, chunk, encoding, callback);
    };

    // 2.2 Định tuyến SSR cho /place/:slug qua api/og-place.js
    const placeMatch = pathname.match(/^\/places?\/([^/?#]+)/i);
    if (placeMatch) {
      await ogHandler(req, res, {
        supabaseUrl: `http://127.0.0.1:${serverPort}`
      });
      return;
    }

    // 2.3 Phục vụ trang chủ / hoặc index.html
    if (pathname === '/' || pathname === '/index.html') {
      const target = fs.existsSync(path.join(DIST_DIR, 'index.html'))
        ? path.join(DIST_DIR, 'index.html')
        : path.join(ROOT_DIR, 'index.html');
      const content = fs.readFileSync(target, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
      return;
    }

    // 2.4 Phục vụ static assets (ưu tiên dist/, fallback ROOT_DIR)
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

  // 3. Kiểm thử HTTP GET thô (Social Crawler SSR): Phân biệt rõ Approved vs Draft vs Non-existent
  console.log('\n--- 3. Kiểm thử HTTP GET thô: Crawler Open Graph & SEO Tags ---');
  {
    // 3.1 Ca Approved: /place/ao-ba-om
    const resAoBaOm = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${serverPort}/place/ao-ba-om`, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
      }).on('error', reject);
    });

    assert.equal(resAoBaOm.status, 200, 'HTTP status của địa điểm approved /place/ao-ba-om phải là 200');
    assert.ok(resAoBaOm.headers['content-type'].includes('text/html'), 'Content-Type phải là text/html');
    assert.ok(resAoBaOm.body.includes('<title>Ao Bà Om - ViVu Trà Vinh</title>'), 'Tiêu đề SSR phải chứa "Ao Bà Om - ViVu Trà Vinh"');
    assert.ok(resAoBaOm.body.includes('<link rel="canonical" id="canonicalLink" href="https://vivutravinh.id.vn/place/ao-ba-om">'), 'Canonical link phải chuẩn');
    assert.ok(resAoBaOm.body.includes('<base href="/">'), 'Thẻ <base href="/"> phải hiện diện trong <head>');
    assert.ok(resAoBaOm.body.includes('href="/manifest.json"'), 'Manifest link phải là /manifest.json');
    assert.ok(resAoBaOm.body.includes('href="/icons/icon.svg"'), 'Icon link phải là /icons/icon.svg');
    assert.ok(resAoBaOm.body.includes('src="/js/app.js"'), 'App.js script phải là /js/app.js');
    console.log('  ✓ [PASS] Ca Approved (/place/ao-ba-om): SSR trả HTTP 200, dynamic OG metadata và tài nguyên root-absolute chuẩn');

    // 3.2 Ca Draft: /place/chua-ang
    const resChuaAng = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${serverPort}/place/chua-ang`, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
      }).on('error', reject);
    });

    assert.equal(resChuaAng.status, 404, 'HTTP status của địa điểm draft /place/chua-ang phải là 404');
    assert.ok(!resChuaAng.body.includes('<title>Chùa Âng - ViVu Trà Vinh</title>'), 'SSR tuyệt đối không phát tán metadata của địa điểm draft');
    assert.ok(resChuaAng.body.includes('Không Tìm Thấy Địa Điểm'), 'SSR phải trả trang neutral not found cho địa điểm draft');
    console.log('  ✓ [PASS] Ca Draft (/place/chua-ang): SSR trả HTTP 404 trang neutral not found, không lộ metadata');

    // 3.3 Ca Không tồn tại: /place/dia-diem-khong-ton-tai
    const resNonExistent = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${serverPort}/place/dia-diem-khong-ton-tai`, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
      }).on('error', reject);
    });

    assert.equal(resNonExistent.status, 404, 'HTTP status của slug không tồn tại phải là 404');
    assert.ok(resNonExistent.body.includes('Không Tìm Thấy Địa Điểm'), 'SSR phải trả trang neutral not found');
    console.log('  ✓ [PASS] Ca Slug không tồn tại: SSR trả HTTP 404 neutral not found chuẩn xác');
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
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

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

    // 4.1 CA APPROVED: Điều hướng trực tiếp tới /place/ao-ba-om
    console.log('  • Đang điều hướng Chrome tới http://127.0.0.1:' + serverPort + '/place/ao-ba-om ...');
    await cdp.setViewport(1280, 800, false);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/place/ao-ba-om` });

    console.log('  • Đang chờ Client JS tải dữ liệu Supabase approved và tự động mở modal...');
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

    assert.ok(modalOpened, 'Modal Ao Bà Om phải tự động mở khi truy cập /place/ao-ba-om với nguồn Supabase approved');
    console.log('  ✓ [PASS] JS nạp Supabase approved thành công và tự động mở đúng modal địa điểm "Ao Bà Om"');

    // 4.2 Thẩm định nội dung modal theo chuẩn Production-Shaped (loại bỏ dứt điểm dữ liệu fixture/fallback cũ)
    const modalData = await cdp.eval(`(() => {
      const modal = document.getElementById('detailModal');
      const text = modal?.innerText || '';
      const html = modal?.innerHTML || '';
      const title = document.getElementById('modalTitle')?.textContent?.trim() || '';
      const address = document.getElementById('modalAddress')?.textContent?.trim() || '';
      return { text, html, title, address };
    })()`);

    // Assert các trường dữ liệu production-shaped đã chuẩn hóa
    assert.equal(modalData.title, 'Ao Bà Om', 'Tên địa điểm phải là "Ao Bà Om" (không mang hậu tố rác hoặc fixture)');
    assert.ok(modalData.address.includes('Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long'), 'Địa chỉ phải là địa chỉ mới NQ 1687 đã thẩm định');

    // Assert tuyệt đối KHÔNG xuất hiện dữ liệu cũ chưa xác minh
    assert.ok(!modalData.text.includes('0294.385.5555'), 'KHÔNG ĐƯỢC xuất hiện số điện thoại cũ: 0294.385.5555');
    assert.ok(!modalData.text.includes('07:00'), 'KHÔNG ĐƯỢC xuất hiện giờ mở cửa cũ: 07:00');
    assert.ok(!modalData.text.includes('Miễn phí'), 'KHÔNG ĐƯỢC tự ý suy diễn giá là "Miễn phí"');
    assert.ok(!modalData.html.includes('ao bà om.jpg'), 'KHÔNG ĐƯỢC sử dụng ảnh cũ chưa xác minh bản quyền: ao bà om.jpg');
    assert.ok(!modalData.text.includes('Danh Thắng Ao Bà Om'), 'KHÔNG ĐƯỢC chứa tên fixture: Danh Thắng Ao Bà Om');

    // Assert hiển thị placeholder an toàn khi images rỗng
    assert.ok(
      modalData.html.includes('data:image/svg+xml') || modalData.html.includes('f1f5f9'),
      'Phải hiển thị hình ảnh placeholder SVG nội bộ an toàn khi images rỗng'
    );
    console.log('  ✓ [PASS] Thẩm định dữ liệu modal approved đạt 100%: 0 rò rỉ hotline giả, 0 giờ giả, 0 giá giả, 0 ảnh chưa xác minh');

    // 4.3 Thẩm định Mạng: Chống Relative Asset Misresolve
    console.log('\n--- 5. Thẩm định Mạng & Chống Relative Asset Misresolve ---');
    assert.equal(erroneousRequests.length, 0, `Phát hiện request tài nguyên bị resolve sai dưới /place/: ${JSON.stringify(erroneousRequests)}`);
    console.log('  ✓ [PASS] Số request sai dưới /place/css, /place/js, /place/icons, /place/vendor: 0 (Hoàn hảo)');

    // 4.4 Thẩm định Content-Type và HTTP Status của các tài nguyên chính
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

    // 4.5 Chụp ảnh nghiệm thu giao diện (Desktop & Mobile, Light & Dark) với dữ liệu verified
    console.log('\n--- 6. Chụp ảnh bằng chứng nghiệm thu giao diện đã xác minh ---');

    // [A] Desktop (1280x800) Light Mode
    await cdp.setViewport(1280, 800, false);
    await cdp.eval(`document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light');`);
    await sleep(200);
    const desktopLightShot = path.join(ARTIFACT_DIR, 'g9-public-route-desktop-light.png');
    await cdp.screenshot(desktopLightShot);
    console.log(`  ✓ [PASS] Desktop Light (1280x800): Đã chụp ảnh dữ liệu verified: ${path.basename(desktopLightShot)}`);

    // [B] Desktop (1280x800) Dark Mode
    await cdp.eval(`document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark');`);
    await sleep(200);
    const desktopDarkShot = path.join(ARTIFACT_DIR, 'g9-public-route-desktop-dark.png');
    await cdp.screenshot(desktopDarkShot);
    console.log(`  ✓ [PASS] Desktop Dark (1280x800): Đã chụp ảnh dữ liệu verified: ${path.basename(desktopDarkShot)}`);

    // [C] Mobile (390x844) Light Mode
    await cdp.setViewport(390, 844, true);
    await cdp.eval(`document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light');`);
    await sleep(200);
    const mobileLightShot = path.join(ARTIFACT_DIR, 'g9-public-route-mobile-light.png');
    await cdp.screenshot(mobileLightShot);
    console.log(`  ✓ [PASS] Mobile Light (390x844): Đã chụp ảnh dữ liệu verified: ${path.basename(mobileLightShot)}`);

    // [D] Mobile (390x844) Dark Mode
    await cdp.eval(`document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark');`);
    await sleep(200);
    const mobileDarkShot = path.join(ARTIFACT_DIR, 'g9-public-route-mobile-dark.png');
    await cdp.screenshot(mobileDarkShot);
    console.log(`  ✓ [PASS] Mobile Dark (390x844): Đã chụp ảnh dữ liệu verified: ${path.basename(mobileDarkShot)}`);

    // 4.6 Kiểm tra đóng modal: Quay về URL '/'
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

    // 4.7 CA DRAFT / HIDDEN: Kiểm tra truy cập trực tiếp /place/chua-ang (đang ở trạng thái draft)
    console.log('\n--- 8. Ca thử: Truy cập trực tiếp địa điểm draft (/place/chua-ang) ---');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/place/chua-ang` });
    await sleep(1500);

    const draftState = await cdp.eval(`(() => {
      const modal = document.getElementById('detailModal');
      const isModalOpen = modal && !modal.classList.contains('hidden');
      const pathname = window.location.pathname;
      return { isModalOpen, pathname };
    })()`);

    assert.equal(draftState.isModalOpen, false, 'Modal tuyệt đối KHÔNG được mở cho địa điểm draft /place/chua-ang');
    assert.equal(draftState.pathname, '/', 'URL phải được reset về "/" khi truy cập slug draft chưa approved');
    console.log('  ✓ [PASS] Ca Draft (/place/chua-ang): Modal bị chặn mở, URL reset về "/", bảo vệ toàn vẹn dữ liệu');

    // 4.8 CA MẤT MẠNG SUPABASE: Tránh rơi xuống mở fallback stale trên direct route
    console.log('\n--- 9. Ca thử: Supabase mất mạng và ứng dụng kích hoạt fallback nội bộ ---');
    serverNetworkErrorMode = true; // Kích hoạt mô phỏng lỗi máy chủ Supabase 500

    cdp.listeners.push((method, params) => {
      if (method === 'Network.requestWillBeSent') {
        console.log('    [CHROME-REQ]', params.request.url);
      }
      if (method === 'Network.responseReceived') {
        console.log('    [CHROME-RESP]', params.response.status, params.response.url);
      }
    });

    await cdp.eval(`(() => {
      localStorage.clear();
      sessionStorage.clear();
    })()`);

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/place/ao-ba-om` });
    let offlineState = null;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 8000) {
      offlineState = await cdp.eval(`(() => {
        const modal = document.getElementById('detailModal');
        const isModalOpen = modal && !modal.classList.contains('hidden');
        const pathname = window.location.pathname;
        const toastTitle = document.getElementById('syncToastTitle')?.textContent || '';
        const dataSource = window.ViVuApp?.state?.allPlaces?.[0]?._source;
        return { isModalOpen, pathname, toastTitle, dataSource };
      })()`);

      if (offlineState && offlineState.dataSource === 'fallback' && offlineState.pathname === '/') {
        break;
      }
      await sleep(250);
    }

    console.log('    • Offline state check:', JSON.stringify(offlineState));

    assert.equal(offlineState.isModalOpen, false, 'Modal tuyệt đối KHÔNG được mở với dữ liệu fallback stale khi Supabase lỗi');
    assert.equal(offlineState.pathname, '/', 'URL direct route phải được dọn về "/"');
    assert.ok(
      offlineState.toastTitle.includes('Không thể tải') || offlineState.toastTitle.includes('thông tin đã xác minh'),
      `Toast cảnh báo an toàn phải được hiển thị, nhận được: "${offlineState.toastTitle}"`
    );
    console.log('  ✓ [PASS] Ca Mất Mạng: Direct route chặn mở fallback cũ, URL reset về "/" và hiển thị thông báo an toàn');

  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    testServer.close();
    try { fs.rmSync(chromeProfile, { recursive: true, force: true }); } catch {}
  }

  console.log('\n========================================');
  console.log('TẤT CẢ KIỂM THỬ PUBLIC PLACE ROUTE G9.3C ĐẠT 100% PASS!');
  console.log('========================================\n');
}

runPublicRouteIntegrationTests().catch(err => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
