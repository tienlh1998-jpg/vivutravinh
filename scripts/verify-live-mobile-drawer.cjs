/**
 * scripts/verify-live-mobile-drawer.cjs
 *
 * Kiểm tra thực tế trên môi trường Production (https://vivutravinh.id.vn):
 * - Viewport mobile 390x844.
 * - Nút #mobileMenuOpenBtn kích thước >= 44x44px.
 * - Bấm nút mở menu thật qua CDP -> Drawer trượt ra, backdrop hiển thị, body khóa cuộn.
 * - Chụp ảnh màn hình Live: prod_mobile_drawer_open_390.png.
 * - Bấm chuyển sang #/about -> view about hiển thị, drawer tự đóng.
 * - Bấm mở lại, bấm Escape -> drawer đóng.
 * - Đổi sang kích thước 1280px -> desktop sidebar hiển thị, drawer đóng.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');

const ARTIFACT_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421';
const LIVE_URL = 'https://vivutravinh.id.vn';

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

    async setViewport(width, height, isMobile = false) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: isMobile ? 2 : 1,
            mobile: isMobile
        });
    }

    async captureScreenshot(outputPath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    }

    async close() {
        this.ws.close();
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

async function runLiveVerification() {
    console.log('================================================================================');
    console.log(' BẮT ĐẦU KIỂM THỬ TRỰC TIẾP TRÊN PRODUCTION VIVUTRAVINH.ID.VN');
    console.log('================================================================================\n');

    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));
    if (!chromeExe) throw new Error('Không tìm thấy Chrome');

    const tempDir = path.join(os.tmpdir(), 'chrome_live_drawer_' + Date.now());
    const cdpPort = 9560 + Math.floor(Math.random() * 200);
    const chrome = spawn(chromeExe, [
        `--remote-debugging-port=${cdpPort}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--mute-audio',
        `--user-data-dir=${tempDir}`,
        `${LIVE_URL}/?nocache=${Date.now()}`
    ], { stdio: 'ignore' });

    let cdp;
    try {
        const wsUrl = await getDebuggerUrl(cdpPort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        await cdp.setViewport(390, 844, true);

        // Chờ app live load xong
        let ready = false;
        for (let i = 0; i < 40; i++) {
            ready = await cdp.eval(`Boolean(
                window.ViVuApp &&
                window.ViVuApp.openMobileDrawer &&
                document.getElementById('mobileMenuOpenBtn')
            )`);
            if (ready) break;
            await sleep(300);
        }
        if (!ready) throw new Error('Trang production chưa cập nhật xong hoặc thiếu mobileMenuOpenBtn');
        console.log('  ✓ Đã kết nối thành công đến Production https://vivutravinh.id.vn!\n');

        // 1. Kiểm tra kích thước nút mở menu trên header
        const btnRect = await cdp.eval(`(() => {
            const btn = document.getElementById('mobileMenuOpenBtn');
            const rect = btn.getBoundingClientRect();
            return {
                width: rect.width,
                height: rect.height,
                ariaLabel: btn.getAttribute('aria-label')
            };
        })()`);
        assert.ok(btnRect.width >= 44, `Nút mở menu width >= 44px (thực tế: ${btnRect.width}px)`);
        assert.ok(btnRect.height >= 44, `Nút mở menu height >= 44px (thực tế: ${btnRect.height}px)`);
        assert.strictEqual(btnRect.ariaLabel, 'Mở danh mục');
        console.log(`  ✓ [PROD] Nút mở menu: ${btnRect.width}x${btnRect.height}px, aria-label="${btnRect.ariaLabel}"`);

        // 2. Click nút mở menu thật
        const debugBefore = await cdp.eval(`(() => {
            const btn = document.getElementById('mobileMenuOpenBtn');
            const drawer = document.getElementById('mobileDrawerNav');
            return {
                hasBtn: Boolean(btn),
                btnOnclick: btn ? btn.getAttribute('onclick') : null,
                hasOpenFn: typeof window.ViVuApp?.openMobileDrawer,
                drawerInertBefore: drawer ? drawer.hasAttribute('inert') : null,
                drawerClassBefore: drawer ? drawer.className : null
            };
        })()`);
        console.log('  [DEBUG BEFORE CLICK]', debugBefore);

        await cdp.eval(`document.getElementById('mobileMenuOpenBtn').click()`);
        await sleep(500);

        const debugAfter = await cdp.eval(`(() => {
            const drawer = document.getElementById('mobileDrawerNav');
            return {
                drawerInertAfter: drawer ? drawer.hasAttribute('inert') : null,
                drawerClassAfter: drawer ? drawer.className : null
            };
        })()`);
        console.log('  [DEBUG AFTER CLICK]', debugAfter);

        const drawerOpened = await cdp.eval(`(() => {
            const drawer = document.getElementById('mobileDrawerNav');
            const backdrop = document.getElementById('mobileDrawerBackdrop');
            const rect = drawer.getBoundingClientRect();
            return {
                left: rect.left,
                width: rect.width,
                hasInert: drawer.hasAttribute('inert'),
                scrollLock: document.body.classList.contains('overflow-hidden')
            };
        })()`);
        assert.strictEqual(drawerOpened.left, 0, 'Drawer trên live phải trượt vào lề trái (left === 0)');
        assert.strictEqual(drawerOpened.hasInert, false, 'Drawer inert phải bị gỡ khi mở');
        assert.strictEqual(drawerOpened.scrollLock, true, 'Body trên live phải khóa cuộn khi mở');
        console.log(`  ✓ [PROD] Mở Drawer thành công: left=0px, width=${drawerOpened.width}px, scrollLock=true`);

        // 3. Chụp ảnh màn hình Live Production
        const prodShotPath = path.join(ARTIFACT_DIR, 'prod_mobile_drawer_open_390.png');
        await cdp.captureScreenshot(prodShotPath);
        console.log(`  ✓ [PROD] Đã chụp ảnh màn hình Live: ${prodShotPath}`);

        // 4. Click mục "Về dự án & Kế hoạch" (#drawerLinkAbout)
        await cdp.eval(`document.getElementById('drawerLinkAbout').click()`);
        await sleep(500);

        const aboutState = await cdp.eval(`(() => {
            const vAbout = document.getElementById('view-about');
            const drawer = document.getElementById('mobileDrawerNav');
            return {
                hash: window.location.hash,
                aboutVisible: Boolean(vAbout && !vAbout.classList.contains('hidden')),
                drawerClosed: drawer.getBoundingClientRect().right <= 0,
                scrollLock: document.body.classList.contains('overflow-hidden')
            };
        })()`);
        assert.strictEqual(aboutState.hash, '#/about', 'Hash phải là #/about');
        assert.strictEqual(aboutState.aboutVisible, true, 'View About phải hiển thị');
        assert.strictEqual(aboutState.drawerClosed, true, 'Drawer phải tự đóng sau khi click');
        assert.strictEqual(aboutState.scrollLock, false, 'Body scroll-lock phải được gỡ bỏ');
        console.log(`  ✓ [PROD] Điều hướng #/about: Hash=${aboutState.hash}, AboutVisible=true, DrawerClosed=true`);

        // 5. Mở lại và đóng bằng Backdrop
        await cdp.eval(`document.getElementById('mobileMenuOpenBtn').click()`);
        await sleep(350);
        await cdp.eval(`document.getElementById('mobileDrawerBackdrop').click()`);
        await sleep(350);
        const closedByBackdrop = await cdp.eval(`document.getElementById('mobileDrawerNav').getBoundingClientRect().right <= 0`);
        assert.strictEqual(closedByBackdrop, true, 'Drawer đóng khi click backdrop trên live');
        console.log(`  ✓ [PROD] Đóng drawer bằng Backdrop thành công`);

        // 6. Mở lại và đóng bằng Escape
        await cdp.eval(`document.getElementById('mobileMenuOpenBtn').click()`);
        await sleep(350);
        await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await sleep(350);
        const closedByEscape = await cdp.eval(`document.getElementById('mobileDrawerNav').getBoundingClientRect().right <= 0`);
        assert.strictEqual(closedByEscape, true, 'Drawer đóng khi bấm phím Escape trên live');
        console.log(`  ✓ [PROD] Đóng drawer bằng phím Escape thành công`);

        // 7. Mở drawer rồi resize sang Desktop 1280px
        await cdp.eval(`document.getElementById('mobileMenuOpenBtn').click()`);
        await sleep(350);
        await cdp.setViewport(1280, 800, false);
        await sleep(350);

        const desktopProdState = await cdp.eval(`(() => {
            const drawer = document.getElementById('mobileDrawerNav');
            const sidebar = document.getElementById('appSidebarNav');
            return {
                drawerClosed: drawer.getBoundingClientRect().right <= 0,
                sidebarVisible: window.getComputedStyle(sidebar).display !== 'none',
                scrollLock: document.body.classList.contains('overflow-hidden')
            };
        })()`);
        assert.strictEqual(desktopProdState.drawerClosed, true);
        assert.strictEqual(desktopProdState.sidebarVisible, true);
        assert.strictEqual(desktopProdState.scrollLock, false);
        console.log(`  ✓ [PROD] Resize sang Desktop 1280px: Drawer đóng sạch sẽ, Desktop Sidebar hiển thị, scrollLock=false`);

        console.log('\n================================================================================');
        console.log(' TOÀN BỘ KIỂM THỬ TRÊN PRODUCTION VIVUTRAVINH.ID.VN ĐÃ HOÀN TẤT THÀNH CÔNG! ');
        console.log('================================================================================\n');

    } finally {
        if (cdp) await cdp.close().catch(() => {});
        chrome.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
}

runLiveVerification().catch(err => {
    console.error('LỖI KIỂM THỬ LIVE:', err);
    process.exit(1);
});
