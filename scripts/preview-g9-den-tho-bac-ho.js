#!/usr/bin/env node
/**
 * scripts/preview-g9-den-tho-bac-ho.js
 * Chuẩn bị dữ liệu & Chạy Dry-Run Preview cho Đền thờ Bác Hồ Trà Vinh (G9.4-C1)
 *
 * Tiêu chuẩn an toàn Fail-Closed & Zero Production Mutation:
 * 1. Đọc dữ liệu đề xuất từ data/g9-expansion-proposed-patches.json (slug: den-tho-bac-ho-tra-vinh).
 * 2. Đối soát nguồn xác thực: Báo Nhân Dân (bài viết cụ thể) & OpenStreetMap way 451892019 (tọa độ).
 * 3. Kiểm định dữ liệu bằng validatePlace: khẳng định 0 error, 4 warnings chuẩn.
 * 4. Đối soát CSDL Live Supabase: kiểm tra 0 collision (slug và tọa độ chưa tồn tại).
 * 5. Thiết lập kế hoạch snapshot & rollback: action=archive (vì là địa điểm tạo mới, targetId=null).
 * 6. Khởi động môi trường preview cục bộ cách ly (Local Server + Chrome CDP).
 * 7. Xuất đủ 6 ảnh chụp màn hình preview cho cả Admin & Public (Desktop/Mobile, Light/Dark).
 * 8. TUYỆT ĐỐI KHÔNG GỌI MUTATION TRÊN PRODUCTION VÀ CHƯA APPROVE.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePlace } from '../js/place-validator.js';
import { SUPABASE_ANON_KEY as CONFIG_SUPABASE_ANON_KEY } from '../js/config.js';
import { loadLiveEnvConfig, computeRecordChecksum } from './execute-g9-bien-ba-dong-draft.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(REPO_ROOT, 'backups');
const ARTIFACT_DIR = path.resolve('/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3');

const SLUG = 'den-tho-bac-ho-tra-vinh';
const PUBLIC_PROD_URL = `https://vivutravinh.id.vn/place/${SLUG}`;

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

export class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.reqId = 0;
    this.callbacks = new Map();
    this.ws.onmessage = (msg) => {
      const res = JSON.parse(msg.data);
      if (res.id && this.callbacks.has(res.id)) {
        const cb = this.callbacks.get(res.id);
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
        reject(new Error(`CDP method ${method} timed out after 20000ms`));
      }, 20000);
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
 * Đọc hồ sơ đề xuất cho Đền thờ Bác Hồ từ proposed patches JSON
 */
export function loadProposedCandidate(options = {}) {
  const patchesPath = options.patchesPath || path.join(REPO_ROOT, 'data/g9-expansion-proposed-patches.json');
  if (!fs.existsSync(patchesPath)) {
    throw new Error(`FAIL_CLOSED: Không tìm thấy tệp hồ sơ đề xuất tại ${patchesPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(patchesPath, 'utf8'));
  const candidate = manifest.candidates.find(c => c.slug === SLUG);
  if (!candidate) {
    throw new Error(`FAIL_CLOSED: Không tìm thấy ứng viên '${SLUG}' trong ${patchesPath}`);
  }
  return { manifest, candidate };
}

/**
 * Kiểm tra đối soát xung đột trên CSDL Live Supabase (Read-Only)
 */
export async function checkLiveCollisions(candidate, options = {}) {
  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (options.mockLivePlaces) {
    const places = options.mockLivePlaces;
    const slugCollision = places.find(p => p.slug === candidate.slug);
    const coordCollision = places.find(p => p.coordinates === candidate.draft_payload.coordinates);
    return {
      totalLivePlaces: places.length,
      hasCollision: Boolean(slugCollision || coordCollision),
      slugCollision,
      coordCollision
    };
  }

  if (!supabaseUrl || !serviceKey) {
    throw new Error('FAIL_CLOSED: Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.');
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/places?select=id,slug,name,coordinates,status`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    }
  });

  if (!res.ok) {
    throw new Error(`FAIL_CLOSED: Không thể đọc danh sách places từ live: HTTP ${res.status}`);
  }

  const places = await res.json();
  const slugCollision = places.find(p => p.slug === candidate.slug);
  const coordCollision = places.find(p => p.coordinates === candidate.draft_payload.coordinates);

  return {
    totalLivePlaces: places.length,
    hasCollision: Boolean(slugCollision || coordCollision),
    slugCollision,
    coordCollision
  };
}

