/**
 * verify-view-router.cjs
 * Bộ kiểm thử tự động toàn diện cho hệ thống điều hướng theo View (View-Based Router) của ViVuTraVinh
 *
 * Kiểm tra các tiêu chí nghiệm thu nghiêm ngặt:
 * 1. Khởi động mặc định: View Home hiển thị, các view khác ẩn, Tab Home active.
 * 2. Chuỗi điều hướng xuôi Home → Community → Search: URL hash, view hiển thị, tab active luôn đồng bộ 100%.
 * 3. Chuỗi điều hướng ngược Browser Back: Search → Community → Home theo đúng thứ tự lịch sử, URL + view + tab khớp hoàn toàn.
 * 4. Chuỗi điều hướng tới Browser Forward: Home → Community → Search đi lại đúng chiều, URL + view + tab khớp hoàn toàn.
 * 5. Chuyển đổi trực tiếp Map ↔ Saved: Luôn đảm bảo chỉ DUY NHẤT một modal mở tại một thời điểm (Mutual Exclusion).
 * 6. Đóng modal qua nút đóng: Khôi phục chính xác base view nền trước đó, URL hash và tab active của base view.
 * 7. Điều hướng Back / Forward qua Modals: Khôi phục chính xác base view nền khi lùi khỏi modal.
 * 8. Tương thích ngược với hash cũ (#festivals) và điều hướng theo section (navGoSection).
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

const ARTIFACT_DIR = path.join(__dirname, '..', '..', '05_AGY_BRAIN_ARTIFACTS');
if (!fs.existsSync(ARTIFACT_DIR)) {
    try { fs.mkdirSync(ARTIFACT_DIR, { recursive: true }); } catch (_) {}
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

    async screenshot(filePath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    }

    async setViewport(width, height) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 1,
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

/**
 * Lấy toàn diện trạng thái view, URL hash, active modal và active tab
 */
async function getAppState(cdp) {
    return await cdp.eval(`(() => {
        const vHome = document.getElementById('view-home');
        const vClubs = document.getElementById('view-clubs');
        const vComm = document.getElementById('view-community');
        const vBlog = document.getElementById('view-blog');
        const vEvents = document.getElementById('view-events');
        const vSearch = document.getElementById('view-search');
        const mapModal = document.getElementById('fullMapModal');
        const savedModal = document.getElementById('savedCollectionsModal');
        const tabHome = document.getElementById('tabNavHome');
        const tabMap = document.getElementById('tabNavMap');
        const tabClubs = document.getElementById('tabNavClubs');
        const tabSaved = document.getElementById('tabNavSaved');
        const tabSearch = document.getElementById('tabNavSearch');

        const isMapOpen = Boolean(mapModal && !mapModal.classList.contains('hidden'));
        const isSavedOpen = Boolean(savedModal && !savedModal.classList.contains('hidden'));

        return {
            activeView: window.ViVuApp.getActiveView ? window.ViVuApp.getActiveView() : null,
            hash: window.location.hash || '',
            pathname: window.location.pathname || '',
            views: {
                home: Boolean(vHome && !vHome.classList.contains('hidden')),
                clubs: Boolean(vClubs && !vClubs.classList.contains('hidden')),
                community: Boolean(vComm && !vComm.classList.contains('hidden')),
                blog: Boolean(vBlog && !vBlog.classList.contains('hidden')),
                events: Boolean(vEvents && !vEvents.classList.contains('hidden')),
                search: Boolean(vSearch && !vSearch.classList.contains('hidden'))
            },
            modals: {
                map: isMapOpen,
                saved: isSavedOpen
            },
            openModalCount: (isMapOpen ? 1 : 0) + (isSavedOpen ? 1 : 0),
            tabs: {
                home: Boolean(tabHome && tabHome.classList.contains('font-bold') && !tabHome.classList.contains('text-on-surface-variant')),
                map: Boolean(tabMap && tabMap.classList.contains('font-bold') && !tabMap.classList.contains('text-on-surface-variant')),
                clubs: Boolean(tabClubs && tabClubs.classList.contains('font-bold') && !tabClubs.classList.contains('text-on-surface-variant')),
                saved: Boolean(tabSaved && tabSaved.classList.contains('font-bold') && !tabSaved.classList.contains('text-on-surface-variant')),
                search: Boolean(tabSearch && tabSearch.classList.contains('font-bold') && !tabSearch.classList.contains('text-on-surface-variant'))
            }
        };
    })()`);
}

