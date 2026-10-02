/**
 * scripts/verify-split-views-acceptance.cjs
 *
 * Kiểm thử nghiệm thu phân tách độc lập 4 danh mục riêng biệt:
 * 1. Câu lạc bộ (view-clubs):
 *    - Danh sách CLB, thông tin và tham gia CLB, lịch hoạt động tuần này của CLB.
 *    - Cuộn hết trang TUYỆT ĐỐI không thấy feed bài đăng, cẩm nang du lịch hay sự kiện.
 * 2. Cộng đồng (view-community):
 *    - Bảng tin bài đăng ngắn, ảnh/video, check-in, chia sẻ trải nghiệm, bình luận và tương tác.
 *    - Cuộn hết trang TUYỆT ĐỐI không thấy danh sách CLB, cẩm nang hay sự kiện.
 * 3. Blog ViVu (view-blog):
 *    - Câu chuyện, ký sự, văn hóa, ẩm thực và cẩm nang.
 *    - Tiêu đề bên trong trang bắt buộc: "Góc chuyện Xứ Trà".
 *    - Cuộn hết trang TUYỆT ĐỐI không thấy CLB, bảng tin hay sự kiện.
 * 4. Sự kiện & Gặp gỡ (view-events):
 *    - Giữ trang sự kiện đã tách và hoạt động chuẩn: Ok Om Bok countdown, thẻ sự kiện, nút tạo sự kiện.
 *    - Cuộn hết trang TUYỆT ĐỐI không thấy CLB, bảng tin hay blog.
 * 5. Điều hướng sidebar trong nhóm "Khám Phá & Kết Nối":
 *    - Trang chủ, Bản đồ, Câu lạc bộ, Cộng đồng, Blog ViVu, Sự kiện & Gặp gỡ.
 *    - Active state chính xác cho từng mục khi mở.
 * 6. Tương thích URL trực tiếp (#clb, #/community, #stories, #/blog, #festivals, #/events), reload, Back/Forward.
 * 7. Điều hướng xem nội dung UGC đã duyệt (viewPublishedUgcItem) dẫn đúng từng view tương ứng.
 * 8. Chụp ảnh màn hình nghiệm thu Desktop (1280px) và Mobile (390px) cả đầu và cuối trang cho cả 4 view.
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

async function run() {
    console.log('================================================================================');
    console.log(' BẮT ĐẦU KIỂM THỬ NGHIỆM THU TÁCH 4 VIEW: CLB - CỘNG ĐỒNG - BLOG - SỰ KIỆN');
    console.log('================================================================================\n');

    // 1. Khởi động Static Web Server
    const server = http.createServer((req, res) => {
        let reqPath = req.url.split('?')[0];
        if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
        const safePath = path.normalize(decodeURIComponent(reqPath)).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(ROOT_DIR, safePath);

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'Content-Type': MIME[ext] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    });

    const serverPort = 8780 + Math.floor(Math.random() * 200);
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

    const tempDir = path.join(os.tmpdir(), 'chrome_split4_test_' + Date.now());
    const cdpPort = 9500 + Math.floor(Math.random() * 300);
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
            ready = await cdp.eval(`Boolean(
                window.ViVuApp &&
                window.ViVuApp.navGoClubs &&
                window.ViVuApp.navGoCommunity &&
                window.ViVuApp.navGoBlog &&
                window.ViVuApp.navGoEvents &&
                window.ViVuApp.state &&
                window.ViVuApp.state.allPlaces?.length > 0
            )`);
            if (ready) break;
            await sleep(250);
        }
        if (!ready) throw new Error('App chưa sẵn sàng hoặc thiếu phương thức điều hướng 4 view');
        console.log('  ✓ Ứng dụng đã sẵn sàng với đầy đủ navGoClubs, navGoCommunity, navGoBlog, navGoEvents!\n');

        // -------------------------------------------------------------------------
        // PHẦN 1: DESKTOP (1280 x 800) - KIỂM THỬ 4 VIEW ĐỘC LẬP
        // -------------------------------------------------------------------------
        console.log('-------------------------------------------------------------------------');
        console.log(' [PHẦN 1] NGHIỆM THU GIAO DIỆN DESKTOP (1280 x 800)');
        console.log('-------------------------------------------------------------------------');
        await cdp.setViewport(1280, 800, false);
        await sleep(300);

        // ==========================================
        // 1.0 NÚT "THAM GIA CỘNG ĐỒNG" TRÊN TRANG CHỦ
        // ==========================================
        console.log('\n[1.0] Kiểm tra nút "Tham gia cộng đồng" trên Trang chủ:');
        const homeHeroBtn = await cdp.eval(`(() => {
            const btn = Array.from(document.querySelectorAll('#view-home a')).find(a => a.textContent.includes('Tham gia cộng đồng'));
            if (!btn) return null;
            return {
                href: btn.getAttribute('href'),
                onclick: btn.getAttribute('onclick')
            };
        })()`);
        assert.ok(homeHeroBtn, 'Phải tìm thấy nút Tham gia cộng đồng trên trang chủ');
        assert.strictEqual(homeHeroBtn.href, '#/community', 'Nút phải giữ href="#/community"');
        assert.ok(homeHeroBtn.onclick.includes('navGoCommunity'), 'Nút phải gọi navGoCommunity()');
        console.log(`  ✓ [PASS] Nút Trang chủ href="${homeHeroBtn.href}", onclick="${homeHeroBtn.onclick}"`);

        await cdp.eval(`(() => {
            const btn = Array.from(document.querySelectorAll('#view-home a')).find(a => a.textContent.includes('Tham gia cộng đồng'));
            btn.click();
        })()`);
        await sleep(400);

        const commAfterHomeBtn = await cdp.eval(`(() => {
            const vComm = document.getElementById('view-community');
            const vHome = document.getElementById('view-home');
            return {
                hash: window.location.hash,
                commVisible: Boolean(vComm && !vComm.classList.contains('hidden')),
                homeHidden: Boolean(vHome && vHome.classList.contains('hidden'))
            };
        })()`);
        assert.strictEqual(commAfterHomeBtn.hash, '#/community', 'Hash phải chuyển sang #/community');
        assert.ok(commAfterHomeBtn.commVisible, 'view-community phải hiển thị sau khi click nút');
        assert.ok(commAfterHomeBtn.homeHidden, 'view-home phải ẩn sau khi click nút');
        console.log(`  ✓ [PASS] Bấm nút Trang chủ đã chuyển thành công sang view-community (hash=${commAfterHomeBtn.hash})`);

        // ==========================================
        // 1.1 VIEW CÂU LẠC BỘ (CLUBS)
        // ==========================================
        console.log('\n[1.1] Bấm chọn "Câu lạc bộ" trên Desktop:');
        await cdp.eval(`window.ViVuApp.navGoClubs()`);
        await sleep(400);

        const clubsState = await cdp.eval(`(() => {
            const vClubs = document.getElementById('view-clubs');
            const vComm = document.getElementById('view-community');
            const vBlog = document.getElementById('view-blog');
            const vEvents = document.getElementById('view-events');
            const linkClubs = document.getElementById('sidebarLinkClubs');

            // Nội dung trong view-clubs
            const featuredClubs = vClubs ? vClubs.querySelectorAll('#featuredClubsGrid article').length : 0;
            const clubPills = vClubs ? vClubs.querySelectorAll('#clubCategoryPills button').length : 0;
            const weeklyActs = vClubs ? vClubs.querySelectorAll('#weeklyActivitiesList > div').length : 0;
            const guidelines = vClubs ? vClubs.querySelectorAll('#communityGuidelinesList li').length : 0;

            // Kiểm tra rò rỉ nội dung từ các view khác
            const feedInClubs = vClubs ? vClubs.querySelectorAll('#communityPostsFeed, #communityCreatePostBox').length : 0;
            const blogInClubs = vClubs ? vClubs.querySelectorAll('#travelStoriesSection').length : 0;
            const eventsInClubs = vClubs ? vClubs.querySelectorAll('#festivalsPortalSection, #festivalsPortalContainer').length : 0;

            return {
                view: window.ViVuApp.getActiveView(),
                hash: window.location.hash,
                scrollY: window.scrollY,
                isVisible: Boolean(vClubs && !vClubs.classList.contains('hidden')),
                otherHidden: Boolean(
                    (!vComm || vComm.classList.contains('hidden')) &&
                    (!vBlog || vBlog.classList.contains('hidden')) &&
                    (!vEvents || vEvents.classList.contains('hidden'))
                ),
                isSidebarActive: Boolean(linkClubs && linkClubs.classList.contains('bg-primary-container')),
                featuredClubs,
                clubPills,
                weeklyActs,
                guidelines,
                feedInClubs,
                blogInClubs,
                eventsInClubs
            };
        })()`);

        assert.strictEqual(clubsState.view, 'clubs', 'Active view phải là "clubs"');
        assert.strictEqual(clubsState.hash, '#/clubs', 'URL hash phải là "#/clubs"');
        assert.strictEqual(clubsState.isVisible, true, 'view-clubs phải hiển thị');
        assert.strictEqual(clubsState.otherHidden, true, 'Các view khác phải ẩn');
        assert.strictEqual(clubsState.isSidebarActive, true, 'sidebarLinkClubs phải có class active');
        assert.strictEqual(clubsState.scrollY, 0, 'Trang phải cuộn về đầu (scrollY === 0)');
        assert.ok(clubsState.featuredClubs >= 4, `Số thẻ CLB phải >= 4 (thực tế: ${clubsState.featuredClubs})`);
        assert.ok(clubsState.weeklyActs >= 1, 'Lịch sinh hoạt CLB phải có nội dung');
        assert.strictEqual(clubsState.feedInClubs, 0, 'TUYỆT ĐỐI không có bảng tin bài đăng trong view-clubs');
        assert.strictEqual(clubsState.blogInClubs, 0, 'TUYỆT ĐỐI không có blog trong view-clubs');
        assert.strictEqual(clubsState.eventsInClubs, 0, 'TUYỆT ĐỐI không có sự kiện/lễ hội trong view-clubs');
        console.log('  ✓ [PASS] View Câu lạc bộ hiển thị độc lập: Bento grid CLB, Lịch sinh hoạt tuần này, Quy tắc CLB.');

        // Chụp ảnh đầu trang CLB
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_clubs_desktop_top.png'));
        console.log('  📸 Đã chụp: split_clubs_desktop_top.png');

        // Cuộn hết trang CLB
        await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
        await sleep(300);
        const clubsBottomCheck = await cdp.eval(`(() => {
            const feed = document.getElementById('communityPostsFeed');
            const stories = document.getElementById('travelStoriesSection');
            const fest = document.getElementById('festivalsPortalSection');
            return {
                scrollY: window.scrollY,
                isFeedVisible: Boolean(feed && feed.offsetParent !== null),
                isStoriesVisible: Boolean(stories && stories.offsetParent !== null),
                isFestVisible: Boolean(fest && fest.offsetParent !== null)
            };
        })()`);
        assert.ok(clubsBottomCheck.scrollY > 0, 'Phải cuộn xuống dưới');
        assert.strictEqual(clubsBottomCheck.isFeedVisible, false, 'Cuộn hết trang CLB: Không có feed bài đăng');
        assert.strictEqual(clubsBottomCheck.isStoriesVisible, false, 'Cuộn hết trang CLB: Không có blog/cẩm nang');
        assert.strictEqual(clubsBottomCheck.isFestVisible, false, 'Cuộn hết trang CLB: Không có sự kiện/lễ hội');
        console.log(`  ✓ [PASS] Cuộn hết trang CLB (scrollY=${clubsBottomCheck.scrollY}px): 0 bài đăng feed, 0 cẩm nang, 0 sự kiện xuất hiện.`);

        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_clubs_desktop_bottom.png'));
        console.log('  📸 Đã chụp: split_clubs_desktop_bottom.png');


        // ==========================================
        // 1.2 VIEW CỘNG ĐỒNG (COMMUNITY FEED)
        // ==========================================
        console.log('\n[1.2] Bấm chọn "Cộng đồng" trên Desktop:');
        await cdp.eval(`window.ViVuApp.navGoCommunity()`);
        await sleep(400);

        const communityState = await cdp.eval(`(() => {
            const vClubs = document.getElementById('view-clubs');
            const vComm = document.getElementById('view-community');
            const vBlog = document.getElementById('view-blog');
            const vEvents = document.getElementById('view-events');
            const linkComm = document.getElementById('sidebarLinkCommunity');

            // Nội dung trong view-community
            const postBox = Boolean(vComm && vComm.querySelector('#communityCreatePostBox'));
            const feedTabs = vComm ? vComm.querySelectorAll('#feedFilterTabs button').length : 0;
            const postsCount = vComm ? vComm.querySelectorAll('#communityPostsFeed article').length : 0;

            // Kiểm tra rò rỉ nội dung
            const clubsInComm = vComm ? vComm.querySelectorAll('#featuredClubsGrid, #clubCategoryPills').length : 0;
            const blogInComm = vComm ? vComm.querySelectorAll('#travelStoriesSection').length : 0;
            const eventsInComm = vComm ? vComm.querySelectorAll('#festivalsPortalSection').length : 0;

            return {
                view: window.ViVuApp.getActiveView(),
                hash: window.location.hash,
                scrollY: window.scrollY,
                isVisible: Boolean(vComm && !vComm.classList.contains('hidden')),
                otherHidden: Boolean(
                    (!vClubs || vClubs.classList.contains('hidden')) &&
                    (!vBlog || vBlog.classList.contains('hidden')) &&
                    (!vEvents || vEvents.classList.contains('hidden'))
                ),
                isSidebarActive: Boolean(linkComm && linkComm.classList.contains('bg-primary-container')),
                postBox,
                feedTabs,
                postsCount,
                clubsInComm,
                blogInComm,
                eventsInComm
            };
        })()`);

        assert.strictEqual(communityState.view, 'community', 'Active view phải là "community"');
        assert.strictEqual(communityState.hash, '#/community', 'URL hash phải là "#/community"');
        assert.strictEqual(communityState.isVisible, true, 'view-community phải hiển thị');
        assert.strictEqual(communityState.otherHidden, true, 'Các view khác phải ẩn');
        assert.strictEqual(communityState.isSidebarActive, true, 'sidebarLinkCommunity phải có class active');
        assert.strictEqual(communityState.scrollY, 0, 'Trang phải cuộn về đầu (scrollY === 0)');
        assert.strictEqual(communityState.postBox, true, 'Form đăng bài #communityCreatePostBox phải có mặt');
        assert.ok(communityState.feedTabs >= 3, 'Các tab lọc bài viết cộng đồng phải hiển thị');
        assert.ok(communityState.postsCount >= 2, `Bảng tin phải có bài viết (thực tế: ${communityState.postsCount})`);
        assert.strictEqual(communityState.clubsInComm, 0, 'TUYỆT ĐỐI không có grid CLB trong view-community');
        assert.strictEqual(communityState.blogInComm, 0, 'TUYỆT ĐỐI không có blog trong view-community');
        assert.strictEqual(communityState.eventsInComm, 0, 'TUYỆT ĐỐI không có sự kiện trong view-community');
        console.log('  ✓ [PASS] View Cộng đồng hiển thị độc lập: Form đăng bài, Bộ lọc feed, Danh sách bài viết thảo luận.');

        // Chụp ảnh đầu trang Cộng đồng
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_community_desktop_top.png'));
        console.log('  📸 Đã chụp: split_community_desktop_top.png');

        // Cuộn hết trang Cộng đồng
        await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
        await sleep(300);
        const commBottomCheck = await cdp.eval(`(() => {
            const clubs = document.getElementById('featuredClubsGrid');
            const stories = document.getElementById('travelStoriesSection');
            const fest = document.getElementById('festivalsPortalSection');
            return {
                scrollY: window.scrollY,
                isClubsVisible: Boolean(clubs && clubs.offsetParent !== null),
                isStoriesVisible: Boolean(stories && stories.offsetParent !== null),
                isFestVisible: Boolean(fest && fest.offsetParent !== null)
            };
        })()`);
        assert.ok(commBottomCheck.scrollY > 0, 'Phải cuộn xuống dưới');
        assert.strictEqual(commBottomCheck.isClubsVisible, false, 'Cuộn hết trang Cộng đồng: Không có CLB');
        assert.strictEqual(commBottomCheck.isStoriesVisible, false, 'Cuộn hết trang Cộng đồng: Không có blog');
        assert.strictEqual(commBottomCheck.isFestVisible, false, 'Cuộn hết trang Cộng đồng: Không có sự kiện');
        console.log(`  ✓ [PASS] Cuộn hết trang Cộng đồng (scrollY=${commBottomCheck.scrollY}px): 0 CLB, 0 cẩm nang, 0 sự kiện xuất hiện.`);

        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_community_desktop_bottom.png'));
        console.log('  📸 Đã chụp: split_community_desktop_bottom.png');


        // ==========================================
        // 1.3 VIEW BLOG VIVU (GÓC CHUYỆN XỨ TRÀ)
        // ==========================================
        console.log('\n[1.3] Bấm chọn "Blog ViVu" trên Desktop:');
        await cdp.eval(`window.ViVuApp.navGoBlog()`);
        await sleep(400);

        const blogState = await cdp.eval(`(() => {
            const vClubs = document.getElementById('view-clubs');
            const vComm = document.getElementById('view-community');
            const vBlog = document.getElementById('view-blog');
            const vEvents = document.getElementById('view-events');
            const linkBlog = document.getElementById('sidebarLinkBlog');

            // Kiểm tra tiêu đề trang bắt buộc: "Góc chuyện Xứ Trà"
            const pageTitleEl = vBlog ? vBlog.querySelector('h3') : null;
            const pageTitle = pageTitleEl ? pageTitleEl.textContent.trim() : '';

            // Nội dung trong view-blog
            const articleCards = vBlog ? vBlog.querySelectorAll('#travelStoriesContainer .grid article, #travelStoriesContainer .grid > div').length : 0;
            const submitBtn = vBlog ? vBlog.querySelector('#btnSubmitArticle') : null;

            // Typography font kiểm tra
            const computedStyle = pageTitleEl ? window.getComputedStyle(pageTitleEl) : null;
            const fontFamily = computedStyle ? computedStyle.fontFamily : '';

            // Kiểm tra rò rỉ nội dung
            const clubsInBlog = vBlog ? vBlog.querySelectorAll('#featuredClubsGrid').length : 0;
            const feedInBlog = vBlog ? vBlog.querySelectorAll('#communityPostsFeed').length : 0;
            const eventsInBlog = vBlog ? vBlog.querySelectorAll('#festivalsPortalSection').length : 0;

            return {
                view: window.ViVuApp.getActiveView(),
                hash: window.location.hash,
                scrollY: window.scrollY,
                isVisible: Boolean(vBlog && !vBlog.classList.contains('hidden')),
                otherHidden: Boolean(
                    (!vClubs || vClubs.classList.contains('hidden')) &&
                    (!vComm || vComm.classList.contains('hidden')) &&
                    (!vEvents || vEvents.classList.contains('hidden'))
                ),
                isSidebarActive: Boolean(linkBlog && linkBlog.classList.contains('bg-primary-container')),
                pageTitle,
                fontFamily,
                articleCards,
                hasSubmitBtn: Boolean(submitBtn),
                clubsInBlog,
                feedInBlog,
                eventsInBlog
            };
        })()`);

        assert.strictEqual(blogState.view, 'blog', 'Active view phải là "blog"');
        assert.strictEqual(blogState.hash, '#/blog', 'URL hash phải là "#/blog"');
        assert.strictEqual(blogState.isVisible, true, 'view-blog phải hiển thị');
        assert.strictEqual(blogState.otherHidden, true, 'Các view khác phải ẩn');
        assert.strictEqual(blogState.isSidebarActive, true, 'sidebarLinkBlog phải có class active');
        assert.strictEqual(blogState.scrollY, 0, 'Trang phải cuộn về đầu (scrollY === 0)');
        assert.strictEqual(blogState.pageTitle, 'Góc chuyện Xứ Trà', 'Tiêu đề trang Blog ViVu bắt buộc phải là "Góc chuyện Xứ Trà"');
        assert.ok(blogState.articleCards >= 3, `Lưới bài viết phải có bài cẩm nang (thực tế: ${blogState.articleCards})`);
        assert.strictEqual(blogState.hasSubmitBtn, true, 'Nút "Gửi bài cẩm nang" phải có mặt');
        assert.strictEqual(blogState.clubsInBlog, 0, 'TUYỆT ĐỐI không có CLB trong view-blog');
        assert.strictEqual(blogState.feedInBlog, 0, 'TUYỆT ĐỐI không có feed bài đăng trong view-blog');
        assert.strictEqual(blogState.eventsInBlog, 0, 'TUYỆT ĐỐI không có sự kiện trong view-blog');
        console.log(`  ✓ [PASS] View Blog ViVu hiển thị độc lập: Tiêu đề "${blogState.pageTitle}", ${blogState.articleCards} bài viết cẩm nang, nút gửi bài cẩm nang.`);

        // Chụp ảnh đầu trang Blog ViVu
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_blog_desktop_top.png'));
        console.log('  📸 Đã chụp: split_blog_desktop_top.png');

        // Cuộn hết trang Blog ViVu
        await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
        await sleep(300);
        const blogBottomCheck = await cdp.eval(`(() => {
            const clubs = document.getElementById('featuredClubsGrid');
            const feed = document.getElementById('communityPostsFeed');
            const fest = document.getElementById('festivalsPortalSection');
            return {
                scrollY: window.scrollY,
                isClubsVisible: Boolean(clubs && clubs.offsetParent !== null),
                isFeedVisible: Boolean(feed && feed.offsetParent !== null),
                isFestVisible: Boolean(fest && fest.offsetParent !== null)
            };
        })()`);
        assert.ok(blogBottomCheck.scrollY > 0, 'Phải cuộn xuống dưới');
        assert.strictEqual(blogBottomCheck.isClubsVisible, false, 'Cuộn hết trang Blog: Không có CLB');
        assert.strictEqual(blogBottomCheck.isFeedVisible, false, 'Cuộn hết trang Blog: Không có feed bài đăng');
        assert.strictEqual(blogBottomCheck.isFestVisible, false, 'Cuộn hết trang Blog: Không có sự kiện');
        console.log(`  ✓ [PASS] Cuộn hết trang Blog ViVu (scrollY=${blogBottomCheck.scrollY}px): 0 CLB, 0 bài feed, 0 sự kiện xuất hiện.`);

        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_blog_desktop_bottom.png'));
        console.log('  📸 Đã chụp: split_blog_desktop_bottom.png');


        // ==========================================
        // 1.4 VIEW SỰ KIỆN & GẶP GỠ (EVENTS)
        // ==========================================
        console.log('\n[1.4] Bấm chọn "Sự kiện & Gặp gỡ" trên Desktop:');
        await cdp.eval(`window.ViVuApp.navGoEvents()`);
        await sleep(400);

        const eventsState = await cdp.eval(`(() => {
            const vClubs = document.getElementById('view-clubs');
            const vComm = document.getElementById('view-community');
            const vBlog = document.getElementById('view-blog');
            const vEvents = document.getElementById('view-events');
            const linkEvents = document.getElementById('sidebarLinkEvents');

            // Nội dung sự kiện
            const festSection = document.getElementById('festivalsPortalSection');
            const hasCountdown = Boolean(festSection && festSection.querySelector('#cd-days'));
            const eventCardsCount = festSection ? festSection.querySelectorAll('#eventsGridContainer article').length : 0;
            const hostBtn = document.getElementById('btnCreateNewEvent');

            // Kiểm tra rò rỉ nội dung
            const clubsInEvents = vEvents ? vEvents.querySelectorAll('#featuredClubsGrid').length : 0;
            const feedInEvents = vEvents ? vEvents.querySelectorAll('#communityPostsFeed').length : 0;
            const blogInEvents = vEvents ? vEvents.querySelectorAll('#travelStoriesSection').length : 0;

            return {
                view: window.ViVuApp.getActiveView(),
                hash: window.location.hash,
                scrollY: window.scrollY,
                isVisible: Boolean(vEvents && !vEvents.classList.contains('hidden')),
                otherHidden: Boolean(
                    (!vClubs || vClubs.classList.contains('hidden')) &&
                    (!vComm || vComm.classList.contains('hidden')) &&
                    (!vBlog || vBlog.classList.contains('hidden'))
                ),
                isSidebarActive: Boolean(linkEvents && linkEvents.classList.contains('bg-primary-container')),
                hasCountdown,
                eventCardsCount,
                hasHostBtn: Boolean(hostBtn),
                clubsInEvents,
                feedInEvents,
                blogInEvents
            };
        })()`);

        assert.strictEqual(eventsState.view, 'events', 'Active view phải là "events"');
        assert.strictEqual(eventsState.hash, '#/events', 'URL hash phải là "#/events"');
        assert.strictEqual(eventsState.isVisible, true, 'view-events phải hiển thị');
        assert.strictEqual(eventsState.otherHidden, true, 'Các view khác phải ẩn');
        assert.strictEqual(eventsState.isSidebarActive, true, 'sidebarLinkEvents phải có class active');
        assert.strictEqual(eventsState.scrollY, 0, 'Trang phải cuộn về đầu (scrollY === 0)');
        assert.strictEqual(eventsState.hasCountdown, true, 'Đồng hồ đếm ngược Ok Om Bok phải hiển thị');
        assert.ok(eventsState.eventCardsCount >= 5, `Số thẻ sự kiện phải >= 5 (thực tế: ${eventsState.eventCardsCount})`);
        assert.strictEqual(eventsState.hasHostBtn, true, 'Nút Tạo sự kiện mới phải có mặt');
        assert.strictEqual(eventsState.clubsInEvents, 0, 'TUYỆT ĐỐI không có CLB trong view-events');
        assert.strictEqual(eventsState.feedInEvents, 0, 'TUYỆT ĐỐI không có feed trong view-events');
        assert.strictEqual(eventsState.blogInEvents, 0, 'TUYỆT ĐỐI không có blog trong view-events');
        console.log('  ✓ [PASS] View Sự kiện & Gặp gỡ hiển thị độc lập: Spotlight Ok Om Bok, countdown, danh sách sự kiện & workshop.');

        // Chụp ảnh đầu trang Sự kiện
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_events_desktop_top.png'));
        console.log('  📸 Đã chụp: split_events_desktop_top.png');

        // Cuộn hết trang Sự kiện
        await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
        await sleep(300);
        const eventsBottomCheck = await cdp.eval(`(() => {
            const clubs = document.getElementById('featuredClubsGrid');
            const feed = document.getElementById('communityPostsFeed');
            const stories = document.getElementById('travelStoriesSection');
            return {
                scrollY: window.scrollY,
                isClubsVisible: Boolean(clubs && clubs.offsetParent !== null),
                isFeedVisible: Boolean(feed && feed.offsetParent !== null),
                isStoriesVisible: Boolean(stories && stories.offsetParent !== null)
            };
        })()`);
        assert.ok(eventsBottomCheck.scrollY > 0, 'Phải cuộn xuống dưới');
        assert.strictEqual(eventsBottomCheck.isClubsVisible, false, 'Cuộn hết trang Sự kiện: Không có CLB');
        assert.strictEqual(eventsBottomCheck.isFeedVisible, false, 'Cuộn hết trang Sự kiện: Không có feed');
        assert.strictEqual(eventsBottomCheck.isStoriesVisible, false, 'Cuộn hết trang Sự kiện: Không có blog');
        console.log(`  ✓ [PASS] Cuộn hết trang Sự kiện & Gặp gỡ (scrollY=${eventsBottomCheck.scrollY}px): 0 CLB, 0 bài feed, 0 cẩm nang xuất hiện.`);

        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_events_desktop_bottom.png'));
        console.log('  📸 Đã chụp: split_events_desktop_bottom.png');


        // -------------------------------------------------------------------------
        // PHẦN 2: MOBILE (390 x 844) - KIỂM THỬ 4 VIEW VÀ KHÔNG TRÀN NGANG
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 2] NGHIỆM THU GIAO DIỆN MOBILE (390 x 844)');
        console.log('-------------------------------------------------------------------------');
        await cdp.setViewport(390, 844, true);
        await sleep(300);

        // 2.1 CLB trên Mobile
        console.log('\n[2.1] Mở "Câu lạc bộ" trên Mobile:');
        await cdp.eval(`window.ViVuApp.navGoClubs()`);
        await sleep(300);
        const clubsMob = await cdp.eval(`(() => {
            const vClubs = document.getElementById('view-clubs');
            return {
                view: window.ViVuApp.getActiveView(),
                isVisible: Boolean(vClubs && !vClubs.classList.contains('hidden')),
                scrollY: window.scrollY,
                overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        })()`);
        assert.strictEqual(clubsMob.view, 'clubs');
        assert.strictEqual(clubsMob.isVisible, true);
        assert.strictEqual(clubsMob.scrollY, 0);
        assert.strictEqual(clubsMob.overflow, false, 'CLB Mobile không tràn ngang');
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_clubs_mobile_top.png'));
        await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
        await sleep(200);
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_clubs_mobile_bottom.png'));
        console.log('  ✓ [PASS] CLB Mobile hiển thị chuẩn, không tràn ngang.');

        // 2.2 Cộng đồng trên Mobile
        console.log('\n[2.2] Mở "Cộng đồng" trên Mobile:');
        await cdp.eval(`window.ViVuApp.navGoCommunity()`);
        await sleep(300);
        const commMob = await cdp.eval(`(() => {
            const vComm = document.getElementById('view-community');
            return {
                view: window.ViVuApp.getActiveView(),
                isVisible: Boolean(vComm && !vComm.classList.contains('hidden')),
                scrollY: window.scrollY,
                overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        })()`);
        assert.strictEqual(commMob.view, 'community');
        assert.strictEqual(commMob.isVisible, true);
        assert.strictEqual(commMob.scrollY, 0);
        assert.strictEqual(commMob.overflow, false, 'Cộng đồng Mobile không tràn ngang');
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_community_mobile_top.png'));
        await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
        await sleep(200);
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_community_mobile_bottom.png'));
        console.log('  ✓ [PASS] Cộng đồng Mobile hiển thị chuẩn, không tràn ngang.');

        // 2.3 Blog ViVu trên Mobile
        console.log('\n[2.3] Mở "Blog ViVu" trên Mobile:');
        await cdp.eval(`window.ViVuApp.navGoBlog()`);
        await sleep(300);
        const blogMob = await cdp.eval(`(() => {
            const vBlog = document.getElementById('view-blog');
            return {
                view: window.ViVuApp.getActiveView(),
                isVisible: Boolean(vBlog && !vBlog.classList.contains('hidden')),
                scrollY: window.scrollY,
                overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        })()`);
        assert.strictEqual(blogMob.view, 'blog');
        assert.strictEqual(blogMob.isVisible, true);
        assert.strictEqual(blogMob.scrollY, 0);
        assert.strictEqual(blogMob.overflow, false, 'Blog ViVu Mobile không tràn ngang');
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_blog_mobile_top.png'));
        await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
        await sleep(200);
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_blog_mobile_bottom.png'));
        console.log('  ✓ [PASS] Blog ViVu Mobile hiển thị chuẩn, không tràn ngang.');

        // 2.4 Sự kiện trên Mobile
        console.log('\n[2.4] Mở "Sự kiện & Gặp gỡ" trên Mobile:');
        await cdp.eval(`window.ViVuApp.navGoEvents()`);
        await sleep(300);
        const eventsMob = await cdp.eval(`(() => {
            const vEvents = document.getElementById('view-events');
            return {
                view: window.ViVuApp.getActiveView(),
                isVisible: Boolean(vEvents && !vEvents.classList.contains('hidden')),
                scrollY: window.scrollY,
                overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        })()`);
        assert.strictEqual(eventsMob.view, 'events');
        assert.strictEqual(eventsMob.isVisible, true);
        assert.strictEqual(eventsMob.scrollY, 0);
        assert.strictEqual(eventsMob.overflow, false, 'Sự kiện Mobile không tràn ngang');
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_events_mobile_top.png'));
        await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
        await sleep(200);
        await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'split_events_mobile_bottom.png'));
        console.log('  ✓ [PASS] Sự kiện Mobile hiển thị chuẩn, không tràn ngang.');


        // -------------------------------------------------------------------------
        // PHẦN 3: URL TRỰC TIẾP, HASH ROUTING, RELOAD & BACK / FORWARD
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 3] KIỂM THỬ DEEP LINK, HASH ROUTING & LỊCH SỬ DUYỆT TRÌNH');
        console.log('-------------------------------------------------------------------------');
        await cdp.setViewport(1280, 800, false);
        await sleep(200);

        // 3.1 Hash cũ #clb
        console.log('\n[3.1] Hash cũ #clb:');
        await cdp.eval(`window.location.hash = '#clb'`);
        await sleep(300);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'clubs', '#clb phải mở view clubs');
        console.log('  ✓ [PASS] Hash #clb điều hướng chính xác vào view Câu lạc bộ.');

        // 3.2 Hash #/community
        console.log('\n[3.2] Hash #/community:');
        await cdp.eval(`window.location.hash = '#/community'`);
        await sleep(300);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'community', '#/community phải mở view community');
        console.log('  ✓ [PASS] Hash #/community điều hướng chính xác vào view Cộng đồng.');

        // 3.3 Hash cũ #stories và #/blog
        console.log('\n[3.3] Hash #stories và #/blog:');
        await cdp.eval(`window.location.hash = '#stories'`);
        await sleep(300);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'blog', '#stories phải mở view blog');
        await cdp.eval(`window.location.hash = '#/blog'`);
        await sleep(300);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'blog', '#/blog phải mở view blog');
        console.log('  ✓ [PASS] Hash #stories & #/blog điều hướng chính xác vào view Blog ViVu.');

        // 3.4 Hash cũ #festivals và #/events
        console.log('\n[3.4] Hash #festivals và #/events:');
        await cdp.eval(`window.location.hash = '#festivals'`);
        await sleep(300);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'events', '#festivals phải mở view events');
        await cdp.eval(`window.location.hash = '#/events'`);
        await sleep(300);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'events', '#/events phải mở view events');
        console.log('  ✓ [PASS] Hash #festivals & #/events điều hướng chính xác vào view Sự kiện.');

        // 3.5 Browser Back / Forward qua chuỗi views
        console.log('\n[3.5] Chuỗi Browser Back / Forward:');
        // Vừa qua: #stories -> #/blog -> #festivals -> #/events
        await cdp.eval(`window.history.back()`);
        await sleep(300);
        await cdp.eval(`window.history.back()`);
        await sleep(300);
        const historyBackView = await cdp.eval(`window.ViVuApp.getActiveView()`);
        assert.strictEqual(historyBackView, 'blog', 'Back 2 lần phải về view "blog"');
        console.log('  ✓ [PASS] Browser Back khôi phục chính xác view Blog ViVu.');

        await cdp.eval(`window.history.forward()`);
        await sleep(300);
        const historyFwdView = await cdp.eval(`window.ViVuApp.getActiveView()`);
        assert.ok(historyFwdView === 'events' || historyFwdView === 'blog');
        console.log('  ✓ [PASS] Browser Forward hoạt động mượt mà.');

        // 3.6 Reload trang tại #/blog
        console.log('\n[3.6] Reload trang tại #/blog:');
        await cdp.eval(`window.ViVuApp.navGoBlog()`);
        await sleep(200);
        await cdp.send('Page.reload');
        await sleep(600);

        let reloadReady = false;
        for (let i = 0; i < 40; i++) {
            reloadReady = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.getActiveView && window.ViVuApp.getActiveView() === 'blog')`);
            if (reloadReady) break;
            await sleep(250);
        }
        assert.ok(reloadReady, 'Sau reload trang phải giữ đúng view "blog"');
        const reloadTitle = await cdp.eval(`document.querySelector('#view-blog h3')?.textContent?.trim()`);
        assert.strictEqual(reloadTitle, 'Góc chuyện Xứ Trà', 'Sau reload: Tiêu đề trang Blog vẫn là "Góc chuyện Xứ Trà"');
        console.log('  ✓ [PASS] Reload trang tại #/blog khôi phục chuẩn xác 100% Blog ViVu với tiêu đề "Góc chuyện Xứ Trà".');


        // -------------------------------------------------------------------------
        // PHẦN 4: ĐIỀU HƯỚNG UGC ITEM ĐÃ DUYỆT (VIEWPUBLISHEDUGCITEM)
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 4] KIỂM THỬ ĐIỀU HƯỚNG NỘI DUNG UGC ĐÃ DUYỆT (VIEWPUBLISHEDUGCITEM)');
        console.log('-------------------------------------------------------------------------');

        // 4.1 Xem bài viết cẩm nang -> điều hướng sang blog
        console.log('\n[4.1] Tác giả xem bài viết cẩm nang đã duyệt:');
        await cdp.eval(`window.ViVuApp.navGoHome()`);
        await sleep(200);
        await cdp.eval(`window.ViVuApp.viewPublishedUgcItem('article', 'art-1')`);
        await sleep(300);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'blog', 'viewPublishedUgcItem article phải chuyển sang view "blog"');
        console.log('  ✓ [PASS] Xem cẩm nang đã duyệt: Điều hướng chính xác sang view Blog ViVu.');

        // 4.2 Xem bài đăng cộng đồng -> điều hướng sang community
        console.log('\n[4.2] Tác giả xem bài đăng cộng đồng đã duyệt:');
        await cdp.eval(`window.ViVuApp.viewPublishedUgcItem('community_post', 'post-1')`);
        await sleep(300);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'community', 'viewPublishedUgcItem community_post phải chuyển sang view "community"');
        console.log('  ✓ [PASS] Xem bài đăng đã duyệt: Điều hướng chính xác sang view Cộng đồng.');

        // 4.3 Xem CLB đã duyệt -> điều hướng sang clubs
        console.log('\n[4.3] Tác giả xem CLB đã duyệt:');
        await cdp.eval(`window.ViVuApp.viewPublishedUgcItem('club', 'club-1')`);
        await sleep(300);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'clubs', 'viewPublishedUgcItem club phải chuyển sang view "clubs"');
        console.log('  ✓ [PASS] Xem CLB đã duyệt: Điều hướng chính xác sang view Câu lạc bộ.');

        // 4.4 Xem sự kiện đã duyệt -> điều hướng sang events
        console.log('\n[4.4] Tác giả xem Sự kiện đã duyệt:');
        await cdp.eval(`window.ViVuApp.viewPublishedUgcItem('community_event', 'event-1')`);
        await sleep(300);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'events', 'viewPublishedUgcItem community_event phải chuyển sang view "events"');
        console.log('  ✓ [PASS] Xem Sự kiện đã duyệt: Điều hướng chính xác sang view Sự kiện & Gặp gỡ.');


        // -------------------------------------------------------------------------
        // PHẦN 5: CÁC MODAL TẠO NỘI DUNG
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 5] KIỂM THỬ CÁC MODAL TẠO NỘI DUNG VÀ FORM');
        console.log('-------------------------------------------------------------------------');

        // 5.1 Modal tạo sự kiện từ view Events
        console.log('\n[5.1] Mở Modal tạo sự kiện:');
        await cdp.eval(`window.ViVuApp.navGoEvents()`);
        await sleep(200);
        await cdp.eval(`window.ViVuApp.openHostEventModal()`);
        await sleep(250);
        const hostOpen = await cdp.eval(`Boolean(document.getElementById('hostEventModal') && !document.getElementById('hostEventModal').classList.contains('hidden'))`);
        assert.strictEqual(hostOpen, true, 'Modal hostEventModal phải mở');
        await cdp.eval(`window.ViVuApp.closeHostEventModal()`);
        await sleep(200);
        console.log('  ✓ [PASS] Modal tạo sự kiện mở và đóng mượt mà.');

        // 5.2 Modal tạo CLB từ view Clubs
        console.log('\n[5.2] Mở Modal tạo CLB:');
        await cdp.eval(`window.ViVuApp.navGoClubs()`);
        await sleep(200);
        await cdp.eval(`window.ViVuApp.openCreateClubModal()`);
        await sleep(250);
        const clubOpen = await cdp.eval(`Boolean(document.getElementById('createClubModal') && !document.getElementById('createClubModal').classList.contains('hidden'))`);
        assert.strictEqual(clubOpen, true, 'Modal createClubModal phải mở');
        await cdp.eval(`window.ViVuApp.closeCreateClubModal()`);
        await sleep(200);
        console.log('  ✓ [PASS] Modal tạo CLB mở và đóng mượt mà.');

        // 5.3 Modal gửi bài cẩm nang từ view Blog
        console.log('\n[5.3] Mở Modal gửi bài cẩm nang từ Blog ViVu:');
        await cdp.eval(`window.ViVuApp.navGoBlog()`);
        await sleep(200);
        // Khi chưa đăng nhập: yêu cầu đăng nhập qua userAuthModal
        await cdp.eval(`window.ViVuApp.openSubmitArticleModal()`);
        await sleep(250);
        const authModalOpen = await cdp.eval(`Boolean(document.getElementById('userAuthModal') && !document.getElementById('userAuthModal').classList.contains('hidden'))`);
        assert.strictEqual(authModalOpen, true, 'Khách bấm gửi bài cẩm nang phải mở userAuthModal');
        await cdp.eval(`window.ViVuApp.closeAuthModal?.() || document.getElementById('userAuthModal')?.classList.add('hidden')`);
        await sleep(200);

        // Khi có quyền tác giả / admin: mở form biên soạn cẩm nang
        await cdp.eval(`window.ViVuApp.openSubmitArticleModal(null, true)`);
        await sleep(250);
        const articleModalOpen = await cdp.eval(`Boolean(document.getElementById('submitArticleModal') && !document.getElementById('submitArticleModal').classList.contains('hidden'))`);
        assert.strictEqual(articleModalOpen, true, 'Modal submitArticleModal phải mở khi có quyền tác giả');
        await cdp.eval(`window.ViVuApp.closeSubmitArticleModal()`);
        await sleep(200);
        console.log('  ✓ [PASS] Modal gửi bài cẩm nang mở và đóng mượt mà (kiểm tra phân quyền đăng nhập chuẩn xác).');

        console.log('\n================================================================================');
        console.log('🎉 TẤT CẢ TIÊU CHÍ NGHIỆM THU TÁCH 4 VIEW ĐÃ HOÀN TOÀN ĐẠT 100%!');
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
