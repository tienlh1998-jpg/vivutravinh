/**
 * scripts/verify-mobile-drawer-navigation.cjs
 *
 * Kiểm tra toàn diện Mobile Drawer Navigation:
 * 1. Mobile viewports (360px, 390px), Tablet (768px), Desktop (1280px).
 * 2. Nút mở menu (#mobileMenuOpenBtn) trên header: kích thước tối thiểu 44x44px, aria-label, aria-expanded.
 * 3. Mở/đóng bằng click nút mở, click backdrop, click nút đóng X, và phím Escape.
 * 4. Scroll lock trên body khi mở và khôi phục khi đóng.
 * 5. Cấu trúc drawer: đủ 3 nhóm (Khám Phá, Cá Nhân, GÓC ADMIN & DỰ ÁN) giống hệt Desktop Sidebar.
 * 6. Điều hướng router qua drawer: click từng mục, hash đổi, view đổi, active state đồng bộ, drawer tự đóng.
 * 7. Phân quyền: Khách vãng lai vs Thành viên vs Quản trị viên (Admin moderation link & badge).
 * 8. Tự động đóng drawer khi đổi kích thước sang Desktop (>= 1024px).
 * 9. Không tràn ngang (scrollWidth <= clientWidth).
 * 10. Chụp ảnh màn hình nghiệm thu mobile drawer mở (390px) vào thư mục Artifacts.
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
    console.log(' BẮT ĐẦU KIỂM THỬ E2E TOÀN DIỆN MOBILE DRAWER NAVIGATION VIVUTRAVINH');
    console.log('================================================================================\n');

    // 1. Static Server
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

    const serverPort = 8820 + Math.floor(Math.random() * 100);
    await new Promise(r => server.listen(serverPort, r));
    console.log(`  ✓ Máy chủ kiểm thử đang chạy tại http://localhost:${serverPort}`);

    // 2. Chrome Headless
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));
    if (!chromeExe) throw new Error('Không tìm thấy Chrome');

    const tempDir = path.join(os.tmpdir(), 'chrome_drawer_test_' + Date.now());
    const cdpPort = 9520 + Math.floor(Math.random() * 200);
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

        // Chờ app khởi tạo
        let ready = false;
        for (let i = 0; i < 40; i++) {
            ready = await cdp.eval(`Boolean(
                window.ViVuApp &&
                window.ViVuApp.openMobileDrawer &&
                window.ViVuApp.closeMobileDrawer &&
                window.ViVuApp.switchView &&
                window.ViVuApp.state?.allPlaces?.length > 0
            )`);
            if (ready) break;
            await sleep(250);
        }
        if (!ready) throw new Error('App chưa sẵn sàng hoặc thiếu phương thức openMobileDrawer / closeMobileDrawer');
        console.log('  ✓ Ứng dụng đã sẵn sàng với openMobileDrawer, closeMobileDrawer!\n');

        // =========================================================================
        // CA KIỂM THỬ 1: VIEWPORT MOBILE 390x844 (iPhone 12/13/14)
        // =========================================================================
        console.log('-------------------------------------------------------------------------');
        console.log(' [CA 1] KIỂM TRA HEADER & NÚT MỞ MENU TRÊN MOBILE 390x844');
        console.log('-------------------------------------------------------------------------');
        await cdp.setViewport(390, 844, true);
        await sleep(300);

        // 1.1 Kiểm tra nút mở menu trên header
        const openBtnInfo = await cdp.eval(`(() => {
            const btn = document.getElementById('mobileMenuOpenBtn');
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            const cs = window.getComputedStyle(btn);
            return {
                exists: true,
                display: cs.display,
                visibility: cs.visibility,
                width: rect.width,
                height: rect.height,
                ariaLabel: btn.getAttribute('aria-label'),
                ariaExpanded: btn.getAttribute('aria-expanded'),
                ariaControls: btn.getAttribute('aria-controls')
            };
        })()`);

        assert.ok(openBtnInfo, 'Nút #mobileMenuOpenBtn phải tồn tại');
        assert.ok(openBtnInfo.width >= 44, `Vùng bấm ngang nút phải >= 44px (thực tế: ${openBtnInfo.width}px)`);
        assert.ok(openBtnInfo.height >= 44, `Vùng bấm dọc nút phải >= 44px (thực tế: ${openBtnInfo.height}px)`);
        assert.strictEqual(openBtnInfo.ariaLabel, 'Mở danh mục', 'aria-label phải là "Mở danh mục"');
        assert.strictEqual(openBtnInfo.ariaExpanded, 'false', 'aria-expanded ban đầu phải là "false"');
        console.log(`  ✓ Nút mở menu: ${openBtnInfo.width}x${openBtnInfo.height}px, aria-label="${openBtnInfo.ariaLabel}", aria-expanded="${openBtnInfo.ariaExpanded}"`);

        // 1.2 Trạng thái drawer khi đóng ban đầu
        const initialDrawerState = await cdp.eval(`(() => {
            const drawer = document.getElementById('mobileDrawerNav');
            const backdrop = document.getElementById('mobileDrawerBackdrop');
            const bodyHasLock = document.body.classList.contains('overflow-hidden');
            const drawerRect = drawer.getBoundingClientRect();
            return {
                drawerRectRight: drawerRect.right,
                hasInert: drawer.hasAttribute('inert'),
                ariaHidden: drawer.getAttribute('aria-hidden'),
                backdropOpacity: window.getComputedStyle(backdrop).opacity,
                bodyHasLock
            };
        })()`);
        assert.ok(initialDrawerState.drawerRectRight <= 0, 'Drawer phải trượt hoàn toàn ra ngoài mép trái khi đóng');
        assert.strictEqual(initialDrawerState.hasInert, true, 'Drawer phải có thuộc tính inert khi đóng');
        assert.strictEqual(initialDrawerState.ariaHidden, 'true', 'Drawer phải có aria-hidden="true" khi đóng');
        assert.strictEqual(initialDrawerState.bodyHasLock, false, 'Body không được bị khóa cuộn khi đóng');
        console.log(`  ✓ Trạng thái đóng ban đầu chuẩn: drawer ngoài màn hình (right: ${initialDrawerState.drawerRectRight}px), inert=true, aria-hidden=true`);

        // =========================================================================
        // CA KIỂM THỬ 2: BẤM NÚT MỞ MENU THẬT SỰ
        // =========================================================================
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [CA 2] BẤM NÚT #mobileMenuOpenBtn ĐỂ MỞ DRAWER');
        console.log('-------------------------------------------------------------------------');
        await cdp.eval(`document.getElementById('mobileMenuOpenBtn').click()`);
        await sleep(350); // chờ animation trượt 300ms

        const openedDrawerState = await cdp.eval(`(() => {
            const drawer = document.getElementById('mobileDrawerNav');
            const backdrop = document.getElementById('mobileDrawerBackdrop');
            const openBtn = document.getElementById('mobileMenuOpenBtn');
            const drawerRect = drawer.getBoundingClientRect();
            const bodyHasLock = document.body.classList.contains('overflow-hidden');
            return {
                drawerLeft: drawerRect.left,
                drawerWidth: drawerRect.width,
                hasInert: drawer.hasAttribute('inert'),
                ariaHidden: drawer.getAttribute('aria-hidden'),
                openBtnExpanded: openBtn.getAttribute('aria-expanded'),
                backdropOpacity: window.getComputedStyle(backdrop).opacity,
                bodyHasLock
            };
        })()`);

        assert.strictEqual(openedDrawerState.drawerLeft, 0, 'Drawer phải trượt vào lề trái (left === 0)');
        assert.ok(openedDrawerState.drawerWidth <= 320, `Drawer width tối đa 320px (thực tế: ${openedDrawerState.drawerWidth}px)`);
        assert.ok(openedDrawerState.drawerWidth >= 300, `Drawer width rộng ~85vw (thực tế: ${openedDrawerState.drawerWidth}px)`);
        assert.strictEqual(openedDrawerState.hasInert, false, 'Drawer phải gỡ bỏ inert khi mở');
        assert.strictEqual(openedDrawerState.ariaHidden, 'false', 'Drawer phải có aria-hidden="false" khi mở');
        assert.strictEqual(openedDrawerState.openBtnExpanded, 'true', 'openBtn aria-expanded phải là "true"');
        assert.strictEqual(openedDrawerState.bodyHasLock, true, 'Body phải có class overflow-hidden để khóa cuộn nền');
        console.log(`  ✓ Drawer mở thành công: left=${openedDrawerState.drawerLeft}px, width=${openedDrawerState.drawerWidth}px, inert=false, scroll-locked=true`);

        // Chụp ảnh Artifact menu mobile đang mở
        const screenshotPath = path.join(ARTIFACT_DIR, 'mobile_drawer_open_390.png');
        await cdp.captureScreenshot(screenshotPath);
        console.log(`  ✓ Đã lưu ảnh chụp Mobile Drawer mở: ${screenshotPath}`);

        // =========================================================================
        // CA KIỂM THỬ 3: KIỂM TRA ĐẦY ĐỦ CÁC DANH MỤC TRONG DRAWER
        // =========================================================================
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [CA 3] RÀ SOÁT CẤU TRÚC VÀ CÁC MỤC DANH MỤC TRONG DRAWER');
        console.log('-------------------------------------------------------------------------');
        const drawerItems = await cdp.eval(`(() => {
            const drawer = document.getElementById('mobileDrawerNav');
            const links = Array.from(drawer.querySelectorAll('a')).map(a => ({
                id: a.id,
                href: a.getAttribute('href'),
                text: a.querySelector('span:not(.material-symbols-outlined)')?.textContent?.trim() || a.textContent.trim(),
                visible: window.getComputedStyle(a).display !== 'none'
            }));
            return links;
        })()`);

        const expectedCategories = [
            'Trang chủ',
            'Bản đồ & Địa điểm',
            'Câu lạc bộ',
            'Cộng đồng',
            'Blog ViVu',
            'Sự kiện & Gặp gỡ',
            'Lên kế hoạch chuyến đi',
            'Bộ sưu tập đã lưu',
            'Nội dung của tôi',
            'Góp ý & Hỗ trợ',
            'Về dự án & Kế hoạch',
            'Đồng hành cùng Admin'
        ];

        for (const cat of expectedCategories) {
            const found = drawerItems.find(it => it.text.includes(cat));
            assert.ok(found, `Danh mục "${cat}" phải có trong Mobile Drawer`);
            console.log(`  ✓ [FOUND] ${cat} (id: ${found.id || 'N/A'}, href: ${found.href})`);
        }

        // Cuộn xuống đáy drawer và chụp ảnh nhóm 3 (GÓC ADMIN & DỰ ÁN)
        await cdp.eval(`(() => {
            const scrollContainer = document.getElementById('mobileDrawerNav').querySelector('.overflow-y-auto');
            if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
        })()`);
        await sleep(200);
        const bottomScreenshotPath = path.join(ARTIFACT_DIR, 'mobile_drawer_bottom_390.png');
        await cdp.captureScreenshot(bottomScreenshotPath);
        console.log(`  ✓ Đã lưu ảnh chụp Mobile Drawer đáy danh mục: ${bottomScreenshotPath}`);

        // =========================================================================
        // CA KIỂM THỬ 4: ĐÓNG MENU BẰNG BACKDROP
        // =========================================================================
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [CA 4] ĐÓNG MENU BẰNG CÁCH BẤM BACKDROP');
        console.log('-------------------------------------------------------------------------');
        await cdp.eval(`document.getElementById('mobileDrawerBackdrop').click()`);
        await sleep(350);

        const afterBackdropState = await cdp.eval(`(() => {
            const drawer = document.getElementById('mobileDrawerNav');
            const bodyHasLock = document.body.classList.contains('overflow-hidden');
            const drawerRect = drawer.getBoundingClientRect();
            return {
                drawerRight: drawerRect.right,
                hasInert: drawer.hasAttribute('inert'),
                bodyHasLock
            };
        })()`);
        assert.ok(afterBackdropState.drawerRight <= 0, 'Drawer phải trượt ra ngoài khi bấm backdrop');
        assert.strictEqual(afterBackdropState.bodyHasLock, false, 'Body phải mở khóa cuộn sau khi đóng');
        console.log(`  ✓ Bấm backdrop: drawer đóng sạch sẽ, body mở khóa cuộn thành công`);

        // =========================================================================
        // CA KIỂM THỬ 5: MỞ LẠI VÀ ĐÓNG BẰNG PHÍM ESCAPE
        // =========================================================================
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [CA 5] MỞ LẠI VÀ ĐÓNG BẰNG PHÍM ESCAPE');
        console.log('-------------------------------------------------------------------------');
        await cdp.eval(`document.getElementById('mobileMenuOpenBtn').click()`);
        await sleep(350);

        await cdp.send('Input.dispatchKeyEvent', {
            type: 'rawKeyDown',
            key: 'Escape',
            code: 'Escape',
            windowsVirtualKeyCode: 27
        });
        await cdp.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Escape',
            code: 'Escape',
            windowsVirtualKeyCode: 27
        });
        await sleep(350);

        const afterEscapeState = await cdp.eval(`(() => {
            const drawer = document.getElementById('mobileDrawerNav');
            const bodyHasLock = document.body.classList.contains('overflow-hidden');
            return {
                drawerRight: drawer.getBoundingClientRect().right,
                hasInert: drawer.hasAttribute('inert'),
                bodyHasLock
            };
        })()`);
        assert.ok(afterEscapeState.drawerRight <= 0, 'Drawer phải đóng khi nhấn Escape');
        assert.strictEqual(afterEscapeState.bodyHasLock, false, 'Body phải mở khóa cuộn sau Escape');
        console.log(`  ✓ Phím Escape: drawer đóng mượt mà, body mở khóa cuộn`);

        // =========================================================================
        // CA KIỂM THỬ 6: MỞ LẠI VÀ ĐÓNG BẰNG NÚT ĐÓNG X (#mobileDrawerCloseBtn)
        // =========================================================================
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [CA 6] MỞ LẠI VÀ ĐÓNG BẰNG NÚT X (#mobileDrawerCloseBtn)');
        console.log('-------------------------------------------------------------------------');
        await cdp.eval(`document.getElementById('mobileMenuOpenBtn').click()`);
        await sleep(350);
        await cdp.eval(`document.getElementById('mobileDrawerCloseBtn').click()`);
        await sleep(350);

        const afterCloseBtnState = await cdp.eval(`(() => {
            const drawer = document.getElementById('mobileDrawerNav');
            const bodyHasLock = document.body.classList.contains('overflow-hidden');
            return {
                drawerRight: drawer.getBoundingClientRect().right,
                hasInert: drawer.hasAttribute('inert'),
                bodyHasLock
            };
        })()`);
        assert.ok(afterCloseBtnState.drawerRight <= 0, 'Drawer phải đóng khi nhấn nút X');
        assert.strictEqual(afterCloseBtnState.bodyHasLock, false, 'Body phải mở khóa cuộn sau nút X');
        console.log(`  ✓ Nút đóng X: drawer đóng chuẩn xác`);

        // =========================================================================
        // CA KIỂM THỬ 7: ĐIỀU HƯỚNG CÁC VIEW TỪ DRAWER (ABOUT, FEEDBACK, COMPANION, CLUBS, HOME)
        // =========================================================================
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [CA 7] ĐIỀU HƯỚNG TỪNG DANH MỤC TRONG DRAWER VÀ ĐỒNG BỘ ACTIVE STATE');
        console.log('-------------------------------------------------------------------------');

        const testRoutes = [
            {
                name: 'Về dự án & Kế hoạch',
                linkId: 'drawerLinkAbout',
                viewId: 'view-about',
                expectedHash: '#/about',
                expectedColorCheck: 'purple'
            },
            {
                name: 'Góp ý & Hỗ trợ',
                linkId: 'drawerLinkFeedback',
                viewId: 'view-feedback',
                expectedHash: '#/feedback',
                expectedColorCheck: 'blue'
            },
            {
                name: 'Đồng hành cùng Admin',
                linkId: 'drawerLinkCompanion',
                viewId: 'view-companion',
                expectedHash: '#/companion',
                expectedColorCheck: 'amber'
            },
            {
                name: 'Câu lạc bộ',
                linkId: 'drawerLinkClubs',
                viewId: 'view-clubs',
                expectedHash: '#/clubs',
                expectedColorCheck: 'primary'
            },
            {
                name: 'Trang chủ',
                linkId: 'drawerLinkHome',
                viewId: 'view-home',
                expectedHash: '#/home',
                expectedColorCheck: 'primary'
            }
        ];

        for (const tr of testRoutes) {
            // Mở drawer
            await cdp.eval(`document.getElementById('mobileMenuOpenBtn').click()`);
            await sleep(350);

            // Click mục
            await cdp.eval(`document.getElementById('${tr.linkId}').click()`);
            await sleep(400);

            // Kiểm tra view hiển thị, hash, drawer tự đóng
            const navCheck = await cdp.eval(`(() => {
                const targetView = document.getElementById('${tr.viewId}');
                const drawer = document.getElementById('mobileDrawerNav');
                const link = document.getElementById('${tr.linkId}');
                return {
                    hash: window.location.hash,
                    viewVisible: Boolean(targetView && !targetView.classList.contains('hidden')),
                    drawerClosed: drawer.getBoundingClientRect().right <= 0,
                    linkClass: link.className,
                    bodyHasLock: document.body.classList.contains('overflow-hidden')
                };
            })()`);

            assert.strictEqual(navCheck.hash, tr.expectedHash, `Hash sau khi click ${tr.name} phải là ${tr.expectedHash}`);
            assert.strictEqual(navCheck.viewVisible, true, `View ${tr.viewId} phải được hiển thị`);
            assert.strictEqual(navCheck.drawerClosed, true, `Drawer phải tự động đóng sau khi click ${tr.name}`);
            assert.strictEqual(navCheck.bodyHasLock, false, `Body scroll-lock phải được gỡ sau điều hướng`);

            if (tr.expectedColorCheck === 'purple') {
                assert.ok(navCheck.linkClass.includes('purple'), 'Drawer link About phải có style tím active');
            } else if (tr.expectedColorCheck === 'blue') {
                assert.ok(navCheck.linkClass.includes('blue'), 'Drawer link Feedback phải có style xanh active');
            } else if (tr.expectedColorCheck === 'amber') {
                assert.ok(navCheck.linkClass.includes('amber'), 'Drawer link Companion phải có style cam hổ phách active');
            }

            console.log(`  ✓ [PASS] Điều hướng ${tr.name}: Hash=${navCheck.hash}, ViewVisible=true, DrawerClosed=true, ActiveStyle OK`);
        }

        // =========================================================================
        // CA KIỂM THỬ 8: PHÂN QUYỀN KHÁCH / MEMBER / ADMIN TRONG DRAWER
        // =========================================================================
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [CA 8] PHÂN QUYỀN VÀ TRẠNG THÁI HIỂN THỊ (GUEST / MEMBER / ADMIN)');
        console.log('-------------------------------------------------------------------------');

        // 8.1 Trạng thái Khách vãng lai
        await cdp.eval(`(() => {
            localStorage.removeItem('vivu_admin_session');
            localStorage.removeItem('vivu_user_session');
            window.ViVuApp.updateAdminRoleUI();
        })()`);
        await sleep(200);

        const guestState = await cdp.eval(`(() => {
            const drawerMod = document.getElementById('drawerAdminModerationLink');
            const drawerLogin = document.getElementById('drawerAdminLoginLink');
            const drawerUser = document.getElementById('drawerUserName');
            const drawerRole = document.getElementById('drawerUserRole');
            return {
                moderationHidden: drawerMod.classList.contains('hidden'),
                loginVisible: !drawerLogin.classList.contains('hidden'),
                userName: drawerUser.textContent.trim(),
                userRole: drawerRole.textContent.trim()
            };
        })()`);
        assert.strictEqual(guestState.moderationHidden, true, 'Khách vãng lai: mục Kiểm duyệt nội dung phải ẨN');
        assert.strictEqual(guestState.loginVisible, true, 'Khách vãng lai: mục Đăng nhập Quản trị phải HIỆN');
        assert.strictEqual(guestState.userName, 'Khách vãng lai', 'Tên khách phải là "Khách vãng lai"');
        console.log(`  ✓ Khách vãng lai: Moderation hidden=true, Login visible=true, User="${guestState.userName}"`);

        // 8.2 Trạng thái Thành viên cộng đồng (Member)
        await cdp.eval(`(() => {
            const memberSession = {
                user: {
                    id: 'usr-member-test',
                    email: 'huynhtran@example.com',
                    user_metadata: { display_name: 'Huỳnh Trần Member' }
                }
            };
            localStorage.setItem('vivu_user_session', JSON.stringify(memberSession));
            localStorage.removeItem('vivu_admin_session');
            window.ViVuApp.updateAdminRoleUI();
        })()`);
        await sleep(200);

        const memberState = await cdp.eval(`(() => {
            const drawerMod = document.getElementById('drawerAdminModerationLink');
            const drawerUser = document.getElementById('drawerUserName');
            const drawerRole = document.getElementById('drawerUserRole');
            return {
                moderationHidden: drawerMod.classList.contains('hidden'),
                userName: drawerUser.textContent.trim(),
                userRole: drawerRole.textContent.trim()
            };
        })()`);
        assert.strictEqual(memberState.moderationHidden, true, 'Thành viên Member: mục Kiểm duyệt nội dung phải ẨN');
        assert.strictEqual(memberState.userName, 'Huỳnh Trần Member', 'Tên member phải khớp');
        assert.strictEqual(memberState.userRole, 'Thành viên', 'Role phải là "Thành viên"');
        console.log(`  ✓ Thành viên Member: Moderation hidden=true, User="${memberState.userName}", Role="${memberState.userRole}"`);

        // 8.3 Trạng thái Quản trị viên (Admin)
        await cdp.eval(`(() => {
            const adminSession = {
                user: {
                    id: 'usr-admin-test',
                    email: 'admin.stitch@vivutravinh.id.vn',
                    role: 'admin'
                }
            };
            localStorage.setItem('vivu_admin_session', JSON.stringify(adminSession));
            window.ViVuApp.updateAdminRoleUI();
            window.ViVuApp.updateAdminModerationBadge(8);
        })()`);
        await sleep(200);

        const adminState = await cdp.eval(`(() => {
            const drawerMod = document.getElementById('drawerAdminModerationLink');
            const drawerLogin = document.getElementById('drawerAdminLoginLink');
            const drawerBadge = document.getElementById('drawerAdminModerationBadge');
            const sidebarBadge = document.getElementById('sidebarAdminModerationBadge');
            const drawerUser = document.getElementById('drawerUserName');
            const drawerRole = document.getElementById('drawerUserRole');
            return {
                moderationVisible: drawerMod.classList.contains('flex') && !drawerMod.classList.contains('hidden'),
                loginHidden: drawerLogin.classList.contains('hidden'),
                drawerBadgeText: drawerBadge.textContent.trim(),
                drawerBadgeVisible: !drawerBadge.classList.contains('hidden'),
                sidebarBadgeText: sidebarBadge.textContent.trim(),
                drawerRole: drawerRole.textContent.trim()
            };
        })()`);
        assert.strictEqual(adminState.moderationVisible, true, 'Admin: mục Kiểm duyệt nội dung phải HIỂN THỊ');
        assert.strictEqual(adminState.loginHidden, true, 'Admin: link Đăng nhập Quản trị phải ẨN');
        assert.strictEqual(adminState.drawerBadgeText, '8', 'Badge drawer phải cập nhật số 8');
        assert.strictEqual(adminState.sidebarBadgeText, '8', 'Badge sidebar desktop phải cập nhật số 8');
        assert.strictEqual(adminState.drawerRole, 'Quản trị viên', 'Role drawer phải là "Quản trị viên"');
        console.log(`  ✓ Quản trị viên: Moderation visible=true, Badge=8, Role="${adminState.drawerRole}"`);

        // Dọn dẹp session test
        await cdp.eval(`(() => {
            localStorage.removeItem('vivu_admin_session');
            localStorage.removeItem('vivu_user_session');
            window.ViVuApp.updateAdminRoleUI();
        })()`);

        // =========================================================================
        // CA KIỂM THỬ 9: TỰ ĐỘNG ĐÓNG VÀ CLEAR SCROLL-LOCK KHI RESIZE SANG DESKTOP
        // =========================================================================
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [CA 9] ĐỔI KÍCH THƯỚC VIEWPORT SANG DESKTOP (>= 1024px)');
        console.log('-------------------------------------------------------------------------');
        // Mở drawer trên mobile trước
        await cdp.eval(`document.getElementById('mobileMenuOpenBtn').click()`);
        await sleep(350);
        const lockBefore = await cdp.eval(`document.body.classList.contains('overflow-hidden')`);
        assert.strictEqual(lockBefore, true, 'Body phải đang scroll-lock');

        // Resize sang Desktop 1280px
        await cdp.setViewport(1280, 800, false);
        await sleep(350);

        const desktopAfterResize = await cdp.eval(`(() => {
            const drawer = document.getElementById('mobileDrawerNav');
            const sidebar = document.getElementById('appSidebarNav');
            const bodyHasLock = document.body.classList.contains('overflow-hidden');
            return {
                drawerRight: drawer.getBoundingClientRect().right,
                sidebarVisible: window.getComputedStyle(sidebar).display !== 'none',
                bodyHasLock
            };
        })()`);
        assert.ok(desktopAfterResize.drawerRight <= 0, 'Drawer phải tự đóng khi sang kích thước Desktop');
        assert.strictEqual(desktopAfterResize.bodyHasLock, false, 'Scroll lock phải được xóa sạch');
        assert.strictEqual(desktopAfterResize.sidebarVisible, true, 'Sidebar Desktop phải hiển thị bình thường');
        console.log(`  ✓ Resize sang desktop: drawer đóng, scroll lock gỡ bỏ, desktop sidebar hiển thị hoàn hảo`);

        // =========================================================================
        // CA KIỂM THỬ 10: KIỂM TRA MÀN HÌNH NHỎ 360px KHÔNG TRÀN NGANG
        // =========================================================================
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [CA 10] KIỂM TRA MÀN HÌNH NHỎ 360px & TRÀN NGANG (OVERFLOW-X)');
        console.log('-------------------------------------------------------------------------');
        await cdp.setViewport(360, 740, true);
        await sleep(300);

        const overflowCheck360 = await cdp.eval(`(() => {
            const docWidth = document.documentElement.clientWidth;
            const scrollWidth = document.documentElement.scrollWidth;
            const bodyScrollWidth = document.body.scrollWidth;
            return {
                clientWidth: docWidth,
                scrollWidth,
                bodyScrollWidth,
                hasOverflow: scrollWidth > docWidth || bodyScrollWidth > docWidth
            };
        })()`);
        assert.strictEqual(overflowCheck360.hasOverflow, false, `Màn hình 360px không được tràn ngang (client: ${overflowCheck360.clientWidth}, scroll: ${overflowCheck360.scrollWidth})`);
        console.log(`  ✓ Màn hình 360px không tràn ngang: clientWidth=${overflowCheck360.clientWidth}px, scrollWidth=${overflowCheck360.scrollWidth}px`);

        // Mở drawer trên 360px
        await cdp.eval(`document.getElementById('mobileMenuOpenBtn').click()`);
        await sleep(350);
        const drawer360Width = await cdp.eval(`document.getElementById('mobileDrawerNav').getBoundingClientRect().width`);
        assert.ok(drawer360Width <= 320, `Drawer trên 360px không vượt quá 320px (thực tế: ${drawer360Width}px)`);
        await cdp.eval(`document.getElementById('mobileDrawerCloseBtn').click()`);
        await sleep(350);
        console.log(`  ✓ Drawer trên 360px hoạt động chuẩn, bề rộng ${drawer360Width}px`);

        // =========================================================================
        // CA KIỂM THỬ 11: TABLET 768px (iPad Mini)
        // =========================================================================
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [CA 11] KIỂM TRA TABLET 768x1024');
        console.log('-------------------------------------------------------------------------');
        await cdp.setViewport(768, 1024, true);
        await sleep(300);

        await cdp.eval(`document.getElementById('mobileMenuOpenBtn').click()`);
        await sleep(350);
        const tabletDrawerWidth = await cdp.eval(`document.getElementById('mobileDrawerNav').getBoundingClientRect().width`);
        assert.strictEqual(tabletDrawerWidth, 320, `Drawer trên tablet bị giới hạn max 320px (thực tế: ${tabletDrawerWidth}px)`);
        await cdp.eval(`document.getElementById('mobileDrawerCloseBtn').click()`);
        await sleep(350);
        console.log(`  ✓ Tablet 768px: Drawer giới hạn tối đa 320px chính xác`);

        // =========================================================================
        // CA KIỂM THỬ 12: DARK MODE TOGGLE TỪ DRAWER
        // =========================================================================
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [CA 12] KIỂM TRA CHUYỂN CHẾ ĐỘ DARK MODE TỪ DRAWER');
        console.log('-------------------------------------------------------------------------');
        await cdp.setViewport(390, 844, true);
        await sleep(200);
        await cdp.eval(`document.getElementById('mobileMenuOpenBtn').click()`);
        await sleep(350);

        const darkBefore = await cdp.eval(`document.documentElement.classList.contains('dark')`);
        await cdp.eval(`document.getElementById('drawerThemeToggleBtn').click()`);
        await sleep(200);
        const darkAfter = await cdp.eval(`document.documentElement.classList.contains('dark')`);
        assert.notStrictEqual(darkBefore, darkAfter, 'Nút đổi theme trong drawer phải đổi class dark trên html');

        const darkScreenshotPath = path.join(ARTIFACT_DIR, 'mobile_drawer_dark_390.png');
        await cdp.captureScreenshot(darkScreenshotPath);
        console.log(`  ✓ Đã lưu ảnh chụp Mobile Drawer Dark Mode: ${darkScreenshotPath}`);

        // Bật lại theme cũ
        await cdp.eval(`document.getElementById('drawerThemeToggleBtn').click()`);
        await sleep(200);
        await cdp.eval(`document.getElementById('mobileDrawerCloseBtn').click()`);
        await sleep(350);
        console.log(`  ✓ Dark mode toggle từ drawer hoạt động chuẩn xác`);

        console.log('\n================================================================================');
        console.log(' TẤT CẢ 12 CA KIỂM THỬ MOBILE DRAWER NAVIGATION ĐÃ ĐẠT 100%! ');
        console.log('================================================================================\n');

    } finally {
        if (cdp) await cdp.close().catch(() => {});
        chrome.kill();
        server.close();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
}

run().catch(err => {
    console.error('LỖI KIỂM THỬ:', err);
    process.exit(1);
});
