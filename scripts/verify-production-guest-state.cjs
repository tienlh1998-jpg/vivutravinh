/**
 * scripts/verify-production-guest-state.cjs
 *
 * Kiểm tra trạng thái khách vãng lai bằng cửa sổ Ẩn danh (Incognito) trên Production (vivutravinh.id.vn):
 * 1. Thanh trên (header) có nút "Đăng nhập" kèm icon login.
 * 2. Sidebar ghi "Khách vãng lai" và "Đăng nhập / Đăng ký".
 * 3. Mở hồ sơ (#userProfileModal):
 *    - Chỉ hiển thị màn hình chào mừng cùng 2 nút [Đăng nhập] và [Tạo tài khoản].
 *    - Hoàn toàn KHÔNG còn tên "Nguyễn Văn Tiến".
 *    - Hoàn toàn KHÔNG hiển thị thành tích, điểm số, xu hay huy hiệu mẫu.
 * 4. Chụp ảnh màn hình lưu bằng chứng nghiệm thu vào Artifacts.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const PROD_URL = 'https://vivutravinh.id.vn';
const ARTIFACT_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421';

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
      }, 30000);
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
  for (let i = 0; i < 40; i++) {
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
  console.log(' KIỂM THỬ TRẠNG THÁI KHÁCH VÃNG LAI TRÊN PRODUCTION (CỬA SỔ ẨN DANH)');
  console.log(` Target URL: ${PROD_URL}`);
  console.log('================================================================================\n');

  let chromeProc = null;
  let cdp = null;

  try {
    const CDP_PORT = 9336;
    const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-incognito-guest-'));

    // Khởi chạy Chrome với cờ --incognito và profile hoàn toàn mới (cách ly 100%)
    chromeProc = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      '--headless=new',
      '--incognito',
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1280,900',
      `--user-data-dir=${tempDir}`
    ]);

    const debuggerUrl = await getDebuggerUrl(CDP_PORT);
    cdp = new CDPClient(debuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    console.log('  ✓ Đã kết nối Chrome headless với chế độ ẩn danh (--incognito).');

    // Điều hướng đến Production
    await cdp.send('Page.navigate', { url: `${PROD_URL}/index.html` });

    // Chờ ứng dụng sẵn sàng
    let ready = false;
    for (let i = 0; i < 40; i++) {
      ready = await cdp.eval(`Boolean(window.ViVuApp && document.getElementById('headerProfileBtn') && document.getElementById('sidebarUserName'))`);
      if (ready) break;
      await sleep(250);
    }
    if (!ready) throw new Error('Timeout chờ ứng dụng sẵn sàng trên Production');
    await sleep(1500);
    console.log('  ✓ Đã nạp thành công website Production https://vivutravinh.id.vn.');

    // -------------------------------------------------------------------------
    // 1. KIỂM TRA THANH TRÊN (HEADER): NÚT ĐĂNG NHẬP
    // -------------------------------------------------------------------------
    console.log('\n[1] KIỂM TRA THANH TRÊN (HEADER):');
    const headerCheck = await cdp.eval(`(() => {
      const btn = document.getElementById('headerProfileBtn');
      if (!btn) return { exists: false };
      const text = btn.innerText || btn.textContent || '';
      const icon = btn.querySelector('.material-symbols-outlined')?.textContent?.trim() || '';
      const ariaLabel = btn.getAttribute('aria-label') || '';
      const title = btn.getAttribute('title') || '';
      return {
        exists: true,
        text: text.trim(),
        hasLoginText: text.includes('Đăng nhập'),
        icon,
        hasLoginIcon: icon === 'login',
        ariaLabel,
        title
      };
    })()`);

    assert.ok(headerCheck.exists, 'Nút #headerProfileBtn phải tồn tại trên header');
    assert.ok(headerCheck.hasLoginText, `Thanh trên phải có nút ghi "Đăng nhập", thực tế: "${headerCheck.text}"`);
    assert.ok(headerCheck.hasLoginIcon, `Thanh trên phải có icon "login", thực tế: "${headerCheck.icon}"`);
    console.log(`  ✓ [PASS] Thanh trên hiển thị nút: "${headerCheck.text}" (icon: ${headerCheck.icon}, title: "${headerCheck.title}").`);

    // -------------------------------------------------------------------------
    // 2. KIỂM TRA SIDEBAR: GHI KHÁCH VÃNG LAI
    // -------------------------------------------------------------------------
    console.log('\n[2] KIỂM TRA SIDEBAR WIDGET CÁ NHÂN:');
    const sidebarCheck = await cdp.eval(`(() => {
      const nameEl = document.getElementById('sidebarUserName');
      const roleEl = document.getElementById('sidebarUserRole');
      return {
        name: nameEl?.textContent?.trim() || '',
        role: roleEl?.textContent?.trim() || '',
        hasKhachVangLai: nameEl?.textContent?.includes('Khách vãng lai'),
        hasDangNhapDangKy: roleEl?.textContent?.includes('Đăng nhập / Đăng ký')
      };
    })()`);

    assert.ok(sidebarCheck.hasKhachVangLai, `Sidebar phải ghi "Khách vãng lai", thực tế: "${sidebarCheck.name}"`);
    assert.ok(sidebarCheck.hasDangNhapDangKy, `Sidebar role phải ghi "Đăng nhập / Đăng ký", thực tế: "${sidebarCheck.role}"`);
    console.log(`  ✓ [PASS] Sidebar hiển thị đúng tên: "${sidebarCheck.name}" và vai trò: "${sidebarCheck.role}".`);

    // Chụp ảnh màn hình trang chủ ẩn danh
    const homeScreenshot = path.join(ARTIFACT_DIR, 'guest_incognito_production_home.png');
    await cdp.captureScreenshot(homeScreenshot);
    console.log(`  📸 Đã chụp ảnh màn hình trang chủ khách vãng lai: ${homeScreenshot}`);

    // -------------------------------------------------------------------------
    // 3. MỞ HỒ SƠ: CHỈ HIỆN ĐĂNG NHẬP / TẠO TÀI KHOẢN, KHÔNG CÓ THÀNH TÍCH MẪU
    // -------------------------------------------------------------------------
    console.log('\n[3] KIỂM TRA MODAL HỒ SƠ NGƯỜI DÙNG KHI CHƯA ĐĂNG NHẬP:');
    await cdp.eval(`window.ViVuApp.openProfileModal()`);
    await sleep(800);

    const modalCheck = await cdp.eval(`(() => {
      const modal = document.getElementById('userProfileModal');
      const isVisible = modal && !modal.classList.contains('hidden');
      const content = document.getElementById('userProfileModalContent');
      const contentText = content?.innerText || content?.textContent || '';
      const html = content?.innerHTML || '';

      // Kiểm tra sự xuất hiện của tên mẫu "Nguyễn Văn Tiến"
      const hasSampleName = contentText.includes('Nguyễn Văn Tiến') || html.includes('Nguyễn Văn Tiến');

      // Kiểm tra thành tích, huy hiệu, xu mẫu
      const hasBadgesGrid = Boolean(content.querySelector('#profileBadgesGrid'));
      const hasBadgeElements = content.querySelectorAll('#profileBadgesGrid > div').length > 0;
      const hasXuThuong = contentText.includes('Xu tích lũy') || contentText.includes('Xu cống hiến') || contentText.includes('Thành viên Xứ Trà');
      const hasCapDo = contentText.includes('Cấp độ') || contentText.includes('Hạng thành viên');

      // Kiểm tra nút Đăng nhập và Tạo tài khoản
      const buttons = Array.from(content.querySelectorAll('button')).map(b => b.textContent.trim());
      const hasLoginBtn = buttons.some(t => t.includes('Đăng nhập'));
      const hasSignupBtn = buttons.some(t => t.includes('Tạo tài khoản'));

      return {
        isVisible,
        contentText: contentText.replace(/\\s+/g, ' ').trim(),
        hasSampleName,
        hasBadgesGrid,
        hasBadgeElements,
        hasXuThuong,
        hasCapDo,
        hasLoginBtn,
        hasSignupBtn,
        buttons
      };
    })()`);

    assert.ok(modalCheck.isVisible, 'Modal #userProfileModal phải mở và hiển thị');
    assert.ok(!modalCheck.hasSampleName, 'Hồ sơ khách tuyệt đối KHÔNG được chứa tên "Nguyễn Văn Tiến"');
    assert.ok(!modalCheck.hasBadgesGrid && !modalCheck.hasBadgeElements, 'Hồ sơ khách tuyệt đối KHÔNG được hiển thị lưới huy hiệu mẫu (#profileBadgesGrid)');
    assert.ok(!modalCheck.hasXuThuong, 'Hồ sơ khách tuyệt đối KHÔNG được hiển thị xu thưởng mẫu');
    assert.ok(!modalCheck.hasCapDo, 'Hồ sơ khách tuyệt đối KHÔNG được hiển thị cấp độ mẫu');
    assert.ok(modalCheck.hasLoginBtn, 'Hồ sơ khách phải có nút "Đăng nhập"');
    assert.ok(modalCheck.hasSignupBtn, 'Hồ sơ khách phải có nút "Tạo tài khoản"');

    console.log('  ✓ [PASS] Modal hồ sơ khách hiển thị:');
    console.log(`    - Thông điệp: "${modalCheck.contentText.slice(0, 120)}..."`);
    console.log(`    - Các nút hành động: [${modalCheck.buttons.join(', ')}]`);
    console.log(`    - Chứa tên "Nguyễn Văn Tiến": ${modalCheck.hasSampleName} (ĐÃ LOẠI BỎ TRIỆT ĐỂ)`);
    console.log(`    - Hiển thị huy hiệu mẫu: ${modalCheck.hasBadgesGrid} (ĐÃ LOẠI BỎ TRIỆT ĐỂ)`);
    console.log(`    - Hiển thị xu thưởng / cấp độ mẫu: ${modalCheck.hasXuThuong || modalCheck.hasCapDo} (ĐÃ LOẠI BỎ TRIỆT ĐỂ)`);

    // Chụp ảnh màn hình modal hồ sơ khách
    const profileScreenshot = path.join(ARTIFACT_DIR, 'guest_incognito_production_profile_modal.png');
    await cdp.captureScreenshot(profileScreenshot);
    console.log(`  📸 Đã chụp ảnh màn hình modal hồ sơ khách vãng lai: ${profileScreenshot}`);

    // Đóng modal
    await cdp.eval(`window.ViVuApp.closeProfileModal()`);
    await sleep(400);

    console.log('\n================================================================================');
    console.log(' KẾT QUẢ: 100% PASS - TRẠNG THÁI KHÁCH VÃNG LAI TRÊN PRODUCTION ĐẠT CHUẨN HOÀN TOÀN');
    console.log('================================================================================\n');

  } finally {
    if (cdp) await cdp.close();
    if (chromeProc) {
      chromeProc.kill('SIGTERM');
      await sleep(500);
    }
  }
}

run().catch(err => {
  console.error('\n❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ KHÁCH VÃNG LAI:', err);
  process.exit(1);
});
