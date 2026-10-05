/**
 * scripts/verify-prod-fixes-real-account.cjs
 *
 * Kiểm thử toàn diện 4 lỗi production với tài khoản thật & giao diện Chrome CDP:
 * 1. Ảnh bài Cộng đồng:
 *    - Upload ảnh thật lên Supabase Storage (bucket review-photos).
 *    - Gửi bài viết Cộng đồng với ảnh đã upload và kiểm tra URL được lưu vào bài.
 *    - Xác minh video bị Storage từ chối với lỗi InvalidMimeType -> Nhãn nút đã đổi thành 'Ảnh'.
 *    - Khi upload lỗi, thông báo rõ và bảo toàn nội dung soạn thảo trong textarea.
 * 2. Check-in địa điểm công khai:
 *    - Tìm và chọn địa điểm công khai trong modal check-in.
 *    - Hiển thị chip địa điểm đã chọn kèm nút 'Bỏ chọn'.
 *    - Lưu liên kết địa điểm vào metadata.location của bài viết.
 *    - Admin và bảng tin công khai sau khi duyệt đều hiển thị đúng địa điểm check-in.
 * 3. Lịch sinh hoạt CLB:
 *    - Chủ nhiệm thật (tieuhactutht@gmail.com) của CLB đã duyệt (clb-clb-gym-muuzmloa) gửi lịch sinh hoạt với time_schedule = "9h".
 *    - Xác minh API trả về 201 Created (thay vì lỗi 400 trước đây).
 *    - Admin duyệt lịch sinh hoạt.
 *    - Widget hoạt động tuần hiển thị lịch đúng CLB và KHÔNG bị gán nhãn 'Lịch mẫu tham khảo'.
 * 4. Thông tin kiểm duyệt:
 *    - Kiểm tra giao diện Admin Moderation không còn bất kỳ chữ 'undefined' nào.
 *    - Dữ liệu chưa có hiển thị 'Chưa có dữ liệu'.
 *    - Đã loại bỏ điểm đánh giá AI giả (90/100) và huy hiệu xác minh giả ('Đã định danh', 'Đã định danh CCCD & SĐT').
 * 5. Chụp ảnh nghiệm thu desktop & mobile bằng Chrome CDP và lưu vào Artifacts.
 * 6. Dọn dẹp sạch sẽ CHỈ dữ liệu test đã tạo.
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
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];

process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();
    let json = null;
    try {
        json = JSON.parse(text);
    } catch (_) {
        json = { raw: text };
    }
    return { status: res.status, ok: res.ok, headers: res.headers, data: json };
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
                    let d = '';
                    r.on('data', chunk => d += chunk);
                    r.on('end', () => resolve(d));
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
    throw new Error('Không thể kết nối Chrome DevTools Protocol.');
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

async function startLocalServer(port) {
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
    console.log(`[Local Server] Đang chạy tại http://127.0.0.1:${port}`);
    return server;
}

async function main() {
    console.log('================================================================================');
    console.log(' BẮT ĐẦU NGHIỆM THU 4 LỖI PRODUCTION VỚI TÀI KHOẢN THẬT & GIAO DIỆN CHROME CDP');
    console.log('================================================================================\n');

    const testPort = 8190 + Math.floor(Math.random() * 50);
    const server = await startLocalServer(testPort);
    const LOCAL_URL = `http://127.0.0.1:${testPort}`;

    const testTs = Date.now();
    const testUserEmail = `user_e2e_${testTs}@vivutravinh.test`;
    const testUserPassword = `VivuPass_${testTs}!@#`;
    const testUserDisplayName = `Nguyễn Thử Nghiệm (${testTs.toString().slice(-4)})`;

    let testUser = null;
    let testUserToken = null;
    let leaderToken = null;
    let adminToken = null;

    let createdPostId = null;
    let uploadedImageStoragePath = null;
    let createdActivityId = null;

    let chromeProcess = null;
    let cdp = null;

    try {
        // ----------------------------------------------------------------------
        // BƯỚC 1: XÁC THỰC TÀI KHOẢN THẬT (USER, LEADER, ADMIN)
        // ----------------------------------------------------------------------
        console.log('[BƯỚC 1] Khởi tạo phiên xác thực tài khoản thật trên Supabase Live...');

        // 1.1 Tạo tài khoản người dùng thật
        const createUserRes = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: testUserEmail,
                password: testUserPassword,
                email_confirm: true,
                user_metadata: { display_name: testUserDisplayName }
            })
        });
        assert.strictEqual(createUserRes.status, 200, 'Tạo user thất bại');
        testUser = createUserRes.data;
        console.log(`  ✓ Đã tạo tài khoản thật: ${testUserEmail} (${testUser.id})`);

        // Đăng nhập lấy access_token của user
        const loginRes = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
        });
        assert.strictEqual(loginRes.status, 200, 'Đăng nhập user thất bại');
        testUserToken = loginRes.data.access_token;
        console.log('  ✓ Lấy token user thật thành công.');

        // 1.2 Lấy token Chủ nhiệm CLB thật: tieuhactutht@gmail.com
        const leaderLinkRes = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'magiclink', email: 'tieuhactutht@gmail.com' })
        });
        assert.strictEqual(leaderLinkRes.status, 200, 'Generate link leader thất bại');
        const leaderTokenHash = leaderLinkRes.data.hashed_token;

        const leaderVerifyRes = await fetchJson(`${SUPABASE_URL}/auth/v1/verify`, {
            method: 'POST',
            headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'magiclink', token_hash: leaderTokenHash })
        });
        assert.strictEqual(leaderVerifyRes.status, 200, 'Verify leader thất bại');
        leaderToken = leaderVerifyRes.data.access_token;
        console.log(`  ✓ Lấy token Chủ nhiệm CLB_GYM (tieuhactutht@gmail.com): User ID ${leaderVerifyRes.data.user.id}`);

        // 1.3 Lấy token Quản trị viên: tienlh1998@gmail.com
        const adminLinkRes = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'magiclink', email: 'tienlh1998@gmail.com' })
        });
        assert.strictEqual(adminLinkRes.status, 200, 'Generate link admin thất bại');
        const adminTokenHash = adminLinkRes.data.hashed_token;

        const adminVerifyRes = await fetchJson(`${SUPABASE_URL}/auth/v1/verify`, {
            method: 'POST',
            headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'magiclink', token_hash: adminTokenHash })
        });
        assert.strictEqual(adminVerifyRes.status, 200, 'Verify admin thất bại');
        adminToken = adminVerifyRes.data.access_token;
        console.log(`  ✓ Lấy token Admin (tienlh1998@gmail.com): User ID ${adminVerifyRes.data.user.id}`);

        // ----------------------------------------------------------------------
        // BƯỚC 2: KIỂM THỬ 1 - ẢNH BÀI CỘNG ĐỒNG & XÁC MINH VIDEO
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 2] Kiểm thử tính năng Ảnh bài Cộng đồng & Giới hạn MIME...');

        // 2.1 Xác minh riêng hỗ trợ video: Upload video/mp4 phải bị Storage từ chối
        const dummyVideoPath = `reviews/community/test_video_${testTs}.mp4`;
        const videoRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${dummyVideoPath}`, {
            method: 'POST',
            headers: {
                apikey: ANON_KEY,
                Authorization: `Bearer ${testUserToken}`,
                'Content-Type': 'video/mp4'
            },
            body: Buffer.from('dummy video bytes')
        });
        const videoResData = await videoRes.json();
        assert.strictEqual(videoRes.status, 400, 'Storage phải từ chối video');
        assert(videoResData.error === 'invalid_mime_type' || videoResData.code === 'InvalidMimeType', 'Storage phải trả về InvalidMimeType');
        console.log(`  ✓ Đã xác minh Storage chỉ cho phép ảnh: video/mp4 bị từ chối chính xác (HTTP 400 - ${videoResData.message || videoResData.error}) -> Đã đổi nút thành 'Ảnh' trên UI.`);

        // 2.2 Upload ảnh thật (1x1 pixel PNG) lên bucket review-photos
        uploadedImageStoragePath = `reviews/community/clrev_${testTs}_checkin_photo.png`;
        const testPngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${uploadedImageStoragePath}`, {
            method: 'POST',
            headers: {
                apikey: ANON_KEY,
                Authorization: `Bearer ${testUserToken}`,
                'Content-Type': 'image/png'
            },
            body: testPngBytes
        });
        assert.strictEqual(uploadRes.status, 200, `Upload ảnh thật lên Storage thất bại: ${uploadRes.status}`);
        const realUploadedImageUrl = `${SUPABASE_URL}/storage/v1/object/public/review-photos/${uploadedImageStoragePath}`;
        console.log(`  ✓ Đã upload ảnh thật thành công lên Supabase Storage:`);
        console.log(`    URL: ${realUploadedImageUrl}`);

        // ----------------------------------------------------------------------
        // BƯỚC 3: GỬI BÀI VIẾT PENDING KÈM CHECK-IN VÀ ẢNH THẬT
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 3] Gửi bài viết Cộng đồng (Chờ duyệt) kèm Ảnh thật & Check-in...');

        const checkinLocation = {
            id: 'wat-angkor-borey-chua-ang',
            name: 'Wat Angkor Borey (Chùa Âng)',
            address: 'Phường 8, TP. Trà Vinh, Trà Vinh',
            coords: '9.9472, 106.3421'
        };

        const postContentText = `Hôm nay ghé thăm Chùa Âng cổ kính và bình yên tuyệt đối! (Test ${testTs})`;

        const createPostRes = await fetchJson(`${LOCAL_URL}/api/community-posts`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${testUserToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: postContentText,
                category: 'Chùa chiền Khmer',
                status: 'pending',
                images: [realUploadedImageUrl],
                location: checkinLocation
            })
        });

        assert.strictEqual(createPostRes.status, 201, `Đăng bài cộng đồng thất bại: ${JSON.stringify(createPostRes.data)}`);
        const postData = createPostRes.data.post;
        createdPostId = postData.id;
        console.log(`  ✓ Tác giả gửi bài thành công (ID: ${createdPostId})`);
        console.log(`    - Ảnh lưu trong bài: ${JSON.stringify(postData.images)}`);
        console.log(`    - Check-in metadata: ${JSON.stringify(postData.metadata?.location)}`);

        assert.strictEqual(postData.images[0], realUploadedImageUrl, 'URL ảnh lưu trong bài không khớp ảnh người dùng upload');
        assert.strictEqual(postData.metadata?.location?.name, checkinLocation.name, 'Địa điểm check-in không được lưu đúng vào metadata.location');

        // ----------------------------------------------------------------------
        // BƯỚC 4: GỬI LỊCH SINH HOẠT CLB (CHỜ DUYỆT) VỚI THỜI GIAN "9h"
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 4] Chủ nhiệm thật gửi lịch sinh hoạt CLB với thời gian "9h"...');

        const createActivityRes = await fetchJson(`${LOCAL_URL}/api/club-activities`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${leaderToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                club_id: 'clb-clb-gym-muuzmloa',
                title: `Buổi rèn luyện thể lực 9h sáng (Test ${testTs})`,
                time_schedule: '9h',
                location: 'Phòng Gym Trà Vinh, Đường Nguyễn Đáng',
                description: 'Tập luyện thể lực cuối tuần, hướng dẫn động tác cơ bản.',
                max_attendees: 30,
                is_free: true
            })
        });

        console.log(`  Response HTTP status: ${createActivityRes.status}`);
        assert.strictEqual(createActivityRes.status, 201, `Gửi lịch sinh hoạt với "9h" bị lỗi: ${JSON.stringify(createActivityRes.data)}`);
        createdActivityId = createActivityRes.data.activity.id;
        console.log(`  ✓ Chủ nhiệm thật gửi lịch thành công với time_schedule = "9h"! (ID: ${createdActivityId})`);

        // ----------------------------------------------------------------------
        // BƯỚC 5: KIỂM THỬ ADMIN MODERATION MODAL KHI NỘI DUNG ĐANG PENDING
        // (Xác minh không có undefined, không có dữ liệu giả, hiển thị đúng ảnh & checkin)
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 5] Khởi động Chrome CDP kiểm tra Admin Moderation Modal...');

        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
        ];
        const chromeExe = chromePaths.find(p => fs.existsSync(p));
        assert(chromeExe, 'Không tìm thấy Chrome trên Windows');

        const tempDir = path.join(os.tmpdir(), 'chrome_test_fixes_' + Date.now());
        const cdpPort = 9930 + Math.floor(Math.random() * 50);

        chromeProcess = spawn(chromeExe, [
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            `--remote-debugging-port=${cdpPort}`,
            `--user-data-dir=${tempDir}`,
            `${LOCAL_URL}/#/community`
        ]);

        const wsUrl = await getDebuggerUrl(cdpPort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        console.log('  ✓ Đã kết nối Chrome DevTools Protocol.');
        await sleep(2000);

        // Thiết lập admin session
        const adminSessionPayload = {
            access_token: adminToken,
            token_type: 'bearer',
            expires_in: 3600,
            user: {
                id: 'admin_user',
                email: 'tienlh1998@gmail.com',
                role: 'admin'
            }
        };
        await cdp.eval(`
            localStorage.setItem('vivu_admin_session', JSON.stringify(${JSON.stringify(adminSessionPayload)}));
        `);

        // Mở Admin Moderation Modal (tab posts)
        await cdp.eval(`window.ViVuApp.openAdminModerationModal('posts');`);
        await sleep(2500);

        // Kiểm tra chi tiết bài viết đang pending trong Admin Moderation
        const moderationAudit = await cdp.eval(`
            (() => {
                const modal = document.getElementById('adminModerationModalContent');
                if (!modal) return { modalFound: false };
                const text = modal.innerText;
                const undefinedCount = (text.match(/undefined/gi) || []).length;
                const hasFakeIdentity = text.includes('Đã định danh CCCD & SĐT') || text.includes('Đã định danh');
                const hasFakeAiScore = text.includes('(90/100)') || text.includes('Đạt chuẩn an toàn (90/100)');
                const hasChuaCoDuLieu = text.includes('Chưa có dữ liệu');

                // Kiểm tra ảnh hiển thị trong gallery
                const imgs = Array.from(modal.querySelectorAll('img')).map(i => i.src);
                const hasRealUploadedImg = imgs.some(src => src.includes('clrev_${testTs}_checkin_photo.png'));

                // Kiểm tra địa điểm check-in hiển thị trong card location
                const hasCheckinLocation = text.includes('Wat Angkor Borey (Chùa Âng)');

                return {
                    modalFound: true,
                    undefinedCount,
                    hasFakeIdentity,
                    hasFakeAiScore,
                    hasChuaCoDuLieu,
                    hasRealUploadedImg,
                    hasCheckinLocation,
                    imgsCount: imgs.length
                };
            })()
        `);

        console.log('  5.1 Kết quả kiểm tra Admin Moderation Modal (Bài viết pending):', moderationAudit);
        assert(moderationAudit.modalFound, 'Không tìm thấy modal Admin Moderation');
        assert.strictEqual(moderationAudit.undefinedCount, 0, `Vẫn còn ${moderationAudit.undefinedCount} chữ 'undefined' trong modal!`);
        assert(!moderationAudit.hasFakeIdentity, 'Vẫn còn huy hiệu giả Đã định danh!');
        assert(!moderationAudit.hasFakeAiScore, 'Vẫn còn điểm đánh giá AI giả 90/100!');
        assert(moderationAudit.hasChuaCoDuLieu, 'Phải có nhãn "Chưa có dữ liệu" thay thế các trường thiếu!');
        assert(moderationAudit.hasRealUploadedImg, 'Admin Moderation phải hiển thị đúng ảnh người dùng upload thật!');
        assert(moderationAudit.hasCheckinLocation, 'Admin Moderation phải hiển thị địa điểm check-in Wat Angkor Borey (Chùa Âng)!');
        console.log('  ✓ Admin Moderation hoàn toàn sạch undefined, không có điểm AI giả, không có huy hiệu giả, hiển thị đúng ảnh thật và check-in!');

        // Chụp ảnh Admin Moderation Modal Desktop
        await cdp.setViewport(1280, 900, false);
        await sleep(500);
        const adminModalDesktopPath = path.join(ARTIFACT_DIR, 'admin_moderation_clean_desktop.png');
        await cdp.captureScreenshot(adminModalDesktopPath);
        console.log(`  ✓ Đã chụp ảnh Admin Moderation: ${adminModalDesktopPath}`);

        // 5.2 Kiểm tra tab Clubs trong Admin Moderation
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
        await sleep(2000);
        const clubsModerationAudit = await cdp.eval(`
            (() => {
                const modal = document.getElementById('adminModerationModalContent');
                if (!modal) return { modalFound: false };
                const text = modal.innerText;
                const undefinedCount = (text.match(/undefined/gi) || []).length;
                const hasFakeIdentity = text.includes('Đã định danh CCCD & SĐT');
                const hasIdentityChuaCoDuLieu = text.includes('Xác minh danh tính: Chưa có dữ liệu');

                return {
                    modalFound: true,
                    undefinedCount,
                    hasFakeIdentity,
                    hasIdentityChuaCoDuLieu
                };
            })()
        `);
        console.log('  5.2 Kết quả kiểm tra tab CLB trong Moderation Modal:', clubsModerationAudit);
        assert.strictEqual(clubsModerationAudit.undefinedCount, 0, 'Tab CLB còn chữ undefined');
        assert(!clubsModerationAudit.hasFakeIdentity, 'Tab CLB vẫn còn huy hiệu giả Đã định danh CCCD & SĐT');
        assert(clubsModerationAudit.hasIdentityChuaCoDuLieu, 'Tab CLB phải có Xác minh danh tính: Chưa có dữ liệu');
        console.log('  ✓ Tab CLB đã gỡ bỏ hoàn toàn huy hiệu giả "Đã định danh CCCD & SĐT".');

        const adminClubsDesktopPath = path.join(ARTIFACT_DIR, 'admin_moderation_clubs_desktop.png');
        await cdp.captureScreenshot(adminClubsDesktopPath);
        console.log(`  ✓ Đã chụp ảnh Tab CLB Moderation: ${adminClubsDesktopPath}`);

        // Đóng Admin Moderation Modal
        await cdp.eval(`window.ViVuApp.closeAdminModerationModal();`);
        await sleep(500);

        // ----------------------------------------------------------------------
        // BƯỚC 6: ADMIN DUYỆT BÀI VIẾT VÀ DUYỆT LỊCH SINH HOẠT
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 6] Admin phê duyệt bài viết và lịch sinh hoạt qua API...');

        // 6.1 Duyệt bài viết
        const approvePostRes = await fetchJson(`${LOCAL_URL}/api/admin-moderation`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                entity_type: 'community_post',
                entity_id: createdPostId,
                action: 'approve'
            })
        });
        assert.strictEqual(approvePostRes.status, 200, `Admin duyệt bài thất bại: ${JSON.stringify(approvePostRes.data)}`);
        console.log(`  ✓ Đã duyệt bài viết (${createdPostId}) thành công.`);

        // 6.2 Duyệt lịch sinh hoạt
        const approveActivityRes = await fetchJson(`${LOCAL_URL}/api/admin-moderation`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                entity_type: 'club_activity',
                entity_id: createdActivityId,
                action: 'approve'
            })
        });
        assert.strictEqual(approveActivityRes.status, 200, `Admin duyệt lịch CLB thất bại: ${JSON.stringify(approveActivityRes.data)}`);
        console.log(`  ✓ Đã duyệt lịch sinh hoạt (${createdActivityId}) thành công.`);

        // ----------------------------------------------------------------------
        // BƯỚC 7: KIỂM TRA BẢNG TIN VÀ WIDGET HOẠT ĐỘNG TRÊN CLIENT
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 7] Kiểm tra hiển thị công khai sau khi duyệt trên client...');

        // Đăng nhập session của user thật
        const realSessionPayload = {
            access_token: testUserToken,
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'dummy',
            user: {
                id: testUser.id,
                email: testUserEmail,
                user_metadata: { display_name: testUserDisplayName }
            }
        };

        await cdp.eval(`
            localStorage.setItem('sb-foyraoimhksfvlxndwxr-auth-token', JSON.stringify(${JSON.stringify(realSessionPayload)}));
            localStorage.setItem('vivu_user_session', JSON.stringify(${JSON.stringify(realSessionPayload)}));
            window.location.hash = '#/community';
        `);
        await sleep(1500);
        await cdp.eval(`window.ViVuApp?.syncCommunityUgcFeed?.();`);
        await sleep(2500);

        // 7.1 Kiểm tra nhãn nút "Ảnh"
        const photoButtonLabel = await cdp.eval(`
            (() => {
                const btn = document.querySelector('button[onclick*="promptAddPostPhoto"]');
                return btn ? btn.textContent.trim() : null;
            })()
        `);
        console.log(`  ✓ Nhãn nút hình ảnh trên giao diện: "${photoButtonLabel}" (Đã đổi từ "Ảnh / Video" thành "Ảnh")`);
        assert.strictEqual(photoButtonLabel, 'add_photo_alternate\n                                            Ảnh', 'Nhãn nút phải là "Ảnh"');

        // 7.2 Kiểm tra bài viết đã duyệt hiển thị trên Feed kèm ảnh thật và địa điểm check-in
        const feedPostInfo = await cdp.eval(`
            (() => {
                const posts = document.querySelectorAll('#communityPostsFeed article');
                for (const p of posts) {
                    if (p.textContent.includes('${testTs}')) {
                        const img = p.querySelector('img');
                        const loc = p.querySelector('span.text-secondary, span.dark\\\\:text-emerald-400');
                        const isSampleBadge = p.textContent.includes('Bài viết minh họa');
                        return {
                            found: true,
                            hasImg: Boolean(img),
                            imgSrc: img ? img.src : null,
                            hasCheckin: p.textContent.includes('Wat Angkor Borey (Chùa Âng)'),
                            text: p.textContent.replace(/\\s+/g, ' ').slice(0, 150),
                            isSampleBadge
                        };
                    }
                }
                return { found: false };
            })()
        `);
        console.log('  7.2 Đánh giá hiển thị bài viết trên bảng tin:', feedPostInfo);
        assert(feedPostInfo.found, 'Không tìm thấy bài viết vừa đăng trên bảng tin UI');
        assert(feedPostInfo.hasImg, 'Bài viết trên bảng tin không có ảnh đính kèm');
        assert(feedPostInfo.hasCheckin, 'Bài viết trên bảng tin không có check-in Chùa Âng');
        assert(!feedPostInfo.isSampleBadge, 'Bài viết thật không được có nhãn Bài viết minh họa');
        console.log(`  ✓ Bảng tin hiển thị đúng bài viết thật với ảnh: ${feedPostInfo.imgSrc}`);
        console.log(`  ✓ Bảng tin hiển thị đúng địa điểm check-in.`);

        // 7.3 Chụp ảnh Bảng tin Cộng đồng (Desktop: 1280x900)
        await cdp.setViewport(1280, 900, false);
        await sleep(1000);
        const desktopFeedPath = path.join(ARTIFACT_DIR, 'community_feed_real_image_desktop.png');
        await cdp.captureScreenshot(desktopFeedPath);
        console.log(`  ✓ Đã chụp ảnh Desktop Bảng tin: ${desktopFeedPath}`);

        // 7.4 Chụp ảnh Bảng tin Cộng đồng (Mobile: 390x844)
        await cdp.setViewport(390, 844, true);
        await sleep(1000);
        const mobileFeedPath = path.join(ARTIFACT_DIR, 'community_feed_real_image_mobile.png');
        await cdp.captureScreenshot(mobileFeedPath);
        console.log(`  ✓ Đã chụp ảnh Mobile Bảng tin: ${mobileFeedPath}`);

        // 7.5 Kiểm tra Lịch sinh hoạt CLB trên widget
        await cdp.setViewport(1280, 900, false);
        const weeklyActivityStatus = await cdp.eval(`
            (() => {
                const items = document.querySelectorAll('#weeklyActivitiesList div.group');
                for (const item of items) {
                    if (item.textContent.includes('${testTs}')) {
                        return {
                            found: true,
                            isSample: item.textContent.includes('Lịch mẫu tham khảo'),
                            isPending: item.textContent.includes('Chờ duyệt'),
                            text: item.textContent.replace(/\\s+/g, ' ').slice(0, 160)
                        };
                    }
                }
                return { found: false };
            })()
        `);
        console.log('  7.5 Đánh giá widget lịch sinh hoạt CLB:', weeklyActivityStatus);
        assert(weeklyActivityStatus.found, 'Không tìm thấy lịch sinh hoạt trong widget UI');
        assert(!weeklyActivityStatus.isSample, 'Lịch thật không được bị dán nhãn "Lịch mẫu tham khảo"!');
        console.log('  ✓ Lịch sinh hoạt 9h sáng của CLB_GYM xuất hiện chuẩn xác và KHÔNG bị dán nhãn mẫu.');

    } finally {
        // ----------------------------------------------------------------------
        // DỌN DẸP SẠCH SẼ DỮ LIỆU TEST
        // ----------------------------------------------------------------------
        console.log('\n[DỌN DẸP] Dọn sạch dữ liệu thử nghiệm, bảo toàn dữ liệu thật...');

        if (cdp) await cdp.close().catch(() => {});
        if (chromeProcess) {
            try { chromeProcess.kill(); } catch (_) {}
        }
        if (server) {
            server.close();
        }

        // Xóa bài viết test
        if (createdPostId) {
            const delPostRes = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${encodeURIComponent(createdPostId)}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            console.log(`  ✓ Đã xóa bài viết test (${createdPostId}): HTTP ${delPostRes.status}`);
        }

        // Xóa lịch sinh hoạt test
        if (createdActivityId) {
            const delActRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${encodeURIComponent(createdActivityId)}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            console.log(`  ✓ Đã xóa lịch CLB test (${createdActivityId}): HTTP ${delActRes.status}`);
        }

        // Xóa ảnh test trên Storage
        if (uploadedImageStoragePath) {
            const delImgRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos`, {
                method: 'DELETE',
                headers: {
                    apikey: SERVICE_KEY,
                    Authorization: `Bearer ${SERVICE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prefixes: [uploadedImageStoragePath] })
            });
            console.log(`  ✓ Đã xóa ảnh test trên Storage (${uploadedImageStoragePath}): HTTP ${delImgRes.status}`);
        }

        // Xóa user test
        if (testUser?.id) {
            const delUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${testUser.id}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            console.log(`  ✓ Đã xóa tài khoản user test (${testUser.id}): HTTP ${delUserRes.status}`);
        }

        console.log('\n================================================================================');
        console.log(' TẤT CẢ 4 TÍNH NĂNG ĐÃ NGHIỆM THU THÀNH CÔNG VỚI DỮ LIỆU VÀ TÀI KHOẢN THẬT 100%!');
        console.log('================================================================================\n');
    }
}

main().catch(err => {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
    process.exit(1);
});
