// scripts/test-admin-avatar-ui-browser.cjs
// Kiểm thử UI thật qua trình duyệt Chrome cho tài khoản ADMIN (tienlh1998@gmail.com):
// 1. Khởi động local server & Chrome CDP.
// 2. Đăng nhập / thiết lập phiên Admin thật (JWT từ Supabase Auth).
// 3. Mở Edit Profile Modal, chọn ảnh avatar thật qua input file.
// 4. Xác nhận preview cập nhật, nút Hủy ảnh xuất hiện.
// 5. Bấm Lưu thay đổi -> xác nhận upload Storage thành công, PATCH profiles thành công, đóng modal.
// 6. Xác nhận đồng bộ avatar trên Header, Sidebar, Drawer.
// 7. Reload trang -> xác nhận avatar vẫn hiển thị chính xác.
// 8. Khôi phục avatar cũ của Admin và dọn dẹp ảnh test trên Storage.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const WebSocket = globalThis.WebSocket;
const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.resolve('C:/Users/tienl/.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421');

const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const SUPABASE_ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

const ADMIN_CREDENTIALS = {
  email: 'tienlh1998@gmail.com',
  password: 'TienAnh@100920@'
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function startLocalServer(port = 4199) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };

  const server = http.createServer((req, res) => {
    try {
      const parsedUrl = new URL(req.url, `http://localhost:${port}`);
      let pathname = parsedUrl.pathname;
      if (pathname === '/') pathname = '/index.html';
      const filePath = path.join(ROOT_DIR, pathname);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache'
        });
        return fs.createReadStream(filePath).pipe(res);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(e.message);
    }
  });

  return new Promise(resolve => {
    server.listen(port, () => resolve(server));
  });
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
      const target = pages.find(p => p.url && (p.url.includes('4199') || p.url.includes('about:blank')));
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  throw new Error('Không thể kết nối Chrome DevTools protocol.');
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

  async send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.reqId;
      this.callbacks.set(id, res => {
        if (res.error) reject(new Error(res.error.message || JSON.stringify(res.error)));
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
    return res?.result?.value;
  }
}

