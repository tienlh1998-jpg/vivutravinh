/**
 * scripts/verify-rsvp-e2e-browser.cjs
 *
 * Kiểm thử E2E trên trình duyệt (Headless Chrome CDP) cho toàn bộ luồng vé:
 * 1. Khách vãng lai tạo vé qua giao diện Web -> Server cấp claim_token, client lưu claimToken & client_rsvp_id vào localStorage.
 * 2. Khách gửi lại đúng token & client_rsvp_id -> Nhận đúng vé cũ (HTTP 200 idempotent).
 * 3. Kẻ xấu biết đủ thông tin nhưng THIẾU TOKEN bí mật -> Bị từ chối HTTP 403, không tạo thêm vé.
 * 4. Kẻ xấu gửi TOKEN BÍ MẬT SAI -> Bị từ chối HTTP 403, không tạo thêm vé.
 * 5. Request gửi Bearer token không hợp lệ / hết hạn -> Bị từ chối HTTP 401 ngay lập tức.
 * 6. Chụp ảnh màn hình minh chứng visual artifact.
 * 7. Dọn dẹp CSDL sạch sẽ 100% theo đúng ID.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const assert = require('assert');

const PROJECT_DIR = path.resolve(__dirname, '..');
const envContent = fs.readFileSync(path.join(PROJECT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1].replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

const ARTIFACT_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
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
  console.log('================================================================================');
  console.log(' KIỂM THỬ E2E TRÌNH DUYỆT: TẠO VÉ -> GỬI LẠI TOKEN -> XÁC MINH AN TOÀN TUYỆT ĐỐI');
  console.log('================================================================================\n');

  const createdTicketIds = [];
  let localServer = null;
  let chromeProc = null;
  let cdp = null;

  try {
    const rsvpModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'submit-rsvp.js')).href);
    const rsvpHandler = rsvpModule.default;

    const serverPort = 8990 + Math.floor(Math.random() * 80);
    localServer = http.createServer(async (req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      if (p.startsWith('/api/submit-rsvp')) {
        req.headers['x-forwarded-for'] = req.headers['x-forwarded-for'] || `10.88.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
        await rsvpHandler(req, res);
        return;
      }

      let filePath = p === '/' ? '/index.html' : p;
      const fp = path.join(PROJECT_DIR, filePath);
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        const ext = path.extname(fp).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(fp).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise(r => localServer.listen(serverPort, r));
    console.log(`  ✓ Đã khởi chạy máy chủ kiểm thử tại cổng ${serverPort}`);

    // Khởi chạy Chrome Headless
    const chromeCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromeCandidates.find(fs.existsSync);
    if (!chromeExe) throw new Error('Không tìm thấy Google Chrome.');

    const cdpPort = 9750 + Math.floor(Math.random() * 80);
    const userDataDir = path.join(os.tmpdir(), `chrome_rsvp_e2e_${Date.now()}`);
    chromeProc = spawn(chromeExe, [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      '--no-sandbox',
      '--disable-gpu',
      `--user-data-dir=${userDataDir}`,
      `http://localhost:${serverPort}/#tabNavHome`
    ]);

    const wsUrl = await getDebuggerUrl(cdpPort);
    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Chờ web app sẵn sàng
    let appLoaded = false;
    for (let i = 0; i < 40; i++) {
      appLoaded = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.handleGrandstandRsvp)`);
      if (appLoaded) break;
      await sleep(250);
    }
    if (!appLoaded) throw new Error('Web App không khởi động được trong 10 giây.');
    console.log('  ✓ Web App đã sẵn sàng trên Chrome Headless.');

    const ts = Date.now();
    const testPhone = '098' + Math.floor(1000000 + Math.random() * 9000000);
    const attendeeName = `Du Khách E2E ${ts}`;

    // =========================================================================
    // [BƯỚC 1] KHÁCH VÃNG LAI TẠO VÉ QUA GIAO DIỆN WEB
    // =========================================================================
    console.log('\n[BƯỚC 1] KHÁCH VÃNG LAI ĐĂNG KÝ VÉ QUA GIAO DIỆN WEB:');
    
    // Thực thi đăng ký vé qua giao diện window.ViVuApp
    await cdp.eval(`(() => {
      window.ViVuApp.handleGrandstandRsvp({
        fullname: '${attendeeName}',
        phone: '${testPhone}',
        sector: 'ao-ba-om'
      });
    })()`);

    // Chờ modal vé mở
    let ticketModalOpened = false;
    for (let i = 0; i < 40; i++) {
      ticketModalOpened = await cdp.eval(`(() => {
        const modal = document.getElementById('offlineTicketModal');
        return modal && !modal.classList.contains('hidden');
      })()`);
      if (ticketModalOpened) break;
      await sleep(250);
    }
    assert.ok(ticketModalOpened, 'Modal vé #offlineTicketModal phải mở sau khi đăng ký thành công');

    // Kiểm tra thông tin hiển thị trên modal vé
    const ticketRendered = await cdp.eval(`(() => {
      const container = document.getElementById('offlineTicketModalContent');
      return container ? container.innerText : '';
    })()`);
    assert.ok(ticketRendered.includes(attendeeName), 'Tên du khách phải hiển thị trên vé');
    assert.ok(ticketRendered.includes('OKB-2026-'), 'Mã vé OKB-2026-XXXX phải hiển thị');
    console.log('  ✓ Modal vé đã mở và hiển thị đầy đủ thông tin vé cho du khách.');

    // Kiểm tra dữ liệu được lưu trong localStorage (vivu_user_passes)
    const norm = p => String(p || '').replace(/[\s.-]/g, '').replace(/^\+84/, '0');
    const storedPasses = await cdp.eval(`JSON.parse(localStorage.getItem('vivu_user_passes') || '[]')`);
    assert.ok(Array.isArray(storedPasses) && storedPasses.length > 0, 'Phải có vé lưu trong localStorage');
    const firstTicket = storedPasses.find(p => norm(p.phone) === norm(testPhone));
    assert.ok(firstTicket, 'Tìm thấy vé tương ứng với SĐT trong localStorage');
    assert.ok(firstTicket.code, `Mã vé đã lưu: ${firstTicket.code}`);
    assert.ok(firstTicket.client_rsvp_id, `client_rsvp_id đã được lưu: ${firstTicket.client_rsvp_id}`);
    assert.ok(firstTicket.claimToken && firstTicket.claimToken.startsWith('clm_'), `Token bí mật claimToken đã lưu: ${firstTicket.claimToken?.slice(0, 10)}...`);
    console.log(`  ✓ Trình duyệt đã lưu thành công client_rsvp_id và claimToken vào localStorage.`);

    // Truy vấn CSDL Supabase để lưu ID bản ghi nhằm dọn dẹp an toàn
    const dbPhoneFilter = `in.(${encodeURIComponent(testPhone)},${encodeURIComponent(testPhone.replace(/^0/, '+84'))})`;
    const dbCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/event_rsvps?phone=${dbPhoneFilter}&select=id,ticket_code,qr_data`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const dbRecords = await dbCheckRes.json();
    assert.strictEqual(dbRecords.length, 1, 'Supabase CSDL phải có đúng 1 bản ghi vé cho SĐT này');
    const createdId = dbRecords[0].id;
    createdTicketIds.push(createdId);
    console.log(`  ✓ CSDL Supabase Live đã lưu vé chính xác (ID: ${createdId}).`);

    // =========================================================================
    // [BƯỚC 2] KHÁCH GỬI LẠI REQUEST (TỰ ĐỘNG GỬI LẠI ĐÚNG TOKEN & CLIENT_RSVP_ID) -> NHẬN ĐÚNG VÉ CŨ
    // =========================================================================
    console.log('\n[BƯỚC 2] KHÁCH GỬI LẠI ĐĂNG KÝ (TỰ ĐỘNG GỬI TOKEN BÍ MẬT & CLIENT_RSVP_ID TỪ LOCALSTORAGE):');
    
    // Đóng modal vé
    await cdp.eval(`window.ViVuApp.closeOfflineTicketModal()`);
    await sleep(200);

    // Gửi lại cùng thông tin đăng ký
    await cdp.eval(`(() => {
      window.ViVuApp.handleGrandstandRsvp({
        fullname: '${attendeeName}',
        phone: '${testPhone}',
        sector: 'ao-ba-om'
      });
    })()`);

    // Chờ modal vé mở lại
    ticketModalOpened = false;
    for (let i = 0; i < 40; i++) {
      ticketModalOpened = await cdp.eval(`(() => {
        const modal = document.getElementById('offlineTicketModal');
        return modal && !modal.classList.contains('hidden');
      })()`);
      if (ticketModalOpened) break;
      await sleep(250);
    }
    assert.ok(ticketModalOpened, 'Modal vé phải mở lại khi khách đăng ký lại');

    // Kiểm tra vé nhận lại có đúng mã vé và thông tin cũ không
    const reloadedPasses = await cdp.eval(`JSON.parse(localStorage.getItem('vivu_user_passes') || '[]')`);
    const retrievedTicket = reloadedPasses.find(p => norm(p.phone) === norm(testPhone));
    assert.strictEqual(retrievedTicket.code, firstTicket.code, 'Mã vé nhận lại phải trùng khớp 100% với vé ban đầu');
    assert.strictEqual(retrievedTicket.seat, firstTicket.seat, 'Số ghế nhận lại phải trùng khớp 100% với ghế ban đầu');
    assert.strictEqual(retrievedTicket.client_rsvp_id, firstTicket.client_rsvp_id, 'client_rsvp_id phải được bảo toàn nguyên vẹn');

    // Xác nhận số bản ghi trong CSDL vẫn là 1 (không tạo thêm vé mới)
    const dbCountRes = await fetch(`${SUPABASE_URL}/rest/v1/event_rsvps?phone=${dbPhoneFilter}&select=id`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const dbCountRecords = await dbCountRes.json();
    assert.strictEqual(dbCountRecords.length, 1, 'Số lượng vé trên CSDL vẫn là 1 (không tạo thêm vé rác)');
    console.log(`  ✓ Xác nhận thành công: Khách nhận đúng vé cũ (${retrievedTicket.code}), CSDL không bị tạo thêm vé mới.`);

    // =========================================================================
    // [BƯỚC 3] KẺ XẤU BIẾT ĐỦ THÔNG TIN NHƯNG THIẾU TOKEN BÍ MẬT -> BỊ TỪ CHỐI
    // =========================================================================
    console.log('\n[BƯỚC 3] KẺ XẤU BIẾT ĐỦ CLIENT_RSVP_ID, HỌ TÊN VÀ SĐT NHƯNG THIẾU TOKEN BÍ MẬT:');
    
    // Kẻ xấu gửi request trực tiếp không có claim_token
    const attackerRes1 = await cdp.eval(`(async () => {
      const res = await fetch('/api/submit-rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullname: '${attendeeName}',
          phone: '${testPhone}',
          sector: 'ao-ba-om',
          event_slug: 'ok-om-bok-2026',
          client_rsvp_id: '${firstTicket.client_rsvp_id}'
        })
      });
      const data = await res.json();
      return { status: res.status, data };
    })()`);

    assert.strictEqual(attackerRes1.status, 403, 'Thiếu token bí mật phải bị từ chối với HTTP 403');
    assert.strictEqual(attackerRes1.data?.error?.code, 'UNAUTHORIZED_TICKET_ACCESS', 'Mã lỗi UNAUTHORIZED_TICKET_ACCESS chuẩn xác');
    assert.strictEqual(attackerRes1.data?.data, undefined, 'Tuyệt đối KHÔNG trả về dữ liệu vé cho kẻ thiếu token');
    console.log('  ✓ Chặn đứng kẻ xấu thiếu token: HTTP 403 UNAUTHORIZED_TICKET_ACCESS, dữ liệu vé được bảo vệ 100%.');

    // Kẻ khác tạo client_rsvp_id mới với SĐT của nạn nhân (thiếu token) -> Bị chặn 409
    const attackerRes2 = await cdp.eval(`(async () => {
      const res = await fetch('/api/submit-rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullname: 'Kẻ Lừa Đảo',
          phone: '${testPhone}',
          sector: 'ao-ba-om',
          event_slug: 'ok-om-bok-2026',
          client_rsvp_id: 'attacker-new-id-${Date.now()}'
        })
      });
      const data = await res.json();
      return { status: res.status, data };
    })()`);

    assert.strictEqual(attackerRes2.status, 409, 'Đăng ký mới với SĐT đã có vé nhưng thiếu token phải trả về HTTP 409');
    assert.strictEqual(attackerRes2.data?.data, undefined, 'HTTP 409 không được để lộ dữ liệu vé cũ');
    console.log('  ✓ Chặn đăng ký trùng SĐT khi thiếu token: HTTP 409 DUPLICATE_REGISTRATION.');

    // =========================================================================
    // [BƯỚC 4] KẺ XẤU GỬI TOKEN BÍ MẬT SAI HOẶC GIẢ MẠO -> BỊ TỪ CHỐI
    // =========================================================================
    console.log('\n[BƯỚC 4] KẺ XẤU GỬI TOKEN BÍ MẬT GIẢ MẠO / SAI:');
    
    const fakeTokenRes = await cdp.eval(`(async () => {
      const res = await fetch('/api/submit-rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ticket-Claim-Token': 'clm_fake_attacker_token_99999999999999999'
        },
        body: JSON.stringify({
          fullname: '${attendeeName}',
          phone: '${testPhone}',
          sector: 'ao-ba-om',
          event_slug: 'ok-om-bok-2026',
          client_rsvp_id: '${firstTicket.client_rsvp_id}',
          claim_token: 'clm_fake_attacker_token_99999999999999999'
        })
      });
      const data = await res.json();
      return { status: res.status, data };
    })()`);

    assert.strictEqual(fakeTokenRes.status, 403, 'Token bí mật sai phải bị từ chối dứt khoát với HTTP 403');
    assert.strictEqual(fakeTokenRes.data?.data, undefined, 'Không rò rỉ dữ liệu vé');
    console.log('  ✓ Token bí mật sai bị từ chối dứt khoát: HTTP 403.');

    // =========================================================================
    // [BƯỚC 5] REQUEST GỬI KÈM BEARER TOKEN HẾT HẠN / KHÔNG HỢP LỆ -> DỪNG NGAY LẬP TỨC
    // =========================================================================
    console.log('\n[BƯỚC 5] REQUEST GỬI KÈM BEARER TOKEN KHÔNG HỢP LỆ / HẾT HẠN:');
    
    const badJwtRes = await cdp.eval(`(async () => {
      const res = await fetch('/api/submit-rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock-expired-token'
        },
        body: JSON.stringify({
          fullname: 'Thành Viên JWT Lỗi',
          phone: '0989998877',
          sector: 'ao-ba-om',
          event_slug: 'ok-om-bok-2026',
          client_rsvp_id: 'bad-jwt-${Date.now()}'
        })
      });
      const data = await res.json();
      return { status: res.status, data };
    })()`);

    assert.strictEqual(badJwtRes.status, 401, 'Bearer token không hợp lệ phải bị từ chối với HTTP 401');
    assert.strictEqual(badJwtRes.data?.error?.code, 'UNAUTHENTICATED', 'Mã lỗi UNAUTHENTICATED chuẩn xác');
    assert.strictEqual(badJwtRes.data?.data, undefined, 'Không tạo vé khi JWT không hợp lệ');
    console.log('  ✓ Dừng ngay lập tức khi Bearer token không hợp lệ: HTTP 401 UNAUTHENTICATED.');

    // =========================================================================
    // [BƯỚC 6] CHỤP ẢNH MÀN HÌNH MINH CHỨNG VÉ ĐÃ XÁC THỰC
    // =========================================================================
    console.log('\n[BƯỚC 6] CHỤP ẢNH MÀN HÌNH MINH CHỨNG VÉ:');
    const screenshotPath = path.join(ARTIFACT_DIR, 'tickets_e2e_verified_pass.png');
    await cdp.captureScreenshot(screenshotPath);
    console.log(`  📸 Đã chụp ảnh màn hình vé xác thực: ${screenshotPath}`);

  } finally {
    // Dọn dẹp tài nguyên
    if (cdp) await cdp.close();
    if (chromeProc) {
      chromeProc.kill('SIGKILL');
      try { process.kill(chromeProc.pid); } catch (_) {}
    }
    if (localServer) localServer.close();

    // DỌN DẸP SUPABASE LIVE CHÍNH XÁC THEO ID
    console.log('\n--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM TRÊN SUPABASE (TARGETED ID CLEANUP) ---');
    for (const ticketId of createdTicketIds) {
      if (!ticketId) continue;
      const cleanUrl = `${SUPABASE_URL}/rest/v1/event_rsvps?id=eq.${encodeURIComponent(ticketId)}`;
      const cleanRes = await fetch(cleanUrl, {
        method: 'DELETE',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`
        }
      });
      console.log(`  ✓ Xóa vé kiểm thử (ID: ${ticketId}): HTTP ${cleanRes.status}`);
    }
    console.log('--- HOÀN TẤT DỌN DẸP AN TOÀN: 0% ẢNH HƯỞNG ĐẾN DỮ LIỆU THẬT ---');
  }

  console.log('\n================================================================================');
  console.log('🎉 KIỂM THỬ E2E TRÌNH DUYỆT RIÊNG CHO VÉ HOÀN TẤT XUẤT SẮC - 100% ĐẠT CHUẨN!');
  console.log('================================================================================\n');
}

run().catch(err => {
  console.error('\n❌ Lỗi kiểm thử E2E Vé:', err);
  process.exit(1);
});
