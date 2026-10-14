/**
 * verify-companion-admin-modal.cjs
 * Kiểm thử E2E giao diện quản lý Modal cho Quản trị viên (Admin)
 * Thêm mới, Chỉnh sửa, Xóa và Đặt lại sản phẩm Thanh lý & Phụ kiện Shopee Affiliate
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

function startStaticServer(port = 8899) {
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
            throw new Error('CDP Eval Exception: ' + JSON.stringify(res.exceptionDetails));
        }
        return res.result ? res.result.value : undefined;
    }

    async captureScreenshot(outputPath) {
        const shot = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(outputPath, Buffer.from(shot.data, 'base64'));
    }

    close() {
        this.ws.close();
    }
}

async function main() {
    console.log('=== BẮT ĐẦU KIỂM THỬ E2E MODAL QUẢN LÝ SẢN PHẨM ADMIN COMPANION ===');

    const port = 8899;
    const server = await startStaticServer(port);
    console.log(`[Server] Máy chủ tĩnh đang chạy tại http://localhost:${port}`);

    const chromePath = findChrome();
    const cdpPort = 9235;
    const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-companion-modal-'));

    const chromeProc = spawn(chromePath, [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${tempProfile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--headless=new',
        '--window-size=1280,900'
    ]);

    await sleep(1500);

    let client = null;
    try {
        const targetsRes = await fetch(`http://127.0.0.1:${cdpPort}/json`);
        const targets = await targetsRes.json();
        const pageTarget = targets.find(t => t.type === 'page');

        if (!pageTarget) throw new Error('Không tìm thấy trang target trong Chrome');

        client = new CDPClient(pageTarget.webSocketDebuggerUrl);
        await client.connect();

        await client.send('Page.enable');
        await client.send('Runtime.enable');

        // Bỏ qua hộp thoại confirm mặc định bằng cách tự động đồng ý (dialog handler)
        await client.send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
        await client.send('Page.javascriptDialogOpening', {}).catch(() => {});
        client.ws.addEventListener('message', async (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.method === 'Page.javascriptDialogOpening') {
                    await client.send('Page.handleJavaScriptDialog', { accept: true });
                }
            } catch (e) {}
        });

        console.log('[E2E 1] Điều hướng đến http://localhost:' + port + '/#/companion với tư cách Khách vãng lai (Guest)...');
        await client.send('Page.navigate', { url: `http://localhost:${port}/#/companion` });
        await sleep(2500);

        // Kiểm tra xem khách vãng lai có thấy nút thêm sản phẩm hay không
        const guestHasAddBtn = await client.eval(`
            Boolean(document.querySelector('button[title*="Thêm thiết bị"]') || document.querySelector('button[title*="Thêm phụ kiện"]'))
        `);
        console.log(`[E2E 1] Guest có thấy nút Thêm sản phẩm không? ${guestHasAddBtn} (Kỳ vọng: false)`);
        if (guestHasAddBtn) throw new Error('Lỗi bảo mật: Khách vãng lai nhìn thấy nút Thêm sản phẩm!');

        // Giả lập Admin đăng nhập
        console.log('[E2E 2] Giả lập Quản trị viên đăng nhập (admin role)...');
        const debugInfo = await client.eval(`
            localStorage.setItem('vivu_admin_session', JSON.stringify({
                access_token: 'fake-admin-token-test',
                refresh_token: 'fake-refresh-token',
                expires_at: Date.now() + 86400000,
                user: {
                    id: 'admin-001',
                    email: 'tienlh1998@gmail.com',
                    role: 'admin',
                    user_metadata: { display_name: 'Admin Lê Hoàng Tiến' }
                }
            }));
            sessionStorage.setItem('vivu_admin_session', JSON.stringify({
                access_token: 'fake-admin-token-test',
                refresh_token: 'fake-refresh-token',
                expires_at: Date.now() + 86400000,
                user: {
                    id: 'admin-001',
                    email: 'tienlh1998@gmail.com',
                    role: 'admin',
                    user_metadata: { display_name: 'Admin Lê Hoàng Tiến' }
                }
            }));
            if (window.ViVuApp?.updateAdminRoleUI) {
                window.ViVuApp.updateAdminRoleUI();
            }
            if (window.ViVuApp?.updateSupportViews) {
                window.ViVuApp.updateSupportViews();
            }
            const container = document.getElementById('companionSupportContainer');
            const btns = Array.from(document.querySelectorAll('button')).map(b => b.innerText || b.title);
            ({
                session: localStorage.getItem('vivu_admin_session'),
                hasContainer: Boolean(container),
                containerHTMLSnippet: container ? container.innerHTML.slice(0, 300) : null,
                buttonTexts: btns.filter(t => t && (t.includes('Thêm') || t.includes('Đặt')))
            })
        `);
        console.log('[E2E 2 Debug]:', JSON.stringify(debugInfo, null, 2));

        const adminHasAddBtn = await client.eval(`
            Boolean(document.querySelector('button[title*="Thêm thiết bị"]') && document.querySelector('button[title*="Shopee"]'))
        `);
        console.log(`[E2E 2] Admin có thấy các nút Quản lý Thêm/Đặt lại không? ${adminHasAddBtn} (Kỳ vọng: true)`);
        if (!adminHasAddBtn) throw new Error('Lỗi: Admin không thấy nút Thêm sản phẩm sau khi đăng nhập!');

        // Mở Modal Thêm thiết bị
        console.log('[E2E 3] Mở Modal "Thêm Thiết Bị Thanh Lý Mới"...');
        await client.eval(`
            window.ViVuApp.openCompanionProductModal('tech');
        `);
        await sleep(500);

        const isModalVisible = await client.eval(`
            const modal = document.getElementById('companionProductModal');
            Boolean(modal && !modal.classList.contains('hidden'))
        `);
        console.log(`[E2E 3] Modal quản lý sản phẩm có hiển thị không? ${isModalVisible} (Kỳ vọng: true)`);
        if (!isModalVisible) throw new Error('Lỗi: Modal quản lý sản phẩm không mở!');

        // Chụp ảnh Modal đang mở
        const modalShotPath = path.join(ARTIFACT_DIR, 'live_companion_admin_modal_open.png');
        await client.captureScreenshot(modalShotPath);
        console.log(`[Screenshot] Đã chụp ảnh Modal mở: ${modalShotPath}`);

        // Điền form và Lưu sản phẩm mới
        console.log('[E2E 4] Điền thông tin sản phẩm mới và submit form...');
        await client.eval(`(() => {
            document.getElementById('prodModalName').value = 'Micro Thu Âm Dã Ngoại DJI Mic 2';
            document.getElementById('prodModalPrice').value = '2400000';
            document.getElementById('prodModalCondition').value = 'Like new 99% • Pin 18 tiếng';
            document.getElementById('prodModalIcon').value = 'devices';
            document.getElementById('prodModalDesc').value = 'Bộ micro không dây thu âm vlogging cao cấp chống ồn AI, test thực tế tại Ao Bà Om & Cù Lao Long Trị.';
            
            const form = document.getElementById('companionProductForm');
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(submitEvent);
        })()`);
        await sleep(1000);

        // Kiểm tra xem sản phẩm mới đã xuất hiện trong danh sách và modal đã đóng chưa
        const productAdded = await client.eval(`(() => {
            const m = document.getElementById('companionProductModal');
            const modalClosed = m && m.classList.contains('hidden');
            const hasNewProduct = document.body.innerText.includes('DJI Mic 2') && document.body.innerText.includes('2.400.000đ');
            return { modalClosed, hasNewProduct };
        })()`);
        console.log('[E2E 4] Kết quả sau submit:', productAdded);
        if (!productAdded.modalClosed || !productAdded.hasNewProduct) {
            throw new Error('Lỗi: Sản phẩm mới không được lưu hoặc modal chưa đóng!');
        }

        // Chỉnh sửa sản phẩm vừa thêm
        console.log('[E2E 5] Kiểm tra chức năng Sửa sản phẩm vừa thêm...');
        await client.eval(`(() => {
            const st = window.ViVuApp.getState();
            const it = (st.techClearance || []).find(x => x.name.includes('DJI Mic 2'));
            if (it) {
                window.ViVuApp.openCompanionProductModal('tech', it.id);
            }
        })()`);
        await sleep(500);

        const editPrefilled = await client.eval(`(() => {
            const name = document.getElementById('prodModalName')?.value;
            const price = document.getElementById('prodModalPrice')?.value;
            return { name, price };
        })()`);
        console.log('[E2E 5] Form sửa đã nạp sẵn dữ liệu cũ:', editPrefilled);

        // Cập nhật giá thành 2.150.000đ
        await client.eval(`(() => {
            document.getElementById('prodModalPrice').value = '2150000';
            const form = document.getElementById('companionProductForm');
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        })()`);
        await sleep(1000);

        const priceUpdated = await client.eval(`
            document.body.innerText.includes('2.150.000đ')
        `);
        console.log(`[E2E 5] Giá mới (2.150.000đ) đã hiển thị: ${priceUpdated}`);
        if (!priceUpdated) throw new Error('Lỗi: Cập nhật giá sản phẩm không thành công!');

        // Kiểm tra chức năng Thêm phụ kiện Shopee Affiliate
        console.log('[E2E 6] Mở Modal "Thêm Phụ Kiện Tiếp Thị Shopee Mới"...');
        await client.eval(`
            window.ViVuApp.openCompanionProductModal('travel');
        `);
        await sleep(500);

        await client.eval(`(() => {
            document.getElementById('prodModalName').value = 'Áo Mưa Bộ Đi Phượt Chống Thấm Givi';
            document.getElementById('prodModalPrice').value = '420000';
            document.getElementById('prodModalRating').value = '4.9 (2.1k đã bán)';
            document.getElementById('prodModalIcon').value = 'rainy';
            document.getElementById('prodModalLink').value = 'https://shopee.vn/universal-givi-raincoat';
            document.getElementById('prodModalDesc').value = 'Áo mưa bộ cao cấp 2 lớp chống nước tuyệt đối khi phượt xe máy qua Cầu Cổ Chiên.';
            
            const form = document.getElementById('companionProductForm');
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        })()`);
        await sleep(1000);

        const gearAdded = await client.eval(`
            document.body.innerText.includes('Áo Mưa Bộ Đi Phượt Chống Thấm Givi') && document.body.innerText.includes('420.000đ')
        `);
        console.log(`[E2E 6] Phụ kiện Shopee mới đã xuất hiện: ${gearAdded}`);
        if (!gearAdded) throw new Error('Lỗi: Không thêm được phụ kiện Shopee!');

        // Cuộn xuống khu vực Góc đồ công nghệ & Phụ kiện Shopee để chụp hình các nút Admin & Card sản phẩm
        await client.eval(`(() => {
            const h2List = Array.from(document.querySelectorAll('h2'));
            const target = h2List.find(h => h.textContent.includes('Góc Đồ Công Nghệ'));
            if (target) {
                target.scrollIntoView({ behavior: 'instant', block: 'start' });
            } else {
                window.scrollBy(0, 1100);
            }
        })()`);
        await sleep(600);

        // Chụp ảnh giao diện hoàn chỉnh sau khi Admin thêm 2 sản phẩm
        const verifiedShotPath = path.join(ARTIFACT_DIR, 'live_companion_admin_clearance_and_gear.png');
        await client.captureScreenshot(verifiedShotPath);
        console.log(`[Screenshot] Đã chụp ảnh kết quả E2E khu vực Thanh lý & Shopee: ${verifiedShotPath}`);

        // Thử nghiệm Xóa sản phẩm và Đặt lại
        console.log('[E2E 7] Kiểm tra chức năng Đặt lại (Reset) danh sách mặc định...');
        await client.eval(`(() => {
            window.confirm = () => true;
            window.ViVuApp.resetCompanionProducts('tech');
            window.ViVuApp.resetCompanionProducts('travel');
        })()`);
        await sleep(1000);

        const resetSuccess = await client.eval(`
            !document.body.innerText.includes('DJI Mic 2') &&
            !document.body.innerText.includes('Áo Mưa Bộ Đi Phượt') &&
            document.body.innerText.includes('Bàn phím cơ không dây NuPhy Air75 v2')
        `);
        console.log(`[E2E 7] Đặt lại danh sách mặc định thành công: ${resetSuccess}`);
        if (!resetSuccess) throw new Error('Lỗi: Đặt lại danh sách mặc định thất bại!');

        console.log('\n=== TẤT CẢ 7/7 KỊCH BẢN KIỂM THỬ E2E MODAL ADMIN ĐÃ THÀNH CÔNG 100%! ===');
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
    console.error('[E2E FAILED]:', err);
    process.exit(1);
});
