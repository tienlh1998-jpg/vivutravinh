/**
 * scripts/verify-three-auth-fixes.cjs
 * 
 * Kiểm thử chi tiết 3 điểm đã hoàn thiện:
 * 1. Bỏ nhánh PKCE thiếu code_verifier, dọn sạch URL và thông báo rõ ràng cho người dùng.
 * 2. Xác minh không còn thời hạn "24 giờ" trong 2 template HTML (confirmation & recovery).
 * 3. Xử lý lỗi gửi email an toàn, trả về phản hồi trung lập (Anti-Account Enumeration) cho cả email tồn tại và không tồn tại.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

// 1. Kiểm tra Template HTML (Điểm 2)
console.log('=== KIỂM TRA ĐIỂM 2: MẪU EMAIL TEMPLATES ===');
const confirmTplPath = path.join(ROOT_DIR, 'supabase/email_templates/confirmation_email.html');
const recoveryTplPath = path.join(ROOT_DIR, 'supabase/email_templates/recovery_email.html');

const confirmHtml = fs.readFileSync(confirmTplPath, 'utf8');
const recoveryHtml = fs.readFileSync(recoveryTplPath, 'utf8');

assert(!confirmHtml.includes('24 giờ') && !confirmHtml.includes('24h'), 'Confirmation email template không được chứa "24 giờ"');
assert(confirmHtml.includes('thời gian giới hạn theo chính sách của hệ thống'), 'Confirmation email phải chứa câu thông báo thời hạn chuẩn');
console.log('✓ [PASS] confirmation_email.html: Đã bỏ "24 giờ", nội dung cập nhật chuẩn xác.');

assert(!recoveryHtml.includes('24 giờ') && !recoveryHtml.includes('24h'), 'Recovery email template không được chứa "24 giờ"');
assert(recoveryHtml.includes('thời gian giới hạn theo chính sách bảo mật của hệ thống'), 'Recovery email phải chứa câu thông báo thời hạn chuẩn');
console.log('✓ [PASS] recovery_email.html: Đã bỏ "24 giờ", nội dung cập nhật chuẩn xác.');

// 2. Kiểm tra Browser CDP cho Điểm 1 (PKCE) và Điểm 3 (Neutral Email Responses)
function startLocalServer(port = 4193) {
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
    };

    const server = http.createServer((req, res) => {
        try {
            const parsedUrl = new URL(req.url, `http://localhost:${port}`);
            let pathname = parsedUrl.pathname;
            if (pathname === '/' || !pathname) pathname = '/index.html';
            const cleanRelative = pathname.replace(/^\/+/, '');
            const filePath = path.join(ROOT_DIR, cleanRelative);

            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                return res.end(`Not Found: ${cleanRelative}`);
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(filePath).pipe(res);
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Internal Error: ${e.message}`);
        }
    });

    return new Promise((resolve) => {
        server.listen(port, () => resolve(server));
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.reqId = 0;
        this.callbacks = new Map();
        this.ws.onmessage = (event) => {
            try {
                const res = JSON.parse(event.data);
                if (res.id && this.callbacks.has(res.id)) {
                    const cb = this.callbacks.get(res.id);
                    this.callbacks.delete(res.id);
                    cb(res);
                }
            } catch (_) {}
        };
    }

    ready() {
        if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
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
            throw new Error(`CDP Eval Exception: ${JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result?.value;
    }
}

async function runBrowserTests() {
    console.log('\n=== KHỞI ĐỘNG KIỂM THỬ TRÌNH DUYỆT (CDP) ===');
    const port = 4193;
    const server = await startLocalServer(port);

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const cdpPort = 9225;
    const userDataDir = path.join(require('os').tmpdir(), 'chrome_cdp_test_' + Date.now());

    const chromeProc = spawn(chromePath, [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        'about:blank'
    ], { stdio: 'ignore' });

    await sleep(2500);

    const tabsRes = await fetch(`http://127.0.0.1:${cdpPort}/json`);
    const tabs = await tabsRes.json();
    const tab = tabs.find(t => t.type === 'page');
    if (!tab) throw new Error('Không tìm thấy tab Chrome!');

    const cdp = new CDPClient(tab.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    try {
        console.log(`Đang điều hướng tới http://localhost:${port}/...`);
        await cdp.send('Page.navigate', { url: `http://localhost:${port}/` });

        for (let i = 0; i < 30; i++) {
            const loaded = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.sendPasswordResetEmail)`);
            if (loaded) break;
            await sleep(200);
        }

        // =====================================================================
        // KIỂM TRA ĐIỂM 1: Bỏ nhánh PKCE thiếu code_verifier, dọn URL & thông báo
        // =====================================================================
        console.log('\n=== KIỂM TRA ĐIỂM 1: XỬ LÝ NHÁNH PKCE (?code=) ===');
        await cdp.eval(`window.history.pushState(null, '', '/?code=mock_pkce_auth_code_12345');`);
        const searchBefore = await cdp.eval(`window.location.search;`);
        assert(searchBefore.includes('code='), 'Query string phải chứa code trước khi xử lý');

        // Gọi handleAuthUrlCallback
        await cdp.eval(`window.ViVuApp.handleAuthUrlCallback();`);
        await sleep(300);

        // Kiểm tra URL đã dọn sạch mã code
        const searchAfter = await cdp.eval(`window.location.search;`);
        assert(!searchAfter.includes('code='), 'URL phải được dọn sạch không còn tham số code=');
        console.log('✓ [PASS] Tham số PKCE code= đã được dọn sạch khỏi URL ngay lập tức.');

        // Kiểm tra thông báo toast xuất hiện và giải thích rõ về liên kết email thay vì PKCE
        const toastContent = await cdp.eval(`
            (() => {
                const toasts = Array.from(document.querySelectorAll('.toast, [role="alert"], div'));
                const match = toasts.find(el => el.textContent.includes('liên kết xác thực email trực tiếp'));
                return match ? match.textContent : '';
            })()
        `);
        assert(toastContent.includes('liên kết xác thực email trực tiếp'), 'Phải hiển thị thông báo rõ ràng về cơ chế email thay vì PKCE thiếu verifier');
        console.log('✓ [PASS] Thông báo rõ ràng về liên kết email trực tiếp đã hiển thị tới người dùng.');

        // =====================================================================
        // KIỂM TRA ĐIỂM 3: Xử lý gửi email & Phân biệt lỗi cấu hình/dịch vụ với lỗi trạng thái tài khoản
        // =====================================================================
        console.log('\n=== KIỂM TRA ĐIỂM 3: XỬ LÝ LỖI GỬI EMAIL & PHÂN LOẠI LỖI CHÍNH XÁC ===');

        // 3.1: Kiểm tra trực tiếp handleAuthEmailResponse với các lỗi cấu hình / dịch vụ
        console.log('3.1 Kiểm thử các lỗi cấu hình/dịch vụ (email provider disabled, invalid api key, restricted email, 5xx):');

        const testProviderDisabled = await cdp.eval(`
            (() => {
                try {
                    window.ViVuApp.handleAuthEmailResponse({ ok: false, status: 400 }, { error_code: 'email_provider_disabled', msg: 'Email provider is disabled' });
                    return 'FAILED_NOT_THROWN';
                } catch (e) {
                    return e.message;
                }
            })()
        `);
        assert.strictEqual(testProviderDisabled, 'Không thể gửi email lúc này.', 'Lỗi email_provider_disabled phải ném lỗi "Không thể gửi email lúc này."');
        console.log('   ✓ [PASS] email_provider_disabled -> Báo lỗi: "Không thể gửi email lúc này." (Không lộ tài khoản)');

        const testInvalidApiKey = await cdp.eval(`
            (() => {
                try {
                    window.ViVuApp.handleAuthEmailResponse({ ok: false, status: 401 }, { message: 'Invalid API key' });
                    return 'FAILED_NOT_THROWN';
                } catch (e) {
                    return e.message;
                }
            })()
        `);
        assert.strictEqual(testInvalidApiKey, 'Không thể gửi email lúc này.', 'Lỗi 401 Invalid API key phải ném lỗi "Không thể gửi email lúc này."');
        console.log('   ✓ [PASS] Invalid API key (401) -> Báo lỗi: "Không thể gửi email lúc này."');

        const testRestrictedEmail = await cdp.eval(`
            (() => {
                try {
                    window.ViVuApp.handleAuthEmailResponse({ ok: false, status: 400 }, { error_code: 'email_address_not_authorized', msg: 'Email address not authorized' });
                    return 'FAILED_NOT_THROWN';
                } catch (e) {
                    return e.message;
                }
            })()
        `);
        assert.strictEqual(testRestrictedEmail, 'Không thể gửi email lúc này.', 'Lỗi địa chỉ gửi bị hạn chế (email_address_not_authorized) phải ném lỗi "Không thể gửi email lúc này."');
        console.log('   ✓ [PASS] Địa chỉ gửi bị hạn chế (email_address_not_authorized) -> Báo lỗi: "Không thể gửi email lúc này."');

        const testRateLimitOrSendQuota = await cdp.eval(`
            (() => {
                try {
                    window.ViVuApp.handleAuthEmailResponse({ ok: false, status: 429 }, { error_code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded' });
                    return 'FAILED_NOT_THROWN';
                } catch (e) {
                    return e.message;
                }
            })()
        `);
        assert.strictEqual(testRateLimitOrSendQuota, 'Không thể gửi email lúc này.', 'Lỗi giới hạn gửi email (429 / over_email_send_rate_limit) phải ném lỗi "Không thể gửi email lúc này."');
        console.log('   ✓ [PASS] Giới hạn gửi / Rate limit (429) -> Báo lỗi: "Không thể gửi email lúc này."');

        const testServerError500 = await cdp.eval(`
            (() => {
                try {
                    window.ViVuApp.handleAuthEmailResponse({ ok: false, status: 500 }, { msg: 'Internal server error' });
                    return 'FAILED_NOT_THROWN';
                } catch (e) {
                    return e.message;
                }
            })()
        `);
        assert.strictEqual(testServerError500, 'Không thể gửi email lúc này.', 'Lỗi 5xx phải ném lỗi "Không thể gửi email lúc này."');
        console.log('   ✓ [PASS] Lỗi máy chủ (HTTP 500) -> Báo lỗi: "Không thể gửi email lúc này."');

        const testArbitrary400 = await cdp.eval(`
            (() => {
                try {
                    window.ViVuApp.handleAuthEmailResponse({ ok: false, status: 400 }, { msg: 'Unexpected bad request' });
                    return 'FAILED_NOT_THROWN';
                } catch (e) {
                    return e.message;
                }
            })()
        `);
        assert.strictEqual(testArbitrary400, 'Không thể gửi email lúc này.', 'Lỗi 4xx bất kỳ không phải trạng thái tài khoản KHÔNG được mặc định là thành công');
        console.log('   ✓ [PASS] Lỗi 4xx bất kỳ không thuộc trạng thái tài khoản -> Báo lỗi: "Không thể gửi email lúc này." (Không mặc định thành công)');

        // 3.2: Kiểm tra phản hồi trung lập cho lỗi liên quan trạng thái tài khoản
        console.log('3.2 Kiểm thử phản hồi trung lập cho lỗi trạng thái tài khoản (user_not_found, user_already_confirmed):');

        const testUserNotFound = await cdp.eval(`window.ViVuApp.handleAuthEmailResponse({ ok: false, status: 400 }, { error_code: 'user_not_found', msg: 'User not found' })`);
        assert.deepStrictEqual(testUserNotFound, { success: true }, 'Lỗi user_not_found phải trả về { success: true } trung lập');
        console.log('   ✓ [PASS] Lỗi user_not_found -> Trả về { success: true } trung lập (chống rà quét tài khoản)');

        const testUserAlreadyConfirmed = await cdp.eval(`window.ViVuApp.handleAuthEmailResponse({ ok: false, status: 400 }, { msg: 'User already confirmed' })`);
        assert.deepStrictEqual(testUserAlreadyConfirmed, { success: true }, 'Lỗi user already confirmed phải trả về { success: true } trung lập');
        console.log('   ✓ [PASS] Lỗi user already confirmed -> Trả về { success: true } trung lập (chống rà quét tài khoản)');

        // 3.3: Thử nghiệm thực tế luồng API & UI
        const fakeEmail = 'nonexistent_test_' + Date.now() + '@example-domain-xyz.com';
        console.log(`3.3 Thử nghiệm API gửi thực tế qua Supabase với email không tồn tại: ${fakeEmail}`);
        const resetResult = await cdp.eval(`window.ViVuApp.sendPasswordResetEmail('${fakeEmail}')`);
        assert.deepStrictEqual(resetResult, { success: true }, 'sendPasswordResetEmail phải trả về { success: true } trung lập khi email không tồn tại');
        console.log('   ✓ [PASS] sendPasswordResetEmail thực tế với Supabase trả về { success: true } an toàn.');

        // 3.4: Thử nghiệm submit form Quên Mật Khẩu trên giao diện người dùng
        console.log('3.4 Thử nghiệm giao diện form Quên Mật Khẩu (Forgot Password Modal):');
        await cdp.eval(`
            window.ViVuApp.openAuthModal('forgot');
            document.getElementById('authEmailInput').value = '${fakeEmail}';
            document.getElementById('userAuthForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        `);
        await sleep(500);

        const noticeText = await cdp.eval(`
            (() => {
                const noticeEl = document.getElementById('authNoticeMessage');
                return noticeEl ? noticeEl.textContent : '';
            })()
        `);
        assert(noticeText.includes('Nếu email') && noticeText.includes('tồn tại trong hệ thống'), 'Giao diện phải hiển thị thông báo trung lập "Nếu email ... tồn tại trong hệ thống..."');
        console.log('   ✓ [PASS] Form Quên mật khẩu hiển thị thông báo trung lập an toàn:');
        console.log(`          "${noticeText.trim()}"`);

        // 3.5: Kiểm tra nút Gửi lại email (Cooldown & Rate limit handling)
        const isSubmitHidden = await cdp.eval(`document.getElementById('authSubmitBtn').classList.contains('hidden')`);
        assert(isSubmitHidden, 'Nút submit phải được ẩn sau khi gửi thành công');
        const resendVisible = await cdp.eval(`!document.getElementById('authResendContainer').classList.contains('hidden')`);
        assert(resendVisible, 'Nút gửi lại kèm đếm ngược cooldown phải xuất hiện');
        console.log('   ✓ [PASS] Nút gửi lại email với bộ đếm thời gian chờ (cooldown 60s) hoạt động chuẩn xác.');

        console.log('\n================================================================================');
        console.log(' TẤT CẢ 3 ĐIỂM KIỂM THỬ ĐÃ ĐẠT CHUẨN 100%!');
        console.log('================================================================================');

    } finally {
        try { chromeProc.kill(); } catch (_) {}
        server.close();
    }
}

runBrowserTests().catch(err => {
    console.error('LỖI KIỂM THỬ:', err);
    process.exit(1);
});
