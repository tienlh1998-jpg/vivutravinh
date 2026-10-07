/**
 * scripts/test-token-refresh-and-avatar.cjs
 * Kiểm thử cơ chế token refresh và upload avatar khi phiên hết hạn:
 * 1. Đơn vị: getValidUserToken() đồng bộ hóa request refresh song song (deduplication)
 * 2. Đơn vị: getValidUserToken() refresh thành công trả về token mới
 * 3. Đơn vị: getValidUserToken() refresh thất bại KHÔNG trả token hết hạn (trả null)
 * 4. E2E trên UI:
 *    - Token hết hạn + refresh thành công -> lưu hồ sơ & upload avatar bình thường
 *    - Token hết hạn + refresh thất bại -> hiển thị thông báo tiếng Việt yêu cầu đăng nhập lại,
 *      GIỮ NGUYÊN ảnh đã chọn (preview, state.pendingAvatarFile) và nội dung form.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const WebSocket = globalThis.WebSocket;
const ROOT_DIR = path.resolve(__dirname, '..');
const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function startLocalServer(port = 4185) {
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
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Server Error: ' + err.message);
        }
    });

    return new Promise(resolve => server.listen(port, () => resolve(server)));
}

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

    ready() {
        return new Promise((resolve, reject) => {
            if (this.ws.readyState === WebSocket.OPEN) return resolve();
            this.ws.onopen = () => resolve();
            this.ws.onerror = (err) => reject(err);
        });
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.reqId;
            this.callbacks.set(id, (res) => {
                if (res.error) {
                    reject(new Error(`CDP Error [${method}]: ${JSON.stringify(res.error)}`));
                } else {
                    resolve(res.result);
                }
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
            throw new Error(`Eval exception: ${res.exceptionDetails.text} (${JSON.stringify(res.exceptionDetails.exception)})`);
        }
        return res.result ? res.result.value : undefined;
    }
}

async function main() {
    console.log('=== KIỂM THỬ CƠ CHẾ TOKEN REFRESH & UPLOAD AVATAR ===');

    const port = 4185;
    const server = await startLocalServer(port);
    const BASE_URL = `http://localhost:${port}`;
    console.log(`✓ Local server đang chạy tại ${BASE_URL}`);

    // Launch Chrome
    const userDataDir = path.join(os.tmpdir(), `vivu-token-test-${Date.now()}`);
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const cdpPort = 9228;

    const chromeProc = spawn(chromePath, [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        'about:blank'
    ]);

    let tempDir = null;

    try {
        await sleep(2000);
        const tabsRes = await fetch(`http://127.0.0.1:${cdpPort}/json`);
        const tabs = await tabsRes.json();
        const tab = tabs.find(t => t.type === 'page');
        if (!tab) throw new Error('Không tìm thấy tab Chrome!');

        const cdp = new CDPClient(tab.webSocketDebuggerUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-token-avatar-'));
        const testAvatarFile = path.join(tempDir, 'test_avatar.png');
        const validPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        fs.writeFileSync(testAvatarFile, Buffer.from(validPngBase64, 'base64'));

        // Điều hướng tới ứng dụng
        await cdp.send('Page.navigate', { url: BASE_URL });
        await sleep(2000);

        // ---------------------------------------------------------------------
        // PHẦN 1: KIỂM THỬ ĐỒNG BỘ REQUEST REFRESH TRÁNH CHẠY ĐỒNG THỜI (DEDUPLICATION)
        // ---------------------------------------------------------------------
        console.log('\n--- PHẦN 1: Kiểm thử đồng bộ các request refresh chạy song song ---');
        const syncTestResult = await cdp.eval(`
            (async () => {
                const { getValidUserToken, saveUserSession } = await import('./js/auth.js');
                
                // Giả lập session có token đã hết hạn
                let fetchCallsCount = 0;
                const originalFetch = window.fetch;
                
                window.fetch = async (url, options) => {
                    if (typeof url === 'string' && url.includes('/auth/v1/token?grant_type=refresh_token')) {
                        fetchCallsCount++;
                        // Delay 200ms để mô phỏng mạng thực tế
                        await new Promise(r => setTimeout(r, 200));
                        return new Response(JSON.stringify({
                            access_token: 'new-refreshed-token-12345',
                            refresh_token: 'new-refresh-token-67890',
                            expires_in: 3600
                        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }
                    return originalFetch(url, options);
                };

                const expiredSession = {
                    access_token: 'old-expired-token',
                    refresh_token: 'valid-refresh-token',
                    expires_at: Math.floor(Date.now() / 1000) - 300, // hết hạn 5 phút trước
                    user: { id: 'test-user-id' }
                };
                saveUserSession(expiredSession);

                // Gọi đồng thời 5 request getValidUserToken()
                const promises = [
                    getValidUserToken(),
                    getValidUserToken(),
                    getValidUserToken(),
                    getValidUserToken(),
                    getValidUserToken()
                ];
                const results = await Promise.all(promises);

                window.fetch = originalFetch;

                return {
                    fetchCallsCount,
                    allReturnedNewToken: results.every(t => t === 'new-refreshed-token-12345'),
                    returnedCount: results.length
                };
            })()
        `);

        console.log('Kết quả kiểm thử đồng bộ refresh:', syncTestResult);
        assert.strictEqual(syncTestResult.fetchCallsCount, 1, 'Chỉ được gửi ĐÚNG 1 request fetch refresh token cho 5 lời gọi song song!');
        assert.strictEqual(syncTestResult.allReturnedNewToken, true, 'Tất cả 5 lời gọi đều phải nhận được token mới!');
        console.log('  ✓ ĐẠT: Request refresh đã được đồng bộ hóa hoàn toàn, không chạy trùng lặp!');

        // ---------------------------------------------------------------------
        // PHẦN 2: KIỂM THỬ TOKEN HẾT HẠN KHI REFRESH THẤT BẠI -> KHÔNG TRẢ TOKEN CŨ
        // ---------------------------------------------------------------------
        console.log('\n--- PHẦN 2: Kiểm thử token hết hạn khi refresh thất bại (Trả null) ---');
        const failTestResult = await cdp.eval(`
            (async () => {
                const { getValidUserToken, saveUserSession } = await import('./js/auth.js');
                
                const originalFetch = window.fetch;
                window.fetch = async (url, options) => {
                    if (typeof url === 'string' && url.includes('/auth/v1/token?grant_type=refresh_token')) {
                        return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh token expired' }), {
                            status: 400,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                    return originalFetch(url, options);
                };

                const expiredSession = {
                    access_token: 'old-expired-token-xyz',
                    refresh_token: 'dead-refresh-token',
                    expires_at: Math.floor(Date.now() / 1000) - 100, // Đã hết hạn
                    user: { id: 'test-user-id' }
                };
                saveUserSession(expiredSession);

                const resultToken = await getValidUserToken();

                window.fetch = originalFetch;

                return {
                    resultToken,
                    isExpiredTokenPrevented: resultToken === null
                };
            })()
        `);

        console.log('Kết quả khi refresh thất bại:', failTestResult);
        assert.strictEqual(failTestResult.resultToken, null, 'getValidUserToken() phải trả null khi refresh thất bại và token đã hết hạn!');
        console.log('  ✓ ĐẠT: getValidUserToken() tuyệt đối KHÔNG trả về token hết hạn khi refresh thất bại!');

        // ---------------------------------------------------------------------
        // PHẦN 3: KIỂM THỬ GIAO DIỆN LƯU HỒ SƠ KHI PHIÊN KHÔNG THỂ LÀM MỚI
        // (Giữ nguyên ảnh đã chọn, giữ nguyên form, thông báo tiếng Việt yêu cầu đăng nhập lại)
        // ---------------------------------------------------------------------
        console.log('\n--- PHẦN 3: Kiểm thử UI khi phiên hết hạn & refresh thất bại ---');
        // Thiết lập phiên hết hạn trên UI
        await cdp.eval(`
            (async () => {
                const { saveUserSession } = await import('./js/auth.js');
                saveUserSession({
                    access_token: 'expired-access-token',
                    refresh_token: 'failing-refresh-token',
                    expires_at: Math.floor(Date.now() / 1000) - 600,
                    user: { id: 'test-user-123', email: 'test@vivutest.local' }
                });
            })()
        `);

        // Mở modal Sửa hồ sơ
        await cdp.eval('window.ViVuApp.openEditProfileModal()');
        await sleep(500);

        // Nhập thông tin form
        await cdp.eval(`
            (() => {
                const nameInput = document.getElementById('editProfileName');
                const bioInput = document.getElementById('editProfileBio');
                if (nameInput) nameInput.value = 'Tên Mới Chưa Lưu';
                if (bioInput) bioInput.value = 'Mô tả cá nhân đặc biệt 123';
            })()
        `);

        // Nạp file avatar thật vào input
        const docRes = await cdp.send('DOM.getDocument');
        const inputNode = await cdp.send('DOM.querySelector', {
            nodeId: docRes.root.nodeId,
            selector: '#editProfileAvatarInput'
        });
        assert(inputNode.nodeId, 'Phải tìm thấy input #editProfileAvatarInput');

        await cdp.send('DOM.setFileInputFiles', {
            files: [testAvatarFile],
            nodeId: inputNode.nodeId
        });
        await sleep(400);

        // Kích hoạt change event
        await cdp.eval(`
            (() => {
                const input = document.getElementById('editProfileAvatarInput');
                input.dispatchEvent(new Event('change', { bubbles: true }));
            })()
        `);
        await sleep(400);

        // Xác nhận ảnh preview đã hiển thị
        const beforeSubmitState = await cdp.eval(`
            (() => {
                const previewImg = document.getElementById('editProfileAvatarPreview');
                const cancelBtn = document.getElementById('editProfileAvatarCancelBtn');
                const nameInput = document.getElementById('editProfileName');
                const bioInput = document.getElementById('editProfileBio');
                return {
                    hasPendingFile: Boolean(window.ViVuApp.state?.pendingAvatarFile),
                    previewSrc: previewImg?.src || '',
                    cancelBtnVisible: !cancelBtn?.classList.contains('hidden'),
                    nameVal: nameInput?.value,
                    bioVal: bioInput?.value
                };
            })()
        `);
        console.log('Trạng thái trước khi submit:', beforeSubmitState);
        assert(beforeSubmitState.hasPendingFile, 'Phải có file pendingAvatarFile');
        assert(beforeSubmitState.cancelBtnVisible, 'Nút Bỏ ảnh mới phải hiển thị');

        // Can thiệp fetch refresh để giả lập refresh thất bại
        await cdp.eval(`
            (() => {
                window.__originalFetch = window.fetch;
                window.fetch = async (url, options) => {
                    if (typeof url === 'string' && url.includes('/auth/v1/token?grant_type=refresh_token')) {
                        return new Response(JSON.stringify({ error: 'invalid_grant', message: 'Token expired' }), {
                            status: 400,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                    return window.__originalFetch(url, options);
                };
            })()
        `);

        // Bấm nút "Lưu thay đổi"
        console.log('Thực hiện bấm Lưu thay đổi khi token hết hạn và refresh thất bại...');
        await cdp.eval(`
            (() => {
                const form = document.querySelector('#editProfileModal form');
                if (form) {
                    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                }
            })()
        `);
        await sleep(1000);

        // Kiểm tra trạng thái UI sau khi submit thất bại:
        // 1. Phải hiện thông báo lỗi tiếng Việt yêu cầu đăng nhập lại
        // 2. GIỮ NGUYÊN ảnh đã chọn (pendingAvatarFile và preview)
        // 3. GIỮ NGUYÊN nội dung form (name, bio)
        // 4. Modal KHÔNG ĐƯỢC đóng
        const afterFailState = await cdp.eval(`
            (() => {
                const modal = document.getElementById('editProfileModal');
                const errorEl = document.getElementById('editProfileAvatarError');
                const errorText = document.getElementById('editProfileAvatarErrorText');
                const previewImg = document.getElementById('editProfileAvatarPreview');
                const cancelBtn = document.getElementById('editProfileAvatarCancelBtn');
                const nameInput = document.getElementById('editProfileName');
                const bioInput = document.getElementById('editProfileBio');
                const submitBtn = document.getElementById('editProfileSubmitBtn');

                return {
                    modalStillOpen: modal && !modal.classList.contains('hidden'),
                    errorVisible: errorEl && !errorEl.classList.contains('hidden'),
                    errorMsg: errorText ? errorText.textContent : '',
                    hasPendingFile: Boolean(window.ViVuApp.state?.pendingAvatarFile),
                    previewSrcStillBlob: previewImg ? previewImg.src.startsWith('blob:') : false,
                    cancelBtnVisible: cancelBtn && !cancelBtn.classList.contains('hidden'),
                    namePreserved: nameInput ? nameInput.value === 'Tên Mới Chưa Lưu' : false,
                    bioPreserved: bioInput ? bioInput.value === 'Mô tả cá nhân đặc biệt 123' : false,
                    submitBtnEnabled: submitBtn ? !submitBtn.disabled : false
                };
            })()
        `);

        console.log('Trạng thái UI sau khi phiên không thể làm mới:', afterFailState);
        assert(afterFailState.modalStillOpen, 'Modal Edit Profile phải giữ nguyên mở');
        assert(afterFailState.errorVisible, 'Thông báo lỗi phải hiển thị');
        assert(afterFailState.errorMsg.includes('đăng nhập lại'), `Thông báo phải yêu cầu đăng nhập lại bằng tiếng Việt, nhận được: "${afterFailState.errorMsg}"`);
        assert(afterFailState.hasPendingFile, 'File ảnh đã chọn (pendingAvatarFile) PHẢI ĐƯỢC GIỮ NGUYÊN!');
        assert(afterFailState.previewSrcStillBlob, 'Preview ảnh đã chọn PHẢI ĐƯỢC GIỮ NGUYÊN!');
        assert(afterFailState.cancelBtnVisible, 'Nút Bỏ ảnh mới PHẢI ĐƯỢC GIỮ NGUYÊN!');
        assert(afterFailState.namePreserved, 'Nội dung tên trong form PHẢI ĐƯỢC GIỮ NGUYÊN!');
        assert(afterFailState.bioPreserved, 'Nội dung bio trong form PHẢI ĐƯỢC GIỮ NGUYÊN!');
        assert(afterFailState.submitBtnEnabled, 'Nút submit phải được mở lại để người dùng thao tác tiếp');
        console.log('  ✓ ĐẠT: Khi phiên không thể làm mới, toàn bộ ảnh đã chọn và nội dung form được bảo toàn nguyên vẹn, thông báo tiếng Việt chính xác!');

        // ---------------------------------------------------------------------
        // PHẦN 4: KIỂM THỬ KHI TOKEN HẾT HẠN NHƯNG REFRESH THÀNH CÔNG -> LƯU HỒ SƠ THÀNH CÔNG
        // ---------------------------------------------------------------------
        console.log('\n--- PHẦN 4: Kiểm thử khi token hết hạn nhưng refresh thành công ---');
        // Khôi phục fetch thực tế và đăng nhập tài khoản test thật để lấy token & refresh_token thật
        await cdp.eval('window.fetch = window.__originalFetch');

        const normalUserEmail = 'prod_norm_1791220432814@vivutest.local';
        const normalUserPass = 'TestPass123!@#';
        const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
            body: JSON.stringify({ email: normalUserEmail, password: normalUserPass })
        });
        const loginData = await loginRes.json();

        // Ghi đè expires_at thành quá khứ để giả lập token hết hạn nhưng refresh_token còn hạn
        const realExpiredSession = {
            access_token: loginData.access_token,
            refresh_token: loginData.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) - 30, // Hết hạn 30s trước
            user: loginData.user
        };

        await cdp.eval(`
            (async () => {
                const { saveUserSession } = await import('./js/auth.js');
                saveUserSession(${JSON.stringify(realExpiredSession)});
            })()
        `);

        // Bấm nút Lưu thay đổi -> hệ thống sẽ tự động refresh token thành công và upload avatar thật!
        console.log('Bấm Lưu thay đổi với session có refresh_token thật...');
        await cdp.eval(`
            (() => {
                const form = document.querySelector('#editProfileModal form');
                if (form) {
                    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                }
            })()
        `);

        // Chờ upload và sync hoàn tất
        let successResult = null;
        for (let i = 0; i < 20; i++) {
            await sleep(500);
            successResult = await cdp.eval(`
                (() => {
                    const modal = document.getElementById('editProfileModal');
                    const errorEl = document.getElementById('editProfileAvatarError');
                    const isClosed = modal ? modal.classList.contains('hidden') : false;
                    const errorHidden = errorEl ? errorEl.classList.contains('hidden') : true;
                    const newAvatar = window.ViVuApp.state?.userProfile?.avatar;
                    return {
                        isClosed,
                        errorHidden,
                        newAvatar
                    };
                })()
            `);
            if (successResult.isClosed) break;
        }

        console.log('Kết quả sau khi refresh token thành công và upload:', successResult);
        assert(successResult.isClosed, 'Modal phải đóng lại khi lưu hồ sơ thành công');
        assert(successResult.newAvatar && successResult.newAvatar.includes('review-photos'), 'Avatar mới phải được cập nhật trên state');
        console.log('  ✓ ĐẠT: Khi token hết hạn nhưng refresh thành công, avatar được tải lên và lưu hồ sơ thành công 100%!');

        // Khôi phục hồ sơ ban đầu và dọn dẹp tệp avatar vừa test
        if (successResult?.newAvatar) {
            const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
            const initialAvatar = 'https://foyraoimhksfvlxndwxr.supabase.co/storage/v1/object/public/review-photos/reviews/avatars/de63ff60-9cba-4f05-b2d8-1af1640b9f02_1791300343401.png';
            await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${loginData.user.id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${SERVICE_KEY}`,
                    'apikey': SERVICE_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ avatar_url: initialAvatar, display_name: 'prod_norm_1791220432814' })
            });
            console.log('  ✓ Đã khôi phục hồ sơ người dùng về trạng thái ban đầu trong DB');

            const matchPath = successResult.newAvatar.match(/\/review-photos\/(.+)$/);
            if (matchPath && matchPath[1]) {
                await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${matchPath[1]}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${SERVICE_KEY}` }
                });
                console.log(`  ✓ Đã xóa tệp test avatar trên Storage: ${matchPath[1]}`);
            }
        }

        console.log('\n================================================================');
        console.log('  TẤT CẢ KIỂM THỬ TOKEN REFRESH & AVATAR ĐÃ ĐẠT CHUẨN 100%!');
        console.log('================================================================');

    } finally {
        if (chromeProc) chromeProc.kill();
        if (server) server.close();
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
}

main().catch(err => {
    console.error('LỖI KIỂM THỬ:', err);
    process.exit(1);
});
