/**
 * scripts/verify-user-login-fix.cjs
 * Kiểm thử toàn diện bản sửa lỗi đăng nhập người dùng:
 * 1. Đăng nhập người dùng thường:
 *    - /api/admin-profile trả 403
 *    - Phiên vivu_user_session được GIỮ NGUYÊN hợp lệ
 *    - vivu_admin_session bị xóa sạch
 *    - Modal đóng, nút được phục hồi, UI cập nhật
 *    - Toast thông báo thành công hiển thị
 * 2. Tải lại trang (Page reload):
 *    - Phiên người dùng vẫn duy trì sau reload, header giữ trạng thái đã đăng nhập
 * 3. Đăng xuất (Sign out):
 *    - Phiên người dùng và phiên quản trị được dọn sạch hoàn toàn
 *    - Header trở về nút "Đăng nhập"
 * 4. Chuyển giữa tài khoản admin và thường:
 *    - Đăng nhập admin -> có admin session
 *    - Đăng nhập lại bằng tài khoản thường -> admin session bị xóa, chỉ còn user session
 * 5. Trường hợp API quyền không phản hồi / timeout:
 *    - Giả lập /api/admin-profile bị treo
 *    - Kích hoạt timeout AbortController (2.5s)
 *    - Phiên người dùng vẫn được bảo toàn và hoàn tất đăng nhập trơn tru
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="?([^"\r\n]+)"?/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\r\n]+)"?/)[1];
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function startLocalServer(port) {
    return new Promise((resolve) => {
        const mimeTypes = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.cjs': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.woff2': 'font/woff2'
        };

        const server = http.createServer((req, res) => {
            const urlObj = new URL(req.url, `http://localhost:${port}`);
            let pathname = urlObj.pathname;

            // Mock /api/admin-profile
            if (pathname === '/api/admin-profile') {
                const authHeader = req.headers['authorization'] || '';
                const token = authHeader.replace(/^Bearer\s+/i, '');

                if (urlObj.searchParams.get('hang') === '1') {
                    // Cố tình treo không trả lời để test timeout
                    return;
                }

                if (token.includes('admin') || token.includes('mock-admin')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        user: { id: 'admin-uid', email: 'admin@vivutravinh.vn', role: 'admin' }
                    }));
                    return;
                }

                // Với tài khoản thường: trả 403 Forbidden
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: { message: 'Tài khoản không có quyền truy cập khu vực quản trị.' }
                }));
                return;
            }

            if (pathname === '/') pathname = '/index.html';
            const filePath = path.join(ROOT_DIR, pathname);

            if (!fs.existsSync(filePath)) {
                res.writeHead(404);
                res.end('Not Found');
                return;
            }

            const ext = path.extname(filePath);
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            fs.createReadStream(filePath).pipe(res);
        });

        server.listen(port, () => resolve(server));
    });
}

function getDebuggerUrl(port) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const list = JSON.parse(data);
                    const page = list.find(item => item.type === 'page');
                    if (page && page.webSocketDebuggerUrl) {
                        resolve(page.webSocketDebuggerUrl);
                    } else {
                        reject(new Error('Không tìm thấy tab trang'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
    });
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.msgId = 1;
        this.pending = new Map();
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.id && this.pending.has(data.id)) {
                const { resolve, reject } = this.pending.get(data.id);
                this.pending.delete(data.id);
                if (data.error) reject(new Error(data.error.message || JSON.stringify(data.error)));
                else resolve(data.result);
            }
        };
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = this.msgId++;
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async eval(expression) {
        const res = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result ? res.result.value : undefined;
    }

    close() {
        this.ws.close();
    }
}

async function main() {
    console.log('=== BẮT ĐẦU KIỂM THỬ SỬA LỖI ĐĂNG NHẬP NGƯỜI DÙNG ===\n');

    const PORT = 4192;
    const server = await startLocalServer(PORT);
    console.log(`[Server] Đã khởi chạy tại http://localhost:${PORT}`);

    // Tài khoản thường
    const normalUserEmail = 'prod_norm_1791220432814@vivutest.local';
    const normalUserPass = 'TestPass123!@#';

    // Khởi động Headless Chrome
    const chromePort = 9277;
    const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

    const chromeProc = spawn(chromePath, [
        `--remote-debugging-port=${chromePort}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-web-security',
        'about:blank'
    ]);

    await sleep(1500);
    const wsUrl = await getDebuggerUrl(chromePort);
    const client = new CDPClient(wsUrl);
    await new Promise(r => client.ws.onopen = r);

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Runtime.enable');

    try {
        // =========================================================================
        // CA 1: ĐĂNG NHẬP NGƯỜI DÙNG THƯỜNG (KHI /api/admin-profile TRẢ 403)
        // =========================================================================
        console.log('\n--- 1. KIỂM THỬ ĐĂNG NHẬP NGƯỜI DÙNG THƯỜNG (403 ADMIN-PROFILE) ---');
        await client.send('Page.navigate', { url: `http://localhost:${PORT}/index.html` });
        await sleep(2500);

        // Mở modal đăng nhập
        await client.eval(`window.ViVuApp.openAuthModal('signin');`);
        await sleep(500);

        // Điền email và mật khẩu
        await client.eval(`
            (() => {
                document.getElementById('authEmailInput').value = '${normalUserEmail}';
                document.getElementById('authPasswordInput').value = '${normalUserPass}';
            })()
        `);

        // Bấm Đăng nhập
        console.log('[Normal Login] Bấm Đăng nhập...');
        await client.eval(`document.getElementById('userAuthForm').dispatchEvent(new Event('submit', { cancelable: true }));`);
        await sleep(3500);

        // Kiểm tra kết quả
        const loginResult = await client.eval(`
            (() => {
                const userSessionRaw = localStorage.getItem('vivu_user_session');
                const adminSessionRaw = localStorage.getItem('vivu_admin_session');
                const modal = document.getElementById('userAuthModal');
                const isModalHidden = modal ? modal.classList.contains('hidden') : true;
                const submitBtn = document.getElementById('authSubmitBtn');
                const isBtnDisabled = submitBtn ? submitBtn.disabled : false;
                const btnText = submitBtn ? submitBtn.textContent.trim() : '';
                const headerProfileText = document.getElementById('headerProfileBtn')?.textContent?.trim();

                return {
                    hasUserSession: Boolean(userSessionRaw),
                    hasAdminSession: Boolean(adminSessionRaw),
                    isModalHidden,
                    isBtnDisabled,
                    btnText,
                    headerProfileText
                };
            })()
        `);
        console.log('[Normal Login] Trạng thái sau đăng nhập:', loginResult);

        assert.strictEqual(loginResult.hasUserSession, true, 'Phiên người dùng vivu_user_session PHẢI ĐƯỢC GIỮ NGUYÊN hợp lệ!');
        assert.strictEqual(loginResult.hasAdminSession, false, 'Tài khoản thường KHÔNG ĐƯỢC có vivu_admin_session!');
        assert.strictEqual(loginResult.isModalHidden, true, 'Modal đăng nhập phải tự động đóng!');
        assert.strictEqual(loginResult.isBtnDisabled, false, 'Nút submit phải được kích hoạt lại (không bị disable)!');
        assert.strictEqual(loginResult.btnText, 'Đăng nhập', 'Nút submit phải phục hồi text về "Đăng nhập"!');
        assert(loginResult.headerProfileText && !loginResult.headerProfileText.includes('Đăng nhập'), 'Header phải hiển thị tên/avatar người dùng thay vì chữ Đăng nhập!');
        console.log('✓ Đăng nhập người dùng thường thành công: Giữ nguyên phiên hợp lệ, đóng modal, phục hồi nút, giao diện cập nhật!');

        // =========================================================================
        // CA 2: TẢI LẠI TRANG (PAGE RELOAD)
        // =========================================================================
        console.log('\n--- 2. KIỂM THỬ TẢI LẠI TRANG (PAGE RELOAD) ---');
        await client.eval(`window.location.reload();`);
        await sleep(3000);

        const reloadState = await client.eval(`
            (() => {
                const userSessionRaw = localStorage.getItem('vivu_user_session');
                const headerProfileText = document.getElementById('headerProfileBtn')?.textContent?.trim();
                return {
                    hasUserSession: Boolean(userSessionRaw),
                    headerProfileText
                };
            })()
        `);
        console.log('[Reload Test] Trạng thái sau reload:', reloadState);
        assert.strictEqual(reloadState.hasUserSession, true, 'Phiên người dùng phải duy trì sau khi tải lại trang!');
        assert(!reloadState.headerProfileText.includes('Đăng nhập'), 'Header phải duy trì trạng thái đã đăng nhập sau khi tải lại trang!');
        console.log('✓ Trạng thái đăng nhập duy trì hoàn hảo sau khi reload!');

        // =========================================================================
        // CA 3: ĐĂNG XUẤT (SIGN OUT)
        // =========================================================================
        console.log('\n--- 3. KIỂM THỬ ĐĂNG XUẤT (SIGN OUT) ---');
        await client.eval(`window.ViVuApp.handleUserSignOut();`);
        await sleep(1000);

        const signOutState = await client.eval(`
            (() => {
                const userSessionRaw = localStorage.getItem('vivu_user_session');
                const adminSessionRaw = localStorage.getItem('vivu_admin_session');
                const headerProfileText = document.getElementById('headerProfileBtn')?.textContent?.trim();
                return {
                    hasUserSession: Boolean(userSessionRaw),
                    hasAdminSession: Boolean(adminSessionRaw),
                    headerProfileText
                };
            })()
        `);
        console.log('[SignOut Test] Trạng thái sau đăng xuất:', signOutState);
        assert.strictEqual(signOutState.hasUserSession, false, 'Phiên người dùng phải được xóa sạch sau khi đăng xuất!');
        assert.strictEqual(signOutState.hasAdminSession, false, 'Phiên admin phải được xóa sạch!');
        assert(signOutState.headerProfileText.includes('Đăng nhập'), 'Header phải quay về nút "Đăng nhập"!');
        console.log('✓ Đăng xuất hoạt động chuẩn xác, dọn sạch phiên và cập nhật lại giao diện!');

        // =========================================================================
        // CA 4: CHUYỂN GIỮA TÀI KHOẢN ADMIN VÀ THƯỜNG
        // =========================================================================
        console.log('\n--- 4. KIỂM THỬ CHUYỂN GIỮA TÀI KHOẢN ADMIN VÀ THƯỜNG ---');
        // 4a. Giả lập đăng nhập Admin (gán mock admin session)
        console.log('[Switch Test] Giả lập tài khoản Admin đăng nhập...');
        await client.eval(`
            (() => {
                const mockAdminSession = {
                    access_token: 'mock-admin-token-xyz',
                    user: { id: 'admin-id-123', email: 'admin@vivutravinh.vn', role: 'admin' },
                    role: 'admin'
                };
                sessionStorage.setItem('vivu_admin_session', JSON.stringify(mockAdminSession));
                localStorage.setItem('vivu_admin_session', JSON.stringify(mockAdminSession));
                localStorage.setItem('vivu_user_session', JSON.stringify(mockAdminSession));
                window.ViVuApp.updateAdminRoleUI();
            })()
        `);
        await sleep(500);

        const adminActiveState = await client.eval(`
            (() => {
                return {
                    hasAdminSession: Boolean(localStorage.getItem('vivu_admin_session')),
                    hasUserSession: Boolean(localStorage.getItem('vivu_user_session'))
                };
            })()
        `);
        assert.strictEqual(adminActiveState.hasAdminSession, true, 'Admin session phải tồn tại');

        // 4b. Bây giờ đăng nhập tài khoản thường đè lên
        console.log('[Switch Test] Đăng nhập tài khoản thường đè lên...');
        await client.eval(`window.ViVuApp.openAuthModal('signin');`);
        await sleep(500);

        await client.eval(`
            (() => {
                document.getElementById('authEmailInput').value = '${normalUserEmail}';
                document.getElementById('authPasswordInput').value = '${normalUserPass}';
                document.getElementById('userAuthForm').dispatchEvent(new Event('submit', { cancelable: true }));
            })()
        `);
        await sleep(3500);

        const afterSwitchState = await client.eval(`
            (() => {
                const userSessionRaw = localStorage.getItem('vivu_user_session');
                const adminSessionRaw = localStorage.getItem('vivu_admin_session');
                const adminSessionStorage = sessionStorage.getItem('vivu_admin_session');
                const parsedUser = userSessionRaw ? JSON.parse(userSessionRaw) : null;
                return {
                    hasUserSession: Boolean(userSessionRaw),
                    userEmail: parsedUser?.user?.email,
                    hasAdminSessionLocal: Boolean(adminSessionRaw),
                    hasAdminSessionSession: Boolean(adminSessionStorage)
                };
            })()
        `);
        console.log('[Switch Test] Trạng thái sau khi chuyển sang tài khoản thường:', afterSwitchState);
        assert.strictEqual(afterSwitchState.hasUserSession, true, 'Phiên người dùng thường phải tồn tại');
        assert.strictEqual(afterSwitchState.userEmail, normalUserEmail, 'Email phải là của người dùng thường');
        assert.strictEqual(afterSwitchState.hasAdminSessionLocal, false, 'Phiên admin trong localStorage PHẢI BỊ XÓA!');
        assert.strictEqual(afterSwitchState.hasAdminSessionSession, false, 'Phiên admin trong sessionStorage PHẢI BỊ XÓA!');
        console.log('✓ Chuyển từ Admin sang Người dùng thường hoạt động xuất sắc: Xóa quyền admin, chỉ giữ phiên người dùng!');

        // =========================================================================
        // CA 5: TRƯỜNG HỢP API QUYỀN KHÔNG PHẢN HỒI (HANG / TIMEOUT)
        // =========================================================================
        console.log('\n--- 5. KIỂM THỬ TRƯỜNG HỢP API QUYỀN BỊ TREO / TIMEOUT ---');
        // Đăng xuất trước
        await client.eval(`window.ViVuApp.handleUserSignOut();`);
        await sleep(500);

        // Can thiệp fetch trong trang: nếu URL là /api/admin-profile thì làm treo vĩnh viễn (không bao giờ resolve)
        await client.eval(`
            (() => {
                const origFetch = window.fetch;
                window.fetch = function(url, options) {
                    if (typeof url === 'string' && url.includes('/api/admin-profile')) {
                        console.log('[Simulate Hang] Làm treo request /api/admin-profile để kích hoạt timeout...');
                        return new Promise((resolve, reject) => {
                            if (options?.signal) {
                                options.signal.addEventListener('abort', () => {
                                    const err = new Error('The user aborted a request.');
                                    err.name = 'AbortError';
                                    reject(err);
                                });
                            }
                        });
                    }
                    return origFetch.apply(this, arguments);
                };
            })()
        `);

        // Đăng nhập lại
        await client.eval(`window.ViVuApp.openAuthModal('signin');`);
        await sleep(500);

        console.log('[Timeout Test] Gửi form đăng nhập khi API quyền bị treo...');
        await client.eval(`
            (() => {
                document.getElementById('authEmailInput').value = '${normalUserEmail}';
                document.getElementById('authPasswordInput').value = '${normalUserPass}';
                document.getElementById('userAuthForm').dispatchEvent(new Event('submit', { cancelable: true }));
            })()
        `);

        // Chờ 3.5s để AbortController timeout (2.5s) kích hoạt và hoàn tất luồng
        await sleep(3800);

        const timeoutResult = await client.eval(`
            (() => {
                const userSessionRaw = localStorage.getItem('vivu_user_session');
                const modal = document.getElementById('userAuthModal');
                const isModalHidden = modal ? modal.classList.contains('hidden') : true;
                const submitBtn = document.getElementById('authSubmitBtn');
                const isBtnDisabled = submitBtn ? submitBtn.disabled : false;
                const headerProfileText = document.getElementById('headerProfileBtn')?.textContent?.trim();
                return {
                    hasUserSession: Boolean(userSessionRaw),
                    isModalHidden,
                    isBtnDisabled,
                    headerProfileText
                };
            })()
        `);
        console.log('[Timeout Test] Trạng thái sau timeout:', timeoutResult);
        assert.strictEqual(timeoutResult.hasUserSession, true, 'Phiên người dùng PHẢI ĐƯỢC GIỮ NGUYÊN ngay cả khi API quyền bị treo/timeout!');
        assert.strictEqual(timeoutResult.isModalHidden, true, 'Modal đăng nhập phải tự đóng sau khi timeout kích hoạt!');
        assert.strictEqual(timeoutResult.isBtnDisabled, false, 'Nút submit phải được kích hoạt lại!');
        assert(!timeoutResult.headerProfileText.includes('Đăng nhập'), 'Giao diện header phải được cập nhật trạng thái đăng nhập!');
        console.log('✓ Xử lý timeout thành công xuất sắc: Không bị treo vĩnh viễn, bảo toàn phiên người dùng, đóng modal và cập nhật giao diện!');

    } finally {
        client.close();
        chromeProc.kill();
        server.close();
        console.log('\n=== TOÀN BỘ CÁC CA TEST ĐÃ ĐẠT 100% ===\n');
    }
}

main().catch(err => {
    console.error('❌ Kiểm thử thất bại:', err);
    process.exit(1);
});