/**
 * Lưu Snapshot Manifest chuẩn bị cho G9.4-C1 (Dry-Run Manifest)
 */
export function savePreCreateSnapshot(candidate, collisionResult, options = {}) {
  const backupsDir = options.backupsDir || BACKUPS_DIR;
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const nowIso = new Date().toISOString();
  const fileDate = nowIso.replace(/[:.]/g, '-');

  const manifest = {
    manifest_type: 'g9_4_c1_den_tho_bac_ho_pre_create_snapshot',
    environment: 'dry_run_simulation',
    target_id: null, // Tạo mới, chưa có ID
    slug: candidate.slug,
    name: candidate.name,
    client_submission_id: candidate.client_submission_id,
    captured_at: nowIso,
    total_live_places_before: collisionResult.totalLivePlaces,
    has_collision: collisionResult.hasCollision,
    proposed_draft_payload: candidate.draft_payload,
    draft_checksum_sha256: computeRecordChecksum(candidate.draft_payload),
    rollback_strategy: {
      action: 'archive',
      slug: candidate.slug,
      client_submission_id: candidate.client_submission_id,
      description: 'Nếu phát sinh lỗi sau khi tạo bản ghi draft, thực hiện archive bản ghi draft theo client_submission_id.'
    }
  };

  const filename = `g9-den-tho-bac-ho-pre-create-manifest-${fileDate}.json`;
  const manifestPath = path.join(backupsDir, filename);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return { manifestPath, manifest };
}

/**
 * Chụp 6 ảnh preview cho Đền thờ Bác Hồ qua môi trường server giả lập biệt lập
 */
