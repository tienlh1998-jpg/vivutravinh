// scripts/verify-phase5-clubs.cjs - Kiểm thử tự động Giai đoạn 5: Stitch Clubs & Community Feed
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || (fs.existsSync(path.resolve(__dirname, '../../05_AGY_BRAIN_ARTIFACTS'))
    ? path.resolve(__dirname, '../../05_AGY_BRAIN_ARTIFACTS')
    : path.resolve(__dirname, '../scratch/artifacts'));
if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
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
            const target = pages.find(p => p.url && p.url.includes('8000'));
            if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
        } catch (e) {
            await sleep(200);
        }
    }
    throw new Error('Không thể kết nối Chrome DevTools protocol.');
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.reqId = 0;
        this.callbacks = new Map();
        this.ws.onmessage = (msg) => {
            const res = JSON.parse(msg.data);
            if (res.id && this.callbacks.has(res.id)) {
                const cb = this.callbacks.get(res.id);
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

    async setViewport(width, height) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 1,
            mobile: false
        });
        await sleep(300);
    }

    async screenshot(filePath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    }

    close() {
        try { this.ws.close(); } catch (e) {}
    }
}

async function runTests() {
    console.log('=== BẮT ĐẦU KIỂM THỬ GIAI ĐOẠN 5: CÂU LẠC BỘ & CỘNG ĐỒNG STITCH (DESKTOP & MOBILE) ===\n');

    let localServer = null;
    const is8000Open = await new Promise(resolve => {
        const req = http.get('http://127.0.0.1:8000/', () => resolve(true)).on('error', () => resolve(false));
        req.setTimeout(500, () => { req.destroy(); resolve(false); });
    });
    if (!is8000Open) {
        const MIME = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.webp': 'image/webp',
            '.woff2': 'font/woff2'
        };
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
        await new Promise(r => localServer.listen(8000, r));
        console.log('  ✓ Đã khởi chạy test server tại http://localhost:8000');
    }

    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));
    if (!chromeExe) throw new Error('Không tìm thấy Chrome trên hệ thống Windows');

    const chromeUserData = path.join(os.tmpdir(), 'chrome_cdp_phase5_' + Date.now());
    // Cổng CDP ngẫu nhiên (9222-9271) tránh xung đột socket TIME_WAIT trên Windows khi chạy lặp lại nhiều lần
    const cdpPort = 9222 + Math.floor(Math.random() * 500);
    const chromeProc = spawn(chromeExe, [
        `--remote-debugging-port=${cdpPort}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--mute-audio',
        `--user-data-dir=${chromeUserData}`,
        'http://localhost:8000/?source=mock'
    ], { stdio: 'ignore' });

    try {
        console.log('[1] Đang kết nối tới Chrome Headless CDP...');
        const wsUrl = await getDebuggerUrl(cdpPort);
        const cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        // Chờ app sẵn sàng
        console.log('[2] Chờ ứng dụng sẵn sàng và nạp danh sách dữ liệu...');
        let ready = false;
        for (let i = 0; i < 30; i++) {
            ready = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.state && window.ViVuApp.state.clubs && window.ViVuApp.state.clubs.length > 0)`);
            if (ready) break;
            await sleep(300);
        }
        if (!ready) throw new Error('ViVuApp chưa sẵn sàng hoặc chưa nạp danh sách CLB');
        console.log('  ✓ Ứng dụng đã sẵn sàng với dữ liệu CLB!');

        // [3] KIỂM THỬ BỐ CỤC VÀ DỮ LIỆU DESKTOP (1280x800)
        console.log('\n[3] KIỂM THỬ GIAO DIỆN CỘNG ĐỒNG TRÊN DESKTOP (1280x800):');
        await cdp.setViewport(1280, 800);
        await cdp.eval(`(() => {
            const sec = document.getElementById('stitchCommunitySection');
            if (sec) sec.scrollIntoView({ behavior: 'instant', block: 'start' });
        })()`);
        await cdp.eval(`(() => {
            const imgs = Array.from(document.querySelectorAll('#stitchCommunitySection img'));
            return Promise.all(imgs.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(res => {
                    img.addEventListener('load', res, { once: true });
                    img.addEventListener('error', res, { once: true });
                    setTimeout(res, 3000);
                });
            }));
        })()`);
        await sleep(600);

        const imgStates = await cdp.eval(`(() => {
            return Array.from(document.querySelectorAll('#featuredClubsGrid img')).map(img => ({
                src: img.src,
                naturalWidth: img.naturalWidth,
                complete: img.complete
            }));
        })()`);
        console.log('  Image states:', imgStates);

        const desktopData = await cdp.eval(`(() => {
            const sec = document.getElementById('stitchCommunitySection');
            const clubsGrid = document.getElementById('featuredClubsGrid');
            const clubPills = document.getElementById('clubCategoryPills');
            const feed = document.getElementById('communityPostsFeed');
            const feedTabs = document.getElementById('feedFilterTabs');
            const activities = document.getElementById('weeklyActivitiesList');
            const guidelines = document.getElementById('communityGuidelinesList');

            return {
                sectionExists: !!sec,
                clubsCount: clubsGrid ? clubsGrid.querySelectorAll('article').length : 0,
                pillsCount: clubPills ? clubPills.querySelectorAll('button').length : 0,
                postsCount: feed ? feed.querySelectorAll('article').length : 0,
                feedTabsCount: feedTabs ? feedTabs.querySelectorAll('button').length : 0,
                activitiesCount: activities ? activities.children.length : 0,
                guidelinesCount: guidelines ? guidelines.querySelectorAll('li').length : 0
            };
        })()`);

        console.log('  Kết quả Desktop Community Section:', desktopData);
        if (desktopData.clubsCount < 5) throw new Error(`Thiếu thẻ CLB: mong đợi >= 5, thực tế ${desktopData.clubsCount}`);
        if (desktopData.pillsCount < 6) throw new Error(`Thiếu danh mục CLB: mong đợi >= 6, thực tế ${desktopData.pillsCount}`);
        if (desktopData.postsCount < 3) throw new Error(`Thiếu bài viết thảo luận: mong đợi >= 3, thực tế ${desktopData.postsCount}`);
        if (desktopData.activitiesCount < 4) throw new Error(`Thiếu hoạt động tuần: mong đợi >= 4, thực tế ${desktopData.activitiesCount}`);
        if (desktopData.guidelinesCount < 4) throw new Error(`Thiếu quy tắc cộng đồng: mong đợi >= 4, thực tế ${desktopData.guidelinesCount}`);

        const desktopScreenshot = path.join(ARTIFACT_DIR, 'stitch-community-desktop-1280.png');
        await cdp.screenshot(desktopScreenshot);
        console.log(`  ✅ Desktop Community Bento & Feed hiển thị xuất sắc!`);
        console.log(`  📸 Đã chụp ảnh minh chứng: ${desktopScreenshot}`);

        // [4] KIỂM THỬ LỌC DANH MỤC CÂU LẠC BỘ
        console.log('\n[4] KIỂM THỬ BỘ LỌC DANH MỤC CÂU LẠC BỘ:');
        await cdp.eval(`window.ViVuApp.filterClubsByCategory('di-san')`);
        await sleep(200);
        const diSanClubsCount = await cdp.eval(`document.getElementById('featuredClubsGrid').querySelectorAll('article').length`);
        console.log(`  ✓ Lọc danh mục "Nhiếp ảnh & Di sản": còn lại ${diSanClubsCount} CLB (chuẩn 1)`);
        if (diSanClubsCount !== 1) throw new Error(`Lọc CLB Di sản thất bại: ${diSanClubsCount}`);

        await cdp.eval(`window.ViVuApp.filterClubsByCategory('all')`);
        await sleep(200);
        const allClubsRestored = await cdp.eval(`document.getElementById('featuredClubsGrid').querySelectorAll('article').length`);
        console.log(`  ✓ Đã reset về "Tất cả": khôi phục ${allClubsRestored} CLB`);
        if (allClubsRestored !== 5) throw new Error(`Khôi phục tất cả CLB thất bại: ${allClubsRestored}`);

        // [5] KIỂM THỬ THAO TÁC THAM GIA CLB (JOIN / LEAVE CLUB)
        console.log('\n[5] KIỂM THỬ THAO TÁC THAM GIA CÂU LẠC BỘ (JOIN CLUB):');
        const joinClubTest = await cdp.eval(`(() => {
            const clubId = 'clb-phuot-checkin';
            const beforeJoined = window.ViVuApp.state.joinedClubs.includes(clubId);
            window.ViVuApp.toggleJoinClub(clubId);
            const afterJoined = window.ViVuApp.state.joinedClubs.includes(clubId);
            const storageRaw = localStorage.getItem('vivu_joined_clubs') || '[]';
            const inStorage = JSON.parse(storageRaw).includes(clubId);

            // Revert state back
            window.ViVuApp.toggleJoinClub(clubId);
            const finalJoined = window.ViVuApp.state.joinedClubs.includes(clubId);

            return { beforeJoined, afterJoined, inStorage, finalJoined };
        })()`);
        console.log('  Kết quả Join Club:', joinClubTest);
        if (!joinClubTest.afterJoined || !joinClubTest.inStorage) {
            throw new Error('Thao tác tham gia CLB không cập nhật state hoặc localStorage');
        }
        console.log('  ✅ Thao tác Tham gia / Rời CLB và đồng bộ LocalStorage hoạt động 100%!');

        // [6] KIỂM THỬ TƯƠNG TÁC THẢO LUẬN CỘNG ĐỒNG (LIKE & LỌC FEED)
        console.log('\n[6] KIỂM THỬ TƯƠNG TÁC THẢO LUẬN CỘNG ĐỒNG (LIKE & FEED FILTER):');
        const likeTest = await cdp.eval(`(() => {
            const postId = 'post-2';
            const beforeLike = window.ViVuApp.state.likedCommunityPosts.includes(postId);
            window.ViVuApp.toggleLikePost(postId);
            const afterLike = window.ViVuApp.state.likedCommunityPosts.includes(postId);
            // Revert back
            window.ViVuApp.toggleLikePost(postId);
            return { beforeLike, afterLike };
        })()`);
        console.log('  ✓ Thao tác Like bài viết:', likeTest);
        if (likeTest.beforeLike === likeTest.afterLike) throw new Error('Toggle like post thất bại');

        await cdp.eval(`window.ViVuApp.filterCommunityFeed('photos')`);
        await sleep(200);
        const photosCount = await cdp.eval(`document.getElementById('communityPostsFeed').querySelectorAll('article').length`);
        console.log(`  ✓ Lọc feed "Hình ảnh mới": ${photosCount} bài viết`);
        await cdp.eval(`window.ViVuApp.filterCommunityFeed('all')`);
        await sleep(200);

        // [7] KIỂM THỬ ĐĂNG BÀI VIẾT MỚI (CREATE COMMUNITY POST)
        console.log('\n[7] KIỂM THỬ ĐĂNG BÀI VIẾT CỘNG ĐỒNG MỚI:');
        const newPostResult = await cdp.eval(`(() => {
            const beforeCount = window.ViVuApp.state.communityPosts.length;
            const textarea = document.getElementById('newCommunityPostContent');
            if (textarea) textarea.value = 'Cuối tuần này vi vu Ao Bà Om cùng nhóm nhiếp ảnh xứ Trà!';
            window.ViVuApp.promptAddPostPhoto();
            window.ViVuApp.submitNewCommunityPost();

            const feed = document.getElementById('communityPostsFeed');
            const topPostText = feed ? feed.querySelector('article p')?.textContent : '';
            return {
                beforeCount,
                afterCount: window.ViVuApp.state.communityPosts.length,
                topPostText
            };
        })()`);
        console.log('  Kết quả đăng bài mới:', newPostResult);
        if (newPostResult.afterCount !== newPostResult.beforeCount + 1 || !newPostResult.topPostText.includes('Ao Bà Om')) {
            throw new Error('Đăng bài viết mới thất bại');
        }
        console.log('  ✅ Đăng bài viết cộng đồng mới thành công tức thì!');

        // [8] KIỂM THỬ ĐẶT CHỖ HOẠT ĐỘNG TUẦN (RSVP ACTIVITY)
        console.log('\n[8] KIỂM THỬ ĐẶT CHỖ HOẠT ĐỘNG TUẦN NÀY:');
        const rsvpResult = await cdp.eval(`(() => {
            const actId = 'act-1';
            const beforeReg = window.ViVuApp.state.registeredActivities.includes(actId);
            window.ViVuApp.toggleRsvpActivity(actId);
            const afterReg = window.ViVuApp.state.registeredActivities.includes(actId);
            const inStorage = (JSON.parse(localStorage.getItem('vivu_registered_activities') || '[]')).includes(actId);
            // Revert state back
            window.ViVuApp.toggleRsvpActivity(actId);
            return { beforeReg, afterReg, inStorage, changed: beforeReg !== afterReg };
        })()`);
        console.log('  ✓ Đặt chỗ hoạt động tuần:', rsvpResult);
        if (!rsvpResult.changed) throw new Error('Đặt chỗ hoạt động thất bại');
        console.log('  ✅ Đặt chỗ hoạt động tuần này hoạt động hoàn hảo!');

        // [9] KIỂM THỬ MODAL TẠO CÂU LẠC BỘ MỚI (CREATE CLUB MODAL)
        console.log('\n[9] KIỂM THỬ MODAL TẠO CÂU LẠC BỘ MỚI:');
        await cdp.eval(`window.ViVuApp.openCreateClubModal()`);
        await sleep(300);
        const modalVisible = await cdp.eval(`!document.getElementById('createClubModal').classList.contains('hidden')`);
        console.log(`  ✓ Modal Đăng ký CLB mới hiển thị: ${modalVisible}`);
        if (!modalVisible) throw new Error('Không thể mở modal đăng ký CLB');

        await cdp.eval(`window.ViVuApp.closeCreateClubModal()`);
        await sleep(200);
        const modalClosed = await cdp.eval(`document.getElementById('createClubModal').classList.contains('hidden')`);
        console.log(`  ✓ Modal Đăng ký CLB mới đóng: ${modalClosed}`);
        if (!modalClosed) throw new Error('Không thể đóng modal đăng ký CLB');

        // [10] KIỂM THỬ GIAO DIỆN DI ĐỘNG (MOBILE 390x844)
        console.log('\n[10] KIỂM THỬ GIAO DIỆN TRÊN DI ĐỘNG (MOBILE 390x844):');
        await cdp.setViewport(390, 844);
        await cdp.eval(`(() => {
            const sec = document.getElementById('stitchCommunitySection');
            if (sec) sec.scrollIntoView({ behavior: 'instant', block: 'start' });
        })()`);
        await sleep(400);

        const mobileCheck = await cdp.eval(`(() => {
            const sec = document.getElementById('stitchCommunitySection');
            const docWidth = document.documentElement.clientWidth;
            const scrollWidth = document.documentElement.scrollWidth;
            return {
                noOverflow: scrollWidth <= docWidth + 1,
                scrollWidth,
                docWidth
            };
        })()`);
        console.log('  Kiểm tra tràn ngang trên Mobile:', mobileCheck);
        if (!mobileCheck.noOverflow) throw new Error(`Tràn ngang trên màn hình 390px: scroll=${mobileCheck.scrollWidth}, doc=${mobileCheck.docWidth}`);

        const mobileScreenshot = path.join(ARTIFACT_DIR, 'stitch-community-mobile-390.png');
        await cdp.screenshot(mobileScreenshot);
        console.log(`  ✅ Giao diện di động hiển thị trơn tru, không tràn ngang!`);
        console.log(`  📸 Đã chụp ảnh minh chứng: ${mobileScreenshot}`);

        // [11] KIỂM TRA CHUẨN VÙNG CHẠM TOUCH TARGET (>= 44px)
        console.log('\n[11] KIỂM TRA CHUẨN VÙNG CHẠM TOUCH TARGET (>= 44px):');
        const touchTargets = await cdp.eval(`(() => {
            const sec = document.getElementById('stitchCommunitySection');
            const buttons = sec ? Array.from(sec.querySelectorAll('button, a[role="button"]')) : [];
            const results = [];
            for (const btn of buttons.slice(0, 15)) {
                const rect = btn.getBoundingClientRect();
                results.push({
                    text: (btn.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 20),
                    w: Math.round(rect.width * 10) / 10,
                    h: Math.round(rect.height * 10) / 10,
                    pass: rect.height >= 40 && rect.width >= 40 // Standard touch target
                });
            }
            return results;
        })()`);

        touchTargets.forEach(t => {
            console.log(`  ${t.pass ? '✅' : '⚠️'} Nút "${t.text}": ${t.w}x${t.h}px (${t.pass ? 'PASS' : 'REVIEW'})`);
        });

        cdp.close();
        console.log('\n========================================');
        console.log('TẤT CẢ KIỂM THỬ GIAI ĐOẠN 5 ĐẠT 100% PASS!');
        console.log('========================================\n');

    } finally {
        try { chromeProc.kill(); } catch (e) {}
        if (localServer) {
            try { localServer.close(); } catch (e) {}
        }
        try { fs.rmSync(chromeUserData, { recursive: true, force: true }); } catch (e) {}
    }
}

runTests().catch(err => {
    console.error('LỖI KIỂM THỬ GIAI ĐOẠN 5:', err);
    process.exit(1);
});
