/**
 * scripts/verify-prod-live-auth.cjs
 * 
 * Kiểm tra nghiệm thu trực tiếp trên PRODUCTION LIVE: https://vivutravinh.id.vn
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const ARTIFACT_DIR = path.resolve('C:\\Users\\tienl\\.gemini\\antigravity\\brain\\2bc7252e-f998-4e30-bbb7-25edbaa0f421');
const LIVE_URL = 'https://vivutravinh.id.vn';

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

    async setViewport(width, height, isMobile = false) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: isMobile ? 2 : 1,
            mobile: isMobile
        });
        await sleep(300);
    }

    async captureScreenshot(targetPath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(targetPath, Buffer.from(res.data, 'base64'));
    }
}

async function run() {
    console.log(`=== BẮT ĐẦU KIỂM THỬ TRỰC TIẾP TRÊN LIVE PRODUCTION: ${LIVE_URL} ===\n`);

    const userDataDir = path.join(os.tmpdir(), `vivu-prod-live-test-${Date.now()}`);
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const cdpPort = 9228;

    const chromeProc = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${cdpPort}`,
        '--no-sandbox',
        '--disable-gpu',
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        'about:blank'
    ]);

    try {
        await sleep(2500);
        const tabsRes = await fetch(`http://127.0.0.1:${cdpPort}/json`);
        const tabs = await tabsRes.json();
        const tab = tabs.find(t => t.type === 'page');
        if (!tab) throw new Error('Không tìm thấy tab Chrome!');

        const cdp = new CDPClient(tab.webSocketDebuggerUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        await cdp.setViewport(1280, 800, false);
        await cdp.send('Page.navigate', { url: LIVE_URL });
        
        let appLoaded = false;
        for (let i = 0; i < 40; i++) {
            try {
                appLoaded = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.openAuthModal)`);
                if (appLoaded) break;
            } catch (_) {}
            await sleep(350);
        }
        assert(appLoaded, 'Trang Production Live không tải xong trong 14s');
        console.log('✓ ViVuTràVinh Live đã sẵn sàng trên Chrome Headless!');

        // 1. Kiểm tra Toggle Mật khẩu trên Live
        console.log('\n--- 1. KIỂM THỬ TOGGLE MẬT KHẨU TRÊN LIVE ---');
        await cdp.eval(`window.ViVuApp.openAuthModal('signin');`);
        await sleep(400);

        const livePassInfo = await cdp.eval(`(() => {
            const input = document.getElementById('authPasswordInput');
            const btn = document.getElementById('authPasswordToggleBtn');
            const rect = btn.getBoundingClientRect();
            return {
                inputType: input?.type,
                w: rect.width,
                h: rect.height
            };
        })()`);
        assert.strictEqual(livePassInfo.inputType, 'password');
        assert(livePassInfo.w >= 44 && livePassInfo.h >= 44);

        // Click toggle
        await cdp.eval(`document.getElementById('authPasswordToggleBtn').click();`);
        const liveToggledType = await cdp.eval(`document.getElementById('authPasswordInput').type;`);
        assert.strictEqual(liveToggledType, 'text');
        console.log(`✓ Live Sign In: Type đã chuyển sang "${liveToggledType}", nút toggle đạt chuẩn ${livePassInfo.w}x${livePassInfo.h}px`);
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'prod_live_auth_signin_toggle.png'));
        console.log('✓ Đã chụp: prod_live_auth_signin_toggle.png');

        // 2. Kiểm tra Tab Đăng ký & Bắt lỗi mật khẩu không khớp trên Live
        console.log('\n--- 2. KIỂM THỬ TAB ĐĂNG KÝ TRÊN LIVE ---');
        await cdp.eval(`window.ViVuApp.switchAuthTab('signup');`);
        await sleep(300);

        await cdp.eval(`(() => {
            document.getElementById('authEmailInput').value = 'khach_live@vivutravinh.id.vn';
            document.getElementById('authDisplayNameInput').value = 'Thành Viên Live';
            document.getElementById('authPasswordInput').value = 'Password123';
            document.getElementById('authConfirmPasswordInput').value = 'MismatchPass999';
        })()`);
        await cdp.eval(`window.ViVuApp.handleAuthSubmit(new Event('submit'));`);
        await sleep(300);

        const liveErr = await cdp.eval(`document.getElementById('authErrorMessage').textContent.trim();`);
        assert.strictEqual(liveErr, 'Mật khẩu xác nhận không trùng khớp. Vui lòng kiểm tra lại.');
        console.log(`✓ Live Sign Up: Bắt lỗi không khớp thành công -> "${liveErr}"`);
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'prod_live_auth_signup_mismatch.png'));
        console.log('✓ Đã chụp: prod_live_auth_signup_mismatch.png');

        // 3. Kiểm tra Quên mật khẩu & Thông báo trung lập trên Live
        console.log('\n--- 3. KIỂM THỬ QUÊN MẬT KHẨU TRÊN LIVE ---');
        await cdp.eval(`document.getElementById('authForgotPasswordLink').click();`);
        await sleep(300);
        await cdp.eval(`document.getElementById('authEmailInput').value = 'support@vivutravinh.id.vn';`);
        await cdp.eval(`window.ViVuApp.handleAuthSubmit(new Event('submit'));`);
        await sleep(1500);

        const liveNotice = await cdp.eval(`document.getElementById('authNoticeMessage').textContent.trim();`);
        assert(liveNotice.includes('support@vivutravinh.id.vn'));
        assert(liveNotice.includes('Nếu email'));
        console.log(`✓ Live Forgot Password: Thông báo trung lập hiển thị -> "${liveNotice}"`);
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'prod_live_auth_forgot_notice.png'));
        console.log('✓ Đã chụp: prod_live_auth_forgot_notice.png');

        await cdp.eval(`window.ViVuApp.closeAuthModal();`);
        await sleep(200);

        // 4. Kiểm tra Modal Đặt lại mật khẩu trên Live
        console.log('\n--- 4. KIỂM THỬ MODAL ĐẶT LẠI MẬT KHẨU TRÊN LIVE ---');
        await cdp.eval(`window.ViVuApp.openResetPasswordModal('mock_live_token');`);
        await sleep(300);
        await cdp.eval(`(() => {
            document.getElementById('resetNewPasswordInput').value = 'PassOne123';
            document.getElementById('resetConfirmPasswordInput').value = 'PassTwo999';
        })()`);
        await cdp.eval(`window.ViVuApp.handleResetPasswordSubmit(new Event('submit'));`);
        await sleep(200);

        const liveResetErr = await cdp.eval(`document.getElementById('resetErrorMessage').textContent.trim();`);
        assert.strictEqual(liveResetErr, 'Mật khẩu xác nhận không trùng khớp. Vui lòng kiểm tra lại.');
        console.log(`✓ Live Reset Password Modal: Bắt lỗi thành công -> "${liveResetErr}"`);
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'prod_live_auth_reset_modal.png'));
        console.log('✓ Đã chụp: prod_live_auth_reset_modal.png');

        await cdp.eval(`window.ViVuApp.closeResetPasswordModal();`);
        await sleep(200);

        // 5. Kiểm tra URL Callback & Xóa token bảo mật trên Live
        console.log('\n--- 5. KIỂM THỬ URL CALLBACK TRÊN LIVE ---');
        await cdp.eval(`window.history.pushState(null, '', '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');`);
        await cdp.eval(`window.ViVuApp.handleAuthUrlCallback();`);
        await sleep(300);

        const liveHashAfter = await cdp.eval(`window.location.hash;`);
        assert.strictEqual(liveHashAfter, '');
        console.log('✓ Live URL callback: URL hash đã được làm sạch ngay lập tức (không lộ thông tin xác thực)');
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'prod_live_auth_callback_expired.png'));
        console.log('✓ Đã chụp: prod_live_auth_callback_expired.png');

        console.log('\n===============================================================');
        console.log('🎉 TOÀN BỘ KIỂM THỬ TRÊN PRODUCTION LIVE HOÀN TẤT THÀNH CÔNG 100%!');
        console.log('===============================================================');

    } finally {
        if (chromeProc) chromeProc.kill('SIGKILL');
        try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
    }
}

run().then(() => process.exit(0)).catch(err => {
    console.error('❌ Thất bại trên Live:', err);
    process.exit(1);
});
