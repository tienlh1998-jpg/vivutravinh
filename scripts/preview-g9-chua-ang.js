#!/usr/bin/env node
/**
 * scripts/preview-g9-chua-ang.js
 * Tạo màn hình preview & kiểm tra thẩm định toàn diện dữ liệu Chùa Âng (ID 3)
 * trước khi thực hiện phê duyệt (Approval).
 *
 * Tiêu chuẩn chất lượng G9.3C:
 * 1. Đọc ID 3 trực tiếp từ production CSDL live (Zero Mutation, Read-Only).
 * 2. Lấy updated_at mới nhất từ production, không hard-code snapshot làm dữ liệu live.
 * 3. Hiển thị "Liên hệ / Chưa rõ" cho price_raw=null trong Admin Preview (tuyệt đối không hiện "Miễn phí").
 * 4. Loại bỏ thông báo HTTP 404 phía sau modal bằng cách mock các endpoint Admin API đúng phạm vi preview.
 * 5. Xác minh hoặc xóa rating 5, mô tả và note nếu chưa có nguồn đáng tin cậy.
 * 6. Kiểm tra tự động khẳng định không xuất hiện "Miễn phí", SĐT cũ, giờ cũ, ảnh cũ, rating giả.
 * 7. Xuất đủ 6 ảnh chụp màn hình preview cho cả Admin & Public (Desktop/Mobile, Light/Dark).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePlace } from '../js/place-validator.js';
import { buildProposedPatchForPlace3 } from './plan-g9-pilot.js';
import { loadPilotProductionRecords } from './audit-g9-pilot-production.js';

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

/**
 * Nạp biến môi trường từ các file local nếu process.env chưa có
 */
function loadLocalEnv() {
  const env = { ...process.env };
  const envCandidates = ['.env.live.tmp', '.vercel/.env.preview.local', '.env.local', '.env'];
  for (const envFile of envCandidates) {
    const fullPath = path.join(REPO_ROOT, envFile);
    if (!fs.existsSync(fullPath)) continue;
    const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
    for (const l of lines) {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (val && val !== '[SENSITIVE]' && !env[key]) {
          env[key] = val;
        }
      }
    }
  }
  if (env.SUPABASE_URL && !env.SUPABASE_URL.startsWith('http')) {
    env.SUPABASE_URL = 'https://' + env.SUPABASE_URL;
  }
  return env;
}

