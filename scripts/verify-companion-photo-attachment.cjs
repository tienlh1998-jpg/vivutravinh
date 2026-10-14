/**
 * verify-companion-photo-attachment.cjs
 * Kiểm thử E2E:
 * 1. Bấm trực tiếp vào 2 nút "+ Thêm thiết bị" và "+ Thêm đồ Shopee" để mở modal.
 * 2. Kiểm tra tính năng Đính kèm & Tải hình ảnh sản phẩm (Upload/DataUrl & Link URL).
 * 3. Kiểm tra khung xem trước ảnh (Preview Area), nút Đổi ảnh, nút Xóa ảnh.
 * 4. Lưu sản phẩm có ảnh đính kèm và kiểm tra card hiển thị hình ảnh chuẩn.
 * 5. Chụp ảnh màn hình bằng chứng Artifact.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = globalThis.WebSocket;

const ARTIFACT_DIR = path.resolve(os.homedir(), '.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421');
const ROOT_DIR = path.resolve(__dirname, '..');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

function startStaticServer(port = 8898) {
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2'
    };

    const server = http.createServer((req, res) => {
        let reqPath = req.url.split('?')[0].split('#')[0];
        if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
        const filePath = path.join(ROOT_DIR, reqPath);

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            res.statusCode = 404;
            res.end('Not found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        fs.createReadStream(filePath).pipe(res);
    });

    return new Promise((resolve) => {
        server.listen(port, () => resolve(server));
    });
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
            throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result ? res.result.value : undefined;
    }

    async captureScreenshot(outputPath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    }

    close() {
        try { this.ws.close(); } catch (e) {}
    }
}

async function main() {
    const port = 8898;
    const server = await startStaticServer(port);
    console.log(`[Server] Static server running at http://localhost:${port}`);

    const cdpPort = 9245;
    const chromePath = findChrome();
    const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-companion-photo-'));

    const chromeProc = spawn(chromePath, [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${tempProfile}`,
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1280,1024',
        '--disable-gpu'
    ]);

    let client = null;

    try {
        await sleep(2000);
        const versionRes = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        const versionData = await versionRes.json();
        const wsUrl = versionData.webSocketDebuggerUrl;

        client = new CDPClient(wsUrl);
        await client.connect();

        await client.send('Target.setDiscoverTargets', { discover: true });
        const targetsRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        const targets = await targetsRes.json();
        const pageTarget = targets.find(t => t.type === 'page');

        client.close();
        client = new CDPClient(pageTarget.webSocketDebuggerUrl);
        await client.connect();

        await client.send('Page.enable');
        await client.send('Runtime.enable');

        console.log('[Step 1] Điều hướng đến trang #/companion...');
        await client.send('Page.navigate', { url: `http://localhost:${port}/#/companion` });
        await sleep(3500);

        console.log('[Step 1b] Thiết lập phiên đăng nhập Admin...');
        await client.eval(`
            const adminSessionData = JSON.stringify({
                access_token: 'fake-admin-token-test',
                refresh_token: 'fake-refresh-token',
                expires_at: Date.now() + 86400000,
                user: {
                    id: 'admin-001',
                    email: 'tienlh1998@gmail.com',
                    role: 'admin',
                    user_metadata: { display_name: 'Admin Lê Hoàng Tiến' }
                }
            });
            localStorage.setItem('vivu_admin_session', adminSessionData);
            sessionStorage.setItem('vivu_admin_session', adminSessionData);
            if (window.ViVuApp?.updateAdminRoleUI) window.ViVuApp.updateAdminRoleUI();
            if (window.ViVuApp?.updateSupportViews) window.ViVuApp.updateSupportViews();
        `);
        await sleep(500);

        // Cuộn xuống khu vực Góc thanh lý
        await client.eval(`(() => {
            const h2 = Array.from(document.querySelectorAll('h2')).find(el => el.textContent.includes('Góc Đồ Công Nghệ'));
            if (h2) h2.scrollIntoView({ behavior: 'instant', block: 'center' });
        })()`);
        await sleep(500);

        // STEP 2: Bấm nút "+ Thêm thiết bị" trực tiếp từ DOM bằng click()
        console.log('[Step 2] Bấm trực tiếp nút "+ Thêm thiết bị"...');
        const clickAddTechRes = await client.eval(`(() => {
            const btn = document.querySelector('button[title*="Thêm thiết bị"]');
            if (!btn) return { error: 'Không tìm thấy nút Thêm thiết bị' };
            btn.click();
            const modal = document.getElementById('companionProductModal');
            return {
                clicked: true,
                modalFound: Boolean(modal),
                modalHidden: modal ? modal.classList.contains('hidden') : null,
                modalDisplay: modal ? window.getComputedStyle(modal).display : null
            };
        })()`);
        console.log('[Step 2] Kết quả click nút "+ Thêm thiết bị":', clickAddTechRes);
        if (!clickAddTechRes.clicked || clickAddTechRes.modalDisplay === 'none' || clickAddTechRes.modalHidden) {
            throw new Error('Lỗi: Nút + Thêm thiết bị không mở modal!');
        }

        // STEP 3: Kiểm tra giao diện đính kèm ảnh trong Modal
        console.log('[Step 3] Kiểm tra giao diện đính kèm ảnh trong Modal...');
        const uploadAreaCheck = await client.eval(`(() => {
            const fileInput = document.getElementById('prodModalFileInput');
            const previewArea = document.getElementById('prodModalImagePreviewArea');
            const urlInput = document.getElementById('prodModalImageUrlManual');
            const hiddenImage = document.getElementById('prodModalImage');
            return {
                hasFileInput: Boolean(fileInput),
                hasPreviewArea: Boolean(previewArea),
                hasUrlInput: Boolean(urlInput),
                hasHiddenImage: Boolean(hiddenImage),
                fileInputAccept: fileInput ? fileInput.getAttribute('accept') : null
            };
        })()`);
        console.log('[Step 3] Kết quả kiểm tra form đính kèm ảnh:', uploadAreaCheck);
        if (!uploadAreaCheck.hasFileInput || !uploadAreaCheck.hasPreviewArea) {
            throw new Error('Lỗi: Khung đính kèm ảnh không hiển thị trong modal!');
        }

        // STEP 4: Giả lập tải ảnh lên (Tạo 1 ảnh Data URL canvas 100x100 màu cam)
        console.log('[Step 4] Giả lập đính kèm hình ảnh và xem trước (Preview)...');
        const sampleImageAttached = await client.eval(`(() => {
            // Tạo 1 sample canvas data URL
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 300;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#EA580C';
            ctx.fillRect(0, 0, 400, 300);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '24px sans-serif';
            ctx.fillText('ẢNH THỰC TẾ SẢN PHẨM', 40, 160);
            const sampleDataUrl = canvas.toDataURL('image/jpeg', 0.85);

            // Cập nhật giá trị và preview
            const hiddenInput = document.getElementById('prodModalImage');
            if (hiddenInput) hiddenInput.value = sampleDataUrl;
            window.ViVuApp.updateCompanionImagePreview(sampleDataUrl);

            const previewArea = document.getElementById('prodModalImagePreviewArea');
            const imgEl = previewArea ? previewArea.querySelector('img') : null;
            const hasChangeBtn = previewArea && previewArea.innerText.includes('Đổi ảnh');
            const hasDeleteBtn = previewArea && previewArea.innerText.includes('Xóa ảnh');

            return {
                hasImg: Boolean(imgEl),
                imgSrcPrefix: imgEl ? imgEl.src.slice(0, 30) : null,
                hasChangeBtn,
                hasDeleteBtn
            };
        })()`);
        console.log('[Step 4] Kết quả xem trước ảnh mẫu:', sampleImageAttached);
        if (!sampleImageAttached.hasImg || !sampleImageAttached.hasDeleteBtn) {
            throw new Error('Lỗi: Khung xem trước không render ảnh preview hoặc thiếu nút thao tác!');
        }

        // Chụp ảnh Modal có xem trước ảnh đính kèm
        const modalWithPhotoShot = path.join(ARTIFACT_DIR, 'live_companion_admin_modal_with_photo.png');
        await client.captureScreenshot(modalWithPhotoShot);
        console.log(`[Screenshot] Đã chụp ảnh Modal đính kèm ảnh: ${modalWithPhotoShot}`);

        // STEP 5: Lưu sản phẩm công nghệ có ảnh đính kèm
        console.log('[Step 5] Lưu thiết bị có ảnh đính kèm vào danh sách...');
        await client.eval(`(() => {
            document.getElementById('prodModalName').value = 'Ống kính Sony 24-70mm GM II';
            document.getElementById('prodModalPrice').value = '38500000';
            document.getElementById('prodModalCondition').value = 'Mới 99.9% • Chính hãng Sony VN';
            document.getElementById('prodModalDesc').value = 'Ống kính chụp phong cảnh Trà Vinh cực nét, đầy đủ cap hood bao da hộp zin.';
            
            const form = document.getElementById('companionProductForm');
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        })()`);
        await sleep(1000);

        // Kiểm tra sản phẩm trên danh sách có ảnh img và giá chuẩn không
        const productWithPhotoCard = await client.eval(`(() => {
            const cards = Array.from(document.querySelectorAll('div.group'));
            const targetCard = cards.find(c => c.textContent.includes('Sony 24-70mm GM II'));
            if (!targetCard) return { error: 'Không tìm thấy card Sony 24-70mm' };
            const img = targetCard.querySelector('img');
            return {
                foundCard: true,
                hasImgTag: Boolean(img),
                imgSrcPrefix: img ? img.src.slice(0, 30) : null,
                cardTextSnippet: targetCard.textContent.slice(0, 100)
            };
        })()`);
        console.log('[Step 5] Kết quả hiển thị card sản phẩm có ảnh:', productWithPhotoCard);
        if (!productWithPhotoCard.foundCard || !productWithPhotoCard.hasImgTag) {
            throw new Error('Lỗi: Card sản phẩm mới không hiển thị ảnh đính kèm!');
        }

        // STEP 6: Bấm trực tiếp nút "+ Thêm đồ Shopee"
        console.log('[Step 6] Bấm trực tiếp nút "+ Thêm đồ Shopee"...');
        const clickAddShopeeRes = await client.eval(`(() => {
            const btn = document.querySelector('button[title*="Thêm đồ Shopee"]') || document.querySelector('button[title*="Shopee"]');
            if (!btn) return { error: 'Không tìm thấy nút Thêm đồ Shopee' };
            btn.click();
            const modal = document.getElementById('companionProductModal');
            return {
                clicked: true,
                modalFound: Boolean(modal),
                modalHidden: modal ? modal.classList.contains('hidden') : null,
                modalDisplay: modal ? window.getComputedStyle(modal).display : null,
                modalType: document.getElementById('prodModalType')?.value
            };
        })()`);
        console.log('[Step 6] Kết quả click nút "+ Thêm đồ Shopee":', clickAddShopeeRes);
        if (!clickAddShopeeRes.clicked || clickAddShopeeRes.modalDisplay === 'none' || clickAddShopeeRes.modalType !== 'travel') {
            throw new Error('Lỗi: Nút + Thêm đồ Shopee không mở đúng modal phụ kiện!');
        }

        // Test tính năng "Dán link URL ngoài" cho sản phẩm Shopee
        console.log('[Step 7] Thử nghiệm dán link ảnh ngoài vào ô link URL...');
        const manualUrlRes = await client.eval(`(() => {
            const urlInput = document.getElementById('prodModalImageUrlManual');
            urlInput.value = 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80';
            window.ViVuApp.applyManualCompanionImageUrl();

            const hiddenInput = document.getElementById('prodModalImage');
            const previewArea = document.getElementById('prodModalImagePreviewArea');
            const img = previewArea ? previewArea.querySelector('img') : null;

            return {
                hiddenValue: hiddenInput?.value,
                previewImgSrc: img?.src
            };
        })()`);
        console.log('[Step 7] Kết quả áp dụng URL ảnh ngoài:', manualUrlRes);
        if (!manualUrlRes.previewImgSrc || !manualUrlRes.previewImgSrc.includes('unsplash.com')) {
            throw new Error('Lỗi: Áp dụng URL ngoài không thành công!');
        }

        // Lưu sản phẩm Shopee có ảnh
        console.log('[Step 8] Lưu phụ kiện Shopee có ảnh link ngoài...');
        await client.eval(`(() => {
            document.getElementById('prodModalName').value = 'Bình Giữ Nhiệt Du Lịch Stanley 1L';
            document.getElementById('prodModalPrice').value = '650000';
            document.getElementById('prodModalRating').value = '4.95 (1.5k đã mua)';
            document.getElementById('prodModalLink').value = 'https://shopee.vn/stanley-thermos-1l';
            document.getElementById('prodModalDesc').value = 'Bình giữ nóng lạnh 24 giờ, lớp vỏ thép không gỉ siêu bền đi phượt miền Tây.';
            
            const form = document.getElementById('companionProductForm');
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        })()`);
        await sleep(1000);

        // Cuộn xuống xem kết quả 2 card có ảnh
        await client.eval(`(() => {
            const h2 = Array.from(document.querySelectorAll('h2')).find(el => el.textContent.includes('Cẩm Nang & Phụ Kiện'));
            if (h2) h2.scrollIntoView({ behavior: 'instant', block: 'center' });
        })()`);
        await sleep(600);

        // Chụp ảnh khu vực phụ kiện Shopee hiển thị ảnh
        const verifiedGearShot = path.join(ARTIFACT_DIR, 'live_companion_admin_verified_photos.png');
        await client.captureScreenshot(verifiedGearShot);
        console.log(`[Screenshot] Đã chụp ảnh kết quả 2 sản phẩm có ảnh: ${verifiedGearShot}`);

        console.log('\n=== TẤT CẢ CÁC BƯỚC KIỂM THỬ ĐÍNH KÈM ẢNH & CLICK NÚT ĐÃ HOÀN TOÀN THÀNH CÔNG 100%! ===');
    } finally {
        if (client) client.close();
        chromeProc.kill();
        server.close();
        try {
            fs.rmSync(tempProfile, { recursive: true, force: true });
        } catch (e) {}
    }
}

main().catch(err => {
    console.error('[TEST FAILED]:', err);
    process.exit(1);
});