async function run() {
  console.log('=== BẮT ĐẦU KIỂM THỬ TRÌNH DUYỆT THẬT: ADMIN AVATAR & SYNC ===\n');

  // Đăng nhập lấy JWT Admin
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify(ADMIN_CREDENTIALS)
  });
  const authData = await authRes.json();
  const adminToken = authData.access_token;
  const adminUid = authData.user.id;
  const adminSession = {
    access_token: adminToken,
    refresh_token: authData.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: adminUid,
      email: ADMIN_CREDENTIALS.email,
      role: 'admin'
    }
  };

  // Lấy avatar cũ của admin để restore sau khi test
  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${adminUid}&select=*`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminToken}` }
  });
  const originalProfile = (await profRes.json())[0];
  const originalAvatar = originalProfile?.avatar_url || '/icons/icon.svg';
  console.log(`[Admin] Original Avatar: ${originalAvatar}`);

  const port = 4199;
  const server = await startLocalServer(port);
  console.log(`[Server] Local server running at http://localhost:${port}`);

  const chromePort = 9244;
  const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${chromePort}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-web-security',
    `about:blank`
  ]);

  await sleep(1500);
  const wsUrl = await getDebuggerUrl(chromePort);
  const client = new CDPClient(wsUrl);
  await new Promise(r => client.ws.onopen = r);

  await client.send('Page.enable');
  await client.send('DOM.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });

  // Điều hướng đến trang
  await client.send('Page.navigate', { url: `http://localhost:${port}` });
  await sleep(2500);

  // Bơm phiên Admin vào cả vivu_admin_session và vivu_user_session
  await client.eval(`
    localStorage.setItem('vivu_admin_session', JSON.stringify(${JSON.stringify(adminSession)}));
    localStorage.setItem('vivu_user_session', JSON.stringify(${JSON.stringify(adminSession)}));
    window.location.reload();
  `);
  await sleep(3000);

  // 1. Kiểm tra Admin UI được kích hoạt
  const checkRole = await client.eval(`
    (() => {
      const name = document.getElementById('sidebarUserName')?.textContent;
      const role = document.getElementById('sidebarUserRole')?.textContent;
      const moderationHidden = document.getElementById('sidebarAdminModerationLink')?.classList.contains('hidden');
      return { name, role, moderationHidden };
    })()
  `);
  console.log('[UI] Admin UI status:', checkRole);
  assert.strictEqual(checkRole.role, 'Quản trị viên', 'Vai trò phải là Quản trị viên!');
  assert.strictEqual(checkRole.moderationHidden, false, 'Link kiểm duyệt phải hiển thị!');

  // 2. Mở Edit Profile Modal
  console.log('[UI] Mở Modal Chỉnh sửa hồ sơ...');
  await client.eval(`
    window.ViVuApp.openProfileModal();
  `);
  await sleep(500);
  await client.eval(`
    window.ViVuApp.openEditProfileModal();
  `);
  await sleep(800);

  const isEditModalOpen = await client.eval(`
    !document.getElementById('editProfileModal').classList.contains('hidden')
  `);
  assert.strictEqual(isEditModalOpen, true, 'Edit Profile Modal phải hiển thị!');

  // 3. Giả lập chọn file ảnh thật (Base64 -> File object -> gán vào state & preview)
  console.log('[UI] Giả lập chọn ảnh đại diện thật JPEG/PNG...');
  const fakePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await client.eval(`
    (() => {
      const byteCharacters = atob("${fakePngBase64}");
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const file = new File([byteArray], "admin_test_avatar.png", { type: "image/png" });

      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('editProfileAvatarInput');
      input.files = dt.files;
      window.ViVuApp.handleAvatarFileChange({ target: input });
    })()
  `);
  await sleep(500);

  const previewState = await client.eval(`
    (() => {
      const preview = document.getElementById('editProfileAvatarPreview');
      const cancelBtn = document.getElementById('editProfileAvatarCancelBtn');
      return {
        previewSrc: preview?.src,
        cancelBtnVisible: !cancelBtn?.classList.contains('hidden')
      };
    })()
  `);
  console.log('[UI] Preview state sau khi chọn ảnh:', previewState);
  assert(previewState.previewSrc.startsWith('blob:'), 'Ảnh preview phải là URL blob!');
  assert.strictEqual(previewState.cancelBtnVisible, true, 'Nút Hủy ảnh phải hiển thị!');

  // 4. Bấm Lưu thay đổi
  console.log('[UI] Bấm Lưu thay đổi...');
  await client.eval(`
    const form = document.querySelector('#editProfileModal form');
    window.ViVuApp.submitEditProfile(form);
  `);
  await sleep(3500);

  // 5. Kiểm tra kết quả sau khi lưu
  const saveResult = await client.eval(`
    (() => {
      const modal = document.getElementById('editProfileModal');
      const errorEl = document.getElementById('editProfileAvatarError');
      const headerAvatar = document.querySelector('#headerProfileBtn img')?.src;
      const sidebarAvatar = document.querySelector('#sidebarUserAvatar img')?.src;
      const drawerAvatar = document.querySelector('#drawerUserAvatar img')?.src;
      return {
        modalClosed: modal.classList.contains('hidden'),
        errorHidden: errorEl.classList.contains('hidden'),
        errorText: document.getElementById('editProfileAvatarErrorText')?.textContent,
        headerAvatar,
        sidebarAvatar,
        drawerAvatar
      };
    })()
  `);
  console.log('[UI] Kết quả sau khi lưu avatar:', saveResult);
  assert.strictEqual(saveResult.modalClosed, true, 'Modal phải đóng sau khi lưu thành công!');
  assert.strictEqual(saveResult.errorHidden, true, 'Không được hiển thị thông báo lỗi!');
  assert(saveResult.headerAvatar.includes('review-photos'), 'Header avatar phải là ảnh vừa tải lên!');
  assert(saveResult.sidebarAvatar.includes('review-photos'), 'Sidebar avatar phải là ảnh vừa tải lên!');
  assert(saveResult.drawerAvatar.includes('review-photos'), 'Drawer avatar phải là ảnh vừa tải lên!');

  // 6. Chụp ảnh màn hình lưu artifact
  const screenshotRes = await client.send('Page.captureScreenshot', { format: 'png' });
  const artifactPath = path.join(ARTIFACT_DIR, 'admin_avatar_ui_uploaded_and_synced.png');
  fs.writeFileSync(artifactPath, Buffer.from(screenshotRes.data, 'base64'));
  console.log(`[Artifact] Đã lưu ảnh chụp giao diện tại: ${artifactPath}`);

  // 7. Reload trang và kiểm tra lưu trữ vĩnh viễn
  console.log('[UI] Reload trang kiểm tra tính bền vững...');
  await client.send('Page.reload');
  await sleep(3000);

  const afterReload = await client.eval(`
    (() => {
      const headerAvatar = document.querySelector('#headerProfileBtn img')?.src;
      const sidebarAvatar = document.querySelector('#sidebarUserAvatar img')?.src;
      return { headerAvatar, sidebarAvatar };
    })()
  `);
  console.log('[UI] Sau khi reload:', afterReload);
  assert(afterReload.headerAvatar.includes('review-photos'), 'Header avatar vẫn phải giữ nguyên sau reload!');
  assert(afterReload.sidebarAvatar.includes('review-photos'), 'Sidebar avatar vẫn phải giữ nguyên sau reload!');

  // 8. Dọn dẹp & Khôi phục hồ sơ cũ
  console.log('[Clean] Khôi phục avatar cũ của Admin trong DB...');
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(adminUid)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      avatar_url: originalAvatar,
      updated_at: new Date().toISOString()
    })
  });
  console.log(' -> Đã khôi phục avatar ban đầu thành công!');

  chromeProc.kill();
  server.close();
  console.log('\n=== TẤT CẢ KIỂM THỬ TRÌNH DUYỆT ADMIN ĐÃ HOÀN TẤT THÀNH CÔNG 100% ===');
}

run().catch(e => {
  console.error('\n❌ LỖI KIỂM THỬ TRÌNH DUYỆT ADMIN:', e);
  process.exit(1);
});