/**
 * Kiểm tra xác thực trạng thái app với thông báo lỗi chi tiết
 */
function assertState(state, expected, stepName) {
    if (expected.activeView && state.activeView !== expected.activeView) {
        throw new Error(`[${stepName}] Sai activeView: mong đợi "${expected.activeView}", thực tế "${state.activeView}"`);
    }
    if (expected.hash !== undefined) {
        const expectedHashes = Array.isArray(expected.hash) ? expected.hash : [expected.hash];
        if (!expectedHashes.includes(state.hash)) {
            throw new Error(`[${stepName}] Sai URL Hash: mong đợi ${JSON.stringify(expected.hash)}, thực tế "${state.hash}"`);
        }
    }
    if (expected.views) {
        for (const [view, isVisible] of Object.entries(expected.views)) {
            if (state.views[view] !== isVisible) {
                throw new Error(`[${stepName}] View container "${view}" sai trạng thái: mong đợi ${isVisible ? 'hiện (không hidden)' : 'ẩn (có hidden)'}, thực tế ${state.views[view] ? 'hiện' : 'ẩn'}`);
            }
        }
    }
    if (expected.modals) {
        for (const [modal, isOpen] of Object.entries(expected.modals)) {
            if (state.modals[modal] !== isOpen) {
                throw new Error(`[${stepName}] Modal "${modal}" sai trạng thái: mong đợi ${isOpen ? 'mở' : 'đóng'}, thực tế ${state.modals[modal] ? 'mở' : 'đóng'}`);
            }
        }
    }
    if (expected.maxOpenModals !== undefined) {
        if (state.openModalCount > expected.maxOpenModals) {
            throw new Error(`[${stepName}] Vi phạm Mutual Exclusion: có ${state.openModalCount} modal cùng mở (tối đa cho phép: ${expected.maxOpenModals})`);
        }
    }
    if (expected.activeTab) {
        for (const [tab, isActive] of Object.entries(state.tabs)) {
            const expectedActive = (tab === expected.activeTab);
            if (isActive !== expectedActive) {
                throw new Error(`[${stepName}] Tab BottomNav "${tab}" sai trạng thái: mong đợi ${expectedActive ? 'active (text-primary)' : 'inactive'}, thực tế ${isActive ? 'active' : 'inactive'}`);
            }
        }
    }
    console.log(`  ✓ [${stepName}] PASS: View=${state.activeView}, Hash="${state.hash}", Tab=${expected.activeTab || 'N/A'}, Modals(open)=${state.openModalCount}`);
}

