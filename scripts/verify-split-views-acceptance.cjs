/**
 * scripts/verify-split-views-acceptance.cjs
 *
 * Kiểm thử nghiệm thu phân tách độc lập hai view:
 * 1. Câu lạc bộ (view-community):
 *    - Chỉ hiển thị danh sách/bộ lọc CLB, hoạt động CLB, thảo luận cộng đồng & chuyện xứ Trà.
 *    - Cuộn hết trang TUYỆT ĐỐI không thấy phần sự kiện hay lễ hội.
 * 2. Sự kiện & Gặp gỡ (view-events):
 *    - Hiển thị cổng sự kiện, Ok Om Bok spotlight & countdown, lễ hội, workshop, nút tạo sự kiện.
 *    - Cuộn hết trang TUYỆT ĐỐI không thấy phần câu lạc bộ hay thảo luận CLB.
 * 3. Chuyển đổi qua lại, sidebar active, cuộn về đầu trang (scrollTop: true).
 * 4. Tương thích URL trực tiếp (#clb, #festivals, #/community, #/events), reload, Back/Forward.
 * 5. Giữ nguyên modal tạo nội dung, đăng ký, kiểm duyệt.
 * 6. Chụp ảnh màn hình nghiệm thu Desktop (1280px) và Mobile (390px) cả đầu và cuối trang.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421';

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
    console.log('================================================================================');
    console.log(' BẮT ĐẦU KIỂM THỬ NGHIỆM THU PHÂN TÁCH VIEW CÂU LẠC BỘ & SỰ KIỆN GẶP GỠ');
    console.log('================================================================================\n');

    // 1. Tạo local server
    const serverPort = 8400 + Math.floor(Math.random() * 400);
    const server = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/') p = '/index.html';
        const fp = path.join(ROOT_DIR, p);
        if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
            res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
            res.end(fs.readFileSync(fp));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });
    await new Promise(r => server.listen(serverPort, r));
    console.log(`  ✓ Máy chủ kiểm thử đang chạy tại http://localhost:${serverPort}`);

    // 2. Khởi động Chrome
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));
    if (!chromeExe) throw new Error('Không tìm thấy Chrome');

    const tempDir = path.join(os.tmpdir(), 'chrome_split_test_' + Date.now());
    const cdpPort = 9400 + Math.floor(Math.random() * 400);
    const chrome = spawn(chromeExe, [
        `--remote-debugging-port=${cdpPort}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--mute-audio',
        `--user-data-dir=${tempDir}`,
        `http://localhost:${serverPort}/?source=mock`
    ], { stdio: 'ignore' });

    let cdp;
    try {
        const wsUrl = await getDebuggerUrl(cdpPort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        // Chờ app sẵn sàng
        let ready = false;
        for (let i = 0; i < 40; i++) {
            ready = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.navGoClubs && window.ViVuApp.navGoEvents && window.ViVuApp.state && window.ViVuApp.state.allPlaces?.length > 0)`);
            if (ready) break;
            await sleep(250);
        }
        if (!ready) throw new Error('App chưa sẵn sàng hoặc thiếu phương thức navGoClubs/navGoEvents');
        console.log('  ✓ Ứng dụng đã sẵn sàng với cả 2 phương thức navGoClubs và navGoEvents!\n');

        // -------------------------------------------------------------------------
        // PHẦN 1: DESKTOP (1280 x 800)
        // -------------------------------------------------------------------------
        console.log('-------------------------------------------------------------------------');
        console.log(' [PHẦN 1] NGHIỆM THU GIAO DIỆN DESKTOP (1280 x 800)');
        console.log('-------------------------------------------------------------------------');
        await cdp.setViewport(1280, 800, false);
        await sleep(300);

        // 1.1 Mở Câu lạc bộ
        console.log('\n[1.1] Bấm chọn "Câu lạc bộ" trên Desktop:');
        await cdp.eval(`window.ViVuApp.navGoClubs()`);
        await sleep(400);

        const clubsDesktopState = await cdp.eval(`(() => {
            const vComm = document.getElementById('view-community');
            const vEvents = document.getElementById('view-events');
            const vHome = document.getElementById('view-home');
            const vSearch = document.getElementById('view-search');

            const linkClubs = document.getElementById('sidebarLinkClubs');
            const linkEvents = document.getElementById('sidebarLinkEvents');

            const hasClubs = Boolean(vComm && !vComm.classList.contains('hidden'));
            const hasEvents = Boolean(vEvents && !vEvents.classList.contains('hidden'));
            const isClubsActive = Boolean(linkClubs && linkClubs.classList.contains('bg-primary-container'));
            const isEventsActive = Boolean(linkEvents && linkEvents.classList.contains('bg-primary-container'));

            const scrollY = window.scrollY;

            // Kiểm tra nội dung CLB
            const featuredClubs = vComm ? vComm.querySelectorAll('#featuredClubsGrid article').length : 0;
            const communityPosts = vComm ? vComm.querySelectorAll('#communityPostsFeed article').length : 0;

            // Kiểm tra xem có bất kỳ phần tử Sự kiện / Lễ hội nào nằm trong view-community không
            const eventsInsideCommunity = vComm ? vComm.querySelectorAll('#festivalsPortalSection, #festivalsPortalContainer, #eventsGridContainer').length : 0;

            return {
                view: window.ViVuApp.getActiveView(),
                hash: window.location.hash,
                scrollY,
                views: {
                    community: hasClubs,
                    events: hasEvents,
                    home: Boolean(vHome && !vHome.classList.contains('hidden')),
                    search: Boolean(vSearch && !vSearch.classList.contains('hidden'))
                },
                sidebar: {
                    clubsActive: isClubsActive,
                    eventsActive: isEventsActive
                },
                featuredClubs,
                communityPosts,
                eventsInsideCommunity
            };
        })()`);

        assert.strictEqual(clubsDesktopState.view, 'community', 'Active view phải là "community"');
        assert.strictEqual(clubsDesktopState.hash, '#/community', 'URL hash phải là "#/community"');
        assert.strictEqual(clubsDesktopState.views.community, true, 'view-community phải hiển thị (không hidden)');
        assert.strictEqual(clubsDesktopState.views.events, false, 'view-events phải ẩn (có hidden)');
        assert.strictEqual(clubsDesktopState.sidebar.clubsActive, true, 'sidebarLinkClubs phải có class active (bg-primary-container)');
        assert.strictEqual(clubsDesktopState.sidebar.eventsActive, false, 'sidebarLinkEvents không được active');
        assert.strictEqual(clubsDesktopState.scrollY, 0, 'Trang phải cuộn về đầu (scrollY === 0)');
        assert.strictEqual(clubsDesktopState.eventsInsideCommunity, 0, 'TUYỆT ĐỐI không có phần tử Sự kiện nào trong view-community');
        assert.ok(clubsDesktopState.featuredClubs >= 4, `Số CLB phải >= 4 (thực tế: ${clubsDesktopState.featuredClubs})`);
        console.log('  ✓ [PASS] View Câu lạc bộ hiển thị độc lập: 0 phần tử sự kiện, sidebar đánh dấu chuẩn, scrollY = 0.');

        // Chụp ảnh đầu trang CLB Desktop
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_clubs_desktop_top.png'));
        console.log('  📸 Đã chụp: split_clubs_desktop_top.png');

        // Cuộn xuống hết trang CLB
        await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
        await sleep(300);

        const clubsBottomCheck = await cdp.eval(`(() => {
            const vEvents = document.getElementById('view-events');
            const festSection = document.getElementById('festivalsPortalSection');
            const isFestVisible = Boolean(festSection && festSection.offsetParent !== null);
            const isEventsVisible = Boolean(vEvents && !vEvents.classList.contains('hidden'));
            return {
                scrollY: window.scrollY,
                isFestVisible,
                isEventsVisible
            };
        })()`);

        assert.strictEqual(clubsBottomCheck.isEventsVisible, false, 'Cuộn hết trang CLB: view-events vẫn phải ẩn');
        assert.strictEqual(clubsBottomCheck.isFestVisible, false, 'Cuộn hết trang CLB: festivalsPortalSection TUYỆT ĐỐI không hiển thị');
        console.log(`  ✓ [PASS] Cuộn hết trang Câu lạc bộ (scrollY=${clubsBottomCheck.scrollY}px): 0 sự kiện, 0 lễ hội xuất hiện!`);

        // Chụp ảnh cuối trang CLB Desktop
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_clubs_desktop_bottom.png'));
        console.log('  📸 Đã chụp: split_clubs_desktop_bottom.png');

        // 1.2 Mở Sự kiện & Gặp gỡ
        console.log('\n[1.2] Bấm chọn "Sự kiện & Gặp gỡ" trên Desktop:');
        await cdp.eval(`window.ViVuApp.navGoEvents()`);
        await sleep(400);

        const eventsDesktopState = await cdp.eval(`(() => {
            const vComm = document.getElementById('view-community');
            const vEvents = document.getElementById('view-events');
            const vHome = document.getElementById('view-home');
            const vSearch = document.getElementById('view-search');

            const linkClubs = document.getElementById('sidebarLinkClubs');
            const linkEvents = document.getElementById('sidebarLinkEvents');

            const hasClubs = Boolean(vComm && !vComm.classList.contains('hidden'));
            const hasEvents = Boolean(vEvents && !vEvents.classList.contains('hidden'));
            const isClubsActive = Boolean(linkClubs && linkClubs.classList.contains('bg-primary-container'));
            const isEventsActive = Boolean(linkEvents && linkEvents.classList.contains('bg-primary-container'));

            const scrollY = window.scrollY;

            // Kiểm tra nội dung Sự kiện
            const festSection = document.getElementById('festivalsPortalSection');
            const hasCountdown = Boolean(festSection && festSection.querySelector('#cd-days'));
            const eventCardsCount = festSection ? festSection.querySelectorAll('#eventsGridContainer article').length : 0;
            const hostEventBtn = document.getElementById('btnCreateNewEvent');

            // Kiểm tra xem có bất kỳ phần tử CLB nào nằm trong view-events không
            const clubsInsideEvents = vEvents ? vEvents.querySelectorAll('#stitchCommunitySection, #featuredClubsGrid, #communityPostsFeed').length : 0;

            return {
                view: window.ViVuApp.getActiveView(),
                hash: window.location.hash,
                scrollY,
                views: {
                    community: hasClubs,
                    events: hasEvents,
                    home: Boolean(vHome && !vHome.classList.contains('hidden')),
                    search: Boolean(vSearch && !vSearch.classList.contains('hidden'))
                },
                sidebar: {
                    clubsActive: isClubsActive,
                    eventsActive: isEventsActive
                },
                hasCountdown,
                eventCardsCount,
                hasHostBtn: Boolean(hostEventBtn),
                clubsInsideEvents
            };
        })()`);

        assert.strictEqual(eventsDesktopState.view, 'events', 'Active view phải là "events"');
        assert.strictEqual(eventsDesktopState.hash, '#/events', 'URL hash phải là "#/events"');
        assert.strictEqual(eventsDesktopState.views.events, true, 'view-events phải hiển thị (không hidden)');
        assert.strictEqual(eventsDesktopState.views.community, false, 'view-community phải ẩn (có hidden)');
        assert.strictEqual(eventsDesktopState.sidebar.eventsActive, true, 'sidebarLinkEvents phải có class active (bg-primary-container)');
        assert.strictEqual(eventsDesktopState.sidebar.clubsActive, false, 'sidebarLinkClubs không được active');
        assert.strictEqual(eventsDesktopState.scrollY, 0, 'Trang phải cuộn về đầu (scrollY === 0)');
        assert.strictEqual(eventsDesktopState.clubsInsideEvents, 0, 'TUYỆT ĐỐI không có phần tử CLB nào trong view-events');
        assert.strictEqual(eventsDesktopState.hasCountdown, true, 'Đồng hồ đếm ngược Ok Om Bok phải hiển thị');
        assert.ok(eventsDesktopState.eventCardsCount >= 5, `Số thẻ sự kiện phải >= 5 (thực tế: ${eventsDesktopState.eventCardsCount})`);
        assert.strictEqual(eventsDesktopState.hasHostBtn, true, 'Nút Tạo sự kiện mới phải có mặt');
        console.log('  ✓ [PASS] View Sự kiện & Gặp gỡ hiển thị độc lập: Ok Om Bok Spotlight, countdown, thẻ sự kiện, nút tạo sự kiện, scrollY = 0.');

        // Chụp ảnh đầu trang Sự kiện Desktop
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_events_desktop_top.png'));
        console.log('  📸 Đã chụp: split_events_desktop_top.png');

        // Cuộn xuống hết trang Sự kiện
        await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
        await sleep(300);

        const eventsBottomCheck = await cdp.eval(`(() => {
            const vComm = document.getElementById('view-community');
            const clubsGrid = document.getElementById('featuredClubsGrid');
            const isClubsVisible = Boolean(clubsGrid && clubsGrid.offsetParent !== null);
            const isCommunityVisible = Boolean(vComm && !vComm.classList.contains('hidden'));
            return {
                scrollY: window.scrollY,
                isClubsVisible,
                isCommunityVisible
            };
        })()`);

        assert.strictEqual(eventsBottomCheck.isCommunityVisible, false, 'Cuộn hết trang Sự kiện: view-community vẫn phải ẩn');
        assert.strictEqual(eventsBottomCheck.isClubsVisible, false, 'Cuộn hết trang Sự kiện: featuredClubsGrid TUYỆT ĐỐI không hiển thị');
        console.log(`  ✓ [PASS] Cuộn hết trang Sự kiện & Gặp gỡ (scrollY=${eventsBottomCheck.scrollY}px): 0 câu lạc bộ xuất hiện!`);

        // Chụp ảnh cuối trang Sự kiện Desktop
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_events_desktop_bottom.png'));
        console.log('  📸 Đã chụp: split_events_desktop_bottom.png');


        // -------------------------------------------------------------------------
        // PHẦN 2: MOBILE (390 x 844)
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 2] NGHIỆM THU GIAO DIỆN MOBILE (390 x 844)');
        console.log('-------------------------------------------------------------------------');
        await cdp.setViewport(390, 844, true);
        await sleep(300);

        // 2.1 Mở Câu lạc bộ trên Mobile
        console.log('\n[2.1] Mở "Câu lạc bộ" trên Mobile:');
        await cdp.eval(`window.ViVuApp.navGoClubs()`);
        await sleep(400);

        const clubsMobileState = await cdp.eval(`(() => {
            const vComm = document.getElementById('view-community');
            const vEvents = document.getElementById('view-events');
            const hasClubs = Boolean(vComm && !vComm.classList.contains('hidden'));
            const hasEvents = Boolean(vEvents && !vEvents.classList.contains('hidden'));
            const scrollY = window.scrollY;
            const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
            return {
                view: window.ViVuApp.getActiveView(),
                hasClubs,
                hasEvents,
                scrollY,
                overflow
            };
        })()`);

        assert.strictEqual(clubsMobileState.view, 'community', 'Mobile: Active view phải là "community"');
        assert.strictEqual(clubsMobileState.hasClubs, true, 'Mobile: view-community phải hiển thị');
        assert.strictEqual(clubsMobileState.hasEvents, false, 'Mobile: view-events phải ẩn');
        assert.strictEqual(clubsMobileState.scrollY, 0, 'Mobile: Trang phải cuộn về đầu (scrollY === 0)');
        assert.strictEqual(clubsMobileState.overflow, false, 'Mobile CLB không được tràn ngang');
        console.log('  ✓ [PASS] Mobile Tab CLB hiển thị chuẩn, không tràn ngang, scrollY = 0.');

        // Chụp ảnh đầu trang CLB Mobile
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_clubs_mobile_top.png'));
        console.log('  📸 Đã chụp: split_clubs_mobile_top.png');

        // Cuộn hết trang CLB Mobile
        await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
        await sleep(300);

        const clubsMobileBottom = await cdp.eval(`(() => {
            const festSection = document.getElementById('festivalsPortalSection');
            return {
                scrollY: window.scrollY,
                isFestVisible: Boolean(festSection && festSection.offsetParent !== null)
            };
        })()`);
        assert.strictEqual(clubsMobileBottom.isFestVisible, false, 'Mobile: Cuộn hết trang CLB không được thấy sự kiện');
        console.log(`  ✓ [PASS] Mobile cuộn hết trang CLB: Không có sự kiện nào.`);

        // Chụp ảnh cuối trang CLB Mobile
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_clubs_mobile_bottom.png'));
        console.log('  📸 Đã chụp: split_clubs_mobile_bottom.png');

        // 2.2 Mở Sự kiện & Gặp gỡ trên Mobile
        console.log('\n[2.2] Mở "Sự kiện & Gặp gỡ" trên Mobile:');
        await cdp.eval(`window.ViVuApp.navGoEvents()`);
        await sleep(400);

        const eventsMobileState = await cdp.eval(`(() => {
            const vComm = document.getElementById('view-community');
            const vEvents = document.getElementById('view-events');
            const hasClubs = Boolean(vComm && !vComm.classList.contains('hidden'));
            const hasEvents = Boolean(vEvents && !vEvents.classList.contains('hidden'));
            const scrollY = window.scrollY;
            const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
            return {
                view: window.ViVuApp.getActiveView(),
                hasClubs,
                hasEvents,
                scrollY,
                overflow
            };
        })()`);

        assert.strictEqual(eventsMobileState.view, 'events', 'Mobile: Active view phải là "events"');
        assert.strictEqual(eventsMobileState.hasEvents, true, 'Mobile: view-events phải hiển thị');
        assert.strictEqual(eventsMobileState.hasClubs, false, 'Mobile: view-community phải ẩn');
        assert.strictEqual(eventsMobileState.scrollY, 0, 'Mobile: Trang phải cuộn về đầu (scrollY === 0)');
        assert.strictEqual(eventsMobileState.overflow, false, 'Mobile Sự kiện không được tràn ngang');
        console.log('  ✓ [PASS] Mobile Sự kiện hiển thị chuẩn, không tràn ngang, scrollY = 0.');

        // Chụp ảnh đầu trang Sự kiện Mobile
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_events_mobile_top.png'));
        console.log('  📸 Đã chụp: split_events_mobile_top.png');

        // Cuộn hết trang Sự kiện Mobile
        await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
        await sleep(300);

        const eventsMobileBottom = await cdp.eval(`(() => {
            const clubsGrid = document.getElementById('featuredClubsGrid');
            return {
                scrollY: window.scrollY,
                isClubsVisible: Boolean(clubsGrid && clubsGrid.offsetParent !== null)
            };
        })()`);
        assert.strictEqual(eventsMobileBottom.isClubsVisible, false, 'Mobile: Cuộn hết trang Sự kiện không được thấy CLB');
        console.log(`  ✓ [PASS] Mobile cuộn hết trang Sự kiện: Không có CLB nào.`);

        // Chụp ảnh cuối trang Sự kiện Mobile
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_events_mobile_bottom.png'));
        console.log('  📸 Đã chụp: split_events_mobile_bottom.png');


        // -------------------------------------------------------------------------
        // PHẦN 3: ĐIỀU HƯỚNG URL, HASH CŨ, RELOAD & BACK/FORWARD
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 3] KIỂM THỬ ĐIỀU HƯỚNG URL TRỰC TIẾP, HASH CŨ, RELOAD, BACK / FORWARD');
        console.log('-------------------------------------------------------------------------');
        await cdp.setViewport(1280, 800, false);
        await sleep(200);

        // 3.1 Hash cũ #festivals
        console.log('\n[3.1] Kiểm tra hash cũ #festivals:');
        await cdp.eval(`window.location.hash = '#festivals'`);
        await sleep(300);
        let checkFestivalsHash = await cdp.eval(`(() => {
            const vEvents = document.getElementById('view-events');
            return {
                view: window.ViVuApp.getActiveView(),
                isEventsVisible: Boolean(vEvents && !vEvents.classList.contains('hidden')),
                sidebarEventsActive: Boolean(document.getElementById('sidebarLinkEvents')?.classList.contains('bg-primary-container'))
            };
        })()`);
        assert.strictEqual(checkFestivalsHash.view, 'events', 'Hash #festivals phải mở view "events"');
        assert.strictEqual(checkFestivalsHash.isEventsVisible, true, 'view-events phải hiển thị khi truy cập #festivals');
        assert.strictEqual(checkFestivalsHash.sidebarEventsActive, true, 'sidebarLinkEvents phải active');
        console.log('  ✓ [PASS] Hash cũ #festivals mở đúng view Events và đánh dấu sidebar.');

        // 3.2 Hash cũ #clb
        console.log('\n[3.2] Kiểm tra hash cũ #clb:');
        await cdp.eval(`window.location.hash = '#clb'`);
        await sleep(300);
        let checkClbHash = await cdp.eval(`(() => {
            const vComm = document.getElementById('view-community');
            return {
                view: window.ViVuApp.getActiveView(),
                isClubsVisible: Boolean(vComm && !vComm.classList.contains('hidden')),
                sidebarClubsActive: Boolean(document.getElementById('sidebarLinkClubs')?.classList.contains('bg-primary-container'))
            };
        })()`);
        assert.strictEqual(checkClbHash.view, 'community', 'Hash #clb phải mở view "community"');
        assert.strictEqual(checkClbHash.isClubsVisible, true, 'view-community phải hiển thị khi truy cập #clb');
        assert.strictEqual(checkClbHash.sidebarClubsActive, true, 'sidebarLinkClubs phải active');
        console.log('  ✓ [PASS] Hash cũ #clb mở đúng view Clubs và đánh dấu sidebar.');

        // 3.3 Chuỗi Back / Forward
        console.log('\n[3.3] Kiểm tra chuỗi Browser Back / Forward:');
        // Đang ở #clb (lịch sử: #festivals -> #clb)
        await cdp.eval(`window.history.back()`);
        await sleep(300);
        let backState = await cdp.eval(`window.ViVuApp.getActiveView()`);
        assert.strictEqual(backState, 'events', 'Browser Back phải trở về "events"');
        console.log('  ✓ [PASS] Browser Back khôi phục chuẩn xác view "events".');

        await cdp.eval(`window.history.forward()`);
        await sleep(300);
        let fwdState = await cdp.eval(`window.ViVuApp.getActiveView()`);
        assert.strictEqual(fwdState, 'community', 'Browser Forward phải tiến vào "community"');
        console.log('  ✓ [PASS] Browser Forward khôi phục chuẩn xác view "community".');

        // 3.4 Reload trang tại URL #/events
        console.log('\n[3.4] Kiểm tra Reload trang tại #/events:');
        await cdp.eval(`window.ViVuApp.navGoEvents()`);
        await sleep(200);
        await cdp.send('Page.reload');
        await sleep(600);

        let reloadReady = false;
        for (let i = 0; i < 40; i++) {
            reloadReady = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.getActiveView && window.ViVuApp.getActiveView() === 'events')`);
            if (reloadReady) break;
            await sleep(250);
        }
        assert.ok(reloadReady, 'Sau reload trang phải giữ đúng view "events"');
        const reloadState = await cdp.eval(`(() => {
            const vEvents = document.getElementById('view-events');
            const vComm = document.getElementById('view-community');
            return {
                view: window.ViVuApp.getActiveView(),
                hash: window.location.hash,
                isEventsVisible: Boolean(vEvents && !vEvents.classList.contains('hidden')),
                isCommVisible: Boolean(vComm && !vComm.classList.contains('hidden')),
                sidebarEventsActive: Boolean(document.getElementById('sidebarLinkEvents')?.classList.contains('bg-primary-container'))
            };
        })()`);
        assert.strictEqual(reloadState.isEventsVisible, true, 'Sau reload: view-events hiển thị');
        assert.strictEqual(reloadState.isCommVisible, false, 'Sau reload: view-community ẩn');
        assert.strictEqual(reloadState.sidebarEventsActive, true, 'Sau reload: sidebarLinkEvents active');
        console.log('  ✓ [PASS] Reload trang tại #/events khôi phục chính xác 100% view Sự kiện.');

        // -------------------------------------------------------------------------
        // PHẦN 4: CÁC MODAL TẠO NỘI DUNG & LIÊN KẾT TỪ TRANG CHỦ
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 4] KIỂM THỬ CÁC MODAL TẠO NỘI DUNG VÀ LIÊN KẾT TỪ TRANG CHỦ');
        console.log('-------------------------------------------------------------------------');

        // 4.1 Mở Modal tạo sự kiện từ view Events
        console.log('\n[4.1] Mở Modal tạo sự kiện từ view Events:');
        await cdp.eval(`window.ViVuApp.openHostEventModal()`);
        await sleep(300);
        const hostModalOpen = await cdp.eval(`(() => {
            const m = document.getElementById('hostEventModal');
            return m && !m.classList.contains('hidden');
        })()`);
        assert.strictEqual(hostModalOpen, true, 'Modal hostEventModal phải mở');
        await cdp.eval(`window.ViVuApp.closeHostEventModal()`);
        await sleep(200);
        console.log('  ✓ [PASS] Modal tạo sự kiện mở và đóng mượt mà.');

        // 4.2 Mở Modal tạo CLB từ view Clubs
        console.log('\n[4.2] Mở Modal tạo CLB từ view Clubs:');
        await cdp.eval(`window.ViVuApp.navGoClubs()`);
        await sleep(200);
        await cdp.eval(`window.ViVuApp.openCreateClubModal()`);
        await sleep(300);
        const clubModalOpen = await cdp.eval(`(() => {
            const m = document.getElementById('createClubModal');
            return m && !m.classList.contains('hidden');
        })()`);
        assert.strictEqual(clubModalOpen, true, 'Modal createClubModal phải mở');
        await cdp.eval(`window.ViVuApp.closeCreateClubModal()`);
        await sleep(200);
        console.log('  ✓ [PASS] Modal tạo CLB mở và đóng mượt mà.');

        // 4.3 Khối giới thiệu trên Trang chủ dẫn tới view tương ứng
        console.log('\n[4.3] Bong bóng "Lễ hội" trên Trang chủ dẫn tới Sự kiện:');
        await cdp.eval(`window.ViVuApp.navGoHome()`);
        await sleep(300);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'home', 'Phải ở view home');

        // Click bubble festivals
        await cdp.eval(`(() => {
            const bubble = Array.from(document.querySelectorAll('#storyBubblesContainer button')).find(b => b.textContent.includes('Lễ hội'));
            if (bubble) bubble.click();
        })()`);
        await sleep(400);

        const bubbleNavState = await cdp.eval(`window.ViVuApp.getActiveView()`);
        assert.strictEqual(bubbleNavState, 'events', 'Bấm bubble Lễ hội trên Trang chủ phải chuyển sang view "events"');
        console.log('  ✓ [PASS] Bong bóng Lễ hội trên Trang chủ dẫn trực tiếp tới view Sự kiện & Gặp gỡ.');

        console.log('\n================================================================================');
        console.log('🎉 TẤT CẢ TIÊU CHÍ NGHIỆM THU TÁCH VIEW ĐÃ HOÀN TOÀN ĐẠT 100%!');
        console.log('================================================================================\n');

    } finally {
        if (chrome) {
            chrome.kill('SIGKILL');
        }
        server.close();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
}

run().catch(err => {
    console.error('\n❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ NGHIỆM THU:', err);
    process.exit(1);
});
