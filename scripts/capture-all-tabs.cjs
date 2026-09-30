/**
 * capture-all-tabs.cjs
 * Chụp ảnh 5 tab trên Mobile 390px và Desktop 1280px.
 * Đồng thời kiểm tra bố cục, tràn ngang, khoảng trắng, thanh điều hướng, cuộn trang và modal.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
};

const BRAIN_DIR = 'C:\\Users\\tienl\\.gemini\\antigravity\\brain\\2bc7252e-f998-4e30-bbb7-25edbaa0f421';
const BACKUP_ARTIFACTS = path.join(__dirname, '..', '..', '05_AGY_BRAIN_ARTIFACTS');
if (!fs.existsSync(BRAIN_DIR)) {
    try { fs.mkdirSync(BRAIN_DIR, { recursive: true }); } catch (_) {}
}
if (!fs.existsSync(BACKUP_ARTIFACTS)) {
    try { fs.mkdirSync(BACKUP_ARTIFACTS, { recursive: true }); } catch (_) {}
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
                reject(new Error(`CDP method ${method} timed out after 15000ms`));
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
            throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result?.value;
    }

    async screenshot(name) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        const buf = Buffer.from(res.data, 'base64');
        const p1 = path.join(BRAIN_DIR, name);
        const p2 = path.join(BACKUP_ARTIFACTS, name);
        fs.writeFileSync(p1, buf);
        try { fs.writeFileSync(p2, buf); } catch (_) {}
        console.log(`  📸 Đã lưu: ${name}`);
    }

    async setViewport(width, height) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 2,
            mobile: width < 768
        });
    }

    async close() {
        this.ws.close();
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
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
            const target = pages.find(p => p.url && (p.url.includes('http') || p.type === 'page'));
            if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
        } catch (_) {
            await sleep(200);
        }
    }
    throw new Error('Không thể kết nối Chrome DevTools Protocol');
}

async function run() {
    const phase = process.argv[2] || 'before';
    console.log(`=== BẮT ĐẦU CHỤP ẢNH 5 TAB TRÊN MOBILE & DESKTOP (GIAI ĐOẠN: ${phase.toUpperCase()}) ===\n`);

    let localServer;
    const serverPort = 8400 + Math.floor(Math.random() * 400);
    localServer = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/') p = '/index.html';
        const fp = path.join(__dirname, '..', p);
        if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
            res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
            res.end(fs.readFileSync(fp));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });
    await new Promise(r => localServer.listen(serverPort, r));
    console.log(`  ✓ Đã khởi chạy test server tại http://localhost:${serverPort}`);

    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));
    if (!chromeExe) throw new Error('Không tìm thấy Chrome trên hệ thống Windows');

    const chromeUserData = path.join(os.tmpdir(), 'chrome_cdp_capture_' + Date.now());
    const cdpPort = 9400 + Math.floor(Math.random() * 400);
    const chromeProc = spawn(chromeExe, [
        `--remote-debugging-port=${cdpPort}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--mute-audio',
        `--user-data-dir=${chromeUserData}`,
        `http://localhost:${serverPort}/?source=mock`
    ], { stdio: 'ignore' });

    let cdp;

    try {
        console.log('[1] Đang kết nối tới Chrome Headless CDP...');
        const wsUrl = await getDebuggerUrl(cdpPort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        // Chờ app nạp xong
        console.log('[2] Chờ ứng dụng sẵn sàng và nạp danh sách dữ liệu...');
        let ready = false;
        for (let i = 0; i < 30; i++) {
            ready = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.switchView && window.ViVuApp.state && window.ViVuApp.state.allPlaces && window.ViVuApp.state.allPlaces.length > 0)`);
            if (ready) break;
            await sleep(300);
        }
        if (!ready) throw new Error('ViVuApp chưa sẵn sàng');
        console.log('  ✓ Ứng dụng đã sẵn sàng!');

        // ==========================================
        // 1. MOBILE 390px (390 x 844)
        // ==========================================
        console.log('\n--- BẮT ĐẦU CHỤP TRÊN MOBILE (390 x 844) ---');
        await cdp.setViewport(390, 844);
        await sleep(300);

        // Tab 1: Home
        console.log('Chụp Tab 1: Trang chủ (Home)...');
        await cdp.eval(`window.ViVuApp.navGoHome()`);
        await sleep(400);
        await cdp.screenshot(`mobile_tab1_home_${phase}.png`);

        // Tab 2: Map
        console.log('Chụp Tab 2: Bản đồ (Map modal)...');
        await cdp.eval(`window.ViVuApp.navGoMap()`);
        await sleep(600);
        await cdp.screenshot(`mobile_tab2_map_${phase}.png`);
        await cdp.eval(`window.ViVuApp.closeFullMapModal()`);
        await sleep(300);

        // Tab 3: Clubs / Community
        console.log('Chụp Tab 3: Câu lạc bộ & Cộng đồng...');
        await cdp.eval(`window.ViVuApp.navGoClubs()`);
        await sleep(400);
        await cdp.screenshot(`mobile_tab3_clubs_${phase}.png`);

        // Tab 4: Saved
        console.log('Chụp Tab 4: Đã lưu (Saved collections)...');
        await cdp.eval(`window.ViVuApp.navGoSaved()`);
        await sleep(600);
        await cdp.screenshot(`mobile_tab4_saved_${phase}.png`);
        await cdp.eval(`window.ViVuApp.closeSavedCollectionsModal()`);
        await sleep(300);

        // Tab 5: Search
        console.log('Chụp Tab 5: Tìm kiếm (Search view)...');
        await cdp.eval(`window.ViVuApp.navGoSearch()`);
        await sleep(400);
        await cdp.screenshot(`mobile_tab5_search_${phase}.png`);

        // Kiểm tra tràn ngang và chèn lấp bottom nav trên Mobile
        const mobileDiagnostics = await cdp.eval(`(() => {
            const docW = document.documentElement.clientWidth;
            const scrollW = document.documentElement.scrollWidth;
            const bottomNav = document.getElementById('mobileBottomNav');
            const bottomNavRect = bottomNav ? bottomNav.getBoundingClientRect() : null;
            const bottomNavH = bottomNavRect ? bottomNavRect.height : 0;

            const mainContent = document.getElementById('mainContentArea');
            const mainStyle = mainContent ? window.getComputedStyle(mainContent) : null;
            const mainPaddingBottom = mainStyle ? parseFloat(mainStyle.paddingBottom) : 0;

            return {
                docW,
                scrollW,
                hasOverflow: scrollW > docW,
                overflowPixels: scrollW - docW,
                bottomNavHeight: bottomNavH,
                mainPaddingBottom
            };
        })()`);
        console.log('\n  Mobile Diagnostics:', mobileDiagnostics);

        // ==========================================
        // 2. DESKTOP 1280px (1280 x 800)
        // ==========================================
        console.log('\n--- BẮT ĐẦU CHỤP TRÊN DESKTOP (1280 x 800) ---');
        await cdp.setViewport(1280, 800);
        await sleep(300);

        // Tab 1: Home
        console.log('Chụp Tab 1: Trang chủ Desktop...');
        await cdp.eval(`window.ViVuApp.navGoHome()`);
        await sleep(400);
        await cdp.screenshot(`desktop_tab1_home_${phase}.png`);

        // Tab 2: Map
        console.log('Chụp Tab 2: Bản đồ Desktop...');
        await cdp.eval(`window.ViVuApp.navGoMap()`);
        await sleep(600);
        await cdp.screenshot(`desktop_tab2_map_${phase}.png`);
        await cdp.eval(`window.ViVuApp.closeFullMapModal()`);
        await sleep(300);

        // Tab 3: Clubs / Community
        console.log('Chụp Tab 3: Câu lạc bộ & Cộng đồng Desktop...');
        await cdp.eval(`window.ViVuApp.navGoClubs()`);
        await sleep(400);
        await cdp.screenshot(`desktop_tab3_clubs_${phase}.png`);

        // Tab 4: Saved
        console.log('Chụp Tab 4: Đã lưu Desktop...');
        await cdp.eval(`window.ViVuApp.navGoSaved()`);
        await sleep(600);
        await cdp.screenshot(`desktop_tab4_saved_${phase}.png`);
        await cdp.eval(`window.ViVuApp.closeSavedCollectionsModal()`);
        await sleep(300);

        // Tab 5: Search
        console.log('Chụp Tab 5: Tìm kiếm Desktop...');
        await cdp.eval(`window.ViVuApp.navGoSearch()`);
        await sleep(400);
        await cdp.screenshot(`desktop_tab5_search_${phase}.png`);

        // Desktop Diagnostics
        const desktopDiagnostics = await cdp.eval(`(() => {
            const sidebar = document.getElementById('desktopSidebar');
            const mainContent = document.getElementById('mainContentArea');
            const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : null;
            const mainRect = mainContent ? mainContent.getBoundingClientRect() : null;
            return {
                sidebarVisible: sidebar && window.getComputedStyle(sidebar).display !== 'none',
                sidebarWidth: sidebarRect ? sidebarRect.width : 0,
                mainLeft: mainRect ? mainRect.left : 0,
                mainWidth: mainRect ? mainRect.width : 0
            };
        })()`);
        console.log('\n  Desktop Diagnostics:', desktopDiagnostics);

        console.log('\n✅ ĐÃ HOÀN THÀNH CHỤP ẢNH TẤT CẢ 5 TAB TRÊN MOBILE VÀ DESKTOP!');

    } finally {
        if (cdp) await cdp.close();
        if (chromeProc) chromeProc.kill();
        if (localServer) localServer.close();
        try { fs.rmSync(chromeUserData, { recursive: true, force: true }); } catch (_) {}
    }
}

run().catch(err => {
    console.error('\n❌ LỖI:', err.message);
    process.exit(1);
});