async function run() {
    console.log('=== BẮT ĐẦU KIỂM THỬ ĐIỀU HƯỚNG THEO VIEW (VIEW-BASED ROUTER) ===\n');

    let localServer;
    const serverPort = 8000 + Math.floor(Math.random() * 800);
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

    const chromeUserData = path.join(os.tmpdir(), 'chrome_cdp_router_' + Date.now());
    const cdpPort = 9300 + Math.floor(Math.random() * 500);
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
        if (!ready) throw new Error('ViVuApp chưa sẵn sàng hoặc thiếu phương thức router');
        console.log('  ✓ Ứng dụng đã sẵn sàng với View Router!');

        // [3] KIỂM THỬ KHỞI ĐỘNG MẶC ĐỊNH (HOME VIEW)
        console.log('\n[3] KIỂM THỬ TRẠNG THÁI KHỞI TẠO MẶC ĐỊNH (VIEW HOME):');
        const stateInitial = await getAppState(cdp);
        assertState(stateInitial, {
            activeView: 'home',
            hash: ['', '#/home', '#'],
            views: { home: true, community: false, search: false },
            modals: { map: false, saved: false },
            maxOpenModals: 0,
            activeTab: 'home'
        }, 'Khởi tạo mặc định');

        // [4] KIỂM THỬ CHUỖI ĐIỀU HƯỚNG TIẾN: HOME → COMMUNITY → SEARCH
        console.log('\n[4] KIỂM THỬ CHUỖI ĐIỀU HƯỚNG TIẾN (Home → Community → Search):');
        // Bước 4a: Chuyển sang Community
        await cdp.eval(`window.ViVuApp.navGoCommunity()`);
        await sleep(300);
        const stateComm = await getAppState(cdp);
        assertState(stateComm, {
            activeView: 'community',
            hash: '#/community',
            views: { home: false, community: true, search: false },
            modals: { map: false, saved: false },
            activeTab: 'clubs'
        }, 'Chuyển sang Community');

        // Bước 4b: Chuyển sang Search
        await cdp.eval(`window.ViVuApp.navGoSearch()`);
        await sleep(300);
        const stateSearch = await getAppState(cdp);
        assertState(stateSearch, {
            activeView: 'search',
            hash: '#/search',
            views: { home: false, community: false, search: true },
            modals: { map: false, saved: false },
            activeTab: 'search'
        }, 'Chuyển sang Search');

        const placesCount = await cdp.eval(`document.querySelectorAll('#placesDiscoveryGrid .place-card').length`);
        if (placesCount < 5) {
            throw new Error(`Thiếu thẻ địa điểm trong Search Grid: ${placesCount}`);
        }
        console.log(`  ✓ Thẻ địa điểm trong Search view hiển thị đầy đủ: ${placesCount} thẻ.`);

        // [5] KIỂM THỬ CHUỖI ĐIỀU HƯỚNG LÙI BROWSER BACK: SEARCH → COMMUNITY → HOME
        console.log('\n[5] KIỂM THỬ CHUỖI ĐIỀU HƯỚNG LÙI BROWSER BACK (Search → Community → Home):');
        // Bước 5a: Back lần 1 (Search -> Community)
        await cdp.eval(`window.history.back()`);
        await sleep(400);
        const stateBack1 = await getAppState(cdp);
        assertState(stateBack1, {
            activeView: 'community',
            hash: '#/community',
            views: { home: false, community: true, search: false },
            modals: { map: false, saved: false },
            activeTab: 'clubs'
        }, 'Browser Back lần 1 (Search → Community)');

        // Bước 5b: Back lần 2 (Community -> Home)
        await cdp.eval(`window.history.back()`);
        await sleep(400);
        const stateBack2 = await getAppState(cdp);
        assertState(stateBack2, {
            activeView: 'home',
            hash: ['', '#/home', '#'],
            views: { home: true, community: false, search: false },
            modals: { map: false, saved: false },
            activeTab: 'home'
        }, 'Browser Back lần 2 (Community → Home)');

        // [6] KIỂM THỬ CHUỖI ĐIỀU HƯỚNG TỚI BROWSER FORWARD: HOME → COMMUNITY → SEARCH
        console.log('\n[6] KIỂM THỬ CHUỖI ĐIỀU HƯỚNG TỚI BROWSER FORWARD (Home → Community → Search):');
        // Bước 6a: Forward lần 1 (Home -> Community)
        await cdp.eval(`window.history.forward()`);
        await sleep(400);
        const stateFwd1 = await getAppState(cdp);
        assertState(stateFwd1, {
            activeView: 'community',
            hash: '#/community',
            views: { home: false, community: true, search: false },
            modals: { map: false, saved: false },
            activeTab: 'clubs'
        }, 'Browser Forward lần 1 (Home → Community)');

        // Bước 6b: Forward lần 2 (Community -> Search)
        await cdp.eval(`window.history.forward()`);
        await sleep(400);
        const stateFwd2 = await getAppState(cdp);
        assertState(stateFwd2, {
            activeView: 'search',
            hash: '#/search',
            views: { home: false, community: false, search: true },
            modals: { map: false, saved: false },
            activeTab: 'search'
        }, 'Browser Forward lần 2 (Community → Search)');

        // [7] KIỂM THỬ CHUYỂN ĐỔI TRỰC TIẾP MAP ↔ SAVED (MUTUAL EXCLUSION)
        console.log('\n[7] KIỂM THỬ CHUYỂN ĐỔI TRỰC TIẾP MAP ↔ SAVED (MUTUAL EXCLUSION):');
        // Đang ở Search view (base view = 'search')
        // Bước 7a: Mở Map modal
        await cdp.eval(`window.ViVuApp.navGoMap()`);
        await sleep(300);
        const stateMap1 = await getAppState(cdp);
        assertState(stateMap1, {
            hash: '#/map',
            modals: { map: true, saved: false },
            maxOpenModals: 1,
            activeTab: 'map'
        }, 'Mở Modal Bản đồ (#/map)');

        // Bước 7b: Chuyển trực tiếp sang Saved modal (Map phải đóng ngay lập tức)
        await cdp.eval(`window.ViVuApp.navGoSaved()`);
        await sleep(300);
        const stateSaved1 = await getAppState(cdp);
        assertState(stateSaved1, {
            hash: '#/saved',
            modals: { map: false, saved: true },
            maxOpenModals: 1,
            activeTab: 'saved'
        }, 'Chuyển trực tiếp Map → Saved (#/saved)');

        // Bước 7c: Chuyển trực tiếp ngược lại Map modal (Saved phải đóng ngay lập tức)
        await cdp.eval(`window.ViVuApp.navGoMap()`);
        await sleep(300);
        const stateMap2 = await getAppState(cdp);
        assertState(stateMap2, {
            hash: '#/map',
            modals: { map: true, saved: false },
            maxOpenModals: 1,
            activeTab: 'map'
        }, 'Chuyển trực tiếp Saved → Map (#/map)');

        // [8] KIỂM THỬ ĐÓNG MODAL QUA NÚT CLOSE KHÔI PHỤC ĐÚNG VIEW NỀN
        console.log('\n[8] KIỂM THỬ ĐÓNG MODAL KHÔI PHỤC BASE VIEW NỀN:');
        await cdp.eval(`window.ViVuApp.closeFullMapModal()`);
        await sleep(300);
        const stateAfterMapClose = await getAppState(cdp);
        assertState(stateAfterMapClose, {
            activeView: 'search',
            hash: '#/search',
            views: { home: false, community: false, search: true },
            modals: { map: false, saved: false },
            maxOpenModals: 0,
            activeTab: 'search'
        }, 'Đóng Bản đồ khôi phục Search view nền');

        // [9] KIỂM THỬ BROWSER BACK / FORWARD QUA MODAL KHÔI PHỤC BASE VIEW NỀN
        console.log('\n[9] KIỂM THỬ BROWSER BACK / FORWARD QUA MODAL:');
        // Mở Map, sau đó mở Saved
        await cdp.eval(`window.ViVuApp.navGoMap()`);
        await sleep(300);
        await cdp.eval(`window.ViVuApp.navGoSaved()`);
        await sleep(300);

        // Đang ở #/saved (modal saved mở, map đóng)
        const stateBeforeModalBack = await getAppState(cdp);
        assertState(stateBeforeModalBack, {
            hash: '#/saved',
            modals: { map: false, saved: true },
            maxOpenModals: 1,
            activeTab: 'saved'
        }, 'Trước khi Back từ Modal (Saved mở)');

        // Back lần 1: Lùi về #/map (Saved đóng, Map mở)
        await cdp.eval(`window.history.back()`);
        await sleep(400);
        const stateModalBack1 = await getAppState(cdp);
        assertState(stateModalBack1, {
            hash: '#/map',
            modals: { map: true, saved: false },
            maxOpenModals: 1,
            activeTab: 'map'
        }, 'Back từ Saved về Map (#/map)');

        // Back lần 2: Lùi về base view Search (Cả 2 modal đóng, base view Search hiển thị)
        await cdp.eval(`window.history.back()`);
        await sleep(400);
        const stateModalBack2 = await getAppState(cdp);
        assertState(stateModalBack2, {
            activeView: 'search',
            hash: '#/search',
            views: { home: false, community: false, search: true },
            modals: { map: false, saved: false },
            maxOpenModals: 0,
            activeTab: 'search'
        }, 'Back từ Map về Search base view nền (#/search)');

        // Forward lần 1: Tiến vào lại #/map (Map mở, Saved đóng)
        await cdp.eval(`window.history.forward()`);
        await sleep(400);
        const stateModalFwd1 = await getAppState(cdp);
        assertState(stateModalFwd1, {
            hash: '#/map',
            modals: { map: true, saved: false },
            maxOpenModals: 1,
            activeTab: 'map'
        }, 'Forward từ Search vào Map (#/map)');

        // Forward lần 2: Tiến vào #/saved (Saved mở, Map đóng)
        await cdp.eval(`window.history.forward()`);
        await sleep(400);
        const stateModalFwd2 = await getAppState(cdp);
        assertState(stateModalFwd2, {
            hash: '#/saved',
            modals: { map: false, saved: true },
            maxOpenModals: 1,
            activeTab: 'saved'
        }, 'Forward từ Map vào Saved (#/saved)');

        // Lùi 2 bước để trở về Search view nền chuẩn
        await cdp.eval(`window.history.back()`);
        await sleep(300);
        await cdp.eval(`window.history.back()`);
        await sleep(300);

        // [10] KIỂM THỬ ĐIỀU HƯỚNG HASH TƯƠNG THÍCH NGƯỢC (#festivals) VÀ TÁCH BIỆT CLB / EVENTS
        console.log('\n[10] KIỂM THỬ HASH NAVIGATION TƯƠNG THÍCH NGƯỢC (#festivals):');
        await cdp.eval(`window.location.hash = '#festivals'`);
        await sleep(400);
        const stateFestivals = await getAppState(cdp);
        assertState(stateFestivals, {
            activeView: 'events',
            views: { home: false, community: false, events: true, search: false },
            modals: { map: false, saved: false },
            activeTab: 'clubs'
        }, 'Hash #festivals kích hoạt Events view độc lập');

        // [10b] KIỂM THỬ TÁCH BIỆT TUYỆT ĐỐI CÂU LẠC BỘ (CLUBS) VÀ SỰ KIỆN (EVENTS)
        console.log('\n[10b] KIỂM THỬ TÁCH BIỆT TUYỆT ĐỐI CÂU LẠC BỘ VÀ SỰ KIỆN:');
        await cdp.eval(`window.ViVuApp.navGoClubs()`);
        await sleep(300);
        const stateClubsOnly = await getAppState(cdp);
        assertState(stateClubsOnly, {
            activeView: 'clubs',
            hash: '#/clubs',
            views: { home: false, clubs: true, community: false, events: false, search: false }
        }, 'navGoClubs kích hoạt Clubs, ẩn hoàn toàn Events');

        await cdp.eval(`window.ViVuApp.navGoEvents()`);
        await sleep(300);
        const stateEventsOnly = await getAppState(cdp);
        assertState(stateEventsOnly, {
            activeView: 'events',
            hash: '#/events',
            views: { home: false, community: false, events: true, search: false }
        }, 'navGoEvents kích hoạt Events, ẩn hoàn toàn Community');

        // [11] KIỂM THỬ PHƯƠNG THỨC navGoSection VÀ CẬP NHẬT URL TƯƠNG ỨNG
        console.log('\n[11] KIỂM THỬ PHƯƠNG THỨC navGoSection VÀ CẬP NHẬT URL:');
        await cdp.eval(`window.ViVuApp.navGoSection('tourItinerariesSection')`);
        await sleep(400);
        const stateTourSection = await getAppState(cdp);

        // Khẳng định chắc chắn URL không còn là #festivals
        if (stateTourSection.hash === '#festivals' || stateTourSection.hash === '#/festivals') {
            throw new Error(`[navGoSection] LỖI: URL vẫn giữ nguyên là "${stateTourSection.hash}", chưa cập nhật URL tương ứng của Tour!`);
        }

        assertState(stateTourSection, {
            activeView: 'home',
            hash: ['#tours', '#/tours'],
            views: { home: true, community: false, search: false },
            modals: { map: false, saved: false },
            activeTab: 'home'
        }, 'navGoSection kích hoạt Home view chứa tours và cập nhật URL #tours');
        console.log(`  ✓ URL Hash đã chuyển đổi chuẩn xác từ #festivals sang "${stateTourSection.hash}"!`);

        // [12] KIỂM THỬ RELOAD TRANG TẠI URL #tours (ĐỒNG BỘ GỘP VIEW PLANNER)
        console.log('\n[12] KIỂM THỬ RELOAD TRANG TẠI URL #tours:');
        await cdp.send('Page.reload');
        await sleep(500);

        let reloadReady = false;
        for (let i = 0; i < 30; i++) {
            reloadReady = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.switchView && window.ViVuApp.state && window.ViVuApp.state.allPlaces && window.ViVuApp.state.allPlaces.length > 0)`);
            if (reloadReady) break;
            await sleep(300);
        }
        if (!reloadReady) throw new Error('Ứng dụng không sẵn sàng sau khi reload trang');

        const stateAfterReload = await getAppState(cdp);
        if (stateAfterReload.hash === '#festivals' || stateAfterReload.hash === '#/festivals') {
            throw new Error(`[Reload Test] LỖI: URL sau reload bị đổi lại thành "${stateAfterReload.hash}"!`);
        }

        assertState(stateAfterReload, {
            activeView: 'planner',
            hash: ['#tours', '#/tours'],
            modals: { map: false, saved: false }
        }, 'Reload trang mở đúng Planner view (Tab Lịch trình gợi ý) và giữ URL #tours');

        const plannerTab = await cdp.eval(`window.ViVuApp.state.plannerCurrentTab`);
        if (plannerTab !== 'suggested') throw new Error(`Tab lịch trình không đúng: mong đợi "suggested", thực tế "${plannerTab}"`);
        console.log('  ✓ Sau reload trang #tours, view Planner và tab Lịch trình gợi ý được khôi phục 100% chuẩn xác!');

        // Chụp ảnh giao diện kết thúc
        const finalShot = path.join(ARTIFACT_DIR, 'view-router-verified.png');
        await cdp.screenshot(finalShot);
        console.log(`\n  📸 Đã chụp ảnh minh chứng: ${finalShot}`);

        console.log('\n======================================================');
        console.log('✅ TẤT CẢ CÁC CA KIỂM THỬ VIEW ROUTER ĐẠT 100% PASS!');
        console.log('======================================================\n');

    } finally {
        if (cdp) await cdp.close();
        if (chromeProc) chromeProc.kill();
        if (localServer) localServer.close();
        try { fs.rmSync(chromeUserData, { recursive: true, force: true }); } catch (_) {}
    }
}

run().catch(err => {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err.message);
    process.exit(1);
});
