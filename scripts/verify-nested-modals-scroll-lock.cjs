/**
 * scripts/verify-nested-modals-scroll-lock.cjs
 *
 * Kiểm tra chuyên biệt theo yêu cầu:
 * 1. Rà hasActiveModalOpen() theo ID thực tế (bao gồm communityCheckinModal, adminActionReasonModal và các modal khác).
 * 2. Kiểm tra modal lồng nhau:
 *    - Mở Kiểm duyệt (adminModerationModal) -> khóa nền body.
 *    - Mở cửa sổ Lý do từ chối (adminActionReasonModal) lồng bên trong -> vẫn khóa nền body.
 *    - Đóng cửa sổ Lý do từ chối (closeActionReasonModal) -> NỀN BODY VẪN PHẢI KHÓA VÌ KIỂM DUYỆT CÒN MỞ.
 *    - Đóng modal cuối cùng (closeAdminModerationModal) -> Khôi phục cuộn trang nền hoàn toàn.
 * 3. Kiểm tra cặp lồng nhau khác:
 *    - Mở deepPlaceDetailModal -> khóa nền.
 *    - Mở placePhotoGalleryModal (lồng bên trong) -> vẫn khóa nền.
 *    - Đóng placePhotoGalleryModal -> VẪN KHÓA NỀN VÌ deepPlaceDetailModal CÒN MỞ.
 *    - Đóng deepPlaceDetailModal -> Khôi phục cuộn trang nền.
 * 4. Kiểm tra communityCheckinModal (đã đổi từ checkinModal):
 *    - Mở -> khóa nền; Đóng -> khôi phục cuộn nền.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421';
const LIVE_URL = 'https://vivutravinh.id.vn';

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
        const res = await贯彻send('Runtime.evaluate', {
            expression: expr,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            throw new Error('CDP Eval Exception: ' + JSON.stringify(res.exceptionDetails));
        }
        return res.result?.value;
    }

    async captureScreenshot(outputPath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    }

    async close() {
        this.ws.close();
    }
}

// Fix send typo in eval
CDPClient.prototype.eval = async function(expr) {
    const res = await this.send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true
    });
    if (res.exceptionDetails) {
        throw new Error('CDP Eval Exception: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
};

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

async function verifyNestedModals(targetUrl, isProd = false) {
    console.log('================================================================================');
    console.log(` KIỂM THỬ MODAL LỒNG NHAU & SCROLL-LOCK: ${isProd ? 'PRODUCTION' : 'LOCAL'}`);
    console.log('================================================================================\n');

    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));
    if (!chromeExe) throw new Error('Không tìm thấy Chrome');

    const tempDir = path.join(os.tmpdir(), `chrome_nested_test_${isProd ? 'prod' : 'loc'}_${Date.now()}`);
    const cdpPort = 9820 + Math.floor(Math.random() * 150);
    const chrome = spawn(chromeExe, [
        `--remote-debugging-port=${cdpPort}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--mute-audio',
        `--user-data-dir=${tempDir}`,
        `${targetUrl}/?t=${Date.now()}`
    ], { stdio: 'ignore' });

    let cdp;
    try {
        const wsUrl = await getDebuggerUrl(cdpPort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
            mobile: true
        });

        // Chờ app sẵn sàng
        let ready = false;
        for (let i = 0; i < 40; i++) {
            ready = await cdp.eval(`Boolean(
                window.ViVuApp &&
                window.ViVuApp.hasActiveModalOpen &&
                window.ViVuApp.syncBodyScrollLock &&
                document.getElementById('adminModerationModal') &&
                document.getElementById('adminActionReasonModal')
            )`);
            if (ready) break;
            await sleep(250);
        }
        if (!ready) throw new Error('Ứng dụng chưa sẵn sàng hoặc thiếu modal lồng nhau');
        console.log(' ✓ Ứng dụng đã sẵn sàng.\n');

        // ---------------------------------------------------------------------
        // TEST 1: KIỂM TRA hasActiveModalOpen() NHẬN BIẾT ĐÚNG TẤT CẢ ID THỰC
        // ---------------------------------------------------------------------
        console.log('--- [TEST 1] Kiểm tra hasActiveModalOpen() với ID thực tế ---');
        const modalIdChecks = await cdp.eval(`(() => {
            const hasCheckinModal = Boolean(document.getElementById('communityCheckinModal'));
            const hasReasonModal = Boolean(document.getElementById('adminActionReasonModal'));
            const hasModerationModal = Boolean(document.getElementById('adminModerationModal'));
            const initialHasActive = window.ViVuApp.hasActiveModalOpen();
            return {
                hasCheckinModal,
                hasReasonModal,
                hasModerationModal,
                initialHasActive
            };
        })()`);

        assert.strictEqual(modalIdChecks.hasCheckinModal, true, 'DOM phải có #communityCheckinModal');
        assert.strictEqual(modalIdChecks.hasReasonModal, true, 'DOM phải có #adminActionReasonModal');
        assert.strictEqual(modalIdChecks.hasModerationModal, true, 'DOM phải có #adminModerationModal');
        assert.strictEqual(modalIdChecks.initialHasActive, false, 'Khi chưa mở modal nào, hasActiveModalOpen() phải trả về false');
        console.log('   ✓ DOM có đủ các modal thực: communityCheckinModal, adminActionReasonModal, adminModerationModal');
        console.log('   ✓ Trạng thái khởi tạo: hasActiveModalOpen() = false\n');

        // ---------------------------------------------------------------------
        // TEST 2: KIỂM TRA MODAL LỒNG NHAU: KIỂM DUYỆT & LÝ DO TỪ CHỐI
        // ---------------------------------------------------------------------
        console.log('--- [TEST 2] Modal lồng nhau: Kiểm duyệt -> Cửa sổ lý do từ chối -> Đóng từng bước ---');

        // Bước 2.1: Mở modal cha (adminModerationModal) trực tiếp
        console.log(' 2.1 Mở modal cha [adminModerationModal]...');
        await cdp.eval(`(() => {
            const modal = document.getElementById('adminModerationModal');
            modal.classList.remove('hidden');
            window.ViVuApp.syncBodyScrollLock();
        })()`);
        await sleep(300);

        const step1State = await cdp.eval(`(() => {
            const modal = document.getElementById('adminModerationModal');
            const isVisible = Boolean(modal && !modal.classList.contains('hidden'));
            const hasActive = window.ViVuApp.hasActiveModalOpen();
            const isLocked = document.body.classList.contains('overflow-hidden') && document.body.style.overflow === 'hidden';
            return { isVisible, hasActive, isLocked };
        })()`);

        assert.strictEqual(step1State.isVisible, true, 'adminModerationModal phải hiển thị');
        assert.strictEqual(step1State.hasActive, true, 'hasActiveModalOpen() phải trả về true khi adminModerationModal mở');
        assert.strictEqual(step1State.isLocked, true, 'Body phải khóa cuộn khi adminModerationModal mở');
        console.log('     ✓ Bước 2.1: adminModerationModal mở, hasActive=true, body scroll-lock = BẬT');

        // Bước 2.2: Mở modal con lồng nhau [adminActionReasonModal]
        console.log(' 2.2 Mở modal con lồng nhau [adminActionReasonModal] qua openActionReasonModal...');
        await cdp.eval(`window.ViVuApp.openActionReasonModal('reject_post', 'test_post_01', 'Bài viết thử nghiệm')`);
        await sleep(300);

        const step2State = await cdp.eval(`(() => {
            const parentModal = document.getElementById('adminModerationModal');
            const childModal = document.getElementById('adminActionReasonModal');
            const isParentVisible = Boolean(parentModal && !parentModal.classList.contains('hidden'));
            const isChildVisible = Boolean(childModal && !childModal.classList.contains('hidden'));
            const hasActive = window.ViVuApp.hasActiveModalOpen();
            const isLocked = document.body.classList.contains('overflow-hidden') && document.body.style.overflow === 'hidden';
            return { isParentVisible, isChildVisible, hasActive, isLocked };
        })()`);

        assert.strictEqual(step2State.isParentVisible, true, 'Modal cha (adminModerationModal) vẫn phải mở');
        assert.strictEqual(step2State.isChildVisible, true, 'Modal con (adminActionReasonModal) phải mở lồng bên trên');
        assert.strictEqual(step2State.isLocked, true, 'Body vẫn phải khóa cuộn khi cả 2 modal cùng mở');
        console.log('     ✓ Bước 2.2: Cả 2 modal cùng mở lồng nhau, body scroll-lock = DUY TRÌ BẬT');

        // Chụp ảnh bằng chứng 2 modal lồng nhau
        const shotNestedOpen = path.join(ARTIFACT_DIR, isProd ? 'prod_nested_reason_modal_open.png' : 'local_nested_reason_modal_open.png');
        await cdp.captureScreenshot(shotNestedOpen);
        console.log(`     ✓ [Artifact] Đã lưu ảnh 2 modal lồng nhau: ${shotNestedOpen}`);

        // Bước 2.3: ĐÓNG CỬA SỔ LÝ DO TỪ CHỐI (MODAL CON)
        console.log(' 2.3 Đóng cửa sổ con [adminActionReasonModal] qua closeActionReasonModal...');
        await cdp.eval(`window.ViVuApp.closeActionReasonModal()`);
        await sleep(300);

        const step3State = await cdp.eval(`(() => {
            const parentModal = document.getElementById('adminModerationModal');
            const childModal = document.getElementById('adminActionReasonModal');
            const isChildClosed = Boolean(!childModal || childModal.classList.contains('hidden'));
            const isParentStillVisible = Boolean(parentModal && !parentModal.classList.contains('hidden'));
            const hasActive = window.ViVuApp.hasActiveModalOpen();
            const isLocked = document.body.classList.contains('overflow-hidden') && document.body.style.overflow === 'hidden';
            return { isChildClosed, isParentStillVisible, hasActive, isLocked };
        })()`);

        assert.strictEqual(step3State.isChildClosed, true, 'Modal con (adminActionReasonModal) phải đã đóng');
        assert.strictEqual(step3State.isParentStillVisible, true, 'Modal cha (adminModerationModal) PHẢI VẪN CÒN MỞ');
        assert.strictEqual(step3State.hasActive, true, 'hasActiveModalOpen() PHẢI VẪN LÀ TRUE');
        assert.strictEqual(step3State.isLocked, true, 'CRITICAL: Đóng modal con thì nền body VẪN PHẢI BỊ KHÓA CUỘN (không được mở cuộn nhầm)');
        console.log('     ✓ [ĐẠT YÊU CẦU CỐT LÕI] Đóng cửa sổ lý do từ chối: Modal con đóng, Modal cha vẫn mở, Body VẪN TIẾP TỤC KHÓA CUỘN!');

        // Bước 2.4: ĐÓNG MODAL CUỐI CÙNG (MODAL CHA)
        console.log(' 2.4 Đóng modal cuối cùng [adminModerationModal] qua closeAdminModerationModal...');
        await cdp.eval(`window.ViVuApp.closeAdminModerationModal()`);
        await sleep(300);

        const step4State = await cdp.eval(`(() => {
            const parentModal = document.getElementById('adminModerationModal');
            const childModal = document.getElementById('adminActionReasonModal');
            const isParentClosed = Boolean(!parentModal || parentModal.classList.contains('hidden'));
            const isChildClosed = Boolean(!childModal || childModal.classList.contains('hidden'));
            const hasActive = window.ViVuApp.hasActiveModalOpen();
            const isScrollRestored = !document.body.classList.contains('overflow-hidden') && document.body.style.overflow !== 'hidden';
            return { isParentClosed, isChildClosed, hasActive, isScrollRestored };
        })()`);

        assert.strictEqual(step4State.isParentClosed, true, 'Modal cha phải đã đóng');
        assert.strictEqual(step4State.hasActive, false, 'hasActiveModalOpen() phải trả về false khi đóng hết modal');
        assert.strictEqual(step4State.isScrollRestored, true, 'CRITICAL: Đóng modal cuối cùng thì cuộn trang nền PHẢI ĐƯỢC KHÔI PHỤC HOÀN TOÀN');
        console.log('     ✓ [ĐẠT YÊU CẦU CỐT LÕI] Đóng modal cuối cùng: hasActive=false, Body scroll-lock = ĐÃ KHÔI PHỤC HOÀN TOÀN!\n');

        // ---------------------------------------------------------------------
        // TEST 3: KIỂM TRA CẶP LỒNG NHAU THỨ 2: deepPlaceDetail & placePhotoGallery
        // ---------------------------------------------------------------------
        console.log('--- [TEST 3] Modal lồng nhau thứ 2: deepPlaceDetail -> placePhotoGallery -> Đóng từng bước ---');

        await cdp.eval(`window.ViVuApp.openDeepPlaceDetail('chua-ang')`);
        await sleep(300);
        let deepState = await cdp.eval(`(() => ({
            deepOpen: !document.getElementById('deepPlaceDetailModal').classList.contains('hidden'),
            locked: document.body.classList.contains('overflow-hidden')
        }))()`);
        assert.strictEqual(deepState.deepOpen, true);
        assert.strictEqual(deepState.locked, true);
        console.log('     ✓ Mở deepPlaceDetailModal -> Khóa cuộn');

        // Mở thư viện ảnh lồng nhau
        await cdp.eval(`window.ViVuApp.openPlacePhotoGallery(0)`);
        await sleep(300);
        let galleryState = await cdp.eval(`(() => ({
            galleryOpen: !document.getElementById('placePhotoGalleryModal').classList.contains('hidden'),
            deepOpen: !document.getElementById('deepPlaceDetailModal').classList.contains('hidden'),
            locked: document.body.classList.contains('overflow-hidden')
        }))()`);
        assert.strictEqual(galleryState.galleryOpen, true);
        assert.strictEqual(galleryState.deepOpen, true);
        assert.strictEqual(galleryState.locked, true);
        console.log('     ✓ Mở placePhotoGalleryModal lồng bên trong -> Duy trì khóa cuộn');

        // Đóng thư viện ảnh
        await cdp.eval(`window.ViVuApp.closePlacePhotoGallery()`);
        await sleep(300);
        let galleryClosedState = await cdp.eval(`(() => ({
            galleryClosed: document.getElementById('placePhotoGalleryModal').classList.contains('hidden'),
            deepStillOpen: !document.getElementById('deepPlaceDetailModal').classList.contains('hidden'),
            locked: document.body.classList.contains('overflow-hidden')
        }))()`);
        assert.strictEqual(galleryClosedState.galleryClosed, true);
        assert.strictEqual(galleryClosedState.deepStillOpen, true);
        assert.strictEqual(galleryClosedState.locked, true, 'Đóng gallery thì deepPlaceDetail vẫn mở -> nền PHẢI VẪN KHÓA CUỘN');
        console.log('     ✓ Đóng placePhotoGalleryModal -> deepPlaceDetailModal vẫn mở -> Body VẪN KHÓA CUỘN!');

        // Đóng deepPlaceDetailModal
        await cdp.eval(`window.ViVuApp.closeDeepPlaceDetail()`);
        await sleep(300);
        let deepClosedState = await cdp.eval(`(() => ({
            deepClosed: document.getElementById('deepPlaceDetailModal').classList.contains('hidden'),
            restored: !document.body.classList.contains('overflow-hidden')
        }))()`);
        assert.strictEqual(deepClosedState.deepClosed, true);
        assert.strictEqual(deepClosedState.restored, true);
        console.log('     ✓ Đóng deepPlaceDetailModal -> Cuộn nền ĐÃ ĐƯỢC KHÔI PHỤC!\n');

        // ---------------------------------------------------------------------
        // TEST 4: KIỂM TRA communityCheckinModal (ID ĐÃ SỬA TỪ checkinModal)
        // ---------------------------------------------------------------------
        console.log('--- [TEST 4] Kiểm tra communityCheckinModal (ID chuẩn mới) ---');
        await cdp.eval(`window.ViVuApp.promptAddPostLocation()`);
        await sleep(300);
        let checkinOpen = await cdp.eval(`(() => ({
            isOpen: !document.getElementById('communityCheckinModal').classList.contains('hidden'),
            hasActive: window.ViVuApp.hasActiveModalOpen(),
            locked: document.body.classList.contains('overflow-hidden')
        }))()`);
        assert.strictEqual(checkinOpen.isOpen, true, 'communityCheckinModal phải mở');
        assert.strictEqual(checkinOpen.hasActive, true, 'hasActiveModalOpen() phải nhận diện đúng communityCheckinModal');
        assert.strictEqual(checkinOpen.locked, true, 'Body phải khóa cuộn khi mở communityCheckinModal');
        console.log('     ✓ promptAddPostLocation mở #communityCheckinModal: hasActive=true, ScrollLocked=true');

        await cdp.eval(`window.ViVuApp.closeCommunityCheckinModal()`);
        await sleep(300);
        let checkinClosed = await cdp.eval(`(() => ({
            isClosed: document.getElementById('communityCheckinModal').classList.contains('hidden'),
            hasActive: window.ViVuApp.hasActiveModalOpen(),
            restored: !document.body.classList.contains('overflow-hidden')
        }))()`);
        assert.strictEqual(checkinClosed.isClosed, true, 'communityCheckinModal phải đóng');
        assert.strictEqual(checkinClosed.hasActive, false, 'hasActiveModalOpen() phải trả về false');
        assert.strictEqual(checkinClosed.restored, true, 'Cuộn body phải được khôi phục khi đóng communityCheckinModal');
        console.log('     ✓ closeCommunityCheckinModal: hasActive=false, ScrollRestored=true\n');

        console.log('================================================================================');
        console.log(` TẤT CẢ KIỂM THỬ MODAL LỒNG NHAU TRÊN ${isProd ? 'PRODUCTION' : 'LOCAL'} ĐẠT 100%! `);
        console.log('================================================================================\n');

    } finally {
        if (cdp) await cdp.close().catch(() => {});
        chrome.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
}

async function startLocalServer(port = 8855) {
    const server = http.createServer((req, res) => {
        let reqPath = req.url.split('?')[0];

        if (reqPath.startsWith('/api/')) {
            const targetUrl = new URL(req.url, LIVE_URL);
            const proxyReq = https.request(targetUrl, {
                method: req.method,
                headers: {
                    ...req.headers,
                    host: 'vivutravinh.id.vn'
                }
            }, proxyRes => {
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res);
            });
            proxyReq.on('error', err => {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            });
            req.pipe(proxyReq);
            return;
        }

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

    await new Promise(r => server.listen(port, r));
    return server;
}

async function main() {
    const isProdMode = process.argv.includes('--prod');
    const isLocalMode = process.argv.includes('--local') || !isProdMode;

    if (isLocalMode) {
        const localPort = 8855;
        const localServer = await startLocalServer(localPort);
        try {
            await verifyNestedModals(`http://localhost:${localPort}`, false);
        } finally {
            localServer.close();
        }
    }

    if (isProdMode) {
        await verifyNestedModals(LIVE_URL, true);
    }
}

main().catch(err => {
    console.error('LỖI KIỂM THỬ MODAL LỒNG NHAU:', err);
    process.exit(1);
});
