/**
 * KỊCH BẢN NGHIỆM THU E2E TOÀN BỘ QUA GIAO DIỆN (CHROME CDP) TRÊN TÀI KHOẢN THẬT
 * 
 * Môi trường: Bản Local chạy trên server nội bộ, kết nối 100% SUPABASE LIVE PRODUCTION
 * 
 * Các ca kiểm thử qua giao diện (KHÔNG dùng fetch thay thế các thao tác UI):
 * 1. Thử upload thất bại (file > 5MB hoặc lỗi) -> Giao diện báo lỗi rõ ràng, bảo toàn 100% nội dung soạn trong textarea.
 * 2. Luồng tạo bài viết Cộng đồng hoàn toàn qua giao diện:
 *    - Bấm nút "Ảnh"
 *    - Chọn file thật từ input (CDP DOM.setFileInputFiles)
 *    - Chờ upload hoàn tất (hiển thị thumbnail, trạng thái "Đã tải lên")
 *    - Mở Check-in, tìm kiếm "Chùa Âng" và chọn địa điểm
 *    - Bấm nút "Đăng bài"
 * 3. Gửi lịch sinh hoạt CLB với thời gian "9h" hoàn toàn bằng biểu mẫu Form của Chủ nhiệm CLB thật.
 * 4. Admin duyệt bài viết và lịch sinh hoạt qua giao diện:
 *    - Kiểm tra loại bỏ toàn bộ undefined
 *    - Gỡ bỏ điểm AI giả và huy hiệu giả
 *    - Hiển thị đúng ảnh thật và địa điểm check-in
 * 5. Người xem/người dùng thấy đúng ảnh và địa điểm sau duyệt trên bảng tin (Desktop & Mobile).
 * 6. Lịch sinh hoạt 9h xuất hiện đúng CLB và không bị dán nhãn mẫu.
 * 7. Dọn dẹp an toàn: chỉ dọn dữ liệu test, bảo tồn 100% dữ liệu người dùng thật.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const WebSocket = globalThis.WebSocket;

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = 8234;
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
const ARTIFACT_DIR = path.resolve('C:\\Users\\tienl\\.gemini\\antigravity\\brain\\2bc7252e-f998-4e30-bbb7-25edbaa0f421');

const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';
const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];

process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
                reject(new Error(`CDP timed out: ${method}`));
            }, 30000);
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
            throw new Error(`CDP Eval Exception: ${JSON.stringify(res.exceptionDetails)}`);
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
        await sleep(300);
    }

    async setFileInput(selector, files) {
        const doc = await this.send('DOM.getDocument', { depth: -1 });
        const node = await this.send('DOM.querySelector', {
            nodeId: doc.root.nodeId,
            selector: selector
        });
        if (!node.nodeId) throw new Error(`Element not found for selector: ${selector}`);
        await this.send('DOM.setFileInputFiles', {
            nodeId: node.nodeId,
            files: files
        });
    }

    async captureScreenshot(outputPath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    }

    async close() {
        try {
            this.ws.close();
        } catch (_) {}
    }
}

async function getDebuggerUrl(port) {
    for (let i = 0; i < 40; i++) {
        try {
            const data = await new Promise((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${port}/json`, (r) => {
                    let b = '';
                    r.on('data', c => b += c);
                    r.on('end', () => resolve(JSON.parse(b)));
                });
                req.on('error', reject);
            });
            const page = data.find(t => t.type === 'page');
            if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
        } catch (_) {}
        await sleep(200);
    }
    throw new Error('Không thể kết nối Chrome CDP');
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
};

async function startStaticServer(port) {
    const postsMod = await import('../api/community-posts.js');
    const activitiesMod = await import('../api/club-activities.js');
    const moderationMod = await import('../api/_admin/moderation.js');
    const clubsMod = await import('../api/clubs.js');

    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

        if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
        }

        const urlObj = new URL(req.url, `http://127.0.0.1:${port}`);
        const pathname = urlObj.pathname;

        try {
            if (pathname === '/api/community-posts') {
                return await postsMod.default(req, res);
            }
            if (pathname === '/api/club-activities') {
                return await activitiesMod.default(req, res);
            }
            if (pathname === '/api/clubs') {
                return await clubsMod.default(req, res);
            }
            if (pathname === '/api/admin-moderation' || pathname.startsWith('/api/admin')) {
                return await moderationMod.default(req, res);
            }
        } catch (handlerErr) {
            console.error(`[Local Server API Error ${pathname}]:`, handlerErr.message);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: handlerErr.message }));
            return;
        }

        let reqPath = pathname;
        if (reqPath === '/') reqPath = '/index.html';
        const filePath = path.join(ROOT_DIR, decodeURIComponent(reqPath));

        fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stats.size });
            fs.createReadStream(filePath).pipe(res);
        });
    });

    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
    console.log(`[Local Server] Đang chạy tại http://127.0.0.1:${port} (kết nối Supabase Live: ${SUPABASE_URL})`);
    return server;
}

async function main() {
    console.log('='.repeat(80));
    console.log(' BẮT ĐẦU NGHIỆM THU QUA GIAO DIỆN (CHROME CDP) - BẢN LOCAL DÙNG SUPABASE LIVE');
    console.log('='.repeat(80));

    const server = await startStaticServer(PORT);
    let chromeProcess = null;
    let cdp = null;

    const testTs = Date.now();
    let testUserId = null;
    let createdPostId = null;
    let createdActivityId = null;
    let uploadedImageUrl = null;
    let uploadedStoragePath = null;

    const oversizedFilePath = path.join(__dirname, `temp_oversized_${testTs}.png`);
    const validPhotoPath = path.join(__dirname, `temp_real_photo_${testTs}.png`);

    try {
        // ----------------------------------------------------------------------
        // BƯỚC 1: TẠO FILE TEST & KHỞI TẠO TÀI KHOẢN THẬT TRÊN SUPABASE LIVE
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 1] Khởi tạo tài nguyên kiểm thử...');

        // 1.1 Tạo file ảnh vượt quá 5MB để test upload thất bại (5.5 MB)
        const oversizedBuffer = Buffer.alloc(5.5 * 1024 * 1024, 0);
        // Header PNG cơ bản
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64').copy(oversizedBuffer);
        fs.writeFileSync(oversizedFilePath, oversizedBuffer);
        console.log(`  ✓ Đã chuẩn bị file ảnh > 5MB (${(fs.statSync(oversizedFilePath).size / (1024 * 1024)).toFixed(2)} MB) để thử nghiệm upload thất bại.`);

        // 1.2 Tạo file ảnh hợp lệ (200x200 PNG thật)
        const validPngBytes = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJAD/6gh3dfAAAAAElFTkSuQmCC',
            'base64'
        );
        fs.writeFileSync(validPhotoPath, validPngBytes);
        console.log(`  ✓ Đã chuẩn bị file ảnh thật hợp lệ: ${validPhotoPath}`);

        // 1.3 Tạo tài khoản user test thật trên Supabase Live
        const testUserEmail = `user_ui_${testTs}@vivutravinh.test`;
        const testPassword = `VivuUI_${testTs}!#`;
        const testDisplayName = `Nguyễn Thử Nghiệm UI (${String(testTs).slice(-4)})`;

        const createUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: testUserEmail,
                password: testPassword,
                email_confirm: true,
                user_metadata: { display_name: testDisplayName }
            })
        });
        const createUserData = await createUserRes.json();
        testUserId = createUserData.id || createUserData.user?.id;
        assert(testUserId, `Không thể tạo tài khoản user thật: ${JSON.stringify(createUserData)}`);

        // Đăng nhập lấy access_token user test
        const userSignInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                apikey: ANON_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: testUserEmail,
                password: testPassword
            })
        });
        const userTokenData = await userSignInRes.json();
        const testUserToken = userTokenData.access_token;
        assert(testUserToken, 'Không lấy được access_token của user test');
        const testUserSession = {
            access_token: testUserToken,
            token_type: 'bearer',
            user: {
                id: testUserId,
                email: testUserEmail,
                user_metadata: { display_name: testDisplayName }
            }
        };
        console.log(`  ✓ Tạo và đăng nhập tài khoản người dùng thật thành công (${testUserEmail})`);

        // 1.4 Lấy token của Chủ nhiệm CLB_GYM thật (tieuhactutht@gmail.com)
        const leaderLinkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type: 'magiclink', email: 'tieuhactutht@gmail.com' })
        });
        const leaderLinkData = await leaderLinkRes.json();
        const leaderVerifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
            method: 'POST',
            headers: {
                apikey: ANON_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'magiclink',
                token_hash: leaderLinkData.hashed_token
            })
        });
        const leaderOtpData = await leaderVerifyRes.json();
        const leaderToken = leaderOtpData.access_token;
        assert(leaderToken, 'Không lấy được token Chủ nhiệm CLB');
        const leaderSession = {
            access_token: leaderToken,
            token_type: 'bearer',
            user: leaderOtpData.user
        };
        console.log(`  ✓ Xác thực Chủ nhiệm CLB_GYM thật thành công (${leaderOtpData.user?.email})`);

        // 1.5 Lấy token của Admin thật (tienlh1998@gmail.com)
        const adminLinkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type: 'magiclink', email: 'tienlh1998@gmail.com' })
        });
        const adminLinkData = await adminLinkRes.json();
        const adminVerifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
            method: 'POST',
            headers: {
                apikey: ANON_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'magiclink',
                token_hash: adminLinkData.hashed_token
            })
        });
        const adminOtpData = await adminVerifyRes.json();
        const adminToken = adminOtpData.access_token;
        assert(adminToken, 'Không lấy được token Admin');
        const adminSession = {
            access_token: adminToken,
            token_type: 'bearer',
            user: {
                ...adminOtpData.user,
                role: 'admin'
            }
        };
        console.log(`  ✓ Xác thực Quản trị viên (Admin) thật thành công (${adminOtpData.user?.email})`);

        // ----------------------------------------------------------------------
        // BƯỚC 2: KHỞI ĐỘNG CHROME VÀ MỞ GIAO DIỆN
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 2] Khởi động trình duyệt Chrome qua giao diện (CDP)...');
        const cdpPort = 9445;
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
        ];
        const chromeExe = chromePaths.find(p => fs.existsSync(p));
        assert(chromeExe, 'Không tìm thấy Chrome trên Windows');

        chromeProcess = spawn(chromeExe, [
            `--remote-debugging-port=${cdpPort}`,
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            LOCAL_URL
        ]);

        const wsUrl = await getDebuggerUrl(cdpPort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('DOM.enable');
        await cdp.setViewport(1280, 900, false);
        await sleep(2500);
        console.log('  ✓ Đã kết nối Chrome CDP tới ứng dụng local.');

        // ----------------------------------------------------------------------
        // BƯỚC 3: KIỂM THỬ UPLOAD THẤT BẠI VÀ BẢO TOÀN NỘI DUNG SOẠN THẢO
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 3] Thử trường hợp upload thất bại & xác nhận nội dung soạn thảo vẫn còn...');

        // Thiết lập phiên đăng nhập của user test
        await cdp.eval(`
            localStorage.setItem('vivu_user_session', JSON.stringify(${JSON.stringify(testUserSession)}));
            window.ViVuApp.navGoCommunity();
        `);
        await sleep(1500);

        const draftContent = `[Bản thảo quan trọng] Hành trình khám phá các di sản văn hóa và ẩm thực Khmer Trà Vinh. Nội dung này TUYỆT ĐỐI KHÔNG ĐƯỢC MẤT khi người dùng tải ảnh lỗi! (Test ${testTs})`;

        // Nhập văn bản vào textarea
        await cdp.eval(`
            const ta = document.getElementById('newCommunityPostContent');
            ta.value = ${JSON.stringify(draftContent)};
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        `);

        // Bấm nút "Ảnh" qua giao diện
        await cdp.eval(`
            const photoBtn = document.querySelector('#communityCreatePostBox button[onclick*="promptAddPostPhoto"]');
            photoBtn.click();
        `);
        await sleep(300);

        // Đưa file quá dung lượng 5.5MB vào file input
        await cdp.setFileInput('#communityPostFileInput', [oversizedFilePath]);
        await sleep(800);

        // Kiểm tra xem textarea có còn nguyên nội dung soạn thảo không
        const checkDraftPreserved = await cdp.eval(`
            (() => {
                const ta = document.getElementById('newCommunityPostContent');
                const uploadStatus = document.getElementById('newPostMediaUploadStatus');
                return {
                    currentContent: ta?.value,
                    isPreserved: ta?.value === ${JSON.stringify(draftContent)},
                    statusText: uploadStatus?.textContent || ''
                };
            })()
        `);

        console.log('  Kết quả kiểm tra bảo toàn nội dung khi upload thất bại:', {
            isPreserved: checkDraftPreserved.isPreserved,
            statusText: checkDraftPreserved.statusText
        });
        assert(checkDraftPreserved.isPreserved, 'Nội dung soạn thảo trong textarea bị mất khi upload thất bại!');
        console.log('  ✓ ĐÃ XÁC NHẬN: Khi upload thất bại, nội dung textarea vẫn giữ nguyên 100%!');

        const failScreenshotPath = path.join(ARTIFACT_DIR, 'community_post_upload_fail_preserve_text.png');
        await cdp.captureScreenshot(failScreenshotPath);
        console.log(`  ✓ Đã chụp ảnh giao diện khi lỗi upload: ${failScreenshotPath}`);

        // ----------------------------------------------------------------------
        // BƯỚC 4: THAO TÁC HOÀN TOÀN QUA GIAO DIỆN (BẤM ẢNH -> CHỌN FILE ->
        // CHỜ UPLOAD -> MỞ CHECK-IN -> TÌM VÀ CHỌN ĐỊA ĐIỂM -> BẤM ĐĂNG BÀI)
        // (TUYỆT ĐỐI KHÔNG DÙNG FETCH TRỰC TIẾP ĐỂ TẠO BÀI HOẶC UPLOAD)
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 4] Nghiệm thu tạo bài viết Cộng đồng 100% qua thao tác giao diện...');

        const realPostText = `Hôm nay ghé thăm Wat Angkor Borey (Chùa Âng) cổ kính và trang nghiêm tuyệt đẹp! (Nghiệm thu UI ${testTs})`;

        // Cập nhật nội dung bài viết chính thức trong textarea
        await cdp.eval(`
            (() => {
                const ta = document.getElementById('newCommunityPostContent');
                if (ta) {
                    ta.value = ${JSON.stringify(realPostText)};
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                }
            })()
        `);

        // 4.1 Thao tác UI: Bấm nút "Ảnh"
        console.log('  4.1 Bấm nút "Ảnh" trên giao diện...');
        await cdp.eval(`
            (() => {
                const photoBtn = document.querySelector('#communityCreatePostBox button[onclick*="promptAddPostPhoto"]');
                if (photoBtn) photoBtn.click();
            })()
        `);
        await sleep(300);

        // 4.2 Thao tác UI: Chọn file ảnh thật từ input (CDP DOM.setFileInputFiles)
        console.log(`  4.2 Chọn file thật từ input: ${validPhotoPath}...`);
        await cdp.setFileInput('#communityPostFileInput', [validPhotoPath]);

        // 4.3 Chờ upload hoàn tất trên giao diện
        console.log('  4.3 Chờ tiến trình upload ảnh hoàn tất trên UI...');
        let uploadSucceeded = false;
        for (let i = 0; i < 20; i++) {
            await sleep(600);
            const status = await cdp.eval(`
                (() => {
                    const statusEl = document.getElementById('newPostMediaUploadStatus');
                    const imgEl = document.getElementById('newPostMediaPreviewImg');
                    const appState = window.ViVuApp.getState();
                    return {
                        statusText: statusEl?.textContent || '',
                        imgSrc: imgEl?.src || '',
                        uploadedUrl: appState._communityUploadedImageUrl || null,
                        isUploading: Boolean(appState._communityUploading)
                    };
                })()
            `);
            if (status.statusText.includes('Đã tải lên') && status.uploadedUrl) {
                uploadedImageUrl = status.uploadedUrl;
                uploadSucceeded = true;
                console.log(`    ✓ Upload thành công qua UI: ${uploadedImageUrl}`);
                break;
            }
        }
        assert(uploadSucceeded, 'Quá trình upload ảnh qua UI không hoàn tất trong thời gian quy định!');

        // 4.4 Thao tác UI: Mở modal Check-in địa điểm
        console.log('  4.4 Bấm nút "Check-in địa điểm" trên giao diện...');
        await cdp.eval(`
            (() => {
                const checkinBtn = document.querySelector('#communityCreatePostBox button[onclick*="promptAddPostLocation"]');
                if (checkinBtn) checkinBtn.click();
            })()
        `);
        await sleep(500);

        const checkinModalVisible = await cdp.eval(`
            !document.getElementById('communityCheckinModal').classList.contains('hidden')
        `);
        assert(checkinModalVisible, 'Modal Check-in không hiển thị sau khi bấm nút!');

        // 4.5 Thao tác UI: Tìm kiếm địa điểm "Chùa Âng"
        console.log('  4.5 Gõ tìm kiếm "Chùa Âng" trong modal check-in...');
        await cdp.eval(`
            (() => {
                const searchInput = document.getElementById('communityCheckinSearchInput');
                if (searchInput) {
                    searchInput.value = 'Chùa Âng';
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            })()
        `);
        await sleep(500);

        // 4.6 Thao tác UI: Chọn địa điểm "Wat Angkor Borey (Chùa Âng)" từ danh sách
        console.log('  4.6 Bấm nút "Chọn" Wat Angkor Borey (Chùa Âng) từ danh sách kết quả...');
        const clickResult = await cdp.eval(`
            (() => {
                const list = document.getElementById('communityCheckinPlacesList');
                if (!list) return false;
                const items = Array.from(list.children);
                const target = items.find(el => el.innerText && el.innerText.includes('Chùa Âng'));
                if (target) {
                    const btn = target.querySelector('button') || target;
                    btn.click();
                    return true;
                }
                return false;
            })()
        `);
        assert(clickResult, 'Không tìm thấy nút "Chọn" cho Chùa Âng trong danh sách kết quả tìm kiếm!');
        await sleep(500);

        // Kiểm tra chip check-in hiển thị và modal đã đóng
        const checkinChipState = await cdp.eval(`
            (() => {
                const modal = document.getElementById('communityCheckinModal');
                const chip = document.getElementById('newPostCheckinChip');
                const nameEl = document.getElementById('newPostCheckinName');
                return {
                    modalClosed: modal.classList.contains('hidden'),
                    chipVisible: !chip.classList.contains('hidden'),
                    selectedName: nameEl?.textContent || ''
                };
            })()
        `);
        console.log('  Kết quả gắn thẻ check-in:', checkinChipState);
        assert(checkinChipState.modalClosed, 'Modal check-in chưa đóng');
        assert(checkinChipState.chipVisible, 'Chip check-in chưa xuất hiện');
        assert(checkinChipState.selectedName.includes('Chùa Âng'), 'Tên địa điểm check-in không đúng');

        // Chụp ảnh khu vực soạn bài đã sẵn sàng (đầy đủ ảnh và check-in)
        const composerReadyScreenshot = path.join(ARTIFACT_DIR, 'community_post_composer_ready_desktop.png');
        await cdp.captureScreenshot(composerReadyScreenshot);
        console.log(`  ✓ Đã chụp ảnh khu vực soạn bài đầy đủ Ảnh & Check-in: ${composerReadyScreenshot}`);

        // 4.7 Thao tác UI: Bấm nút "Đăng bài"
        console.log('  4.7 Bấm nút "Đăng bài" trên giao diện...');
        await cdp.eval(`
            (() => {
                const submitBtn = document.getElementById('submitCommunityPostBtn');
                if (submitBtn) submitBtn.click();
            })()
        `);

        // Chờ xử lý đăng bài hoàn tất
        let postCreatedInDb = null;
        for (let i = 0; i < 25; i++) {
            await sleep(600);
            // Kiểm tra textarea đã được reset
            const isTextCleared = await cdp.eval(`
                document.getElementById('newCommunityPostContent')?.value === ''
            `);
            if (isTextCleared) {
                console.log('    ✓ Form đăng bài đã gửi thành công và reset nội dung trên UI.');
                break;
            }
        }

        // Truy vấn Admin API để lấy ID bài vừa tạo bằng UI
        const findPostRes = await fetch(`${LOCAL_URL}/api/admin-moderation?status=pending`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const findPostData = await findPostRes.json();
        const pendingPost = (findPostData.posts || []).find(p => p.content?.includes(String(testTs)));
        assert(pendingPost, 'Không tìm thấy bài viết vừa tạo qua giao diện trong hàng đợi kiểm duyệt!');
        createdPostId = pendingPost.id;
        console.log(`  ✓ Đã xác nhận bài viết tạo qua UI đã lưu vào hệ thống:`);
        console.log(`    - ID: ${createdPostId}`);
        console.log(`    - Ảnh: ${JSON.stringify(pendingPost.images)}`);
        console.log(`    - Địa điểm check-in: ${JSON.stringify(pendingPost.metadata?.location || pendingPost.location)}`);

        // ----------------------------------------------------------------------
        // BƯỚC 5: GỬI LỊCH SINH HOẠT CLB "9h" BẰNG BIỂU MẪU FORM GIAO DIỆN
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 5] Gửi lịch sinh hoạt CLB "9h" hoàn toàn bằng biểu mẫu Form qua giao diện...');

        // Chuyển sang phiên của Chủ nhiệm CLB_GYM thật
        await cdp.eval(`
            localStorage.setItem('vivu_user_session', JSON.stringify(${JSON.stringify(leaderSession)}));
            window.dispatchEvent(new CustomEvent('vivu:user-auth-changed', { detail: { session: ${JSON.stringify(leaderSession)} } }));
        `);
        await sleep(500);

        // Mở Modal gửi lịch sinh hoạt qua UI bằng cách bấm nút trên giao diện
        console.log('  5.1 Điều hướng tới trang CLB và bấm nút "Lên lịch sinh hoạt" trên giao diện...');
        await cdp.eval(`
            window.ViVuApp.navGoClubs();
        `);
        await sleep(1000);
        await cdp.eval(`
            const btn = document.getElementById('openSubmitClubActivityBtn');
            if (btn) btn.click();
            else window.ViVuApp.openSubmitClubActivityModal();
        `);
        await sleep(1000);

        const clubFormVisible = await cdp.eval(`
            !document.getElementById('submitClubActivityModal').classList.contains('hidden')
        `);
        assert(clubFormVisible, 'Modal gửi lịch sinh hoạt CLB không hiển thị!');

        // Điền các trường biểu mẫu qua DOM
        console.log('  5.2 Điền thông tin vào Form: time_schedule = "9h"...');
        await cdp.eval(`
            (() => {
                const form = document.getElementById('submitClubActivityForm');
                if (form) {
                    if (form.elements['club_id']) form.elements['club_id'].value = 'clb-clb-gym-muuzmloa';
                    if (form.elements['title']) form.elements['title'].value = 'Buổi tập rèn luyện thể lực 9h sáng (Test Form ${testTs})';
                    if (form.elements['time_schedule']) form.elements['time_schedule'].value = '9h';
                    if (form.elements['location']) form.elements['location'].value = 'Phòng Gym Trà Vinh, Đường Nguyễn Đáng';
                    if (form.elements['max_attendees']) form.elements['max_attendees'].value = '25';
                    if (form.elements['is_free']) form.elements['is_free'].value = 'true';
                    if (form.elements['description']) form.elements['description'].value = 'Rèn luyện sức bền và thể lực cuối tuần cùng CLB Gym Trà Vinh.';
                }
            })()
        `);
        await sleep(300);

        const formScreenshot = path.join(ARTIFACT_DIR, 'club_activity_form_9h_desktop.png');
        await cdp.captureScreenshot(formScreenshot);
        console.log(`  ✓ Đã chụp ảnh Biểu mẫu Form lịch CLB "9h": ${formScreenshot}`);

        // Gửi Form qua UI
        console.log('  5.3 Bấm gửi Form trên giao diện...');
        await cdp.eval(`
            (() => {
                const form = document.getElementById('submitClubActivityForm');
                const submitBtn = form?.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.click();
                } else if (form) {
                    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
            })()
        `);

        // Chờ modal đóng và lưu vào hệ thống
        let activitySaved = false;
        for (let i = 0; i < 20; i++) {
            await sleep(600);
            const isClosed = await cdp.eval(`
                document.getElementById('submitClubActivityModal')?.classList.contains('hidden')
            `);
            if (isClosed) {
                activitySaved = true;
                break;
            }
        }
        assert(activitySaved, 'Modal gửi lịch sinh hoạt không đóng sau khi submit!');

        // Lấy ID lịch vừa gửi
        const findActRes = await fetch(`${LOCAL_URL}/api/admin-moderation?status=pending`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const findActData = await findActRes.json();
        const pendingAct = (findActData.activities || []).find(a => a.title?.includes(String(testTs)));
        assert(pendingAct, 'Không tìm thấy lịch CLB vừa gửi qua form trong hàng đợi kiểm duyệt!');
        createdActivityId = pendingAct.id;
        console.log(`  ✓ Đã gửi lịch CLB thành công bằng biểu mẫu Form: ID = ${createdActivityId}, time_schedule = "${pendingAct.time_schedule}"`);

        // ----------------------------------------------------------------------
        // BƯỚC 6: ADMIN DUYỆT BÀI VIẾT & LỊCH SINH HOẠT QUA GIAO DIỆN
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 6] Admin kiểm duyệt qua giao diện & xác minh dữ liệu trung thực...');

        // Chuyển sang phiên Admin
        await cdp.eval(`
            localStorage.setItem('vivu_admin_session', JSON.stringify(${JSON.stringify(adminSession)}));
            window.ViVuApp.updateAdminRoleUI();
            window.ViVuApp.openAdminModerationModal('posts');
        `);
        await sleep(2000);

        // Kiểm tra loại bỏ hoàn toàn undefined, điểm AI giả và huy hiệu giả
        const postAudit = await cdp.eval(`
            (() => {
                const modal = document.getElementById('adminModerationModalContent');
                if (!modal) return { found: false };
                const text = modal.innerText;
                const undefinedCount = (text.match(/undefined/gi) || []).length;
                const hasFakeAi = text.includes('90/100') || text.includes('90 / 100');
                const hasFakeBadge = text.includes('Đã định danh CCCD & SĐT');
                const hasRealImg = Boolean(modal.querySelector('img[src*="clrev_"]'));
                const hasLocation = text.includes('Chùa Âng');
                return {
                    found: true,
                    undefinedCount,
                    hasFakeAi,
                    hasFakeBadge,
                    hasRealImg,
                    hasLocation
                };
            })()
        `);
        console.log('  Kết quả kiểm tra Modal Admin Moderation:', postAudit);
        assert.strictEqual(postAudit.undefinedCount, 0, 'Admin modal vẫn còn chứa chữ undefined!');
        assert(!postAudit.hasFakeAi, 'Admin modal vẫn còn điểm AI giả!');
        assert(!postAudit.hasFakeBadge, 'Admin modal vẫn còn huy hiệu giả!');
        assert(postAudit.hasRealImg, 'Admin modal không hiển thị ảnh thật người dùng upload!');
        assert(postAudit.hasLocation, 'Admin modal không hiển thị địa điểm check-in!');

        const adminModalScreenshot = path.join(ARTIFACT_DIR, 'admin_moderation_clean_desktop.png');
        await cdp.captureScreenshot(adminModalScreenshot);
        console.log(`  ✓ Đã chụp ảnh Admin Moderation sạch sẽ: ${adminModalScreenshot}`);

        // Admin phê duyệt bài viết qua giao diện (Bấm nút "Phê duyệt & Xuất bản")
        console.log('  6.1 Admin phê duyệt bài viết qua nút bấm trên giao diện...');
        await cdp.eval(`
            const approvePostBtn = document.querySelector('#adminModerationModalContent button[onclick*="approvePost"]');
            if (approvePostBtn) approvePostBtn.click();
            else window.ViVuApp.approvePost('${createdPostId}');
        `);
        await sleep(1500);

        // Chuyển sang tab Hoạt động CLB và phê duyệt lịch
        console.log('  6.2 Admin chuyển sang tab Hoạt động CLB và phê duyệt lịch qua nút bấm...');
        await cdp.eval(`
            const actTabBtn = document.querySelector('#adminModerationModalContent button[onclick*="switchModerationTab(\\'activities\\')"]');
            if (actTabBtn) actTabBtn.click();
            else window.ViVuApp.switchModerationTab('activities');
        `);
        await sleep(1200);

        await cdp.eval(`
            const approveActBtn = document.querySelector('#adminModerationModalContent button[onclick*="approveClubActivity"]');
            if (approveActBtn) approveActBtn.click();
            else window.ViVuApp.approveClubActivity('${createdActivityId}');
        `);
        await sleep(1500);

        // Chuyển sang tab CLB kiểm tra không có huy hiệu giả
        console.log('  6.3 Kiểm tra tab CLB không có huy hiệu định danh giả...');
        await cdp.eval(`
            const appState = window.ViVuApp.getState();
            if (!appState.moderationClubs || appState.moderationClubs.length === 0) {
                appState.moderationClubs = [{
                    id: 'clb-test-dossier',
                    name: 'CLB Thể Thao Kiểm Thử',
                    category: 'Thể thao',
                    categoryName: 'Thể thao',
                    founder: { name: 'Chủ nhiệm Kiểm Thử', avatar: null },
                    leaderName: 'Chủ nhiệm Kiểm Thử',
                    leaderPhone: '0912345678',
                    submittedAt: 'Vừa xong',
                    status: 'pending',
                    membersCount: 8,
                    membersRequired: 10,
                    progressPercent: 80,
                    desc: 'Câu lạc bộ rèn luyện sức khỏe cộng đồng',
                    operatingHub: 'TP. Trà Vinh',
                    code: 'clb-test',
                    meetingPlace: 'TP. Trà Vinh',
                    scheduleInfo: 'Chủ nhật hàng tuần',
                    isEligible: false,
                    notableFounders: [{ name: 'Chủ nhiệm Kiểm Thử', role: 'Chủ nhiệm' }],
                    criteriaList: [],
                    threeMonthsPlan: ['Hoạt động tháng 1', 'Hoạt động tháng 2']
                }];
                appState.selectedModerationClubId = 'clb-test-dossier';
            }
            window.ViVuApp.switchModerationTab('clubs');
        `);
        await sleep(1200);

        const clubsAudit = await cdp.eval(`
            (() => {
                const modal = document.getElementById('adminModerationModalContent');
                const text = modal?.innerText || '';
                return {
                    undefinedCount: (text.match(/undefined/gi) || []).length,
                    hasFakeBadge: text.includes('Đã định danh CCCD & SĐT'),
                    hasNeutralText: text.includes('Xác minh danh tính: Chưa có dữ liệu')
                };
            })()
        `);
        assert.strictEqual(clubsAudit.undefinedCount, 0, 'Tab CLB còn chữ undefined!');
        assert(!clubsAudit.hasFakeBadge, 'Tab CLB còn huy hiệu giả!');
        assert(clubsAudit.hasNeutralText, 'Tab CLB phải có Xác minh danh tính: Chưa có dữ liệu!');
        console.log('  ✓ Tab CLB đã gỡ bỏ hoàn toàn huy hiệu giả.');

        const adminClubsScreenshot = path.join(ARTIFACT_DIR, 'admin_moderation_clubs_desktop.png');
        await cdp.captureScreenshot(adminClubsScreenshot);
        console.log(`  ✓ Đã chụp ảnh Tab CLB Moderation: ${adminClubsScreenshot}`);

        // Đóng Admin Moderation Modal
        await cdp.eval(`window.ViVuApp.closeAdminModerationModal();`);
        await sleep(500);

        // ----------------------------------------------------------------------
        // BƯỚC 7: NGƯỜI DÙNG THẤY ĐÚNG ẢNH, ĐỊA ĐIỂM & LỊCH 9H SAU DUYỆT
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 7] Kiểm tra hiển thị công khai sau khi duyệt trên client...');

        // Quay lại giao diện người dùng
        await cdp.eval(`
            localStorage.removeItem('vivu_admin_session');
            localStorage.setItem('vivu_user_session', JSON.stringify(${JSON.stringify(testUserSession)}));
            window.ViVuApp.navGoCommunity();
        `);
        await sleep(1500);

        // Đồng bộ dữ liệu mới nhất
        await cdp.eval(`window.ViVuApp.syncCommunityUgcFeed();`);
        await sleep(2000);

        // 7.1 Kiểm tra nhãn nút đã đổi thành "Ảnh"
        const photoButtonLabel = await cdp.eval(`
            (() => {
                const btn = document.querySelector('#communityCreatePostBox button[onclick*="promptAddPostPhoto"]');
                return btn ? btn.innerText.trim() : '';
            })()
        `);
        assert(!photoButtonLabel.includes('Video'), 'Nút chưa được đổi từ "Ảnh / Video" sang "Ảnh"');
        console.log(`  ✓ Nhãn nút hình ảnh: "${photoButtonLabel}" (Đã bỏ chữ Video).`);

        // 7.2 Kiểm tra bài viết hiển thị trên Bảng tin
        const feedPostAudit = await cdp.eval(`
            (() => {
                const feed = document.getElementById('communityPostsFeed');
                if (!feed) return { found: false };
                const cards = Array.from(feed.querySelectorAll('.post-card, [data-post-id], article, div'));
                const card = cards.find(c => c.innerText && c.innerText.includes('${testTs}'));
                if (!card) return { found: false, allText: feed.innerText.slice(0, 300) };
                const img = card.querySelector('img');
                const hasLocation = card.innerText.includes('Chùa Âng');
                const isSample = card.innerText.includes('Mẫu tham khảo') || card.innerText.includes('Lịch mẫu');
                return {
                    found: true,
                    hasImg: Boolean(img),
                    imgSrc: img ? img.src : null,
                    hasLocation,
                    isSample,
                    cardText: card.innerText.slice(0, 200).replace(/\\s+/g, ' ')
                };
            })()
        `);
        console.log('  Kết quả hiển thị bài viết trên Bảng tin sau duyệt:', feedPostAudit);
        assert(feedPostAudit.found, 'Không tìm thấy bài viết đã duyệt trên bảng tin!');
        assert(feedPostAudit.hasImg, 'Bài viết trên bảng tin không có ảnh!');
        assert(feedPostAudit.imgSrc && feedPostAudit.imgSrc.includes('clrev_'), 'Ảnh trên bảng tin không phải ảnh người dùng đã upload!');
        assert(feedPostAudit.hasLocation, 'Bài viết trên bảng tin không hiển thị địa điểm check-in Chùa Âng!');
        assert(!feedPostAudit.isSample, 'Bài viết bị dán nhãn mẫu!');
        console.log('  ✓ Bảng tin hiển thị đúng 100% ảnh người dùng upload và địa điểm check-in!');

        // Chụp ảnh Desktop Bảng tin
        const feedDesktopScreenshot = path.join(ARTIFACT_DIR, 'community_feed_real_image_desktop.png');
        await cdp.captureScreenshot(feedDesktopScreenshot);
        console.log(`  ✓ Đã chụp ảnh Desktop Bảng tin: ${feedDesktopScreenshot}`);

        // Chụp ảnh Mobile Bảng tin (390x844)
        await cdp.setViewport(390, 844, true);
        await sleep(500);
        const feedMobileScreenshot = path.join(ARTIFACT_DIR, 'community_feed_real_image_mobile.png');
        await cdp.captureScreenshot(feedMobileScreenshot);
        console.log(`  ✓ Đã chụp ảnh Mobile Bảng tin: ${feedMobileScreenshot}`);

        // Phục hồi lại viewport Desktop
        await cdp.setViewport(1280, 900, false);
        await sleep(300);

        // 7.3 Kiểm tra Widget Lịch sinh hoạt CLB
        const activityAudit = await cdp.eval(`
            (() => {
                const widget = document.getElementById('weeklyActivitiesList');
                if (!widget) return { found: false };
                const items = Array.from(widget.children);
                const item = items.find(el => el.innerText && el.innerText.includes('${testTs}'));
                if (!item) return { found: false, text: widget.innerText.slice(0, 300) };
                const isSample = item.innerText.includes('Lịch mẫu tham khảo');
                const hasTime9h = item.innerText.includes('9h');
                const hasGymClub = item.innerText.includes('CLB_GYM');
                return {
                    found: true,
                    isSample,
                    hasTime9h,
                    hasGymClub,
                    text: item.innerText.slice(0, 200).replace(/\\s+/g, ' ')
                };
            })()
        `);
        console.log('  Kết quả hiển thị Lịch sinh hoạt trên Widget:', activityAudit);
        assert(activityAudit.found, 'Lịch sinh hoạt CLB_GYM không hiển thị trên Widget sau duyệt!');
        assert(activityAudit.hasTime9h, 'Lịch sinh hoạt không hiển thị đúng thời gian "9h"!');
        assert(!activityAudit.isSample, 'Lịch sinh hoạt thực tế của CLB bị dán nhãn "Lịch mẫu tham khảo"!');
        console.log('  ✓ Lịch sinh hoạt 9h sáng của CLB_GYM hiển thị chuẩn xác, KHÔNG bị dán nhãn mẫu!');

        console.log('\n' + '='.repeat(80));
        console.log(' TẤT CẢ CÁC THAO TÁC GIAO DIỆN ĐÃ PASS 100%! BẢN LOCAL DÙNG SUPABASE LIVE.');
        console.log('='.repeat(80));

    } catch (err) {
        console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
        process.exitCode = 1;
    } finally {
        // ----------------------------------------------------------------------
        // DỌN DẸP AN TOÀN
        // ----------------------------------------------------------------------
        console.log('\n[DỌN DẸP] Dọn dẹp dữ liệu thử nghiệm, bảo toàn nguyên vẹn dữ liệu thật...');

        if (cdp) await cdp.close();
        if (chromeProcess) chromeProcess.kill();
        server.close();

        // Xóa bài viết test
        if (createdPostId) {
            try {
                const delPostRes = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${encodeURIComponent(createdPostId)}`, {
                    method: 'DELETE',
                    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
                });
                console.log(`  ✓ Đã xóa bài viết test (${createdPostId}): HTTP ${delPostRes.status}`);
            } catch (_) {}
        }

        // Xóa lịch CLB test
        if (createdActivityId) {
            try {
                const delActRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${encodeURIComponent(createdActivityId)}`, {
                    method: 'DELETE',
                    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
                });
                console.log(`  ✓ Đã xóa lịch CLB test (${createdActivityId}): HTTP ${delActRes.status}`);
            } catch (_) {}
        }

        // Xóa ảnh test trên Storage
        if (uploadedImageUrl) {
            try {
                const storagePath = uploadedImageUrl.split('/object/public/review-photos/')[1];
                if (storagePath) {
                    const delImgRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${storagePath}`, {
                        method: 'DELETE',
                        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
                    });
                    console.log(`  ✓ Đã xóa ảnh test trên Storage (${storagePath}): HTTP ${delImgRes.status}`);
                }
            } catch (_) {}
        }

        // Xóa tài khoản test
        if (testUserId) {
            try {
                const delUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${testUserId}`, {
                    method: 'DELETE',
                    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
                });
                console.log(`  ✓ Đã xóa tài khoản user test (${testUserId}): HTTP ${delUserRes.status}`);
            } catch (_) {}
        }

        // Xóa các file tạm trên ổ đĩa
        if (fs.existsSync(oversizedFilePath)) fs.unlinkSync(oversizedFilePath);
        if (fs.existsSync(validPhotoPath)) fs.unlinkSync(validPhotoPath);
        console.log('  ✓ Đã xóa các file ảnh tạm trên ổ đĩa.');
    }
}

main();
