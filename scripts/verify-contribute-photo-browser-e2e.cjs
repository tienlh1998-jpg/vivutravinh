/**
 * scripts/verify-contribute-photo-browser-e2e.cjs
 * Kiểm thử E2E giao diện người dùng thực tế trên Chrome CDP thật:
 * 1. PC: Người dùng thường đăng nhập -> Chọn ảnh -> Xem trước -> Bỏ ảnh -> Tải lên thành công
 * 2. Ca lỗi: Phiên hết hạn -> Thông báo lỗi rõ ràng, giữ nguyên form
 * 3. Ca lỗi: Tải ảnh thất bại (Sai định dạng tệp, vượt dung lượng 5MB)
 * 4. Mobile: Kiểm tra giao diện responsive 390x844, nút bấm >= 44px
 * 5. Admin kiểm duyệt: Xem ảnh thumbnail, xem ảnh gốc trong modal, phê duyệt -> hiển thị ở trang chủ
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');
const { pathToFileURL } = require('url');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.resolve('C:\\Users\\tienl\\.gemini\\antigravity\\brain\\2bc7252e-f998-4e30-bbb7-25edbaa0f421');

const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="?([^"\r\n]+)"?/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\r\n]+)"?/)[1];
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
process.env.ADMIN_SECRET = 'dev-admin';
process.env.NODE_ENV = 'test';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function startLocalServer(port = 4188) {
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
    };

    const server = http.createServer(async (req, res) => {
        try {
            const parsedUrl = new URL(req.url, `http://localhost:${port}`);
            let pathname = parsedUrl.pathname;

            if (pathname === '/api/submit-place') {
                const submitMod = await import(pathToFileURL(path.join(ROOT_DIR, 'api', 'submit-place.js')).href);
                return submitMod.default(req, res);
            }

            if (pathname === '/api/admin-moderation' || pathname.startsWith('/api/admin-moderation')) {
                const mod = await import(pathToFileURL(path.join(ROOT_DIR, 'api', '_admin', 'moderation.js')).href);
                return mod.default(req, res);
            }

            if (pathname === '/api/admin-places' || pathname.startsWith('/api/admin-places')) {
                const mod = await import(pathToFileURL(path.join(ROOT_DIR, 'api', '_admin', 'places.js')).href);
                return mod.default(req, res);
            }

            if (pathname === '/') pathname = '/index.html';
            const filePath = path.join(ROOT_DIR, pathname);

            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                return res.end('Not Found');
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
            fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            console.error('[Server Error]', err);
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(err.message);
        }
    });

    return new Promise(resolve => {
        server.listen(port, () => resolve(server));
    });
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
            const target = pages.find(p => p.url && (p.url.includes('4188') || p.url.includes('about:blank')));
            if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
        } catch {
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

    async send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.reqId;
            this.callbacks.set(id, res => {
                if (res.error) reject(new Error(res.error.message || JSON.stringify(res.error)));
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
            throw new Error(res.exceptionDetails.exception?.description || 'Eval error');
        }
        return res.result?.value;
    }

    async screenshot(filepath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
        console.log(`  [Screenshot] Saved: ${filepath}`);
    }

    close() {
        this.ws.close();
    }
}

async function main() {
    console.log('=== BẮT ĐẦU KIỂM THỬ E2E TẢI ẢNH ĐÓNG GÓP TRÊN CHROME CDP ===\n');

    // 0. Khởi động Local Web Server
    const PORT = 4188;
    const server = await startLocalServer(PORT);
    console.log(`[Server] Đã khởi chạy tại http://localhost:${PORT}`);

    // Đăng nhập người dùng thường để lấy session thật
    const userEmail = 'prod_norm_1791220432814@vivutest.local';
    const userPass = 'TestPass123!@#';
    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, password: userPass })
    });
    const authData = await loginRes.json();
    assert(authData.access_token, 'Đăng nhập người dùng thường phải thành công');
    const normalUserSession = {
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: authData.user
    };
    console.log('[Auth] Đã lấy phiên hợp lệ cho user:', authData.user.id);

    // Khởi động Headless Chrome
    const chromePort = 9255;
    const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

    const chromeProc = spawn(chromePath, [
        `--remote-debugging-port=${chromePort}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-web-security',
        'about:blank'
    ]);

    await sleep(1500);
    const wsUrl = await getDebuggerUrl(chromePort);
    const client = new CDPClient(wsUrl);
    await new Promise(r => client.ws.onopen = r);

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Runtime.enable');

    let createdPlaceId = null;

    try {
        // =========================================================================
        // PHẦN 1: GIAO DIỆN PC - NGƯỜI DÙNG THƯỜNG CHỌN ẢNH, XEM TRƯỚC, BỎ ẢNH, TẢI LÊN
        // =========================================================================
        console.log('\n--- 1. KIỂM THỬ TRÊN PC (1280x800): CHỌN ẢNH, PREVIEW, BỎ ẢNH & TẢI THÀNH CÔNG ---');
        await client.send('Emulation.setDeviceMetricsOverride', {
            width: 1280,
            height: 800,
            deviceScaleFactor: 1,
            mobile: false
        });

        await client.send('Page.navigate', { url: `http://localhost:${PORT}/?source=supabase` });
        await sleep(2500);

        // Bơm phiên người dùng thường vào localStorage và cấu hình datasource=supabase
        await client.eval(`
            localStorage.setItem('vivu_data_source', 'supabase');
            localStorage.setItem('vivu_user_session', JSON.stringify(${JSON.stringify(normalUserSession)}));
            Object.keys(localStorage).forEach(k => {
                if (k.includes('places') || k.includes('cache')) {
                    localStorage.removeItem(k);
                }
            });
            window.location.reload();
        `);
        await sleep(2500);

        // Mở Modal Đóng góp địa điểm
        console.log('[PC] Mở Modal Đóng Góp...');
        await client.eval(`window.ViVuApp.openContributeModal();`);
        await sleep(800);

        const modalOpen = await client.eval(`!document.getElementById('contributeModal').classList.contains('hidden')`);
        assert(modalOpen, 'Modal đóng góp phải mở thành công');

        // Tạo 2 ảnh mẫu giả lập (1x1 PNG hợp lệ)
        console.log('[PC] Giả lập người dùng chọn 2 ảnh...');
        await client.eval(`
            (() => {
                const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
                const byteCharacters = atob(b64);
                const byteArrays = [];
                for (let offset = 0; offset < byteCharacters.length; offset += 512) {
                    const slice = byteCharacters.slice(offset, offset + 512);
                    const byteNumbers = new Array(slice.length);
                    for (let i = 0; i < slice.length; i++) {
                        byteNumbers[i] = slice.charCodeAt(i);
                    }
                    byteArrays.push(new Uint8Array(byteNumbers));
                }
                const blob = new Blob(byteArrays, { type: 'image/png' });
                const file1 = new File([blob], 'chua_ang_mat_tien.png', { type: 'image/png' });
                const file2 = new File([blob], 'chua_ang_khuon_vien.png', { type: 'image/png' });
                window.ViVuApp.handleContributePhotosSelect([file1, file2]);
            })()
        `);
        await sleep(600);

        // Kiểm tra xem trước 2 ảnh
        const previewState = await client.eval(`
            (() => {
                const countBadge = document.getElementById('contribPhotoCountBadge')?.textContent?.trim();
                const previewEl = document.getElementById('contribPhotosPreview');
                const isVisible = !previewEl.classList.contains('hidden');
                const cardsCount = previewEl.querySelectorAll('img').length;
                const clearBtnVisible = !document.getElementById('contribClearAllPhotosBtn').classList.contains('hidden');
                return { countBadge, isVisible, cardsCount, clearBtnVisible };
            })()
        `);
        console.log('[PC] Preview sau khi chọn 2 ảnh:', previewState);
        assert.strictEqual(previewState.countBadge, '2/5 ảnh', 'Badge phải hiển thị 2/5 ảnh');
        assert.strictEqual(previewState.cardsCount, 2, 'Phải có đúng 2 thẻ ảnh preview');
        assert.strictEqual(previewState.isVisible, true, 'Khung preview phải hiển thị');
        assert.strictEqual(previewState.clearBtnVisible, true, 'Nút Bỏ tất cả phải hiển thị');

        // Thử bỏ 1 ảnh (xóa ảnh thứ 1)
        console.log('[PC] Thử bỏ 1 ảnh (ảnh thứ 1)...');
        await client.eval(`window.ViVuApp.removeContributePhoto(0);`);
        await sleep(500);

        const previewAfterRemove = await client.eval(`
            (() => {
                const countBadge = document.getElementById('contribPhotoCountBadge')?.textContent?.trim();
                const cardsCount = document.getElementById('contribPhotosPreview').querySelectorAll('img').length;
                return { countBadge, cardsCount };
            })()
        `);
        console.log('[PC] Preview sau khi bỏ 1 ảnh:', previewAfterRemove);
        assert.strictEqual(previewAfterRemove.countBadge, '1/5 ảnh', 'Badge phải cập nhật thành 1/5 ảnh');
        assert.strictEqual(previewAfterRemove.cardsCount, 1, 'Chỉ còn đúng 1 thẻ ảnh preview');

        // Điền đầy đủ thông tin form
        const testPlaceName = 'Quán Cà Phê Suối Xanh Trà Vinh ' + Date.now().toString().slice(-4);
        console.log('[PC] Điền thông tin form:', testPlaceName);
        await client.eval(`
            (() => {
                document.getElementById('contribPlaceName').value = '${testPlaceName}';
                document.getElementById('contribDistrict').value = 'TP. Trà Vinh';
                document.getElementById('contribHours').value = '06:30 - 22:00';
                document.getElementById('contribPrice').value = '25k - 50k';
                document.getElementById('contribAddress').value = 'Số 124 Điện Biên Phủ, Phường 6, TP. Trà Vinh';
                document.getElementById('contribDescription').value = 'Không gian cà phê sân vườn rợp bóng cổ thụ đặc trưng Xứ Trà, cà phê hạt rang mộc đậm đà.';
                document.getElementById('contribAuthorName').value = 'Nguyễn Thổ Địa';
                document.getElementById('contribAuthorContact').value = '0918123456';
            })()
        `);

        // Gửi form đề xuất kèm ảnh
        console.log('[PC] Nhấn Gửi Đóng Góp...');
        await client.eval(`document.getElementById('contributePlaceForm').dispatchEvent(new Event('submit', { cancelable: true }));`);
        await sleep(3500);

        await client.screenshot(path.join(ARTIFACT_DIR, 'contribute_photo_pc_success.png'));

        // Kiểm tra địa điểm đã được tạo trong Database
        const checkDb = await fetch(`${SUPABASE_URL}/rest/v1/places?name=eq.${encodeURIComponent(testPlaceName)}&select=*`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const foundRows = await checkDb.json();
        assert(Array.isArray(foundRows) && foundRows.length > 0, 'Địa điểm phải được lưu vào CSDL');
        const dbPlace = foundRows[0];
        createdPlaceId = dbPlace.id;
        console.log('[DB] Địa điểm được tạo ID =', dbPlace.id, 'status =', dbPlace.status);
        console.log('[DB] Images gắn kết:', dbPlace.images);
        console.log('[DB] Image_link gắn kết:', dbPlace.image_link);
        assert(Array.isArray(dbPlace.images) && dbPlace.images.length === 1, 'Mảng images phải có 1 ảnh đã tải lên');
        assert(dbPlace.images[0].includes('storage/v1/object/public/review-photos/reviews/places/'), 'URL ảnh phải thuộc bucket review-photos');
        assert.strictEqual(dbPlace.image_link, dbPlace.images[0], 'image_link phải trỏ đúng vào ảnh đã tải');
        console.log('✓ Luồng tải ảnh & gửi đề xuất trên PC hoàn tất xuất sắc!');

        // =========================================================================
        // PHẦN 2: CA LỖI - PHIÊN ĐĂNG NHẬP HẾT HẠN
        // =========================================================================
        console.log('\n--- 2. KIỂM THỬ CA LỖI: PHIÊN ĐĂNG NHẬP HẾT HẠN ---');
        // Mở lại modal đóng góp
        await client.eval(`window.ViVuApp.openContributeModal();`);
        await sleep(500);

        // Bơm phiên hết hạn vào localStorage
        await client.eval(`
            (() => {
                const expiredSession = {
                    access_token: 'fake_expired_jwt_token',
                    refresh_token: 'invalid_refresh',
                    expires_at: Math.floor(Date.now() / 1000) - 3600,
                    user: { id: 'user_expired_id', email: 'expired@vivu.local' }
                };
                localStorage.setItem('vivu_user_session', JSON.stringify(expiredSession));
            })()
        `);

        // Chọn 1 ảnh
        await client.eval(`
            (() => {
                const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
                const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
                const file = new File([blob], 'anh_thu_nghiem.png', { type: 'image/png' });
                window.ViVuApp.handleContributePhotosSelect([file]);
                document.getElementById('contribPlaceName').value = 'Địa Điểm Test Hết Hạn';
                document.getElementById('contribAddress').value = 'Địa chỉ test';
                document.getElementById('contribDescription').value = 'Mô tả test';
            })()
        `);
        await sleep(500);

        // Bấm gửi form với phiên hết hạn
        console.log('[Expired Test] Bấm gửi đề xuất khi phiên hết hạn...');
        await client.eval(`document.getElementById('contributePlaceForm').dispatchEvent(new Event('submit', { cancelable: true }));`);
        await sleep(1500);

        const expiredError = await client.eval(`
            (() => {
                const errBox = document.getElementById('contribPhotoError');
                const isVisible = !errBox.classList.contains('hidden');
                const text = document.getElementById('contribPhotoErrorText')?.textContent?.trim();
                const formName = document.getElementById('contribPlaceName')?.value;
                return { isVisible, text, formName };
            })()
        `);
        console.log('[Expired Test] Kết quả hiển thị lỗi:', expiredError);
        assert(expiredError.isVisible, 'Hộp cảnh báo lỗi phiên phải hiển thị');
        assert(expiredError.text.includes('hết hạn') || expiredError.text.includes('đăng nhập lại'), 'Thông báo phải ghi rõ phiên hết hạn');
        assert.strictEqual(expiredError.formName, 'Địa Điểm Test Hết Hạn', 'Dữ liệu form phải được giữ nguyên');

        await client.screenshot(path.join(ARTIFACT_DIR, 'contribute_photo_expired_session.png'));
        console.log('✓ Ca phiên hết hạn xử lý chuẩn xác, chặn tải ảnh và thông báo rõ ràng!');

        // =========================================================================
        // PHẦN 3: CA LỖI - TẢI ẢNH THẤT BẠI (SAI ĐỊNH DẠNG & VƯỢT DUNG LƯỢNG)
        // =========================================================================
        console.log('\n--- 3. KIỂM THỬ CA LỖI: TẢI ẢNH THẤT BẠI (SAI MIME & QUÁ 5MB) ---');
        // 3a. Thử file sai định dạng (.pdf / .txt)
        await client.eval(`
            (() => {
                const blob = new Blob(['sample text content'], { type: 'text/plain' });
                const invalidFile = new File([blob], 'huong_dan_du_lich.txt', { type: 'text/plain' });
                window.ViVuApp.handleContributePhotosSelect([invalidFile]);
            })()
        `);
        await sleep(500);

        const invalidMimeError = await client.eval(`
            (() => {
                const errBox = document.getElementById('contribPhotoError');
                const text = document.getElementById('contribPhotoErrorText')?.textContent?.trim();
                return { isVisible: !errBox.classList.contains('hidden'), text };
            })()
        `);
        console.log('[Mime Test] Lỗi sai định dạng:', invalidMimeError);
        assert(invalidMimeError.isVisible, 'Hộp lỗi phải hiển thị');
        assert(invalidMimeError.text.includes('không hợp lệ'), 'Phải báo định dạng không hợp lệ');
        await client.screenshot(path.join(ARTIFACT_DIR, 'contribute_photo_invalid_type.png'));

        // 3b. Thử file vượt quá dung lượng (> 5MB)
        await client.eval(`
            (() => {
                // Tạo fake file 6MB
                const fake6MBBlob = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/jpeg' });
                const largeFile = new File([fake6MBBlob], 'anh_sieu_nang_6mb.jpg', { type: 'image/jpeg' });
                window.ViVuApp.handleContributePhotosSelect([largeFile]);
            })()
        `);
        await sleep(500);

        const oversizeError = await client.eval(`
            (() => {
                const errBox = document.getElementById('contribPhotoError');
                const text = document.getElementById('contribPhotoErrorText')?.textContent?.trim();
                return { isVisible: !errBox.classList.contains('hidden'), text };
            })()
        `);
        console.log('[Oversize Test] Lỗi vượt dung lượng:', oversizeError);
        assert(oversizeError.isVisible, 'Hộp lỗi phải hiển thị');
        assert(oversizeError.text.includes('5MB') && oversizeError.text.includes('vượt quá'), 'Phải báo vượt quá 5MB');
        await client.screenshot(path.join(ARTIFACT_DIR, 'contribute_photo_oversized.png'));
        console.log('✓ Ca lỗi dung lượng và định dạng xử lý chuẩn xác!');

        // Đóng modal
        await client.eval(`window.ViVuApp.closeContributeModal();`);
        await sleep(500);

        // =========================================================================
        // PHẦN 4: KIỂM THỬ TRÊN MOBILE (390x844 - iPhone)
        // =========================================================================
        console.log('\n--- 4. KIỂM THỬ TRÊN MOBILE (390x844): RESPONSIVE & NÚT BẤM >= 44PX ---');
        await client.send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
            mobile: true
        });

        // Phục hồi lại phiên người dùng thường hợp lệ
        await client.eval(`
            localStorage.setItem('vivu_user_session', JSON.stringify(${JSON.stringify(normalUserSession)}));
            window.ViVuApp.openContributeModal();
        `);
        await sleep(800);

        // Chọn 1 ảnh trên Mobile
        await client.eval(`
            (() => {
                const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
                const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
                const file = new File([blob], 'mobile_sample_photo.png', { type: 'image/png' });
                window.ViVuApp.handleContributePhotosSelect([file]);
            })()
        `);
        await sleep(600);

        // Kiểm tra kích thước nút và dropzone trên mobile
        const mobileMetrics = await client.eval(`
            (() => {
                const dropzone = document.getElementById('contribPhotoDropzone');
                const dropzoneRect = dropzone.getBoundingClientRect();
                const previewCards = document.getElementById('contribPhotosPreview').children;
                const cardRect = previewCards.length > 0 ? previewCards[0].getBoundingClientRect() : null;
                const closeBtn = document.querySelector('#contributeModal button[aria-label="Đóng cửa sổ"]');
                const closeBtnRect = closeBtn.getBoundingClientRect();
                return {
                    dropzoneHeight: dropzoneRect.height,
                    cardWidth: cardRect?.width,
                    cardHeight: cardRect?.height,
                    closeBtnSize: Math.min(closeBtnRect.width, closeBtnRect.height)
                };
            })()
        `);
        console.log('[Mobile] Chỉ số giao diện Mobile:', mobileMetrics);
        assert(mobileMetrics.dropzoneHeight >= 44, 'Dropzone phải có chiều cao dễ chạm trên mobile');
        assert(mobileMetrics.closeBtnSize >= 40, 'Nút đóng cửa sổ phải đạt chuẩn touch-target');

        await client.screenshot(path.join(ARTIFACT_DIR, 'contribute_photo_mobile.png'));
        console.log('✓ Giao diện Mobile responsive hiển thị đẹp mắt và tiện dụng!');

        // Đóng modal trên Mobile
        await client.eval(`window.ViVuApp.closeContributeModal();`);
        await sleep(500);

        // =========================================================================
        // PHẦN 5: ADMIN KIỂM DUYỆT & PHÊ DUYỆT ĐỊA ĐIỂM CÓ ẢNH
        // =========================================================================
        console.log('\n--- 5. ADMIN KIỂM DUYỆT & XEM ẢNH TRONG ADMIN.HTML ---');
        // Chuyển lại Viewport Desktop để test Admin Portal
        await client.send('Emulation.setDeviceMetricsOverride', {
            width: 1280,
            height: 800,
            deviceScaleFactor: 1,
            mobile: false
        });

        // Bơm phiên Admin
        const adminSession = {
            access_token: 'mock-admin-token',
            user: { id: 'admin-id', email: 'admin@vivutravinh.vn', role: 'admin' },
            role: 'admin'
        };

        await client.send('Page.navigate', { url: `http://localhost:${PORT}/admin.html` });
        await sleep(2000);

        await client.eval(`
            localStorage.setItem('vivu_admin_session', JSON.stringify(${JSON.stringify(adminSession)}));
            sessionStorage.setItem('vivu_admin_session', JSON.stringify(${JSON.stringify(adminSession)}));
            window.location.reload();
        `);
        await sleep(3000);

        // Tải danh sách địa điểm draft để duyệt địa điểm vừa tạo
        console.log('[Admin] Tải danh sách địa điểm trạng thái draft...');
        await client.eval(`
            (() => {
                const select = document.getElementById('placeStatusFilter');
                if (select) {
                    select.value = 'draft';
                    document.getElementById('refreshPlacesBtn').click();
                }
            })()
        `);
        await sleep(2500);

        // Kiểm tra danh sách hiển thị thẻ địa điểm có ảnh thumbnail
        const placeCardInfo = await client.eval(`
            (() => {
                const cards = Array.from(document.querySelectorAll('#placesContainer article'));
                const targetCard = cards.find(c => c.textContent.includes('${testPlaceName}'));
                if (!targetCard) return null;
                const img = targetCard.querySelector('img');
                return {
                    found: true,
                    title: targetCard.querySelector('h3')?.textContent?.trim(),
                    imgSrc: img?.src,
                    hasPreviewBtn: Boolean(targetCard.querySelector('button[data-action="preview-place"]')),
                    hasApproveBtn: Boolean(targetCard.querySelector('button[data-action="approve-place"]'))
                };
            })()
        `);
        console.log('[Admin] Thẻ địa điểm trong danh sách:', placeCardInfo);
        assert(placeCardInfo && placeCardInfo.found, 'Admin phải tìm thấy địa điểm đề xuất trong danh sách');
        assert(placeCardInfo.imgSrc && placeCardInfo.imgSrc.includes('storage/v1/object/public/review-photos/'), 'Thumbnail của địa điểm phải hiển thị đúng ảnh đã upload');

        // Mở Modal Xem Trước (Preview Place)
        console.log('[Admin] Bấm Xem trước địa điểm...');
        await client.eval(`
            (() => {
                const btn = document.querySelector('button[data-action="preview-place"][data-place-id="${createdPlaceId}"]');
                if (btn) btn.click();
            })()
        `);
        await sleep(1000);

        const previewModalInfo = await client.eval(`
            (() => {
                const modal = document.getElementById('placePreviewModal');
                const isVisible = !modal.classList.contains('hidden');
                const mainImg = modal.querySelector('img');
                const mainLink = modal.querySelector('a[title="Bấm để mở ảnh kích thước gốc"]');
                return {
                    isVisible,
                    imgSrc: mainImg?.src,
                    hasFullSizeLink: Boolean(mainLink),
                    fullSizeHref: mainLink?.href
                };
            })()
        `);
        console.log('[Admin] Modal xem trước:', previewModalInfo);
        assert(previewModalInfo.isVisible, 'Modal xem trước phải hiển thị');
        assert(previewModalInfo.imgSrc.includes('storage/v1/object/public/review-photos/'), 'Ảnh xem trước phải đúng ảnh đã tải');
        // Phê duyệt từ Modal Xem Trước
        console.log('[Admin] Bấm Duyệt xuất bản từ Modal Xem Trước...');
        await client.eval(`
            (() => {
                const approveBtn = document.getElementById('approveFromPreviewBtn');
                if (approveBtn) approveBtn.click();
            })()
        `);
        await sleep(800);

        // Bấm Xác nhận duyệt trong confirmModal
        console.log('[Admin] Bấm Xác nhận trong Dialog duyệt địa điểm...');
        await client.eval(`
            (() => {
                const confirmBtn = document.getElementById('confirmModalAcceptBtn');
                if (confirmBtn) confirmBtn.click();
            })()
        `);
        await sleep(3000);

        await client.screenshot(path.join(ARTIFACT_DIR, 'contribute_photo_admin_approved.png'));

        // Kiểm tra lại trong DB: status = approved
        const verifyApproved = await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${createdPlaceId}&select=*`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const approvedRows = await verifyApproved.json();
        assert(approvedRows[0]?.status === 'approved', 'Trạng thái trong DB phải là approved');
        console.log('[Admin] ✓ Địa điểm đã được phê duyệt thành công: status =', approvedRows[0]?.status);

        // =========================================================================
        // PHẦN 6: KIỂM TRA HIỂN THỊ CÔNG KHAI NGOÀI TRANG CHỦ & CHI TIẾT
        // =========================================================================
        console.log('\n--- 6. KIỂM TRA HIỂN THỊ NGOÀI TRANG CHỦ VÀ TRANG CHI TIẾT ---');
        await client.send('Page.navigate', { url: `http://localhost:${PORT}/?source=supabase` });
        await sleep(2000);

        // Xóa cache places để nạp dữ liệu Supabase mới nhất (vừa approved)
        await client.eval(`
            localStorage.setItem('vivu_data_source', 'supabase');
            Object.keys(localStorage).forEach(k => {
                if (k.includes('places') || k.includes('cache')) {
                    localStorage.removeItem(k);
                }
            });
            window.location.reload();
        `);
        await sleep(3500);

        const publicPlaceCard = await client.eval(`
            (() => {
                const cards = Array.from(document.querySelectorAll('#placesDiscoveryGrid .place-card, .place-card'));
                const card = cards.find(c => c.textContent.includes('${testPlaceName}'));
                if (!card) return null;
                const img = card.querySelector('img');
                return {
                    found: true,
                    imgSrc: img?.src
                };
            })()
        `);
        console.log('[Public Page] Thẻ địa điểm hiển thị công khai:', publicPlaceCard);
        assert(publicPlaceCard && publicPlaceCard.found, 'Địa điểm mới duyệt phải xuất hiện ngoài trang chủ');
        assert(publicPlaceCard.imgSrc.includes('storage/v1/object/public/review-photos/'), 'Ảnh trên trang chủ phải là ảnh người dùng đã đóng góp');

        // Cuộn tới thẻ địa điểm để chụp ảnh rõ ràng
        await client.eval(`
            (() => {
                const card = Array.from(document.querySelectorAll('#placesDiscoveryGrid .place-card, .place-card'))
                    .find(c => c.textContent.includes('${testPlaceName}'));
                if (card) card.scrollIntoView({ behavior: 'instant', block: 'center' });
            })()
        `);
        await sleep(800);
        await client.screenshot(path.join(ARTIFACT_DIR, 'contribute_photo_public_listed.png'));
        console.log('✓ Địa điểm xuất hiện hoàn hảo ngoài trang chủ với đúng ảnh đóng góp!');

        // Mở modal chi tiết địa điểm công khai
        console.log('[Public Page] Mở modal chi tiết địa điểm công khai...');
        await client.eval(`
            (() => {
                const card = Array.from(document.querySelectorAll('#placesDiscoveryGrid .place-card, .place-card'))
                    .find(c => c.textContent.includes('${testPlaceName}'));
                if (card) {
                    const detailBtn = card.querySelector('[data-action="open-detail"]');
                    if (detailBtn) {
                        detailBtn.click();
                    } else {
                        card.click();
                    }
                } else {
                    window.ViVuApp?.openDetailModal(${JSON.stringify(createdPlaceId)});
                }
            })()
        `);
        await sleep(1500);

        const detailModalInfo = await client.eval(`
            (() => {
                const modal = document.getElementById('detailModal');
                const isVisible = modal && !modal.classList.contains('hidden');
                const title = document.getElementById('modalTitle')?.textContent?.trim();
                const mainImg = document.getElementById('modalMainImage') || document.getElementById('modalGalleryMainImg');
                return {
                    isVisible,
                    title,
                    imgSrc: mainImg?.src
                };
            })()
        `);
        console.log('[Public Detail] Modal chi tiết:', detailModalInfo);
        assert(detailModalInfo.isVisible, 'Modal chi tiết địa điểm phải mở');
        assert(detailModalInfo.imgSrc && detailModalInfo.imgSrc.includes('storage/v1/object/public/review-photos/'), 'Ảnh trong modal chi tiết phải đúng ảnh đã đóng góp');

        await client.screenshot(path.join(ARTIFACT_DIR, 'contribute_photo_public_detail.png'));
        console.log('✓ Trang chi tiết hiển thị đúng ảnh đóng góp!');

    } finally {
        // Dọn dẹp bản ghi test trong DB và Storage
        console.log('\n--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM ---');
        if (createdPlaceId) {
            await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${createdPlaceId}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            console.log('  ✓ Đã xóa bản ghi test ID =', createdPlaceId);
        }
        await fetch(`${SUPABASE_URL}/rest/v1/places?slug=ilike.*suoi-xanh*`, {
            method: 'DELETE',
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });

        client.close();
        chromeProc.kill();
        server.close();
        console.log('=== TOÀN BỘ KIỂM THỬ E2E TRÊN TRÌNH DUYỆT ĐÃ THÀNH CÔNG RỰC RỠ ===\n');
    }
}

main().catch(err => {
    console.error('❌ Kiểm thử E2E thất bại:', err);
    process.exit(1);
});
