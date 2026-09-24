#!/usr/bin/env node
/**
 * scripts/preview-g9-chua-ang.js
 * Tạo màn hình preview & kiểm tra thẩm định toàn diện dữ liệu Chùa Âng (ID 3)
 * trước khi thực hiện phê duyệt (Approval).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePlace } from '../js/place-validator.js';
import { buildProposedPatchForPlace3 } from './plan-g9-pilot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.resolve('/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
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
    await sleep(200);
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function getDebuggerUrl(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const data = await res.json();
      console.log('    [DEBUGGER-TARGETS]', JSON.stringify(data));
      if (Array.isArray(data)) {
        const pageTarget = data.find(p => p.type === 'page');
        if (pageTarget?.webSocketDebuggerUrl) return pageTarget.webSocketDebuggerUrl;
        if (data[0]?.webSocketDebuggerUrl) return data[0].webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(200);
  }
  throw new Error('Không thể kết nối Chrome DevTools CDP');
}

async function runChuaAngPreview() {
  console.log('\n======================================================');
  console.log('KIỂM TRA & CHUẨN BỊ PREVIEW CHÙA ÂNG (ID 3) TRƯỚC KHI DUYỆT');
  console.log('======================================================\n');

  // 1. Dữ liệu Before từ CSDL / snapshot
  const beforeRecord = {
    id: 3,
    slug: 'chua-ang',
    name: 'Chùa Âng',
    category: 'Du Lịch Tâm Linh',
    area: 'TP. Trà Vinh',
    address: 'Khóm 4, phường 8, TP. Trà Vinh',
    map_link: 'https://www.google.com/maps?q=9.9322,106.3364',
    coordinates: '9.9322,106.3364',
    price_raw: 'Miễn phí',
    opening_time: '06:00',
    closing_time: '18:00',
    display_hours: null,
    operating_status: 'Normal',
    status: 'hidden',
    images: ['./chùa âng.jpg'],
    image_link: './chùa âng.jpg',
    description: 'Ngôi chùa Khmer cổ kính, nổi bật với kiến trúc truyền thống và không gian yên bình.',
    note: 'Giữ trang phục lịch sự khi tham quan.',
    contact: '0294.385.1111',
    contributor: 'Admin',
    rating: 5,
    sort_order: 3,
    is_featured: true,
    created_at: '2026-05-27T02:13:13.148216+00:00',
    updated_at: '2026-05-27T04:38:31.731583+00:00'
  };

  // 2. Sinh Proposed Patch qua hàm chuẩn của hệ thống
  const { afterRecord, fieldSources, changedFields, rollbackPayload } = buildProposedPatchForPlace3(beforeRecord);

  console.log('--- 1. Đối Soát Dữ Liệu Thay Đổi (Before vs After) ---');
  for (const field of changedFields) {
    console.log(`  • [${field}]:`);
    console.log(`      Trước : ${JSON.stringify(beforeRecord[field])}`);
    console.log(`      Sau   : ${JSON.stringify(afterRecord[field])}`);
    if (fieldSources[field]) {
      console.log(`      Căn cứ: ${fieldSources[field].rationale}`);
      if (fieldSources[field].source_url) {
        console.log(`      Nguồn : ${fieldSources[field].source_url}`);
      }
    }
  }

  // 3. Thẩm định tiêu chuẩn dữ liệu qua validatePlace
  console.log('\n--- 2. Thẩm Định Tiêu Chuẩn Dữ Liệu (Place Validator) ---');
  const draftVal = validatePlace(afterRecord, { mode: 'draft' });
  const approvalVal = validatePlace(afterRecord, { mode: 'approval' });

  console.log(`  • Chế độ Draft   : ${draftVal.errors.length} errors, ${draftVal.warnings.length} warnings`);
  console.log(`  • Chế độ Approval: ${approvalVal.errors.length} errors, ${approvalVal.warnings.length} warnings`);

  if (approvalVal.errors.length > 0) {
    console.error('❌ LỖI BẮT BUỘC CHẶN DUYỆT:');
    approvalVal.errors.forEach(e => console.error(`    - [${e.field}] ${e.message}`));
  } else {
    console.log('  ✓ [ĐẠT] Không có bất kỳ lỗi vi phạm bắt buộc nào (0 errors). Nút duyệt đủ điều kiện kích hoạt.');
  }

  console.log('  • Chi tiết các cảnh báo chất lượng dữ liệu được chấp nhận:');
  approvalVal.warnings.forEach(w => {
    console.log(`    - [${w.field}] (${w.code}): ${w.message}`);
  });

  // 4. Khởi động Web Server cục bộ phục vụ các tài nguyên repo
  const serverPort = 8021;
  const server = http.createServer((req, res) => {
    console.log('    [HTTP-SERVER]', req.method, req.url);
    let filePath = path.join(REPO_ROOT, req.url.split('?')[0]);
    if (filePath.endsWith('/')) filePath += 'index.html';

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  await new Promise(r => server.listen(serverPort, '127.0.0.1', r));

  // 5. Khởi động Chrome Headless & CDP Client
  console.log('\n--- 3. Khởi Động Trình Duyệt Thực Tế Chrome Headless (CDP) ---');
  const chromePort = 9227;
  const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu_chua_ang_preview_'));

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

    cdp.listeners.push((method, params) => {
      if (method === 'Network.requestWillBeSent') {
        console.log('    [CHROME-REQ]', params.request.url);
      }
      if (method === 'Network.responseReceived') {
        console.log('    [CHROME-RESP]', params.response.status, params.response.url);
      }
      if (method === 'Runtime.consoleAPICalled') {
        console.log('    [CHROME-CONSOLE]', params.type, params.args?.map(a => a.value));
      }
      if (method === 'Runtime.exceptionThrown') {
        console.log('    [CHROME-EXC]', params.exceptionDetails?.text, params.exceptionDetails?.exception?.description);
      }
    });

    // 5.1 GIAO DIỆN QUẢN TRỊ (ADMIN PREVIEW MODAL)
    console.log('\n--- 4. Màn Hình Xem Trước & Thẩm Định Quản Trị (Admin Preview Modal) ---');
    await cdp.setViewport(1280, 850, false);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/admin.html` });
    
    // Đợi window.VivuAdmin sẵn sàng
    for (let i = 0; i < 25; i++) {
      const hasVivuAdmin = await cdp.eval(`Boolean(window.VivuAdmin)`);
      if (hasVivuAdmin) break;
      await sleep(200);
    }

    // Thiết lập session quản trị viên
    await cdp.eval(`(() => {
      const session = {
        user: { id: 'admin-qc', email: 'admin@vivutravinh.vn' },
        access_token: 'fake-jwt-for-preview',
        profile: { user_id: 'admin-qc', role: 'admin', full_name: 'Quản Trị Viên QC' }
      };
      sessionStorage.setItem('vivu_admin_session', JSON.stringify(session));
      window.dispatchEvent(new CustomEvent('vivu:auth-login', { detail: { session } }));
    })()`);
    await sleep(300);

    // Kích hoạt mở modal xem trước địa điểm Chùa Âng
    await cdp.eval(`(() => {
      const placeData = ${JSON.stringify(afterRecord)};
      window.VivuAdmin.openPlacePreview(placeData);
    })()`);
    await sleep(400);

    // Chụp ảnh Admin Preview Light Mode
    const adminLightShot = path.join(ARTIFACT_DIR, 'g9-chua-ang-admin-preview-light.png');
    await cdp.screenshot(adminLightShot);
    console.log(`  ✓ Đã lưu ảnh Admin Preview (Light Mode): ${path.basename(adminLightShot)}`);

    // Chuyển sang Dark Mode & chụp ảnh
    await cdp.eval(`document.documentElement.classList.add('dark');`);
    await sleep(200);
    const adminDarkShot = path.join(ARTIFACT_DIR, 'g9-chua-ang-admin-preview-dark.png');
    await cdp.screenshot(adminDarkShot);
    console.log(`  ✓ Đã lưu ảnh Admin Preview (Dark Mode): ${path.basename(adminDarkShot)}`);

    // 5.2 GIAO DIỆN CÔNG KHAI NGƯỜI DÙNG (PUBLIC CLIENT MODAL)
    console.log('\n--- 5. Màn Hình Hiển Thị Thực Tế Với Người Dùng Khi Được Duyệt (Public Detail Modal) ---');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/index.html` });
    await sleep(600);

    // Đợi window.ViVuApp sẵn sàng
    for (let i = 0; i < 30; i++) {
      const isReady = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.state && Array.isArray(window.ViVuApp.state.allPlaces))`);
      if (isReady) break;
      await sleep(200);
    }

    // Chuẩn bị dữ liệu hiển thị phía client (mô phỏng sau khi được approve trên Supabase)
    const publicPlace = {
      ...afterRecord,
      _source: 'supabase',
      status: 'approved'
    };

    await cdp.eval(`(() => {
      document.documentElement.classList.remove('dark');
      const p = ${JSON.stringify(publicPlace)};
      window.ViVuApp.state.allPlaces.unshift(p);
      window.ViVuApp.openDetailModal(p);
      document.getElementById('offlineSyncToast')?.classList.add('hidden');
    })()`);
    await sleep(400);

    // Desktop Light
    const publicDesktopLightShot = path.join(ARTIFACT_DIR, 'g9-chua-ang-public-preview-desktop-light.png');
    await cdp.screenshot(publicDesktopLightShot);
    console.log(`  ✓ Đã lưu ảnh Public Modal (Desktop Light): ${path.basename(publicDesktopLightShot)}`);

    // Desktop Dark
    await cdp.eval(`(() => {
      document.documentElement.classList.add('dark');
      document.getElementById('offlineSyncToast')?.classList.add('hidden');
    })()`);
    await sleep(200);
    const publicDesktopDarkShot = path.join(ARTIFACT_DIR, 'g9-chua-ang-public-preview-desktop-dark.png');
    await cdp.screenshot(publicDesktopDarkShot);
    console.log(`  ✓ Đã lưu ảnh Public Modal (Desktop Dark): ${path.basename(publicDesktopDarkShot)}`);

    // Mobile (390x844) Light & Dark
    await cdp.setViewport(390, 844, true);
    await cdp.eval(`(() => {
      document.documentElement.classList.remove('dark');
      document.getElementById('offlineSyncToast')?.classList.add('hidden');
    })()`);
    await sleep(200);
    const publicMobileLightShot = path.join(ARTIFACT_DIR, 'g9-chua-ang-public-preview-mobile-light.png');
    await cdp.screenshot(publicMobileLightShot);
    console.log(`  ✓ Đã lưu ảnh Public Modal (Mobile Light): ${path.basename(publicMobileLightShot)}`);

    await cdp.eval(`(() => {
      document.documentElement.classList.add('dark');
      document.getElementById('offlineSyncToast')?.classList.add('hidden');
    })()`);
    await sleep(200);
    const publicMobileDarkShot = path.join(ARTIFACT_DIR, 'g9-chua-ang-public-preview-mobile-dark.png');
    await cdp.screenshot(publicMobileDarkShot);
    console.log(`  ✓ Đã lưu ảnh Public Modal (Mobile Dark): ${path.basename(publicMobileDarkShot)}`);

  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    server.close();
    try { fs.rmSync(chromeProfile, { recursive: true, force: true }); } catch {}
  }

  console.log('\n======================================================');
  console.log('HOÀN TẤT CHUẨN BỊ PREVIEW & THẨM ĐỊNH CHÙA ÂNG (ID 3)');
  console.log('======================================================\n');
}

runChuaAngPreview().catch(err => {
  console.error('❌ Lỗi tạo preview:', err);
  process.exit(1);
});
