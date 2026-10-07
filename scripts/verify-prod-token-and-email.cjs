/**
 * scripts/verify-prod-token-and-email.cjs
 * 
 * Kiểm tra nghiệm thu xác thực token máy chủ và chặn token không hợp lệ trực tiếp trên:
 * PRODUCTION LIVE: https://vivutravinh.id.vn
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
    console.log(`=== BẮT ĐẦU KIỂM THỬ BẢO MẬT TOKEN MÁY CHỦ TRÊN PRODUCTION LIVE: ${LIVE_URL} ===\n`);

    const userDataDir = path.join(os.tmpdir(), `vivu-prod-token-${Date.now()}`);
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const cdpPort = 9230;

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
                appLoaded = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.verifyUserTokenWithServer)`);
                if (appLoaded) break;
            } catch (_) {}
            await sleep(350);
        }
        assert(appLoaded, 'Trang Production Live không tải xong');
        console.log('✓ Trang Production Live đã sẵn sàng với verifyUserTokenWithServer!');

        // 1. Thử nghiệm hàm verifyUserTokenWithServer trên Live với token giả mạo
        const fakePayload = Buffer.from(JSON.stringify({ sub: "attacker-fake-uuid", email: "attacker@fake.com", exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64');
        const forgedJwtToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${fakePayload}.fake_untrusted_signature`;

        console.log('\n--- 1. KIỂM THỬ XÁC THỰC SERVER-SIDE TRÊN LIVE VỚI TOKEN GIẢ MẠO ---');
        const liveVerifyRes = await cdp.eval(`window.ViVuApp.verifyUserTokenWithServer('${forgedJwtToken}');`);
        assert.strictEqual(liveVerifyRes, null, 'verifyUserTokenWithServer trên Live phải trả về null');
        console.log('✓ [PASS] Live verifyUserTokenWithServer đã từ chối token giả mạo (trả về null).');

        // 2. Thử nghiệm Callback URL chứa token giả mạo type=signup trên Live
        console.log('\n--- 2. KIỂM THỬ CALLBACK URL VỚI TOKEN GIẢ MẠO (SIGNUP) TRÊN LIVE ---');
        await cdp.eval(`localStorage.removeItem('vivu_user_session');`);
        await cdp.eval(`window.history.pushState(null, '', '/#access_token=${encodeURIComponent(forgedJwtToken)}&type=signup&expires_in=3600');`);
        await cdp.eval(`window.ViVuApp.handleAuthUrlCallback();`);
        await sleep(400);

        const liveCleanHash = await cdp.eval(`window.location.hash;`);
        assert.strictEqual(liveCleanHash, '', 'URL hash trên Live phải bị xóa ngay');
        const liveSession = await cdp.eval(`localStorage.getItem('vivu_user_session');`);
        assert.strictEqual(liveSession, null, 'Live tuyệt đối KHÔNG cấp phiên đăng nhập cho token giả');
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'prod_live_forged_token_blocked.png'));
        console.log('✓ [PASS] Live: Đã dọn sạch URL, từ chối tạo session cho token giả mạo.');
        console.log('✓ Đã chụp ảnh: prod_live_forged_token_blocked.png');

        // 3. Thử nghiệm Callback URL chứa token giả mạo type=recovery trên Live
        console.log('\n--- 3. KIỂM THỬ CALLBACK URL VỚI TOKEN GIẢ MẠO (RECOVERY) TRÊN LIVE ---');
        await cdp.eval(`window.history.pushState(null, '', '/#access_token=${encodeURIComponent(forgedJwtToken)}&type=recovery&expires_in=3600');`);
        await cdp.eval(`window.ViVuApp.handleAuthUrlCallback();`);
        await sleep(400);

        const liveResetModalOpen = await cdp.eval(`!document.getElementById('resetPasswordModal').classList.contains('hidden');`);
        assert.strictEqual(liveResetModalOpen, false, 'Modal đặt lại mật khẩu KHÔNG được mở cho token giả mạo trên Live');
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'prod_live_invalid_recovery_blocked.png'));
        console.log('✓ [PASS] Live: Đã chặn không cho mở modal đặt lại mật khẩu khi token không hợp lệ.');
        console.log('✓ Đã chụp ảnh: prod_live_invalid_recovery_blocked.png');

        console.log('\n===============================================================');
        console.log('🎉 TOÀN BỘ KIỂM THỬ BẢO MẬT TOKEN TRÊN PRODUCTION LIVE HOÀN TẤT THÀNH CÔNG!');
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
