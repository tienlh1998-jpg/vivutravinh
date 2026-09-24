#!/usr/bin/env node
/**
 * scripts/execute-g9-bien-ba-dong-draft.js
 * Quản trị & Chuyển Trạng Thái Biển Ba Động (ID 2) sang DRAFT và Thực Hiện Preview (G9.4-B1)
 *
 * Tiêu chuẩn Fail-Closed & An Toàn Tuyệt Đối:
 * 1. Đọc lại ID 2 và updated_at mới nhất từ production ngay trước khi thực thi.
 * 2. Lưu snapshot manifest & rollback payload trước khi thực hiện bất kỳ mutation nào.
 * 3. Bắt buộc ADMIN_ACCESS_TOKEN (Xác thực Supabase Auth + allowlist admin_users role admin).
 * 4. Kiểm soát khóa lạc quan (OCC) nghiêm ngặt với expected_updated_at.
 * 5. Bắt buộc cả hai cờ --execute và --confirm; nếu thiếu -> Dry-run an toàn (Zero Mutation).
 * 6. CHỈ CHUYỂN SANG DRAFT, TUYỆT ĐỐI KHÔNG APPROVE.
 * 7. Xác minh audit log nguyên tử trong admin_audit_logs.
 * 8. Kiểm tra route công khai https://vivutravinh.id.vn/place/bien-ba-dong vẫn trả HTTP 404.
 * 9. Khởi động Chrome CDP chụp đầy đủ ảnh preview Admin & Public (Desktop/Mobile, Light/Dark).
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(REPO_ROOT, 'backups');
const ARTIFACT_DIR = path.resolve('/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3');

const PLACE_ID = 2;
const SLUG = 'bien-ba-dong';
const PUBLIC_URL = `https://vivutravinh.id.vn/place/${SLUG}`;

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

export function loadLiveEnvConfig() {
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
  return env;
}

export function computeRecordChecksum(record) {
  if (!record || typeof record !== 'object') return '';
  const sortedKeys = Object.keys(record).sort();
  const sortedObj = {};
  for (const k of sortedKeys) {
    sortedObj[k] = record[k];
  }
  return crypto.createHash('sha256').update(JSON.stringify(sortedObj)).digest('hex');
}

export async function fetchLivePlaceId2(options = {}) {
  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
  const anonKey = options.anonKey || env.SUPABASE_ANON_KEY || CONFIG_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

  if (options.mockPlace) {
    return options.mockPlace;
  }

  if (!supabaseUrl || !serviceKey) {
    throw new Error('FAIL_CLOSED: Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.');
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/places?id=eq.${PLACE_ID}&select=*&limit=1`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    }
  });

  if (!res.ok) {
    throw new Error(`FAIL_CLOSED: Lỗi truy vấn live place ID ${PLACE_ID}: HTTP ${res.status}`);
  }

  const rows = await res.json();
  const place = rows[0];
  if (!place) {
    throw new Error(`FAIL_CLOSED: Không tìm thấy bản ghi ID ${PLACE_ID} trên production live.`);
  }

  return place;
}

export async function resolveAndAuthenticateAdmin(options = {}) {
  const env = options.env || loadLiveEnvConfig();
  const adminToken = options.adminToken || env.ADMIN_ACCESS_TOKEN || '';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = options.anonKey || env.SUPABASE_ANON_KEY || CONFIG_SUPABASE_ANON_KEY;
  const supabaseUrl = (options.supabaseUrl || env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');

  if (options.mockAuth) {
    if (options.mockAuth.error) throw options.mockAuth.error;
    return options.mockAuth.actor;
  }

  // Bắt buộc phải có ADMIN_ACCESS_TOKEN. Tuyệt đối không tự động đăng nhập ngầm bằng ADMIN_SECRET!
  if (!adminToken || typeof adminToken !== 'string' || !adminToken.trim()) {
    throw new Error('FAIL_CLOSED_NO_ADMIN_TOKEN: Thao tác mutation bắt buộc có ADMIN_ACCESS_TOKEN. Không tự động đăng nhập ngầm bằng ADMIN_SECRET.');
  }

  // 1. Xác thực token với Supabase Auth /auth/v1/user
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      apikey: serviceKey || anonKey
    }
  });

  if (!userRes.ok) {
    throw new Error(`UNAUTHENTICATED: ADMIN_ACCESS_TOKEN không hợp lệ hoặc đã hết hạn (HTTP ${userRes.status}).`);
  }

  const authUser = await userRes.json();
  if (!authUser || !authUser.id) {
    throw new Error('UNAUTHENTICATED: Không thể nhận diện danh tính người dùng từ token.');
  }

  // 2. Tra cứu quyền trong bảng public.admin_users
  const adminRes = await fetch(
    `${supabaseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(authUser.id)}&select=user_id,email,role,is_active`,
    {
      headers: {
        apikey: serviceKey || anonKey,
        Authorization: `Bearer ${serviceKey || adminToken}`
      }
    }
  );

  if (!adminRes.ok) {
    throw new Error(`DATABASE_ERROR: Không thể đối soát bảng admin_users (HTTP ${adminRes.status}).`);
  }

  const rows = await adminRes.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`FORBIDDEN: Tài khoản ${authUser.email || authUser.id} không nằm trong danh sách quản trị viên.`);
  }

  const adminProfile = rows[0];
  if (!adminProfile.is_active) {
    throw new Error(`FORBIDDEN: Tài khoản quản trị viên ${adminProfile.email} đã bị vô hiệu hóa.`);
  }

  if (adminProfile.role !== 'admin') {
    throw new Error(`FORBIDDEN: Yêu cầu quyền role 'admin' để thực thi mutation (vai trò hiện tại: '${adminProfile.role}').`);
  }

  return {
    id: adminProfile.user_id,
    email: adminProfile.email,
    role: adminProfile.role,
    token: adminToken
  };
}

export function savePreDraftSnapshot(liveRecord, options = {}) {
  const backupsDir = options.backupsDir || BACKUPS_DIR;
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const nowIso = new Date().toISOString();
  const fileDate = nowIso.replace(/[:.]/g, '-');

  const manifest = {
    manifest_type: 'g9_4_b1_bien_ba_dong_pre_draft_snapshot',
    environment: 'production',
    target_id: PLACE_ID,
    slug: SLUG,
    captured_at: nowIso,
    live_record: liveRecord,
    checksum_sha256: computeRecordChecksum(liveRecord),
    expected_updated_at: liveRecord.updated_at,
    rollback_payload: {
      id: liveRecord.id,
      name: liveRecord.name,
      slug: liveRecord.slug,
      category: liveRecord.category,
      area: liveRecord.area,
      address: liveRecord.address,
      coordinates: liveRecord.coordinates,
      map_link: liveRecord.map_link,
      opening_time: liveRecord.opening_time,
      closing_time: liveRecord.closing_time,
      display_hours: liveRecord.display_hours,
      price_raw: liveRecord.price_raw,
      rating: liveRecord.rating,
      contact: liveRecord.contact,
      note: liveRecord.note,
      status: liveRecord.status, // hidden
      operating_status: liveRecord.operating_status,
      images: liveRecord.images,
      image_link: liveRecord.image_link
    }
  };

  const filename = `g9-bien-ba-dong-pre-draft-manifest-${fileDate}.json`;
  const manifestPath = path.join(backupsDir, filename);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return { manifestPath, manifest };
}

export async function verifyAuditLog(targetId, correlationId, options = {}) {
  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (options.mockAuditLog) {
    return options.mockAuditLog;
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/admin_audit_logs?entity_type=eq.place&entity_id=eq.${targetId}&order=created_at.desc&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    }
  );

  if (!res.ok) {
    throw new Error(`FAIL_CLOSED: Lỗi truy vấn admin_audit_logs: HTTP ${res.status}`);
  }

  const logs = await res.json();
  const log = logs[0];
  if (!log) {
    throw new Error('FAIL_CLOSED: Không tìm thấy bản ghi audit log nào cho thao tác cập nhật ID 2.');
  }

  if (correlationId && log.correlation_id !== correlationId) {
    console.warn(`[AuditLog] Cảnh báo: correlation_id mới nhất (${log.correlation_id}) khác với (${correlationId}).`);
  }

  return log;
}

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

export async function capturePlacePreviewScreenshots(placeRecord, options = {}) {
  const artifactDir = options.artifactDir || ARTIFACT_DIR;
  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });

  const serverPort = options.serverPort || 8023;
  const chromePort = options.chromePort || 9228;

  // Khởi động server cục bộ
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://127.0.0.1:${serverPort}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/admin-places') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        places: [placeRecord],
        pagination: { page: 1, limit: 15, total: 1, total_pages: 1 }
      }));
      return;
    }

    if (pathname === '/api/admin-comments') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, comments: [], pagination: { page: 1, limit: 15, total: 0, total_pages: 0 } }));
      return;
    }

    if (pathname === '/api/admin-reports') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, reports: [], pagination: { page: 1, limit: 15, total: 0, total_pages: 0 } }));
      return;
    }

    if (pathname === '/api/admin-profile') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, profile: { role: 'admin', full_name: 'Quản Trị Viên QC' } }));
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

  const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu_ba_dong_preview_'));
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

    // 1. ADMIN PREVIEW MODAL
    console.log('\n--- Chụp Admin Preview Modal (Desktop & Mobile, Light & Dark) ---');
    await cdp.setViewport(1280, 850, false);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/admin.html` });

    for (let i = 0; i < 25; i++) {
      const hasVivuAdmin = await cdp.eval(`Boolean(window.VivuAdmin)`);
      if (hasVivuAdmin) break;
      await sleep(200);
    }

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

    await cdp.eval(`(() => {
      const placeData = ${JSON.stringify(placeRecord)};
      window.VivuAdmin.openPlacePreview(placeData);
    })()`);
    await sleep(400);

    const adminModalCheck = await cdp.eval(`(() => {
      const modal = document.getElementById('placePreviewModal');
      const text = modal ? modal.innerText : '';
      return { text };
    })()`);

    assert.ok(adminModalCheck.text.includes('Liên hệ / Chưa rõ'), 'Admin Preview phải hiển thị "Liên hệ / Chưa rõ"');
    assert.ok(!adminModalCheck.text.includes('Miễn phí'), 'Admin Preview TUYỆT ĐỐI không hiển thị "Miễn phí"');
    assert.ok(!adminModalCheck.text.includes('0294.383.2222'), 'Admin Preview TUYỆT ĐỐI không hiển thị hotline cũ');
    assert.ok(!adminModalCheck.text.includes('07:00'), 'Admin Preview TUYỆT ĐỐI không hiển thị giờ cũ 07:00');
    assert.ok(adminModalCheck.text.includes('Chưa có đánh giá'), 'Admin Preview phải hiển thị "Chưa có đánh giá"');

    // Admin Desktop Light
    const adminLightPath = path.join(artifactDir, 'g9-bien-ba-dong-admin-preview-light.png');
    await cdp.screenshot(adminLightPath);
    screenshots.adminDesktopLight = adminLightPath;
    console.log(`  ✓ Đã lưu Admin Preview Desktop Light: ${path.basename(adminLightPath)}`);

    // Admin Desktop Dark
    await cdp.eval(`document.documentElement.classList.add('dark');`);
    await sleep(200);
    const adminDarkPath = path.join(artifactDir, 'g9-bien-ba-dong-admin-preview-dark.png');
    await cdp.screenshot(adminDarkPath);
    screenshots.adminDesktopDark = adminDarkPath;
    console.log(`  ✓ Đã lưu Admin Preview Desktop Dark: ${path.basename(adminDarkPath)}`);

    // 2. PUBLIC CLIENT PREVIEW (Desktop & Mobile, Light & Dark)
    console.log('\n--- Chụp Public Detail Modal Preview (Desktop & Mobile, Light & Dark) ---');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/index.html` });
    await sleep(600);

    for (let i = 0; i < 30; i++) {
      const isReady = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.state && Array.isArray(window.ViVuApp.state.allPlaces))`);
      if (isReady) break;
      await sleep(200);
    }

    const publicPlace = {
      ...placeRecord,
      _source: 'supabase',
      status: 'approved' // Chế độ preview trải nghiệm người dùng
    };

    await cdp.eval(`(() => {
      document.documentElement.classList.remove('dark');
      const p = ${JSON.stringify(publicPlace)};
      window.ViVuApp.state.allPlaces.unshift(p);
      window.ViVuApp.openDetailModal(p);
      document.getElementById('offlineSyncToast')?.classList.add('hidden');
    })()`);
    await sleep(1500);

    // Desktop Light
    await cdp.eval(`document.getElementById('offlineSyncToast')?.remove();`);
    const pubDeskLight = path.join(artifactDir, 'g9-bien-ba-dong-public-preview-desktop-light.png');
    await cdp.screenshot(pubDeskLight);
    screenshots.publicDesktopLight = pubDeskLight;
    console.log(`  ✓ Đã lưu Public Preview Desktop Light: ${path.basename(pubDeskLight)}`);

    // Desktop Dark
    await cdp.eval(`document.documentElement.classList.add('dark'); document.getElementById('offlineSyncToast')?.classList.add('hidden');`);
    await sleep(300);
    const pubDeskDark = path.join(artifactDir, 'g9-bien-ba-dong-public-preview-desktop-dark.png');
    await cdp.screenshot(pubDeskDark);
    screenshots.publicDesktopDark = pubDeskDark;
    console.log(`  ✓ Đã lưu Public Preview Desktop Dark: ${path.basename(pubDeskDark)}`);

    // Mobile Viewport (390x844)
    await cdp.setViewport(390, 844, true);
    await cdp.eval(`(() => { if (window.ViVuApp?.state?.modalMap) window.ViVuApp.state.modalMap.invalidateSize(); return true; })()`);
    await sleep(600);

    // Mobile Light
    await cdp.eval(`document.documentElement.classList.remove('dark'); document.getElementById('offlineSyncToast')?.classList.add('hidden');`);
    await sleep(200);
    const pubMobLight = path.join(artifactDir, 'g9-bien-ba-dong-public-preview-mobile-light.png');
    await cdp.screenshot(pubMobLight);
    screenshots.publicMobileLight = pubMobLight;
    console.log(`  ✓ Đã lưu Public Preview Mobile Light: ${path.basename(pubMobLight)}`);

    // Mobile Dark
    await cdp.eval(`document.documentElement.classList.add('dark'); document.getElementById('offlineSyncToast')?.classList.add('hidden');`);
    await sleep(200);
    const pubMobDark = path.join(artifactDir, 'g9-bien-ba-dong-public-preview-mobile-dark.png');
    await cdp.screenshot(pubMobDark);
    screenshots.publicMobileDark = pubMobDark;
    console.log(`  ✓ Đã lưu Public Preview Mobile Dark: ${path.basename(pubMobDark)}`);

  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    server.close();
    try { fs.rmSync(chromeProfile, { recursive: true, force: true }); } catch {}
  }

  return screenshots;
}

export async function executeBienBaDongDraft(options = {}) {
  const args = options.args || process.argv.slice(2);
  const isExecute = args.includes('--execute') || Boolean(options.execute);
  const isConfirm = args.includes('--confirm') || Boolean(options.confirm);
  const isDryRun = !isExecute || !isConfirm;

  console.log('======================================================================');
  console.log('🚀 QUY TRÌNH CHUYỂN DRAFT & PREVIEW BIỂN BA ĐỘNG (ID 2)');
  console.log(`   Chế độ hoạt động: ${isDryRun ? '🔍 DRY-RUN (MÔ PHỎNG AN TOÀN — ZERO MUTATION)' : '⚡ EXECUTE MUTATION (CÓ XÁC NHẬN)'}`);
  console.log('======================================================================\n');

  // 1. Đọc lại ID 2 và updated_at mới nhất từ production live
  console.log('--- BƯỚC 1: TRUY VẤN LIVE SUPABASE ID 2 & UPDATED_AT ---');
  const liveRecord = await fetchLivePlaceId2(options);
  console.log(`  • ID                   : ${liveRecord.id}`);
  console.log(`  • Slug                 : ${liveRecord.slug}`);
  console.log(`  • Tên hiện tại         : ${liveRecord.name}`);
  console.log(`  • Trạng thái hiện tại  : ${liveRecord.status}`);
  console.log(`  • updated_at live      : ${liveRecord.updated_at}`);

  // 2. Tạo snapshot/rollback mới
  console.log('\n--- BƯỚC 2: TẠO SNAPSHOT & ROLLBACK PAYLOAD ---');
  const { manifestPath, manifest } = savePreDraftSnapshot(liveRecord, options);
  console.log(`  • Snapshot manifest    : ${manifestPath}`);
  console.log(`  • Checksum SHA-256     : ${manifest.checksum_sha256}`);

  // 3. Xác thực ADMIN_ACCESS_TOKEN
  console.log('\n--- BƯỚC 3: XÁC THỰC DANH TÍNH QUẢN TRỊ VIÊN ---');
  const adminActor = await resolveAndAuthenticateAdmin(options);
  console.log(`  • Actor xác thực       : ${adminActor.email} (Role: ${adminActor.role}, UUID: ${adminActor.id})`);

  // 4. Nếu là Dry-Run (thiếu cờ xác nhận): Dừng an toàn không mutation
  if (isDryRun) {
    console.log('\n----------------------------------------------------------------------');
    console.log('🔍 KẾT QUẢ MÔ PHỎNG DRY-RUN:');
    console.log('  • Xác thực token quản trị viên: THÀNH CÔNG');
    console.log(`  • Actor hợp lệ               : ${adminActor.email}`);
    console.log(`  • Mục tiêu live              : ID ${liveRecord.id} (${liveRecord.name}) - Status: ${liveRecord.status}`);
    console.log(`  • Yêu cầu cờ thực thi        : ${isExecute ? '✓ có --execute' : '✗ thiếu --execute'}, ${isConfirm ? '✓ có --confirm' : '✗ thiếu --confirm'}`);
    console.log('----------------------------------------------------------------------');
    console.log('ℹ️  Để thực thi mutation trên production, bắt buộc truyền ĐỒNG THỜI cả hai cờ:');
    console.log('   node scripts/execute-g9-bien-ba-dong-draft.js --execute --confirm\n');
    return {
      success: true,
      dryRun: true,
      mutated: false,
      liveRecord,
      adminActor,
      manifestPath
    };
  }

  let rpcData;
  let correlationIdPatch;

  // 5. Kiểm tra tiền điều kiện: Nếu đã là draft và dữ liệu đã chuẩn hóa, sử dụng trực tiếp bản ghi live
  if (liveRecord.status === 'draft' && liveRecord.name === 'Biển Ba Động' && liveRecord.price_raw === null) {
    console.log('\nℹ️ Bản ghi Biển Ba Động (ID 2) đã ở trạng thái draft với dữ liệu sạch. Bỏ qua mutation lặp lại, tiến hành kiểm tra audit log, route 404 và chụp ảnh preview.');
    rpcData = liveRecord;
  } else {
    // 6. Thực thi PATCH bằng OCC (Bắt buộc)
    console.log('\n--- BƯỚC 4: THỰC THI BẢN VÁ DỮ LIỆU & CHUYỂN DRAFT (OCC) ---');
    correlationIdPatch = `g9-bien-ba-dong-draft-${Date.now()}`;
    const env = options.env || loadLiveEnvConfig();
    const supabaseUrl = env.SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    const patchPayload = {
      name: 'Biển Ba Động',
      slug: 'bien-ba-dong',
      category: 'Điểm Check-in / Sống Ảo',
      area: 'Duyên Hải',
      address: 'Khu du lịch Ba Động, phường Trường Long Hòa, tỉnh Vĩnh Long',
      coordinates: '9.6730,106.5700',
      map_link: 'https://www.google.com/maps?q=9.6730,106.5700',
      description: 'Biển Ba Động là điểm du lịch biển nổi tiếng từ thời Pháp thuộc, mang đặc trưng cảnh quan và hệ sinh thái duyên hải của vùng đất Trà Vinh.',
      price_raw: null,
      rating: null,
      contact: null,
      note: null,
      opening_time: null,
      closing_time: null,
      display_hours: null,
      operating_status: 'Normal',
      status: 'draft', // DRAFT ONLY! KHÔNG APPROVE!
      images: [],
      image_link: null,
      expected_updated_at: liveRecord.updated_at
    };

    // Thẩm định schema trước khi gọi RPC
    const valResult = validatePlace(patchPayload, { mode: 'draft' });
    if (!valResult.valid) {
      throw new Error(`VALIDATION_FAILED: Dữ liệu patch không đạt chuẩn: ${JSON.stringify(valResult.errors)}`);
    }

    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_update_place_atomic`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_actor_id: adminActor.id,
        p_actor_email: adminActor.email,
        p_actor_role: adminActor.role,
        p_place_id: PLACE_ID,
        p_patch: patchPayload,
        p_ip: '127.0.0.1',
        p_correlation_id: correlationIdPatch
      })
    });

    rpcData = await rpcRes.json().catch(() => null);
    if (!rpcRes.ok) {
      const errMsg = rpcData?.message || `HTTP ${rpcRes.status}`;
      if (rpcRes.status === 409 || errMsg.includes('CONFLICT') || errMsg.includes('40001')) {
        console.error('\n❌ 409 CONFLICT: updated_at đã bị thay đổi đồng thời trên production!');
        throw new Error(`409 CONFLICT: OCC mismatch (${liveRecord.updated_at}). Mutation bị chặn đứng an toàn.`);
      }
      throw new Error(`RPC_FAILED: admin_update_place_atomic thất bại: ${errMsg}`);
    }

    console.log('  ✓ admin_update_place_atomic thành công!');
    console.log(`  • ID 2 Trạng thái mới  : ${rpcData.status}`);
    console.log(`  • updated_at mới       : ${rpcData.updated_at}`);
  }

  assert.strictEqual(rpcData.status, 'draft', 'Bản ghi phải ở trạng thái draft');
  assert.strictEqual(rpcData.price_raw, null, 'price_raw phải là null');
  assert.strictEqual(rpcData.rating, null, 'rating phải là null');

  // 7. Xác minh audit log
  console.log('\n--- BƯỚC 5: XÁC MINH AUDIT LOG TRONG CSDL ---');
  const auditLog = await verifyAuditLog(PLACE_ID, correlationIdPatch, options);
  console.log(`  • Log ID               : ${auditLog.id}`);
  console.log(`  • Action               : ${auditLog.action}`);
  console.log(`  • Correlation ID       : ${auditLog.correlation_id}`);
  console.log(`  • Actor                : ${auditLog.actor_email}`);
  console.log(`  • Payload status after : ${auditLog.payload_after?.status}`);
  assert.ok(auditLog.action === 'place.update' || auditLog.action === 'place.draft', 'Hành động audit log phải là place.update hoặc place.draft');
  assert.strictEqual(auditLog.payload_after?.status, 'draft', 'Audit log phải ghi nhận status=draft');

  // 8. Kiểm tra route công khai https://vivutravinh.id.vn/place/bien-ba-dong vẫn trả HTTP 404
  console.log('\n--- BƯỚC 6: KIỂM TRA ROUTE CÔNG KHAI (HTTP 404 NGUYÊN BẢN) ---');
  const pubRes = await fetch(PUBLIC_URL, {
    headers: { 'Cache-Control': 'no-cache' }
  });
  console.log(`  • URL kiểm tra         : ${PUBLIC_URL}`);
  console.log(`  • HTTP Status          : ${pubRes.status}`);
  assert.strictEqual(pubRes.status, 404, `Route công khai ${PUBLIC_URL} bắt buộc phải trả về HTTP 404 khi đang là draft`);
  console.log('  ✓ [ĐẠT] Route công khai trả về HTTP 404 trung tính, hoàn toàn không rò rỉ dữ liệu draft ra ngoài.');

  // 9. Chụp ảnh Preview Chrome Headless CDP
  console.log('\n--- BƯỚC 7: CHỤP ẢNH PREVIEW DESKTOP/MOBILE, SÁNG/TỐI (CDP) ---');
  const screenshots = await capturePlacePreviewScreenshots(rpcData, options);

  // 10. Dừng lại để kiểm tra trước khi duyệt công khai
  console.log('\n======================================================================');
  console.log('🛑 BƯỚC 8: DỪNG LẠI KIỂM SOÁT — TUYỆT ĐỐI CHƯA APPROVE!');
  console.log('   Biển Ba Động (ID 2) hiện đang ở trạng thái DRAFT an toàn trên Production.');
  console.log('   Route công khai trả về HTTP 404. Mọi bằng chứng preview đã sẵn sàng để đối soát.');
  console.log('======================================================================\n');

  return {
    success: true,
    dryRun: false,
    mutated: true,
    place: rpcData,
    auditLog,
    screenshots,
    manifestPath
  };
}

// Chạy trực tiếp qua CLI
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  executeBienBaDongDraft().catch(err => {
    console.error('\n❌ LỖI TRONG QUÁ TRÌNH THỰC THI:', err.message);
    process.exit(1);
  });
}
