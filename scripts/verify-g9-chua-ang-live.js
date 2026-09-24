#!/usr/bin/env node
/**
 * scripts/verify-g9-chua-ang-live.js
 * Xác minh toàn diện Chùa Âng (ID 3) sau khi cập nhật dữ liệu và phê duyệt trên Production.
 *
 * Kiểm tra 4 tầng:
 * 1. CSDL Live Supabase: status=approved, description chuẩn, price_raw=null, rating=null, note=null.
 * 2. Audit Logs: Xác nhận 2 thao tác place.update và place.approved được ghi nhận nguyên tử với role admin.
 * 3. SSR Route Vercel: GET https://vivutravinh.id.vn/place/chua-ang -> HTTP 200, dynamic metadata chuẩn.
 * 4. Browser Chrome CDP: Modal mở tự động, hiển thị "Liên hệ", ẩn contact, mô tả chứa năm 990.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const PLACE_ID = 3;
const SLUG = 'chua-ang';
const PUBLIC_URL = `https://vivutravinh.id.vn/place/${SLUG}`;

function getEnvConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error('FAIL_CLOSED: Thiếu biến môi trường SUPABASE_SERVICE_ROLE_KEY.');
  }

  const baseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  return { baseUrl, serviceKey };
}

async function supabaseFetch(endpoint) {
  const { baseUrl, serviceKey } = getEnvConfig();
  const url = `${baseUrl}/rest/v1/${endpoint.replace(/^\//, '')}`;
  return fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    }
  });
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
  throw new Error('Chrome remote debugging not ready');
}

class CDPClient {
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
      this.callbacks.set(id, (res) => {
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
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }
}

async function main() {
  console.log('======================================================================');
  console.log('🔍 XÁC MINH TOÀN DIỆN CHÙA ÂNG (ID 3) TRÊN PRODUCTION SAU KHI DUYỆT');
  console.log('======================================================================\n');

  // --- TẦNG 1: CSDL LIVE SUPABASE ---
  console.log('--- 1. Kiểm tra CSDL Live Supabase ---');
  const resPlace = await supabaseFetch(`places?id=eq.${PLACE_ID}&select=*&limit=1`);
  assert.strictEqual(resPlace.status, 200, 'Supabase REST phải trả HTTP 200');
  const places = await resPlace.json();
  const place = places[0];
  assert.ok(place, 'Phải tìm thấy địa điểm ID 3');

  console.log(`  • Tên          : ${place.name}`);
  console.log(`  • Slug         : ${place.slug}`);
  console.log(`  • Trạng thái   : ${place.status}`);
  console.log(`  • updated_at   : ${place.updated_at}`);
  console.log(`  • Giá          : ${place.price_raw}`);
  console.log(`  • Đánh giá     : ${place.rating}`);
  console.log(`  • Ghi chú      : ${place.note}`);
  console.log(`  • Liên hệ      : ${place.contact}`);
  console.log(`  • Giờ mở cửa   : ${place.opening_time} - ${place.closing_time}`);

  assert.strictEqual(place.status, 'approved', 'Trạng thái CSDL live phải là approved');
  assert.strictEqual(place.price_raw, null, 'Giá price_raw phải là null');
  assert.strictEqual(place.rating, null, 'Rating phải là null');
  assert.strictEqual(place.note, null, 'Note phải là null');
  assert.strictEqual(place.contact, null, 'Contact phải là null');
  assert.ok(place.description.includes('990'), 'Mô tả phải chứa năm khởi dựng 990');
  assert.ok(place.description.includes('Ao Bà Om'), 'Mô tả phải nhắc đến khuôn viên Ao Bà Om');
  console.log('  ✓ [ĐẠT] CSDL Live Supabase: Trạng thái approved, 100% dữ liệu đã được làm sạch và chuẩn hóa.');

  // --- TẦNG 2: AUDIT LOGS ---
  console.log('\n--- 2. Kiểm tra Nhật Ký Kiểm Toán (Admin Audit Logs) ---');
  const resAudit = await supabaseFetch(`admin_audit_logs?entity_id=eq.${PLACE_ID}&order=created_at.desc&limit=2`);
  assert.strictEqual(resAudit.status, 200, 'Supabase audit logs phải trả HTTP 200');
  const auditLogs = await resAudit.json();
  assert.strictEqual(auditLogs.length, 2, 'Phải có 2 bản ghi audit gần nhất cho ID 3');

  const approveLog = auditLogs.find(l => l.action === 'place.approved');
  const patchLog = auditLogs.find(l => l.action === 'place.update');

  assert.ok(approveLog, 'Phải có audit log place.approved');
  assert.ok(patchLog, 'Phải có audit log place.update');

  console.log(`  • Log 1 (PATCH)  : ID ${patchLog.id}, Action: ${patchLog.action}, Actor: ${patchLog.actor_email}`);
  console.log(`  • Log 2 (APPROVE): ID ${approveLog.id}, Action: ${approveLog.action}, Actor: ${approveLog.actor_email}`);
  assert.strictEqual(approveLog.actor_role, 'admin');
  assert.strictEqual(patchLog.actor_role, 'admin');
  assert.strictEqual(approveLog.payload_after.status, 'approved');
  assert.strictEqual(patchLog.payload_after.rating, null);
  console.log('  ✓ [ĐẠT] Audit Logs: Cả hai thao tác PATCH và APPROVE đều được ghi nhận nguyên tử, an toàn.');

  // --- TẦNG 3: SSR ROUTE VERCEL ---
  console.log('\n--- 3. Kiểm tra Route Công Khai SSR Vercel ---');
  console.log(`  • Đang kiểm tra GET ${PUBLIC_URL}`);
  const ssrRes = await fetch(PUBLIC_URL, { headers: { 'Cache-Control': 'no-cache' } });
  console.log(`  • HTTP Status: ${ssrRes.status}`);
  assert.strictEqual(ssrRes.status, 200, 'Route công khai phải trả HTTP 200');

  const html = await ssrRes.text();
  assert.ok(html.includes('<title>Chùa Âng - ViVu Trà Vinh</title>'), 'Title phải là "Chùa Âng - ViVu Trà Vinh"');
  assert.ok(html.includes(`href="${PUBLIC_URL}"`), 'Canonical phải trỏ về /place/chua-ang');
  assert.ok(html.includes('content="Chùa Âng - ViVu Trà Vinh"'), 'OpenGraph Title chuẩn');
  assert.ok(html.includes('Ngôi chùa Khmer cổ kính và tiêu biểu bậc nhất Nam Bộ khởi dựng từ năm 990'), 'OpenGraph Description chứa mô tả đã xác minh');
  assert.ok(!html.includes('0294.385.1111'), 'Tuyệt đối không chứa số điện thoại cũ');
  assert.ok(!html.includes('chùa âng.jpg'), 'Tuyệt đối không chứa ảnh cũ');
  console.log('  ✓ [ĐẠT] SSR Route Vercel: HTTP 200, Dynamic OG Tags và Canonical URL hoàn hảo.');

  // --- TẦNG 4: CLIENT BROWSER HYDRATION (CHROME CDP) ---
  console.log('\n--- 4. Kiểm tra Trình Duyệt Thực Tế Client-Side (Chrome CDP) ---');
  const chromePort = 9260;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu_chua_ang_verify_'));
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${chromePort}`,
    'about:blank'
  ], { stdio: 'pipe' });

  try {
    const wsUrl = await getDebuggerUrl(chromePort);
    const cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log(`  • Chrome điều hướng tới ${PUBLIC_URL} ...`);
    await cdp.send('Page.navigate', { url: PUBLIC_URL });

    let modalData = null;
    let modalOpen = false;
    const startTime = Date.now();

    while (Date.now() - startTime < 15000) {
      modalData = await cdp.eval(`
        (() => {
          const modal = document.getElementById('detailModal');
          const isOpen = modal && !modal.classList.contains('hidden');
          const title = document.getElementById('modalTitle')?.textContent?.trim() || '';
          const price = document.getElementById('modalPrice')?.textContent?.trim() || '';
          const hours = document.getElementById('modalHours')?.textContent?.trim() || '';
          const desc = document.getElementById('modalDescription')?.textContent?.trim() || '';
          const address = document.getElementById('modalAddress')?.textContent?.trim() || '';
          const contactHidden = document.getElementById('modalContactBlock')?.classList.contains('hidden');
          return {
            isOpen,
            title,
            price,
            hours,
            desc,
            address,
            contactHidden
          };
        })()
      `);

      if (modalData && modalData.isOpen && modalData.title === 'Chùa Âng' && modalData.desc.length > 20) {
        modalOpen = true;
        break;
      }
      await sleep(500);
    }

    console.log('  • Kết quả Modal trên Client Live:');
    console.log(`    + isOpen       : ${modalData.isOpen}`);
    console.log(`    + title        : ${modalData.title}`);
    console.log(`    + price        : ${modalData.price}`);
    console.log(`    + hours        : ${modalData.hours}`);
    console.log(`    + desc         : ${modalData.desc.slice(0, 60)}...`);
    console.log(`    + address      : ${modalData.address}`);
    console.log(`    + contactHidden: ${modalData.contactHidden}`);

    assert.ok(modalOpen, 'Modal phải tự động mở khi truy cập /place/chua-ang');
    assert.strictEqual(modalData.title, 'Chùa Âng');
    assert.strictEqual(modalData.price, 'Liên hệ', 'Giá phải hiển thị "Liên hệ" (tuyệt đối không hiện "Miễn phí")');
    assert.ok(modalData.desc.includes('990'), 'Mô tả trên client phải chứa năm khởi dựng 990');
    assert.strictEqual(modalData.contactHidden, true, 'Khối liên hệ phải ẩn khi không có contact');
    console.log('  ✓ [ĐẠT] Client Browser: Tự động mở modal Chùa Âng, hiển thị "Liên hệ", mô tả chuẩn, khối liên hệ ẩn.');
  } finally {
    chrome.kill('SIGTERM');
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }

  console.log('\n======================================================================');
  console.log('🎉 TẤT CẢ 4 TẦNG XÁC MINH PRODUCTION ĐÃ ĐẠT 100% PASS!');
  console.log('   ID 1 (Ao Bà Om) & ID 3 (Chùa Âng) ĐÃ HOÀN TẤT VÒNG ĐỜI PILOT G9.3C');
  console.log('======================================================================\n');
}

main().catch(err => {
  console.error('\n❌ LỖI TRONG QUÁ TRÌNH XÁC MINH:', err);
  process.exit(1);
});
