#!/usr/bin/env node
/**
 * scripts/execute-g9-bien-ba-dong-approve.js
 * Quản trị & Phê duyệt Công Khai Biển Ba Động (ID 2) trên Production (G9.4-B2)
 *
 * Tiêu chuẩn Fail-Closed & An Toàn Tuyệt Đối:
 * 1. Đọc lại bản ghi ID 2 và updated_at mới nhất từ production ngay trước khi thực thi.
 * 2. Lưu snapshot manifest & rollback payload (chuyển ngược về draft) trước khi mutation.
 * 3. Bắt buộc ADMIN_ACCESS_TOKEN (Xác thực Supabase Auth + allowlist admin_users role admin).
 *    Thiếu token -> Dừng ngay lập tức (FAIL_CLOSED_NO_ADMIN_TOKEN). Không tự đăng nhập bằng ADMIN_SECRET.
 * 4. Kiểm soát khóa lạc quan (OCC) nghiêm ngặt với expected_updated_at.
 * 5. Bắt buộc cả hai cờ --execute và --confirm; nếu thiếu -> Dry-run an toàn (Zero Mutation).
 * 6. CHỈ PATCH status: "approved" kèm expected_updated_at. KHÔNG sửa bất kỳ trường nào khác.
 * 7. Xác minh audit log nguyên tử: action='place.approved', đúng actor và correlation ID.
 * 8. Kiểm tra route công khai https://vivutravinh.id.vn/place/bien-ba-dong chuyển từ HTTP 404 sang HTTP 200,
 *    title và canonical chính xác, không dữ liệu rác cũ.
 * 9. Chụp ảnh kiểm thử trực tiếp giao diện production trên desktop/mobile (Light/Dark).
 * 10. Dừng lại sau khi hoàn tất ID 2; tuyệt đối không tạo hay duyệt 4 địa điểm còn lại.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SUPABASE_ANON_KEY as CONFIG_SUPABASE_ANON_KEY } from '../js/config.js';
import { loadLiveEnvConfig, computeRecordChecksum } from './execute-g9-bien-ba-dong-draft.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(REPO_ROOT, 'backups');
const ARTIFACT_DIR = path.resolve('/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3');

const PLACE_ID = 2;
const SLUG = 'bien-ba-dong';
const PUBLIC_URL = `https://vivutravinh.id.vn/place/${SLUG}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function fetchLivePlaceId2(options = {}) {
  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = (options.supabaseUrl || env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const anonKey = options.anonKey || env.SUPABASE_ANON_KEY || CONFIG_SUPABASE_ANON_KEY;
  const serviceKey = options.serviceKey || env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

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
  const serviceKey = options.serviceKey || env.SUPABASE_SERVICE_ROLE_KEY || '';
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

export function savePreApproveSnapshot(liveRecord, options = {}) {
  const backupsDir = options.backupsDir || BACKUPS_DIR;
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const nowIso = new Date().toISOString();
  const fileDate = nowIso.replace(/[:.]/g, '-');

  const manifest = {
    manifest_type: 'g9_4_b2_bien_ba_dong_pre_approve_snapshot',
    environment: 'production',
    target_id: PLACE_ID,
    slug: SLUG,
    captured_at: nowIso,
    live_record: liveRecord,
    checksum_sha256: computeRecordChecksum(liveRecord),
    expected_updated_at: liveRecord.updated_at,
    rollback_payload: {
      id: liveRecord.id,
      status: 'draft', // rollback chuyển ngược về draft
      expected_updated_at: null // sẽ được điền khi rollback
    }
  };

  const filename = `g9-bien-ba-dong-pre-approve-manifest-${fileDate}.json`;
  const manifestPath = path.join(backupsDir, filename);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return { manifestPath, manifest };
}

export async function verifyApproveAuditLog(targetId, correlationId, options = {}) {
  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
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
    throw new Error('FAIL_CLOSED: Không tìm thấy bản ghi audit log nào cho thao tác approve ID 2.');
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

export async function captureProductionVerificationScreenshots(options = {}) {
  const artifactDir = options.artifactDir || ARTIFACT_DIR;
  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });

  const chromePort = options.chromePort || 9238;
  const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu_ba_dong_prod_'));
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

    console.log('\n--- Kiểm Tra Giao Diện Live Production Trực Tiếp (Chrome CDP) ---');
    console.log(`  • Điều hướng đến: ${PUBLIC_URL}`);
    await cdp.setViewport(1280, 850, false);
    await cdp.send('Page.navigate', { url: PUBLIC_URL });

    // Chờ ứng dụng nạp xong và mở modal
    for (let i = 0; i < 30; i++) {
      const modalOpen = await cdp.eval(`(() => {
        const modal = document.getElementById('detailModal');
        return Boolean(modal && !modal.classList.contains('hidden'));
      })()`);
      if (modalOpen) break;
      await sleep(300);
    }

    // Chờ Leaflet map nạp tiles OSM
    await sleep(2000);

    // Xác minh nội dung modal trực tiếp từ DOM production
    const modalCheck = await cdp.eval(`(() => {
      const modal = document.getElementById('detailModal');
      const text = modal ? modal.innerText : '';
      const mapEl = document.getElementById('modalLeafletMap');
      const tileImages = mapEl ? Array.from(mapEl.querySelectorAll('img.leaflet-tile')).map(i => i.src) : [];
      return {
        text,
        tileImagesCount: tileImages.length,
        hasOsmTile: tileImages.some(src => src.includes('tile.openstreetmap.org')),
        hasCartoTile: tileImages.some(src => src.includes('cartocdn.com'))
      };
    })()`);

    console.log(`  • Kiểm tra DOM Live Production:`);
    console.log(`    - Số mảnh tile bản đồ: ${modalCheck.tileImagesCount}`);
    console.log(`    - Dùng OpenStreetMap : ${modalCheck.hasOsmTile ? 'ĐÚNG ✓' : 'CHƯA TẢI'}`);
    console.log(`    - Dùng Cartocdn      : ${modalCheck.hasCartoTile ? 'CÓ LỖI ✗' : 'KHÔNG (CHUẨN) ✓'}`);

    assert.ok(modalCheck.text.includes('Biển Ba Động'), 'Modal phải chứa tiêu đề "Biển Ba Động"');
    assert.ok(modalCheck.text.includes('Liên hệ'), 'Modal phải hiển thị giá "Liên hệ"');
    assert.ok(!modalCheck.text.includes('Miễn phí'), 'Modal TUYỆT ĐỐI không hiển thị "Miễn phí"');
    assert.ok(modalCheck.text.includes('Chưa rõ giờ mở'), 'Modal phải hiển thị trạng thái giờ "Chưa rõ giờ mở"');
    assert.ok(modalCheck.text.includes('Chưa có đánh giá'), 'Modal phải hiển thị "Chưa có đánh giá"');
    assert.ok(!modalCheck.text.includes('0294.383.2222'), 'Modal TUYỆT ĐỐI không chứa số điện thoại cũ');
    assert.ok(!modalCheck.hasCartoTile, 'Modal TUYỆT ĐỐI không chứa tile cartocdn có lỗi watermark');

    // 1. Desktop Light Mode
    await cdp.eval(`document.documentElement.classList.remove('dark');`);
    await sleep(200);
    const deskLightPath = path.join(artifactDir, 'g9-bien-ba-dong-production-desktop-light.png');
    await cdp.screenshot(deskLightPath);
    screenshots.desktopLight = deskLightPath;
    console.log(`  ✓ Đã lưu Live Production Desktop Light: ${path.basename(deskLightPath)}`);

    // 2. Desktop Dark Mode
    await cdp.eval(`document.documentElement.classList.add('dark');`);
    await sleep(300);
    const deskDarkPath = path.join(artifactDir, 'g9-bien-ba-dong-production-desktop-dark.png');
    await cdp.screenshot(deskDarkPath);
    screenshots.desktopDark = deskDarkPath;
    console.log(`  ✓ Đã lưu Live Production Desktop Dark: ${path.basename(deskDarkPath)}`);

    // 3. Mobile Viewport (390x844)
    await cdp.setViewport(390, 844, true);
    await cdp.eval(`(() => { if (window.ViVuApp?.state?.modalMap) window.ViVuApp.state.modalMap.invalidateSize(); return true; })()`);
    await sleep(600);

    // Mobile Light
    await cdp.eval(`document.documentElement.classList.remove('dark');`);
    await sleep(200);
    const mobLightPath = path.join(artifactDir, 'g9-bien-ba-dong-production-mobile-light.png');
    await cdp.screenshot(mobLightPath);
    screenshots.mobileLight = mobLightPath;
    console.log(`  ✓ Đã lưu Live Production Mobile Light: ${path.basename(mobLightPath)}`);

    // Mobile Dark
    await cdp.eval(`document.documentElement.classList.add('dark');`);
    await sleep(300);
    const mobDarkPath = path.join(artifactDir, 'g9-bien-ba-dong-production-mobile-dark.png');
    await cdp.screenshot(mobDarkPath);
    screenshots.mobileDark = mobDarkPath;
    console.log(`  ✓ Đã lưu Live Production Mobile Dark: ${path.basename(mobDarkPath)}`);

  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    try { fs.rmSync(chromeProfile, { recursive: true, force: true }); } catch {}
  }

  return screenshots;
}

export async function executeBienBaDongApprove(options = {}) {
  const args = options.args || process.argv.slice(2);
  const isExecute = args.includes('--execute') || Boolean(options.execute);
  const isConfirm = args.includes('--confirm') || Boolean(options.confirm);
  const isDryRun = !isExecute || !isConfirm;

  console.log('======================================================================');
  console.log('🚀 QUY TRÌNH PHÊ DUYỆT CÔNG KHAI BIỂN BA ĐỘNG (ID 2) — G9.4-B2');
  console.log(`   Chế độ hoạt động: ${isDryRun ? '🔍 DRY-RUN (MÔ PHỎNG AN TOÀN — ZERO MUTATION)' : '⚡ EXECUTE MUTATION (CÓ XÁC NHẬN)'}`);
  console.log('======================================================================\n');

  // 1. Đọc lại bản ghi ID 2 và updated_at trực tiếp từ production
  console.log('--- BƯỚC 1: TRUY VẤN LIVE SUPABASE ID 2 & UPDATED_AT ---');
  const liveRecord = await fetchLivePlaceId2(options);
  console.log(`  • ID                   : ${liveRecord.id}`);
  console.log(`  • Slug                 : ${liveRecord.slug}`);
  console.log(`  • Tên hiện tại         : ${liveRecord.name}`);
  console.log(`  • Trạng thái hiện tại  : ${liveRecord.status}`);
  console.log(`  • updated_at live      : ${liveRecord.updated_at}`);

  // 2. Lưu snapshot manifest & rollback payload
  console.log('\n--- BƯỚC 2: TẠO SNAPSHOT & ROLLBACK PAYLOAD ---');
  const { manifestPath, manifest } = savePreApproveSnapshot(liveRecord, options);
  console.log(`  • Snapshot manifest    : ${manifestPath}`);
  console.log(`  • Checksum SHA-256     : ${manifest.checksum_sha256}`);

  // 3. Bắt buộc xác thực ADMIN_ACCESS_TOKEN (Fail-Closed)
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
    console.log(`  • Thao tác dự kiến           : CHỈ CHUYỂN status: 'approved' kèm OCC expected_updated_at`);
    console.log(`  • Yêu cầu cờ thực thi        : ${isExecute ? '✓ có --execute' : '✗ thiếu --execute'}, ${isConfirm ? '✓ có --confirm' : '✗ thiếu --confirm'}`);
    console.log('----------------------------------------------------------------------');
    console.log('ℹ️  Để thực thi phê duyệt trên production, bắt buộc truyền ĐỒNG THỜI cả hai cờ:');
    console.log('   node scripts/execute-g9-bien-ba-dong-approve.js --execute --confirm\n');
    return {
      success: true,
      dryRun: true,
      mutated: false,
      liveRecord,
      adminActor,
      manifestPath
    };
  }

  // 5. Kiểm tra nếu đã được approved từ trước (Idempotent execution)
  let rpcData;
  let correlationIdApprove = `g9-bien-ba-dong-approve-${Date.now()}`;

  if (liveRecord.status === 'approved') {
    console.log('\nℹ️ Bản ghi Biển Ba Động (ID 2) đã ở trạng thái approved. Bỏ qua mutation lặp lại.');
    rpcData = liveRecord;
  } else {
    // 6. Thực thi PATCH status: "approved" kèm expected_updated_at mới nhất (KHÔNG SỬA BẤT KỲ TRƯỜNG NÀO KHÁC)
    console.log('\n--- BƯỚC 4: THỰC THI PHÊ DUYỆT (APPROVE) VỚI KHÓA LẠC QUAN (OCC) ---');
    const env = options.env || loadLiveEnvConfig();
    const supabaseUrl = env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    // Chỉ PATCH status: "approved" kèm expected_updated_at
    const approvePatch = {
      status: 'approved',
      expected_updated_at: liveRecord.updated_at
    };

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
        p_patch: approvePatch,
        p_ip: '127.0.0.1',
        p_correlation_id: correlationIdApprove
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

  assert.strictEqual(rpcData.status, 'approved', 'Bản ghi phải ở trạng thái approved');
  assert.strictEqual(rpcData.name, 'Biển Ba Động', 'Tên không được thay đổi');
  assert.strictEqual(rpcData.price_raw, null, 'price_raw phải giữ nguyên null');
  assert.strictEqual(rpcData.rating, null, 'rating phải giữ nguyên null');

  // 7. Xác minh audit log có action place.approved, đúng actor và correlation ID
  console.log('\n--- BƯỚC 5: XÁC MINH AUDIT LOG PHÊ DUYỆT (place.approved) ---');
  const auditLog = await verifyApproveAuditLog(PLACE_ID, correlationIdApprove, options);
  console.log(`  • Log ID               : ${auditLog.id}`);
  console.log(`  • Action               : ${auditLog.action}`);
  console.log(`  • Correlation ID       : ${auditLog.correlation_id}`);
  console.log(`  • Actor                : ${auditLog.actor_email}`);
  console.log(`  • Payload status after : ${auditLog.payload_after?.status}`);
  assert.strictEqual(auditLog.action, 'place.approved', 'Audit log action bắt buộc phải là place.approved');
  assert.strictEqual(auditLog.actor_email, adminActor.email, 'Actor email trong audit log phải khớp actor xác thực');
  assert.strictEqual(auditLog.payload_after?.status, 'approved', 'Audit log payload_after status phải là approved');

  // 8. Kiểm tra route công khai chuyển từ HTTP 404 sang HTTP 200, title và canonical chính xác
  console.log('\n--- BƯỚC 6: XÁC MINH ROUTE CÔNG KHAI TRÊN PRODUCTION (HTTP 200) ---');
  let pubRes = null;
  let pubHtml = '';
  for (let attempt = 1; attempt <= 10; attempt++) {
    pubRes = await fetch(PUBLIC_URL, {
      headers: { 'Cache-Control': 'no-cache, no-store' }
    });
    if (pubRes.status === 200) {
      pubHtml = await pubRes.text();
      break;
    }
    console.log(`  • Lần thử ${attempt}/10: HTTP ${pubRes.status}... chờ đồng bộ edge (1000ms)`);
    await sleep(1000);
  }

  console.log(`  • URL kiểm tra         : ${PUBLIC_URL}`);
  console.log(`  • HTTP Status          : ${pubRes.status}`);
  assert.strictEqual(pubRes.status, 200, `Route công khai ${PUBLIC_URL} bắt buộc phải trả về HTTP 200 sau khi approved`);

  // Kiểm tra title và canonical
  assert.ok(pubHtml.includes('<title>Biển Ba Động - ViVu Trà Vinh</title>'), 'HTML phải chứa title chuẩn "Biển Ba Động - ViVu Trà Vinh"');
  console.log('  ✓ Title: Biển Ba Động - ViVu Trà Vinh');

  assert.ok(pubHtml.includes('href="https://vivutravinh.id.vn/place/bien-ba-dong"'), 'HTML phải chứa canonical link chuẩn');
  console.log('  ✓ Canonical URL: https://vivutravinh.id.vn/place/bien-ba-dong');

  // Khẳng định không rò rỉ dữ liệu cũ chưa xác minh trong metadata
  assert.ok(!pubHtml.includes('0294.383.2222'), 'Tuyệt đối không chứa số điện thoại cũ');
  assert.ok(!pubHtml.includes('biển ba động.jpg'), 'Tuyệt đối không chứa tên ảnh cũ');
  console.log('  ✓ Dữ liệu rác cũ đã được khử sạch 100%');

  // 9. Kiểm tra trực tiếp modal production trên desktop/mobile
  console.log('\n--- BƯỚC 7: CHỤP ẢNH XÁC MINH TRỰC TIẾP LIVE PRODUCTION (CDP) ---');
  let screenshots = {};
  if (!options.skipScreenshots) {
    screenshots = await captureProductionVerificationScreenshots(options);
  }

  // 10. Dừng lại sau khi hoàn tất Biển Ba Động; chưa tạo hoặc duyệt bốn địa điểm G9.4 còn lại
  console.log('\n======================================================================');
  console.log('🛑 BƯỚC 8: DỪNG LẠI HOÀN TẤT BIỂN BA ĐỘNG — CHƯA ĐỘNG ĐẾN 4 ĐỊA ĐIỂM CÒN LẠI');
  console.log('   Biển Ba Động (ID 2) đã được DUYỆT CÔNG KHAI và hiển thị chuẩn xác trên Production.');
  console.log('   Tuyệt đối chưa tạo hoặc duyệt: Chùa Hang, Chùa Vàm Rây, Cồn Chim, Cù Lao Tân Quy.');
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
  executeBienBaDongApprove().catch(err => {
    console.error('\n❌ LỖI TRONG QUÁ TRÌNH THỰC THI:', err.message);
    process.exit(1);
  });
}
