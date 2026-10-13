// scripts/verify-admin-place-actions-browser.cjs
// Kiểm thử tự động trên trình duyệt:
// 1. Khách vãng lai: Modal chi tiết địa điểm KHÔNG có Admin Toolbar
// 2. Admin: Modal chi tiết địa điểm HIỂN THỊ Admin Toolbar (Sửa trực tiếp, Tạm ẩn, Thùng rác)
// 3. Admin: Bấm "Sửa trực tiếp" mở form chỉnh sửa địa điểm giữ nguyên công khai
// 4. Admin Portal (admin.html): Thẻ địa điểm có các nút [Tạm ẩn], [Hiện lại], [Khôi phục]

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.resolve('C:\\Users\\tienl\\.gemini\\antigravity\\brain\\2bc7252e-f998-4e30-bbb7-25edbaa0f421');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Simple local static server
function startServer(port = 4173) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.woff2': 'font/woff2'
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(ROOT_DIR, reqPath);

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    });
  });

  return new Promise(resolve => {
    server.listen(port, () => resolve(server));
  });
}

class SimpleCDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.reqId = 0;
    this.resolvers = new Map();
  }

  async connect() {
    const WebSocket = globalThis.WebSocket;
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.resolvers.has(data.id)) {
        const { resolve, reject } = this.resolvers.get(data.id);
        this.resolvers.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.reqId;
      this.resolvers.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result?.value;
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function findChromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function launchBrowser(port = 9224) {
  const chromePath = await findChromePath();
  if (!chromePath) throw new Error('Chrome not found');

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-admin-place-test-'));
  const proc = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1280,850'
  ]);

  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      const res = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/version`, r => {
          let data = '';
          r.on('data', c => data += c);
          r.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      if (res.webSocketDebuggerUrl) {
        return { proc, wsUrl: res.webSocketDebuggerUrl, userDataDir };
      }
    } catch (_) {}
  }
  proc.kill();
  throw new Error('Chrome CDP launch timeout');
}

async function run() {
  console.log('=== BẮT ĐẦU KIỂM THỬ TRÌNH DUYỆT: QUẢN TRỊ ĐỊA ĐIỂM DÀNH CHO ADMIN ===\n');

  const PORT = 4173;
  const server = await startServer(PORT);
  console.log(`[Server] Khởi chạy HTTP server tại http://localhost:${PORT}`);

  const { proc, wsUrl, userDataDir } = await launchBrowser(9224);
  console.log('[Browser] Chrome Headless khởi chạy thành công.');

  try {
    // 1. Kết nối target page
    const pages = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:9224/json`, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject);
    });
    const pageTarget = (Array.isArray(pages) ? pages : []).find(p => p.type === 'page') || pages[0];
    if (!pageTarget?.webSocketDebuggerUrl) throw new Error('Không tìm thấy Page target');

    const cdp = new SimpleCDP(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/` });
    await sleep(2500);

    console.log('[Test 1] Kiểm tra Khách Vãng Lai mở modal địa điểm...');
    await sleep(2000);

    // Mở modal địa điểm 'chua-ang' bằng khách
    await cdp.eval(`window.ViVuApp.openDetailModal('chua-ang')`);
    await sleep(600);

    const guestCheck = await cdp.eval(`(() => {
      const bar = document.getElementById('modalAdminBar');
      const isVisible = bar && !bar.classList.contains('hidden');
      return { isVisible };
    })()`);

    console.log('  Khách vãng lai thấy Admin Bar?', guestCheck.isVisible ? 'CÓ (LỖI)' : 'KHÔNG (CHUẨN)');
    if (guestCheck.isVisible) {
      throw new Error('LỖI: Khách vãng lai không được nhìn thấy Admin Bar!');
    }

    const guestScreenshotPath = path.join(ARTIFACT_DIR, 'guest_place_modal_no_admin_bar.png');
    await cdp.screenshot(guestScreenshotPath);
    console.log(`  ✓ Đã chụp ảnh khách vãng lai: ${guestScreenshotPath}`);

    // Đóng modal
    await cdp.eval(`window.ViVuApp.closeDetailModal()`);
    await sleep(400);

    // 2. Thiết lập Session Admin
    console.log('\n[Test 2] Đăng nhập tài khoản Admin và kiểm tra Admin Toolbar trong Modal địa điểm...');
    await cdp.eval(`(() => {
      const fakeAdminSession = {
        access_token: 'fake_test_token',
        token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: 'admin_test_001',
          email: 'admin@vivutravinh.id.vn',
          role: 'admin'
        }
      };
      localStorage.setItem('vivu_admin_session', JSON.stringify(fakeAdminSession));
      if (window.ViVuApp?.updateAdminRoleUI) {
        window.ViVuApp.updateAdminRoleUI();
      }
    })()`);

    // Mở lại modal địa điểm 'chua-ang' với tư cách Admin
    await cdp.eval(`window.ViVuApp.openDetailModal('chua-ang')`);
    await sleep(800);

    const adminCheck = await cdp.eval(`(() => {
      const bar = document.getElementById('modalAdminBar');
      const badge = document.getElementById('modalAdminPlaceStatusBadge');
      const editBtn = document.getElementById('modalAdminEditBtn');
      const hideBtn = document.getElementById('modalAdminToggleHideBtn');
      const trashBtn = document.getElementById('modalAdminTrashBtn');

      return {
        barVisible: bar && !bar.classList.contains('hidden'),
        badgeText: badge ? badge.textContent.trim() : null,
        hasEditBtn: Boolean(editBtn),
        hasHideBtn: Boolean(hideBtn),
        hasTrashBtn: Boolean(trashBtn)
      };
    })()`);

    console.log('  Admin thấy Admin Bar?', adminCheck.barVisible ? 'CÓ (CHUẨN)' : 'KHÔNG (LỖI)');
    console.log('  Badge trạng thái:', adminCheck.badgeText);
    console.log('  Có đủ 3 nút Sửa trực tiếp / Tạm ẩn / Thùng rác?', adminCheck.hasEditBtn && adminCheck.hasHideBtn && adminCheck.hasTrashBtn ? 'CÓ (CHUẨN)' : 'KHÔNG');

    if (!adminCheck.barVisible || !adminCheck.hasEditBtn || !adminCheck.hasHideBtn || !adminCheck.hasTrashBtn) {
      throw new Error('LỖI: Admin Bar không hiển thị đầy đủ trên modal địa điểm!');
    }

    const adminScreenshotPath = path.join(ARTIFACT_DIR, 'admin_place_modal_toolbar.png');
    await cdp.screenshot(adminScreenshotPath);
    console.log(`  ✓ Đã chụp ảnh Admin Toolbar: ${adminScreenshotPath}`);

    // 3. Bấm nút Sửa trực tiếp
    console.log('\n[Test 3] Kiểm tra bấm "Sửa trực tiếp" mở form chỉnh sửa địa điểm giữ nguyên công khai...');
    await cdp.eval(`document.getElementById('modalAdminEditBtn').click()`);
    await sleep(600);

    const formCheck = await cdp.eval(`(() => {
      const reasonModal = document.getElementById('adminActionReasonModal');
      const nameInput = document.getElementById('editDirectName');
      const catInput = document.getElementById('editDirectCategory');
      const descInput = document.getElementById('editDirectDesc');

      return {
        isModalVisible: reasonModal && !reasonModal.classList.contains('hidden'),
        nameValue: nameInput ? nameInput.value : null,
        catValue: catInput ? catInput.value : null,
        hasDesc: Boolean(descInput && descInput.value)
      };
    })()`);

    console.log('  Modal Sửa trực tiếp hiển thị?', formCheck.isModalVisible ? 'CÓ (CHUẨN)' : 'KHÔNG (LỖI)');
    console.log('  Tên địa điểm đã điền:', formCheck.nameValue);
    console.log('  Danh mục đã điền:', formCheck.catValue);

    if (!formCheck.isModalVisible || !formCheck.nameValue) {
      throw new Error('LỖI: Form Sửa trực tiếp không mở hoặc không tự động điền dữ liệu địa điểm!');
    }

    const formScreenshotPath = path.join(ARTIFACT_DIR, 'admin_place_direct_edit_form.png');
    await cdp.screenshot(formScreenshotPath);
    console.log(`  ✓ Đã chụp ảnh Form Sửa trực tiếp: ${formScreenshotPath}`);

    // Đóng form sửa
    await cdp.eval(`window.ViVuApp.closeActionReasonModal()`);
    await sleep(300);

    // 4. Kiểm tra trang admin.html
    console.log('\n[Test 4] Kiểm tra trang admin.html: Các nút [Tạm ẩn], [Hiện lại], [Khôi phục]...');
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/admin.html` });
    await sleep(2000);

    const adminHtmlCheck = await cdp.eval(`(() => {
      const samplePlaces = [
        { id: 101, name: 'Điểm Đến Đã Duyệt (Approved)', status: 'approved', slug: 'diem-den-approved', category: 'Tham quan', area: 'TP. Trà Vinh' },
        { id: 102, name: 'Điểm Đến Đang Tạm Ẩn (Hidden)', status: 'hidden', slug: 'diem-den-hidden', category: 'Ẩm thực', area: 'Châu Thành' },
        { id: 103, name: 'Điểm Đến Trong Thùng Rác (Archived)', status: 'archived', slug: 'diem-den-archived', category: 'Di tích', area: 'Cầu Ngang' }
      ];
      const adminObj = window.VivuAdmin || window.AdminApp;
      if (adminObj?.renderPlaces) {
        adminObj.renderPlaces(samplePlaces, { total: 3, page: 1, total_pages: 1 });
      }

      const hideBtns = document.querySelectorAll('[data-action="hide-place"]');
      const unhideBtns = document.querySelectorAll('[data-action="unhide-place"]');
      const restoreBtns = document.querySelectorAll('[data-action="restore-place"]');
      const archiveBtns = document.querySelectorAll('[data-action="archive-place"]');
      const deleteBtns = document.querySelectorAll('[data-action="delete-place"]');
      const editBtns = document.querySelectorAll('[data-action="edit-place"]');

      return {
        hideBtnsCount: hideBtns.length,
        unhideBtnsCount: unhideBtns.length,
        restoreBtnsCount: restoreBtns.length,
        archiveBtnsCount: archiveBtns.length,
        deleteBtnsCount: deleteBtns.length,
        editBtnsCount: editBtns.length
      };
    })()`);

    console.log('  Số nút Tạm ẩn tìm thấy:', adminHtmlCheck.hideBtnsCount, adminHtmlCheck.hideBtnsCount === 1 ? '✓ CHUẨN' : '✗ LỖI');
    console.log('  Số nút Hiện lại tìm thấy:', adminHtmlCheck.unhideBtnsCount, adminHtmlCheck.unhideBtnsCount === 1 ? '✓ CHUẨN' : '✗ LỖI');
    console.log('  Số nút Khôi phục tìm thấy:', adminHtmlCheck.restoreBtnsCount, adminHtmlCheck.restoreBtnsCount === 1 ? '✓ CHUẨN' : '✗ LỖI');
    console.log('  Số nút Thùng rác/Lưu trữ tìm thấy:', adminHtmlCheck.archiveBtnsCount, adminHtmlCheck.archiveBtnsCount === 2 ? '✓ CHUẨN' : '✗ LỖI');
    console.log('  Số nút Xóa hẳn tìm thấy:', adminHtmlCheck.deleteBtnsCount, adminHtmlCheck.deleteBtnsCount === 1 ? '✓ CHUẨN' : '✗ LỖI');
    console.log('  Số nút Sửa tìm thấy:', adminHtmlCheck.editBtnsCount, adminHtmlCheck.editBtnsCount === 3 ? '✓ CHUẨN' : '✗ LỖI');

    if (adminHtmlCheck.hideBtnsCount !== 1 || adminHtmlCheck.unhideBtnsCount !== 1 || adminHtmlCheck.restoreBtnsCount !== 1) {
      throw new Error('LỖI: Các nút [Tạm ẩn], [Hiện lại], [Khôi phục] không xuất hiện đúng theo trạng thái địa điểm!');
    }

    const adminPlacesScreenshotPath = path.join(ARTIFACT_DIR, 'admin_places_tab_action_buttons.png');
    await cdp.screenshot(adminPlacesScreenshotPath);
    console.log(`  ✓ Đã chụp ảnh trang admin.html: ${adminPlacesScreenshotPath}`);

    cdp.close();
    console.log('\n========================================================================');
    console.log('TẤT CẢ 4/4 BƯỚC KIỂM THỬ TRÌNH DUYỆT ĐỀU THÀNH CÔNG VƯỢT TRỘI (100% PASS)!');
    console.log('========================================================================');
  } finally {
    proc.kill();
    server.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

run().catch(err => {
  console.error('\n❌ LỖI KIỂM THỬ:', err);
  process.exit(1);
});