async function runChuaAngPreview() {
  console.log('\n======================================================');
  console.log('KIỂM TRA & CHUẨN BỊ PREVIEW CHÙA ÂNG (ID 3) TRƯỚC KHI DUYỆT');
  console.log('======================================================\n');

  // 1. Đọc ID 3 trực tiếp từ production CSDL live (Zero Mutation, Read-Only)
  console.log('--- 1. Truy Vấn Dữ Liệu ID 3 Trực Tiếp Từ Production Live ---');
  const env = loadLocalEnv();

  const { source, places } = await loadPilotProductionRecords({ env });
  const liveRecord3 = places.find(p => p.id === 3);

  if (!liveRecord3) {
    throw new Error('FAIL_CLOSED: Không tìm thấy bản ghi ID 3 trên live production CSDL.');
  }

  console.log(`  • Nguồn dữ liệu            : ${source}`);
  console.log(`  • ID 3 Tên                 : ${liveRecord3.name}`);
  console.log(`  • ID 3 Slug                : ${liveRecord3.slug}`);
  console.log(`  • ID 3 Trạng thái CSDL live: ${liveRecord3.status}`);
  console.log(`  • ID 3 updated_at mới nhất : ${liveRecord3.updated_at}`);

  // Sử dụng bản ghi live làm beforeRecord thay vì snapshot cũ
  const beforeRecord = liveRecord3;

  // 2. Sinh Proposed Patch qua hàm chuẩn của hệ thống
  const { afterRecord, fieldSources, changedFields, rollbackPayload } = buildProposedPatchForPlace3(beforeRecord);

  console.log('\n--- 2. Đối Soát Dữ Liệu Thay Đổi (Before vs After) ---');
  console.log(`  • Tổng số trường thay đổi: ${changedFields.length}`);
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

  // 3. Kiểm tra tự động tính trung thực dữ liệu ID 3
  console.log('\n--- 3. Kiểm Tra Tự Động Tính Trung Thực Dữ Liệu (QC Invariants) ---');
  assert.strictEqual(afterRecord.price_raw, null, 'price_raw phải là null (không suy diễn "Miễn phí")');
  assert.strictEqual(afterRecord.rating, null, 'rating phải là null (chưa có đánh giá thực tế)');
  assert.strictEqual(afterRecord.note, null, 'note phải là null (xóa ghi chú chưa xác minh)');
  assert.strictEqual(afterRecord.contact, null, 'contact phải là null (xóa hotline cũ 0294.385.1111)');
  assert.strictEqual(afterRecord.opening_time, null, 'opening_time phải là null (xóa giờ cũ 06:00)');
  assert.strictEqual(afterRecord.closing_time, null, 'closing_time phải là null (xóa giờ cũ 18:00)');
  assert.strictEqual(afterRecord.display_hours, null, 'display_hours phải là null');
  assert.deepStrictEqual(afterRecord.images, [], 'images phải là mảng rỗng [] (chặn ảnh chưa thẩm định bản quyền)');
  assert.strictEqual(afterRecord.image_link, null, 'image_link phải là null');
  assert.ok(afterRecord.description.includes('Wat Angkorajaborey'), 'Mô tả phải có tên chuẩn Wat Angkorajaborey');
  assert.strictEqual(afterRecord.expected_updated_at, beforeRecord.updated_at, 'expected_updated_at phải khớp với updated_at mới nhất từ live CSDL');
  console.log('  ✓ [ĐẠT] 100% các tiêu chí QC cốt lõi (0 Miễn phí, 0 SĐT cũ, 0 giờ cũ, 0 ảnh cũ, 0 fake rating)');

  // 4. Thẩm định tiêu chuẩn dữ liệu qua validatePlace
  console.log('\n--- 4. Thẩm Định Tiêu Chuẩn Dữ Liệu (Place Validator) ---');
  const draftVal = validatePlace(afterRecord, { mode: 'draft' });
  const approvalVal = validatePlace(afterRecord, { mode: 'approval' });

  console.log(`  • Chế độ Draft   : ${draftVal.errors.length} errors, ${draftVal.warnings.length} warnings`);
  console.log(`  • Chế độ Approval: ${approvalVal.errors.length} errors, ${approvalVal.warnings.length} warnings`);

  if (approvalVal.errors.length > 0) {
    console.error('❌ LỖI BẮT BUỘC CHẶN DUYỆT:');
    approvalVal.errors.forEach(e => console.error(`    - [${e.field}] ${e.message}`));
    throw new Error('Dữ liệu afterRecord vi phạm tiêu chuẩn duyệt.');
  } else {
    console.log('  ✓ [ĐẠT] Không có bất kỳ lỗi vi phạm bắt buộc nào (0 errors). Nút duyệt đủ điều kiện kích hoạt.');
  }

  // 5. Khởi động Web Server cục bộ phục vụ các tài nguyên repo kèm mock Admin API
  const serverPort = 8021;
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://127.0.0.1:${serverPort}`);
    const pathname = parsedUrl.pathname;

    // Mock các Admin API endpoints trong phạm vi preview để loại bỏ 404 phía sau modal
    if (pathname === '/api/admin-places') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        places: [afterRecord],
        pagination: { page: 1, limit: 15, total: 1, total_pages: 1 }
      }));
      return;
    }

    if (pathname === '/api/admin-comments') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        comments: [],
        pagination: { page: 1, limit: 15, total: 0, total_pages: 0 }
      }));
      return;
    }

    if (pathname === '/api/admin-reports') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        reports: [],
        pagination: { page: 1, limit: 15, total: 0, total_pages: 0 }
      }));
      return;
    }

    if (pathname === '/api/admin-profile') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        profile: { role: 'admin', full_name: 'Quản Trị Viên QC' }
      }));
      return;
    }

    let filePath = path.join(REPO_ROOT, pathname);
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

  // 6. Khởi động Chrome Headless & CDP Client
  console.log('\n--- 5. Khởi Động Trình Duyệt Thực Tế Chrome Headless (CDP) ---');
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

    // 6.1 GIAO DIỆN QUẢN TRỊ (ADMIN PREVIEW MODAL)
    console.log('\n--- 6. Màn Hình Xem Trước & Thẩm Định Quản Trị (Admin Preview Modal) ---');
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
    await sleep(400);

    // Kích hoạt mở modal xem trước địa điểm Chùa Âng
    await cdp.eval(`(() => {
      const placeData = ${JSON.stringify(afterRecord)};
      window.VivuAdmin.openPlacePreview(placeData);
    })()`);
    await sleep(400);

    // Kiểm tra DOM của Admin Preview Modal
    const adminModalData = await cdp.eval(`(() => {
      const modal = document.getElementById('placePreviewModal');
      const text = modal ? modal.innerText : '';
      const alerts = document.querySelectorAll('.bg-rose-50, .text-rose-600, #adminMessageContainer .text-red-700, #adminMessageContainer .text-rose-700');
      const alertTexts = Array.from(alerts).map(a => a.innerText.trim()).filter(Boolean);
      return { text, alertTexts };
    })()`);

    console.log('  • Xác thực giao diện Admin Preview:');
    assert.ok(adminModalData.text.includes('Liên hệ / Chưa rõ'), 'Admin Preview phải hiển thị "Liên hệ / Chưa rõ" cho price_raw=null');
    assert.ok(!adminModalData.text.includes('Miễn phí'), 'Admin Preview TUYỆT ĐỐI không được hiển thị "Miễn phí"');
    assert.ok(!adminModalData.text.includes('0294.385.1111'), 'Admin Preview TUYỆT ĐỐI không hiển thị SĐT cũ');
    assert.ok(!adminModalData.text.includes('06:00'), 'Admin Preview TUYỆT ĐỐI không hiển thị giờ cũ 06:00');
    assert.ok(!adminModalData.text.includes('18:00'), 'Admin Preview TUYỆT ĐỐI không hiển thị giờ cũ 18:00');
    assert.ok(!adminModalData.text.includes('./chùa âng.jpg'), 'Admin Preview TUYỆT ĐỐI không chứa link ảnh chưa xác minh');
    assert.ok(adminModalData.text.includes('Chưa có đánh giá'), 'Admin Preview phải hiển thị "Chưa có đánh giá"');
    assert.strictEqual(adminModalData.alertTexts.length, 0, `Nền Admin Dashboard không được có thông báo lỗi 404 (tìm thấy: ${adminModalData.alertTexts.join('; ')})`);
    console.log('    ✓ Admin Preview: 0 "Miễn phí", 0 "0294.385.1111", 0 giờ cũ, 0 ảnh cũ, 0 fake rating, 0 lỗi 404 nền');

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

    // 6.2 GIAO DIỆN CÔNG KHAI NGƯỜI DÙNG (PUBLIC CLIENT MODAL)
    console.log('\n--- 7. Màn Hình Hiển Thị Thực Tế Với Người Dùng Khi Được Duyệt (Public Detail Modal) ---');
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

    // Kiểm tra DOM của Public Detail Modal
    const publicModalData = await cdp.eval(`(() => {
      const modal = document.getElementById('detailModal');
      return {
        text: modal ? modal.innerText : '',
        price: document.getElementById('modalPrice')?.innerText || '',
        hours: document.getElementById('modalHours')?.innerText || '',
        stars: document.getElementById('modalStars')?.innerText || '',
        contactBlockHidden: document.getElementById('modalContactBlock')?.classList.contains('hidden')
      };
    })()`);

    console.log('  • Xác thực giao diện Public Detail Modal:');
    assert.strictEqual(publicModalData.price, 'Liên hệ', 'Public Modal giá phải hiển thị "Liên hệ"');
    assert.ok(!publicModalData.text.includes('Miễn phí'), 'Public Modal TUYỆT ĐỐI không được hiển thị "Miễn phí"');
    assert.ok(!publicModalData.text.includes('0294.385.1111'), 'Public Modal TUYỆT ĐỐI không hiển thị SĐT cũ');
    assert.ok(!publicModalData.text.includes('06:00'), 'Public Modal TUYỆT ĐỐI không hiển thị giờ cũ 06:00');
    assert.ok(!publicModalData.text.includes('18:00'), 'Public Modal TUYỆT ĐỐI không hiển thị giờ cũ 18:00');
    assert.ok(!publicModalData.text.includes('./chùa âng.jpg'), 'Public Modal TUYỆT ĐỐI không dùng ảnh chưa bản quyền');
    assert.ok(publicModalData.stars.includes('Chưa có đánh giá'), 'Public Modal phải hiển thị "Chưa có đánh giá"');
    assert.strictEqual(publicModalData.contactBlockHidden, true, 'Khối liên hệ phải ẩn khi contact=null');
    console.log('    ✓ Public Modal: 0 "Miễn phí", 0 "0294.385.1111", 0 giờ cũ, 0 ảnh cũ, 0 fake rating, khối liên hệ ẩn');

    // Desktop Light
    await cdp.eval(`(() => {
      document.getElementById('offlineSyncToast')?.remove();
    })()`);
    await sleep(100);
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