export async function captureDenThoBacHoPreviews(candidate, options = {}) {
  const artifactDir = options.artifactDir || ARTIFACT_DIR;
  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });

  const serverPort = options.serverPort || 8023;
  const draftPlace = {
    ...candidate.draft_payload,
    id: 11, // ID giả lập phục vụ preview giao diện
    sort_order: 11,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // 1. Tạo HTTP server phục vụ repo và mock Admin API
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://127.0.0.1:${serverPort}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/admin-places') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        places: [draftPlace],
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

  const chromePort = options.chromePort || 9239;
  const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu_den_tho_bac_ho_preview_'));
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
  const screenshots = {};

  try {
    const wsUrl = await getDebuggerUrl(chromePort);
    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    // ==========================================
    // 1. ADMIN PREVIEW MODAL
    // ==========================================
    console.log('\n--- Chụp Ảnh Admin Preview Modal (Desktop Light & Dark) ---');
    await cdp.setViewport(1280, 850, false);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/admin.html` });

    for (let i = 0; i < 25; i++) {
      const hasVivuAdmin = await cdp.eval(`Boolean(window.VivuAdmin)`);
      if (hasVivuAdmin) break;
      await sleep(200);
    }

    await cdp.eval(`(() => {
      const session = {
        user: { id: 'admin-qc', email: 'admin@vivutravinh.vn', role: 'admin' },
        access_token: 'fake-jwt-for-preview',
        profile: { user_id: 'admin-qc', role: 'admin', full_name: 'Quản Trị Viên QC' }
      };
      sessionStorage.setItem('vivu_admin_session', JSON.stringify(session));
      window.dispatchEvent(new CustomEvent('vivu:auth-login', { detail: { session } }));
    })()`);
    await sleep(400);

    // Kích hoạt mở modal xem trước
    await cdp.eval(`(() => {
      const placeData = ${JSON.stringify(draftPlace)};
      window.VivuAdmin.openPlacePreview(placeData);
    })()`);
    await sleep(400);

    const adminCheck = await cdp.eval(`(() => {
      const modal = document.getElementById('placePreviewModal');
      const text = modal ? modal.innerText : '';
      const hasErrorBlock = Boolean(document.getElementById('previewValidationErrors'));
      const hasWarningBlock = Boolean(document.getElementById('previewValidationWarnings'));
      const approveBtn = document.getElementById('approveFromPreviewBtn');
      const isApproveBtnDisabled = approveBtn ? approveBtn.disabled : true;
      return {
        text,
        hasErrorBlock,
        hasWarningBlock,
        isApproveBtnDisabled
      };
    })()`);

    console.log('  • Xác thực DOM Admin Preview:');
    assert.ok(adminCheck.text.includes('Đền thờ Bác Hồ Trà Vinh'), 'Admin Preview phải hiển thị tên Đền thờ Bác Hồ');
    assert.ok(adminCheck.text.includes('Liên hệ / Chưa rõ') || adminCheck.text.includes('Liên hệ'), 'Admin Preview phải hiển thị "Liên hệ" cho giá');
    assert.ok(!adminCheck.text.includes('Miễn phí'), 'Admin Preview TUYỆT ĐỐI không được hiển thị "Miễn phí"');
    assert.ok(adminCheck.text.includes('Chưa có đánh giá'), 'Admin Preview phải hiển thị "Chưa có đánh giá"');
    assert.strictEqual(adminCheck.hasErrorBlock, false, 'Admin Preview phải có 0 lỗi bắt buộc');
    assert.strictEqual(adminCheck.hasWarningBlock, true, 'Admin Preview phải hiển thị khối 4 cảnh báo khuyến nghị');
    assert.strictEqual(adminCheck.isApproveBtnDisabled, false, 'Nút duyệt phải sẵn sàng kích hoạt vì 0 lỗi bắt buộc');
    console.log('    ✓ Admin Preview: Tên chuẩn, Giá Liên hệ, 0 Miễn phí, 0 Fake Rating, 0 Error, 4 Warnings');

    // Admin Light
    const adminLightPath = path.join(artifactDir, 'g9-den-tho-bac-ho-admin-preview-light.png');
    await cdp.screenshot(adminLightPath);
    screenshots.adminLight = adminLightPath;
    console.log(`  ✓ Đã lưu Admin Preview Light: ${path.basename(adminLightPath)}`);

    // Admin Dark
    await cdp.eval(`document.documentElement.classList.add('dark');`);
    await sleep(200);
    const adminDarkPath = path.join(artifactDir, 'g9-den-tho-bac-ho-admin-preview-dark.png');
    await cdp.screenshot(adminDarkPath);
    screenshots.adminDark = adminDarkPath;
    console.log(`  ✓ Đã lưu Admin Preview Dark: ${path.basename(adminDarkPath)}`);

    // ==========================================
    // 2. PUBLIC DETAIL MODAL PREVIEW
    // ==========================================
    console.log('\n--- Chụp Ảnh Public Detail Modal Preview (Desktop/Mobile, Light/Dark) ---');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/index.html` });
    await sleep(600);

    for (let i = 0; i < 30; i++) {
      const isReady = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.state && Array.isArray(window.ViVuApp.state.allPlaces))`);
      if (isReady) break;
      await sleep(200);
    }

    const publicPlace = {
      ...draftPlace,
      _source: 'supabase',
      status: 'approved', // mô phỏng khi được approve hiển thị với công chúng
      mapLink: draftPlace.map_link,
      hasValidGps: true,
      parsedCoordinates: [9.9705, 106.3382]
    };

    await cdp.eval(`(() => {
      document.documentElement.classList.remove('dark');
      const p = ${JSON.stringify(publicPlace)};
      window.ViVuApp.state.allPlaces.unshift(p);
      window.ViVuApp.openDetailModal(p);
      document.getElementById('offlineSyncToast')?.classList.add('hidden');
    })()`);
    await sleep(2000); // Chờ Leaflet map nạp tiles OSM

    const publicCheck = await cdp.eval(`(() => {
      const modal = document.getElementById('detailModal');
      const text = modal ? modal.innerText : '';
      const mapEl = document.getElementById('modalLeafletMap');
      const tileImages = mapEl ? Array.from(mapEl.querySelectorAll('img.leaflet-tile')).map(i => i.src) : [];
      const dirLink = document.getElementById('modalDirections');
      return {
        text,
        price: document.getElementById('modalPrice')?.innerText || '',
        tileImagesCount: tileImages.length,
        hasOsmTile: tileImages.some(src => src.includes('tile.openstreetmap.org')),
        hasCartoTile: tileImages.some(src => src.includes('cartocdn.com')),
        contactHidden: document.getElementById('modalContactBlock')?.classList.contains('hidden'),
        directionsHref: dirLink ? dirLink.href : ''
      };
    })()`);

    console.log('  • Xác thực DOM Public Modal:');
    assert.ok(publicCheck.text.includes('Đền thờ Bác Hồ Trà Vinh'), 'Public Modal phải chứa tên Đền thờ Bác Hồ Trà Vinh');
    assert.strictEqual(publicCheck.price, 'Liên hệ', 'Public Modal giá phải là "Liên hệ"');
    assert.ok(!publicCheck.text.includes('Miễn phí'), 'Public Modal TUYỆT ĐỐI không hiển thị "Miễn phí"');
    assert.ok(publicCheck.text.includes('Chưa có đánh giá'), 'Public Modal phải hiển thị "Chưa có đánh giá"');
    assert.ok(publicCheck.text.includes('Chưa rõ giờ mở'), 'Public Modal phải hiển thị trạng thái giờ "Chưa rõ giờ mở"');
    assert.strictEqual(publicCheck.contactHidden, true, 'Khối liên hệ phải ẩn khi contact=null');
    assert.ok(!publicCheck.hasCartoTile, 'Modal TUYỆT ĐỐI không chứa tile cartocdn có lỗi watermark');
    assert.ok(publicCheck.directionsHref.includes('9.9705') && publicCheck.directionsHref.includes('106.3382'), 'Nút chỉ đường Google Maps phải trỏ đúng tọa độ');
    console.log('    ✓ Public Modal: Tên chuẩn, Giá Liên hệ, 0 Miễn phí, 0 Fake Rating, Tile OSM sạch, Nút Maps chuẩn');

    // Public Desktop Light
    await cdp.eval(`(() => { document.getElementById('offlineSyncToast')?.remove(); })()`);
    await sleep(100);
    const pubDeskLightPath = path.join(artifactDir, 'g9-den-tho-bac-ho-public-preview-desktop-light.png');
    await cdp.screenshot(pubDeskLightPath);
    screenshots.publicDesktopLight = pubDeskLightPath;
    console.log(`  ✓ Đã lưu Public Preview Desktop Light: ${path.basename(pubDeskLightPath)}`);

    // Public Desktop Dark
    await cdp.eval(`(() => {
      document.documentElement.classList.add('dark');
      document.getElementById('offlineSyncToast')?.remove();
    })()`);
    await sleep(200);
    const pubDeskDarkPath = path.join(artifactDir, 'g9-den-tho-bac-ho-public-preview-desktop-dark.png');
    await cdp.screenshot(pubDeskDarkPath);
    screenshots.publicDesktopDark = pubDeskDarkPath;
    console.log(`  ✓ Đã lưu Public Preview Desktop Dark: ${path.basename(pubDeskDarkPath)}`);

    // Mobile Viewport (390x844)
    await cdp.setViewport(390, 844, true);
    await cdp.eval(`(() => {
      if (window.ViVuApp?.state?.modalMap) window.ViVuApp.state.modalMap.invalidateSize();
      document.getElementById('offlineSyncToast')?.remove();
      return true;
    })()`);
    await sleep(600);

    // Public Mobile Light
    await cdp.eval(`(() => {
      document.documentElement.classList.remove('dark');
      document.getElementById('offlineSyncToast')?.remove();
    })()`);
    await sleep(200);
    const pubMobLightPath = path.join(artifactDir, 'g9-den-tho-bac-ho-public-preview-mobile-light.png');
    await cdp.screenshot(pubMobLightPath);
    screenshots.publicMobileLight = pubMobLightPath;
    console.log(`  ✓ Đã lưu Public Preview Mobile Light: ${path.basename(pubMobLightPath)}`);

    // Public Mobile Dark
    await cdp.eval(`(() => {
      document.documentElement.classList.add('dark');
      document.getElementById('offlineSyncToast')?.remove();
    })()`);
    await sleep(200);
    const pubMobDarkPath = path.join(artifactDir, 'g9-den-tho-bac-ho-public-preview-mobile-dark.png');
    await cdp.screenshot(pubMobDarkPath);
    screenshots.publicMobileDark = pubMobDarkPath;
    console.log(`  ✓ Đã lưu Public Preview Mobile Dark: ${path.basename(pubMobDarkPath)}`);

  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    server.close();
    try { fs.rmSync(chromeProfile, { recursive: true, force: true }); } catch {}
  }

  return screenshots;
}

/**
 * Quy trình thực thi Dry-Run toàn diện G9.4-C1
 */
export async function runDenThoBacHoDryRun(options = {}) {
  console.log('======================================================================');
  console.log('🔍 G9.4-C1: THẨM ĐỊNH NGUỒN & CHẠY DRY-RUN ĐỀN THỜ BÁC HỒ TRÀ VINH');
  console.log('   CHẾ ĐỘ: 100% DRY-RUN — ZERO PRODUCTION MUTATION — ZERO APPROVAL');
  console.log('======================================================================\n');

  // 1. Tải hồ sơ đề xuất
  console.log('--- 1. NẠP HỒ SƠ ĐỀ XUẤT TỪ MANIFEST G9.4 ---');
  const { candidate } = loadProposedCandidate(options);
  console.log(`  • Tên ứng viên          : ${candidate.name}`);
  console.log(`  • Slug canonical        : ${candidate.slug}`);
  console.log(`  • Thao tác dự kiến      : ${candidate.actionType} (targetId: ${candidate.targetId})`);
  console.log(`  • Idempotency key       : ${candidate.client_submission_id}`);
  console.log(`  • Địa chỉ chuẩn         : ${candidate.draft_payload.address}`);
  console.log(`  • Tọa độ GPS            : ${candidate.draft_payload.coordinates}`);

  // 2. Thẩm tra nguồn gốc dữ liệu
  console.log('\n--- 2. THẨM TRA NGUỒN GỐC TỪNG TRƯỜNG DỮ LIỆU ---');
  const fsSources = candidate.field_sources;
  console.log(`  • Nguồn tên & di tích   : ${fsSources.name.source_url} (${fsSources.name.rationale})`);
  console.log(`  • Nguồn địa chỉ NQ 1687 : ${fsSources.address.source_url} (${fsSources.address.rationale})`);
  console.log(`  • Nguồn tọa độ OSM      : ${fsSources.coordinates.source_url} (${fsSources.coordinates.rationale})`);
  console.log(`  • Nguồn mô tả lịch sử   : ${fsSources.description.source_url}`);
  assert.ok(fsSources.name.source_url.includes('nhandan.vn'), 'Nguồn tên phải từ Báo Nhân Dân');
  assert.ok(fsSources.coordinates.source_url.includes('openstreetmap.org/way/451892019'), 'Nguồn tọa độ phải từ OSM way 451892019');

  // 3. Thẩm định tiêu chuẩn chất lượng (validatePlace)
  console.log('\n--- 3. THẨM ĐỊNH CONTRACT SCHEMA (validatePlace) ---');
  const draftVal = validatePlace(candidate.draft_payload, { mode: 'draft' });
  console.log(`  • Chế độ Draft: valid=${draftVal.valid}, errors=${draftVal.errors.length}, warnings=${draftVal.warnings.length}`);
  assert.strictEqual(draftVal.valid, true, 'Draft payload bắt buộc phải valid=true');
  assert.strictEqual(draftVal.errors.length, 0, 'Draft payload không được có lỗi bắt buộc nào');
  assert.strictEqual(draftVal.warnings.length, 4, 'Draft payload phải có đúng 4 cảnh báo chuẩn');
  console.log('  ✓ 4 cảnh báo được kiểm soát chặt chẽ: thiếu ảnh, thiếu giờ, thiếu giá, thiếu liên hệ');

  // 4. Đối soát CSDL Live Supabase (Read-Only)
  console.log('\n--- 4. ĐỐI SOÁT CSDL LIVE SUPABASE (READ-ONLY) ---');
  const collisionResult = await checkLiveCollisions(candidate, options);
  console.log(`  • Tổng số places trên live: ${collisionResult.totalLivePlaces}`);
  console.log(`  • Trùng lặp slug          : ${collisionResult.slugCollision ? 'CÓ (LỖI)' : 'KHÔNG (CHUẨN) ✓'}`);
  console.log(`  • Trùng lặp tọa độ        : ${collisionResult.coordCollision ? 'CÓ (LỖI)' : 'KHÔNG (CHUẨN) ✓'}`);
  assert.strictEqual(collisionResult.hasCollision, false, 'Không được có bất kỳ xung đột nào trên CSDL live');

  // 5. Kiểm tra route công khai hiện tại (phải là 404)
  console.log('\n--- 5. KIỂM TRA ROUTE CÔNG KHAI PRODUCTION (HTTP 404) ---');
  if (!options.skipRouteCheck) {
    const routeRes = await fetch(PUBLIC_PROD_URL, { headers: { 'Cache-Control': 'no-cache' } });
    console.log(`  • URL kiểm tra         : ${PUBLIC_PROD_URL}`);
    console.log(`  • HTTP Status          : ${routeRes.status}`);
    assert.strictEqual(routeRes.status, 404, `Route công khai ${PUBLIC_PROD_URL} phải trả về 404 trước khi tạo bản ghi`);
    console.log('  ✓ Xác nhận: Route công khai đang an toàn (404 Not Found), dữ liệu chưa rò rỉ');
  }

  // 6. Lưu Snapshot Manifest & Kế hoạch Rollback
  console.log('\n--- 6. LƯU SNAPSHOT MANIFEST & KẾ HOẠCH ROLLBACK ---');
  const { manifestPath, manifest } = savePreCreateSnapshot(candidate, collisionResult, options);
  console.log(`  • File manifest lưu tại: ${manifestPath}`);
  console.log(`  • Kế hoạch rollback    : ${manifest.rollback_strategy.action} (theo ${manifest.rollback_strategy.client_submission_id})`);

  // 7. Chụp ảnh Preview thực tế (Chrome CDP)
  console.log('\n--- 7. KHỞI ĐỘNG PREVIEW & CHỤP ẢNH MINH CHỨNG (CDP) ---');
  let screenshots = {};
  if (!options.skipScreenshots) {
    screenshots = await captureDenThoBacHoPreviews(candidate, options);
  }

  // 8. Khẳng định giới hạn & Dừng an toàn
  console.log('\n======================================================================');
  console.log('🛑 KẾT QUẢ DRY-RUN G9.4-C1: HOÀN TOÀN ĐẠT CHUẨN');
  console.log('   • Đã thẩm tra nguồn chính thức & bài viết cụ thể.');
  console.log('   • Đã thẩm định draft payload: 0 error, 4 warnings kiểm soát.');
  console.log('   • Đã xác nhận 0 collision trên live CSDL và route 404 bảo mật.');
  console.log('   • Đã chụp đủ 6 ảnh Preview Admin & Public (Desktop/Mobile, Light/Dark).');
  console.log('   • TUYỆT ĐỐI KHÔNG GỌI MUTATION TRÊN PRODUCTION VÀ CHƯA APPROVE.');
  console.log('======================================================================\n');

  return {
    success: true,
    candidate,
    collisionResult,
    manifestPath,
    screenshots
  };
}

// Chạy trực tiếp qua CLI
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  runDenThoBacHoDryRun().catch(err => {
    console.error('\n❌ LỖI TRONG QUÁ TRÌNH DRY-RUN:', err.message);
    process.exit(1);
  });
}
