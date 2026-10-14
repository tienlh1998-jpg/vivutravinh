/**
 * verify-companion-admin-live.cjs
 * Kiểm thử E2E tự động qua Chrome CDP cho trang "Đồng hành cùng Admin" (#view-companion)
 * Xác minh đầy đủ:
 * 1. Donate tự nguyện (VietQR + Tiers + STK + Tiến độ quỹ máy chủ)
 * 2. Trang mình bán hàng (Góc đồ công nghệ của Admin)
 * 3. Trang nhỏ chứa các hình sản phẩm và link liên kết tiếp thị Shopee
 * 4. Tương tác chọn gói ủng hộ, tạo mã QR tùy chỉnh, xác nhận mô phỏng
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');
const WebSocket = globalThis.WebSocket;

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.resolve(os.homedir(), '.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Simple static server
function createStaticServer(rootDir, port = 8089) {
    const MIME_TYPES = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2'
    };

    const server = http.createServer((req, res) => {
        let reqPath = decodeURIComponent(req.url.split('?')[0]);
        if (reqPath === '/') reqPath = '/index.html';
        const filePath = path.join(rootDir, reqPath);

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found: ' + reqPath);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
        fs.createReadStream(filePath).pipe(res);
    });

    return new Promise(resolve => {
        server.listen(port, () => resolve(server));
    });
}

// Find Chrome Executable
function findChrome() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return 'chrome';
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.id = 1;
        this.callbacks = new Map();
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.ws.onopen = () => resolve();
            this.ws.onerror = (err) => reject(err);
            this.ws.onmessage = (msg) => {
                const data = JSON.parse(msg.data);
                if (data.id && this.callbacks.has(data.id)) {
                    const { resolve, reject } = this.callbacks.get(data.id);
                    this.callbacks.delete(data.id);
                    if (data.error) reject(data.error);
                    else resolve(data.result);
                }
            };
        });
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = this.id++;
            this.callbacks.set(id, { resolve, reject });
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
        return res.result ? res.result.value : undefined;
    }

    async captureScreenshot(outputPath, fullPage = false) {
        let params = { format: 'png' };
        if (fullPage) {
            const metrics = await this.send('Page.getLayoutMetrics');
            const width = Math.ceil(metrics.contentSize.width);
            const height = Math.ceil(metrics.contentSize.height);
            await this.send('Emulation.setDeviceMetricsOverride', {
                width,
                height,
                deviceScaleFactor: 1,
                mobile: false
            });
            params.captureBeyondViewport = true;
        }
        const shot = await this.send('Page.captureScreenshot', params);
        fs.writeFileSync(outputPath, Buffer.from(shot.data, 'base64'));
    }

    close() {
        this.ws.close();
    }
}

async function main() {
    console.log('=== BẮT ĐẦU KIỂM THỬ E2E TRANG ĐỒNG HÀNH CÙNG ADMIN (PHASE 10) ===');
    const port = 8089;
    const server = await createStaticServer(ROOT_DIR, port);
    console.log(`[1] Static Server sẵn sàng tại http://localhost:${port}`);

    const chromePath = findChrome();
    const cdpPort = 9229;
    const userDataDir = path.join(os.tmpdir(), 'chrome_cdp_companion_' + Date.now());

    const chromeProc = spawn(chromePath, [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--headless=new',
        '--window-size=1280,960'
    ]);

    try {
        let wsUrl;
        for (let i = 0; i < 20; i++) {
            await sleep(300);
            try {
                const targetsRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
                if (targetsRes.ok) {
                    const targets = await targetsRes.json();
                    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
                    if (pageTarget && pageTarget.webSocketDebuggerUrl) {
                        wsUrl = pageTarget.webSocketDebuggerUrl;
                        break;
                    }
                }
            } catch (e) {}
        }
        if (!wsUrl) throw new Error('Không thể kết nối tới Page target của Chrome');

        const cdp = new CDPClient(wsUrl);
        await cdp.connect();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        console.log('[2] CDP kết nối thành công tới page target');

        // Navigate to companion view
        console.log('[3] Điều hướng tới http://localhost:' + port + '/#/companion');
        await cdp.send('Page.navigate', { url: `http://localhost:${port}/#/companion` });
        await sleep(2500);

        // Ensure companion view is switched
        await cdp.eval(`window.ViVuApp?.navGoCompanion ? window.ViVuApp.navGoCompanion() : (document.getElementById('sidebarLinkCompanion')?.click())`);
        await sleep(800);

        // Verify that #view-companion is visible
        const checkView = await cdp.eval(`(() => {
            const view = document.getElementById('view-companion');
            const isVisible = view && !view.classList.contains('hidden');
            const heroText = view?.querySelector('h1')?.innerText;
            const text = (view?.innerText || '').replace(/\\s+/g, ' ');

            // 1. Kiểm tra Donate tự nguyện
            const hasDonateSection = text.includes('Ủng Hộ Kinh Phí Duy Trì');
            const hasCoffeeTier = text.includes('20K') && text.includes('cà phê');
            const hasNoodleTier = text.includes('35K') && text.includes('bún nước lèo');
            const hasHostingTier = text.includes('100K') && text.includes('hosting');
            const hasVietQrSvg = Boolean(view?.querySelector('svg[aria-label*="VietQR"]'));
            const hasBankInfo = text.includes('Vietcombank') && text.includes('VIVUTRAVINH COMMUNITY') && text.includes('9826');
            const hasProgressBudget = text.includes('650.000đ') && text.includes('520.000đ') && text.includes('80%');

            // 2. Kiểm tra Trang mình bán hàng (Góc đồ công nghệ)
            const hasTechSection = text.includes('Góc Đồ Công Nghệ Của Admin');
            const hasSsd = text.includes('SSD NVMe 1TB Kingston') && text.includes('1.250.000đ');
            const hasNuPhy = text.includes('NuPhy Air75 v2') && text.includes('1.800.000đ');
            const hasStand = text.includes('Giá đỡ laptop nhôm xoay 360°') && text.includes('320.000đ');

            // 3. Kiểm tra Trang nhỏ liên kết tiếp thị Shopee
            const hasShopeeSection = text.includes('Đồ Dùng Hữu Ích Khi Đi Khám Phá');
            const hasPhoneMount = text.includes('gắn ghi đông xe máy') && text.includes('165.000đ');
            const hasCable = text.includes('Baseus') && text.includes('89.000đ');
            const hasNomad = text.includes('Nomad') && text.includes('240.000đ');
            const shopeeButtons = Array.from(view?.querySelectorAll('a[href*="shopee.vn"]') || []).length;

            // 4. Kiểm tra Danh sách tri ân
            const hasSupporters = text.includes('Danh sách tri ân người đồng hành') && text.includes('Nguyễn Văn Tiến');

            return {
                isVisible,
                heroText,
                hasDonateSection,
                hasCoffeeTier,
                hasNoodleTier,
                hasHostingTier,
                hasVietQrSvg,
                hasBankInfo,
                hasProgressBudget,
                hasTechSection,
                hasSsd,
                hasNuPhy,
                hasStand,
                hasShopeeSection,
                hasPhoneMount,
                hasCable,
                hasNomad,
                shopeeButtons,
                hasSupporters
            };
        })()`);

        console.log('Trạng thái view Đồng hành cùng Admin:', JSON.stringify(checkView, null, 2));

        assert.ok(checkView.isVisible, 'View #view-companion phải hiển thị công khai');
        assert.ok(checkView.hasDonateSection, 'Phải có mục Donate tự nguyện');
        assert.ok(checkView.hasCoffeeTier && checkView.hasNoodleTier && checkView.hasHostingTier, 'Phải có đầy đủ 3 gói donate 20k, 35k, 100k');
        assert.ok(checkView.hasVietQrSvg, 'Phải có mã VietQR SVG');
        assert.ok(checkView.hasBankInfo, 'Phải có thông tin chuyển khoản Vietcombank 9826');
        assert.ok(checkView.hasProgressBudget, 'Phải có báo cáo tiến độ quỹ máy chủ 80%');
        assert.ok(checkView.hasTechSection, 'Phải có Góc đồ công nghệ của Admin (Trang mình bán hàng)');
        assert.ok(checkView.hasSsd && checkView.hasNuPhy && checkView.hasStand, 'Phải có 3 sản phẩm công nghệ thanh lý');
        assert.ok(checkView.hasShopeeSection, 'Phải có mục Đồ dùng du lịch hữu ích');
        assert.ok(checkView.hasPhoneMount && checkView.hasCable && checkView.hasNomad, 'Phải có 3 sản phẩm tiếp thị Shopee');
        assert.ok(checkView.shopeeButtons >= 3, 'Phải có tối thiểu 3 nút Xem trên Shopee');
        assert.ok(checkView.hasSupporters, 'Phải có danh sách tri ân người đồng hành');

        console.log('  ✓ Đầy đủ cả 3 thành phần cốt lõi: Donate tự nguyện, Bán hàng Admin và Tiếp thị Shopee!');

        // [4] Test tương tác chọn gói ủng hộ 100.000đ
        console.log('[4] Thử nghiệm chọn gói 100K (Hosting)...');
        await cdp.eval(`window.ViVuApp.selectDonationTier(100000, 'hosting')`);
        await sleep(500);

        const check100k = await cdp.eval(`(() => {
            const memo = document.getElementById('transferNoteLabel')?.innerText;
            const containerText = document.getElementById('companionSupportContainer')?.innerText || '';
            return {
                memo,
                has100k: memo?.includes('100.000') || containerText.includes('100.000')
            };
        })()`);
        console.log('  ✓ Kết quả chọn gói 100k:', check100k);
        assert.ok(check100k.has100k, 'Nội dung chuyển khoản hoặc số tiền phải cập nhật thành 100.000đ');

        // [5] Test nhập số tiền tùy ý 50.000đ
        console.log('[5] Thử nghiệm nhập số tiền tùy ý 50.000đ và tạo mã QR...');
        await cdp.eval(`(() => {
            const input = document.getElementById('companionCustomDonationInput') || document.getElementById('customDonationInput');
            if (input) {
                input.value = '50000';
            }
            window.ViVuApp.applyCustomDonation();
        })()`);
        await sleep(500);

        const checkCustom = await cdp.eval(`(() => {
            const memo = document.getElementById('transferNoteLabel')?.innerText;
            return { memo };
        })()`);
        console.log('  ✓ Kết quả tạo mã QR tùy chọn:', checkCustom);
        assert.ok(checkCustom.memo?.includes('50.000'), 'Nội dung chuyển khoản phải cập nhật thành 50.000');

        // [6] Test xác nhận mô phỏng ủng hộ
        console.log('[6] Thử nghiệm xác nhận ủng hộ mô phỏng...');
        const beforeFunded = await cdp.eval(`window.ViVuApp.getState().financialReport.monthlyFunded`);
        await cdp.eval(`window.ViVuApp.confirmSimulatedDonation(50000)`);
        await sleep(500);
        const afterFunded = await cdp.eval(`window.ViVuApp.getState().financialReport.monthlyFunded`);
        console.log(`  ✓ Quỹ trước: ${beforeFunded}đ -> Quỹ sau: ${afterFunded}đ (+50.000đ)`);
        assert.strictEqual(afterFunded, beforeFunded + 50000, 'Quỹ máy chủ phải được cộng thêm số tiền ủng hộ');

        // [7] Chụp ảnh minh chứng
        await cdp.eval(`window.scrollTo({ top: 800, behavior: 'instant' })`);
        await sleep(300);
        const screenshotMiddle = path.join(ARTIFACT_DIR, 'live_verified_companion_donate_section.png');
        await cdp.captureScreenshot(screenshotMiddle);
        console.log(`[7] Đã chụp ảnh phần Donate & VietQR: ${screenshotMiddle}`);

        await cdp.eval(`window.scrollTo({ top: 2900, behavior: 'instant' })`);
        await sleep(300);
        const screenshotShopee = path.join(ARTIFACT_DIR, 'live_verified_companion_shopee_and_supporters.png');
        await cdp.captureScreenshot(screenshotShopee);
        console.log(`[7] Đã chụp ảnh phần Tiếp thị Shopee & Tri ân: ${screenshotShopee}`);

        const screenshotPath = path.join(ARTIFACT_DIR, 'live_verified_companion_admin_view.png');
        await cdp.captureScreenshot(screenshotPath, true);
        console.log(`[7] Đã chụp ảnh toàn trang: ${screenshotPath}`);

        console.log('=== KIỂM THỬ E2E TRANG ĐỒNG HÀNH CÙNG ADMIN THÀNH CÔNG 100%! ===');
    } finally {
        chromeProc.kill();
        server.close();
        if (fs.existsSync(userDataDir)) {
            try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
        }
    }
}

main().catch(err => {
    console.error('LỖI KIỂM THỬ:', err);
    process.exit(1);
});
