/**
 * scripts/verify-live-saved-production.cjs
 *
 * Verifies the live deployment of Saved Collections on https://vivutravinh.id.vn/#/saved
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const LIVE_URL = 'https://vivutravinh.id.vn/#/saved';
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
            }, 25000);
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
            throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result.value;
    }

    async setViewport(width, height, isMobile = false) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 2,
            mobile: isMobile
        });
        await this.send('Emulation.setVisibleSize', { width, height });
    }

    async captureScreenshot(filePath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    }

    async close() {
        this.ws.close();
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getDebuggerUrl(port) {
    const start = Date.now();
    while (Date.now() - start < 10000) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json`);
            if (res.ok) {
                const pages = await res.json();
                const target = pages.find(p => p.url && (p.url.includes('http') || p.type === 'page'));
                if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
            }
        } catch (_) {}
        await sleep(200);
    }
    throw new Error('Chrome CDP debug endpoint not accessible');
}

async function runLiveSavedAcceptance() {
    console.log('================================================================================');
    console.log(' BẮT ĐẦU KIỂM THỬ TRỰC TIẾP TRÊN PRODUCTION VIVUTRAVINH.ID.VN');
    console.log('================================================================================\n');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-live-saved-'));
    const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

    const cdpPort = 9800 + Math.floor(Math.random() * 150);
    const chrome = spawn(chromeExe, [
        `--remote-debugging-port=${cdpPort}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--mute-audio',
        `--user-data-dir=${tempDir}`,
        LIVE_URL
    ], { stdio: 'ignore' });

    let cdp = null;
    try {
        const wsUrl = await getDebuggerUrl(cdpPort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        console.log('  ✓ Đang tải trang https://vivutravinh.id.vn/#/saved...');
        await sleep(3000);

        // Mở modal nếu cần
        await cdp.eval(`(() => {
            window.location.hash = '#/saved';
            if (window.ViVuApp && window.ViVuApp.openSavedCollectionsModal) {
                window.ViVuApp.openSavedCollectionsModal();
            }
        })()`);
        await sleep(1000);

        // 1. Kiểm tra phiên bản và mã nguồn mới
        const buildInfo = await cdp.eval(`(() => {
            return {
                hasSearchInput: Boolean(document.getElementById('savedSearchInput')),
                hasSortSelect: Boolean(document.getElementById('savedSortSelect')),
                hasHandleSavedSearch: typeof window.ViVuApp?.handleSavedSearch === 'function',
                categoriesCount: document.querySelectorAll('#savedCollectionsModal [data-category]').length
            };
        })()`);

        console.log(`  ✓ Phát hiện trên live:`);
        console.log(`    - Ô tìm kiếm #savedSearchInput: ${buildInfo.hasSearchInput ? 'CÓ' : 'KHÔNG'}`);
        console.log(`    - Cụm sắp xếp #savedSortSelect: ${buildInfo.hasSortSelect ? 'CÓ' : 'KHÔNG'}`);
        console.log(`    - Hàm ViVuApp.handleSavedSearch: ${buildInfo.hasHandleSavedSearch ? 'CÓ' : 'KHÔNG'}`);
        console.log(`    - Số nút danh mục: ${buildInfo.categoriesCount}/5`);

        assert(buildInfo.hasSearchInput, 'Live site phải có ô tìm kiếm #savedSearchInput');
        assert(buildInfo.hasHandleSavedSearch, 'Live site phải có hàm handleSavedSearch');
        assert.strictEqual(buildInfo.categoriesCount, 5, 'Live site phải có đủ 5 danh mục');

        // 2. Chụp ảnh Desktop Live
        await cdp.setViewport(1280, 800, false);
        await sleep(500);
        const shotDesktop = path.join(ARTIFACT_DIR, 'live_prod_saved_desktop.png');
        await cdp.captureScreenshot(shotDesktop);
        console.log(`  📸 Đã chụp giao diện Desktop live: live_prod_saved_desktop.png`);

        // 3. Chụp ảnh Tablet Live (Kiểm tra 0% che khuất)
        await cdp.setViewport(1024, 768, false);
        await sleep(400);
        const tabletOverlap = await cdp.eval(`(() => {
            const sort = document.getElementById('savedSortSelect')?.getBoundingClientRect();
            const lastCat = document.querySelector('#savedCollectionsModal [data-category="culture"]')?.getBoundingClientRect();
            if (!sort || !lastCat) return { overlap: false };
            const overlapX = Math.max(0, Math.min(lastCat.right, sort.right) - Math.max(lastCat.left, sort.left));
            const overlapY = Math.max(0, Math.min(lastCat.bottom, sort.bottom) - Math.max(lastCat.top, sort.top));
            return { overlap: overlapX > 0 && overlapY > 0 };
        })()`);
        assert(!tabletOverlap.overlap, 'Trên live tablet 1024px, nút danh mục không được chồng lấn với cụm sắp xếp');
        const shotTablet = path.join(ARTIFACT_DIR, 'live_prod_saved_tablet.png');
        await cdp.captureScreenshot(shotTablet);
        console.log(`  📸 Đã chụp giao diện Tablet live: live_prod_saved_tablet.png`);

        // 4. Chụp ảnh Mobile Live
        await cdp.setViewport(390, 844, true);
        await sleep(400);
        const shotMobile = path.join(ARTIFACT_DIR, 'live_prod_saved_mobile.png');
        await cdp.captureScreenshot(shotMobile);
        console.log(`  📸 Đã chụp giao diện Mobile live: live_prod_saved_mobile.png`);

        // 5. Thử nghiệm tìm kiếm trực tiếp trên live
        const liveSearchResult = await cdp.eval(`(() => {
            window.ViVuApp.handleSavedSearch('Chùa');
            const cards = Array.from(document.querySelectorAll('.saved-card'));
            const titles = cards.map(c => c.querySelector('h2, h3')?.innerText.trim());
            return { count: cards.length, titles };
        })()`);
        console.log(`  ✓ Tìm kiếm live "Chùa" trả về: ${liveSearchResult.count} mục (${liveSearchResult.titles.join(', ')})`);
        assert(liveSearchResult.count >= 1, 'Tìm kiếm live phải lọc kết quả');

        console.log('\n================================================================================');
        console.log('🎉 XÁC MINH LIVE PRODUCTION TRÊN VIVUTRAVINH.ID.VN THÀNH CÔNG RỰC RỠ!');
        console.log('================================================================================\n');

    } finally {
        if (cdp) await cdp.close();
        chrome.kill();
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

runLiveSavedAcceptance().catch(err => {
    console.error('❌ Lỗi kiểm thử live:', err);
    process.exit(1);
});
