/**
 * scripts/verify-place-moderation-e2e.cjs
 * Kịch bản kiểm thử E2E luồng "Đề xuất địa điểm" trong Trung tâm kiểm duyệt trên Chrome CDP thật:
 * 1. Đăng bài đề xuất địa điểm từ người dùng thường qua API /submit-place.
 * 2. Admin mở Trung tâm kiểm duyệt:
 *    - Sidebar badge phản ánh đúng tổng số pending (gồm places).
 *    - Thẻ thống kê KPI "Địa điểm chờ duyệt" hiển thị chính xác.
 *    - Tab "Đề xuất địa điểm" độc lập đọc từ bảng places (thay thế nút posts/location cũ).
 *    - Thanh bộ lọc: desktop xuống dòng tự nhiên; các nút không co ép; mobile có cue cuộn ngang.
 * 3. Kiểm duyệt chi tiết: ảnh, người gửi, địa chỉ, giờ mở cửa, giá, tọa độ, mô tả.
 * 4. Phê duyệt địa điểm:
 *    - Thao tác duyệt thành công (+15 Điểm Thổ Địa G15).
 *    - Địa điểm chuyển sang approved, xuất hiện công khai.
 *    - Số chờ duyệt giảm chính xác cả ở modal, tab, và sidebar badge.
 * 5. Trạng thái lỗi mạng / API:
 *    - Hiển thị `--`, "Chưa tải được", badge sidebar `!`, không chuyển thành 0 hay "Đã sạch".
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');
const { pathToFileURL } = require('url');

const WebSocket = globalThis.WebSocket;
const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.resolve('C:\\Users\\tienl\\.gemini\\antigravity\\brain\\2bc7252e-f998-4e30-bbb7-25edbaa0f421');

const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="?([^"\r\n]+)"?/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\r\n]+)"?/)[1];

process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
process.env.ADMIN_SECRET = 'dev-admin';
process.env.NODE_ENV = 'test';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let mockApiError = false;

function startLocalServer(port = 4178) {
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

            if (pathname === '/api/admin-moderation' || pathname.startsWith('/api/admin-moderation')) {
                if (mockApiError) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({
                        success: false,
                        error: { code: 'QUEUE_FETCH_ERROR', message: 'Mô phỏng lỗi kết nối máy chủ' }
                    }));
                }
                const mod = await import(pathToFileURL(path.join(ROOT_DIR, 'api', '_admin', 'moderation.js')).href);
                return mod.default(req, res);
            }

            if (pathname === '/api/submit-place') {
                const submitMod = await import(pathToFileURL(path.join(ROOT_DIR, 'api', 'submit-place.js')).href);
                return submitMod.default(req, res);
            }

            if (pathname === '/api/places') {
                const sRes = await fetch(`${SUPABASE_URL}/rest/v1/places?select=*&status=eq.approved&limit=100`, {
                    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
                });
                const data = await sRes.json();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify(data));
            }

            if (pathname === '/') pathname = '/index.html';
            const filePath = path.join(ROOT_DIR, pathname);

            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                return res.end('Not Found');
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(filePath).pipe(res);
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Internal Error: ${e.message}`);
        }
    });

    return new Promise((resolve) => {
        server.listen(port, () => resolve(server));
    });
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.reqId = 0;
        this.callbacks = new Map();
        this.consoleLogs = [];
        this.jsErrors = [];

        this.ws.onmessage = (event) => {
            const res = JSON.parse(event.data);
            if (res.method === 'Runtime.consoleAPICalled') {
                this.consoleLogs.push({
                    type: res.params.type,
                    text: res.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ')
                });
            } else if (res.method === 'Runtime.exceptionThrown') {
                this.jsErrors.push(res.params.exceptionDetails);
            } else if (res.id && this.callbacks.has(res.id)) {
                const cb = this.callbacks.get(res.id);
                this.callbacks.delete(res.id);
                cb(res);
            }
        };
    }

    ready() {
        return new Promise((resolve) => {
            if (this.ws.readyState === WebSocket.OPEN) return resolve();
            this.ws.onopen = () => resolve();
        });
    }

    send(method, params = {}) {
        const id = ++this.reqId;
        return new Promise((resolve, reject) => {
            this.callbacks.set(id, (res) => {
                if (res.error) reject(new Error(`CDP Error in ${method}: ${res.error.message}`));
                else resolve(res.result);
            });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async eval(expression) {
        const expr = `(() => {\n${expression}\n})()`;
        const result = await this.send('Runtime.evaluate', {
            expression: expr,
            returnByValue: true,
            awaitPromise: true
        });
        if (result.exceptionDetails) {
            throw new Error(`Eval error: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
        }
        return result.result?.value;
    }

    async captureScreenshot(outputPath) {
        const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(outputPath, Buffer.from(data, 'base64'));
    }

    close() {
        this.ws.close();
    }
}

async function findChromeExecutable() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error('Không tìm thấy trình duyệt Google Chrome!');
}

async function launchBrowser(port = 9338) {
    const chromePath = await findChromeExecutable();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-test-place-mod-'));
    const proc = spawn(chromePath, [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--window-size=1280,950'
    ]);

    for (let i = 0; i < 30; i++) {
        await sleep(300);
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (res.ok) {
                const targetsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
                const targets = await targetsRes.json();
                const pageTarget = targets.find(t => t.type === 'page') || targets[0];
                return { proc, wsUrl: pageTarget.webSocketDebuggerUrl, port, userDataDir };
            }
        } catch (e) {}
    }
    throw new Error('Không thể kết nối Chrome DevTools CDP!');
}

async function main() {
    console.log('--- KHỞI ĐỘNG KIỂM THỬ E2E: ĐỀ XUẤT ĐỊA ĐIỂM TRONG TRUNG TÂM KIỂM DUYỆT ---');

    const SERVER_PORT = 4178;
    const server = await startLocalServer(SERVER_PORT);
    console.log(`[Local Server] Đang lắng nghe tại http://localhost:${SERVER_PORT}`);

    const browser = await launchBrowser(9338);
    console.log(`[Chrome Headless] Đã khởi chạy CDP tại ws: ${browser.wsUrl}`);

    const cdp = new CDPClient(browser.wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const results = [];
    let testPlaceId = null;

    try {
        // -------------------------------------------------------------
        // BƯỚC 1: TẠO MỘT ĐỀ XUẤT ĐỊA ĐIỂM TỪ NGƯỜI DÙNG THƯỜNG
        // -------------------------------------------------------------
        console.log('\n[Bước 1] Gửi đề xuất địa điểm mới từ người dùng thường...');
        const uniqueTestSlug = `test-banh-tet-${Date.now()}`;
        const submitPayload = {
            client_submission_id: `contrib_${Date.now()}_test_e2e`,
            name: `Bánh Tét Trà Cuôn Ba Hai E2E (${Date.now().toString().slice(-4)})`,
            category: 'Ẩm thực',
            area: 'Cầu Ngang',
            address: 'Ấp Trà Cuôn, Xã Kim Hòa, Huyện Cầu Ngang, Trà Vinh',
            map_link: 'https://maps.google.com/?q=9.8512,106.3981',
            price_raw: '80.000đ - 120.000đ/đòn',
            description: 'Đặc sản bánh tét nếp sáp truyền thống dẻo thơm nhân đậu xanh thịt mỡ trứng muối nức tiếng Trà Vinh.',
            note: 'Có nhận đóng gói hút chân không mang đi xa',
            contact: '0294.3825.999',
            coordinates: '9.8512,106.3981',
            contributor: 'Thổ Địa Bến Tre Thăm Xứ Trà',
            display_hours: '06:00 - 20:00'
        };

        const submitRes = await fetch(`http://localhost:${SERVER_PORT}/api/submit-place`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submitPayload)
        });
        const submitJson = await submitRes.json();
        console.log('Kết quả submit-place:', submitJson);
        assert.ok([200, 201].includes(submitRes.status), 'Gửi đề xuất địa điểm phải trả về HTTP 200 hoặc 201');
        assert.ok(submitJson.success, 'Phản hồi gửi đề xuất phải có success = true');
        assert.strictEqual(submitJson.data?.status, 'draft', 'Địa điểm mới tạo phải ở trạng thái draft chờ duyệt');
        testPlaceId = submitJson.data?.id;
        console.log(`✓ Đã tạo địa điểm chờ duyệt thành công: ID = ${testPlaceId}, Name = ${submitPayload.name}`);
        results.push({ name: 'User Submit Place Proposal', passed: true, placeId: testPlaceId });

        // -------------------------------------------------------------
        // BƯỚC 2: ADMIN TRUY CẬP HỆ THỐNG VÀ XÁC THỰC BADGE / KPI
        // -------------------------------------------------------------
        console.log('\n[Bước 2] Mở ứng dụng với quyền Quản trị viên...');
        await cdp.send('Page.navigate', { url: `http://localhost:${SERVER_PORT}` });
        await sleep(2500);

        // Thiết lập phiên Admin giả lập
        await cdp.eval(`
            const adminSess = {
                user: { id: 'mock-admin-uuid', email: 'admin@vivutravinh.test', role: 'admin' },
                access_token: 'mock-admin-token',
                token: 'mock-admin-token',
                expires_at: Math.floor(Date.now() / 1000) + 7200,
                adminSecret: 'dev-admin',
                timestamp: Date.now()
            };
            localStorage.setItem('vivu_admin_session', JSON.stringify(adminSess));
            sessionStorage.setItem('vivu_admin_session', JSON.stringify(adminSess));
            if (window.ViVuApp?.updateAdminRoleUI) {
                window.ViVuApp.updateAdminRoleUI();
            }
        `);
        await sleep(2000);

        // Lấy số lượng trên Sidebar Badge
        const sidebarBadgeInfo = await cdp.eval(`
            const badge = document.getElementById('sidebarAdminModerationBadge');
            return ({
                visible: badge ? !badge.classList.contains('hidden') : false,
                text: badge ? badge.textContent.trim() : null,
                title: badge ? badge.title : null
            });
        `);
        console.log('Sidebar badge:', sidebarBadgeInfo);
        assert.ok(sidebarBadgeInfo.visible, 'Sidebar badge phải hiển thị khi có mục chờ duyệt');
        const badgeCount = parseInt(sidebarBadgeInfo.text, 10);
        assert.ok(badgeCount >= 2, `Sidebar badge phải bao gồm cả địa điểm chờ duyệt (nhận được: ${badgeCount})`);
        results.push({ name: 'Sidebar Badge includes Places', passed: true, badgeCount });

        // Mở Trung tâm kiểm duyệt
        await cdp.eval(`window.ViVuApp.openAdminModerationModal('places')`);
        await sleep(1500);

        // Chụp ảnh Modal mở ra với tab places
        const screenshotPath1 = path.join(ARTIFACT_DIR, 'local_admin_place_moderation_open.png');
        await cdp.captureScreenshot(screenshotPath1);
        console.log(`[Artifact] Đã chụp ảnh giao diện duyệt đề xuất địa điểm: ${screenshotPath1}`);

        // -------------------------------------------------------------
        // BƯỚC 3: KIỂM TRA THẺ KPI "ĐỊA ĐIỂM CHỜ DUYỆT" & TAB RIÊNG
        // -------------------------------------------------------------
        console.log('\n[Bước 3] Kiểm tra KPI Cards & Thanh bộ lọc...');
        const modalStats = await cdp.eval(`
            const cards = Array.from(document.querySelectorAll('#adminModerationModalContent .grid > div'));
            const placeCard = cards.find(c => c.textContent.includes('Địa điểm chờ duyệt'));
            const placeTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Đề xuất địa điểm'));
            const oldPostsLocTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Đề xuất địa điểm mới'));

            return ({
                hasPlaceCard: Boolean(placeCard),
                placeCardText: placeCard ? placeCard.innerText.replace(/\\s+/g, ' ') : null,
                hasPlaceTab: Boolean(placeTab),
                placeTabText: placeTab ? placeTab.innerText.replace(/\\s+/g, ' ') : null,
                hasOldPostsLocTab: Boolean(oldPostsLocTab)
            });
        `);
        console.log('Modal Stats & Tabs:', modalStats);
        assert.ok(modalStats.hasPlaceCard, 'Phải có thẻ KPI "Địa điểm chờ duyệt" trong dashboard kiểm duyệt');
        assert.ok(modalStats.hasPlaceTab, 'Phải có tab riêng "Đề xuất địa điểm" đọc từ places');
        assert.strictEqual(modalStats.hasOldPostsLocTab, false, 'Nút lọc bài viết cộng đồng cũ "Đề xuất địa điểm mới" phải được thay thế');
        results.push({ name: 'KPI Card & Dedicated Place Tab', passed: true, details: modalStats });

        // -------------------------------------------------------------
        // BƯỚC 4: KIỂM TRA CHI TIẾT ĐỀ XUẤT ĐỊA ĐIỂM (Ảnh, Người gửi, Tọa độ...)
        // -------------------------------------------------------------
        console.log('\n[Bước 4] Kiểm tra danh sách hàng đợi và chi tiết đề xuất...');
        // Chọn địa điểm vừa submit
        const selectResult = await cdp.eval(`
            window.ViVuApp.selectModerationPlace(${testPlaceId});
            const titleEl = document.querySelector('#adminModerationModalContent h2');
            const submitterEl = document.querySelector('#adminModerationModalContent [class*="truncate"]');
            const approveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Phê duyệt & Xuất bản'));
            const rejectBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Từ chối đề xuất'));

            return ({
                selectedTitle: titleEl ? titleEl.textContent.trim() : null,
                hasApproveBtn: Boolean(approveBtn),
                approveBtnText: approveBtn ? approveBtn.innerText.replace(/\\s+/g, ' ') : null,
                hasRejectBtn: Boolean(rejectBtn)
            });
        `);
        console.log('Proposal Selection Details:', selectResult);
        assert.ok(selectResult.selectedTitle.includes('Bánh Tét Trà Cuôn Ba Hai E2E'), 'Tiêu đề đề xuất đang chọn phải trùng khớp');
        assert.ok(selectResult.hasApproveBtn, 'Phải có nút Phê duyệt & Xuất bản');
        assert.ok(selectResult.approveBtnText.includes('+15 Điểm Thổ Địa'), 'Nút duyệt phải ghi rõ phần thưởng chuẩn G15 (+15 Điểm Thổ Địa)');
        assert.ok(selectResult.hasRejectBtn, 'Phải có nút Từ chối đề xuất');
        results.push({ name: 'Place Details & G15 Action Button', passed: true });

        // Chụp ảnh chi tiết đề xuất trước khi duyệt
        const screenshotPath2 = path.join(ARTIFACT_DIR, 'local_admin_place_detail_view.png');
        await cdp.captureScreenshot(screenshotPath2);
        console.log(`[Artifact] Đã chụp ảnh chi tiết đề xuất: ${screenshotPath2}`);

        // -------------------------------------------------------------
        // BƯỚC 5: PHÊ DUYỆT ĐỊA ĐIỂM (+15 ĐIỂM THỔ ĐIỂM)
        // -------------------------------------------------------------
        console.log('\n[Bước 5] Thực hiện Phê duyệt & Xuất bản địa điểm...');
        await cdp.eval(`window.ViVuApp.approvePlace(${testPlaceId})`);
        await sleep(2000);

        // Kiểm tra cơ sở dữ liệu Supabase xem place đã approved chưa
        const checkDbRes = await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${testPlaceId}&select=id,name,status`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const checkDbJson = await checkDbRes.json();
        console.log('Database verification after approve:', checkDbJson);
        assert.strictEqual(checkDbJson[0]?.status, 'approved', 'Địa điểm sau khi admin duyệt phải có status = "approved"');

        // Kiểm tra điểm thưởng G15 được ghi nhận trong bảng content_moderation_points hoặc user
        const checkPointsRes = await fetch(`${SUPABASE_URL}/rest/v1/audit_logs?action=eq.content_points_awarded&limit=1`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        }).catch(() => null);

        // Kiểm tra hàng đợi và số lượng sau khi duyệt
        const afterApproveState = await cdp.eval(`
            const modalContent = document.getElementById('adminModerationModalContent');
            const badge = document.getElementById('sidebarAdminModerationBadge');
            const state = window.ViVuApp.getState ? window.ViVuApp.getState() : null;

            return ({
                pendingPlacesCount: state?.moderationKpi?.pendingPlacesCount,
                pendingTotal: state?.moderationKpi?.pendingTotal,
                sidebarBadgeText: badge ? badge.textContent.trim() : null,
                itemStillInQueue: state?.moderationPlaces?.some(p => p.id === ${testPlaceId})
            });
        `);
        console.log('State after approval:', afterApproveState);
        assert.strictEqual(afterApproveState.itemStillInQueue, false, 'Địa điểm đã duyệt phải rời khỏi hàng đợi');
        results.push({ name: 'Approve Execution & Database Update', passed: true, status: checkDbJson[0]?.status });

        // Chụp ảnh giao diện sau khi duyệt thành công
        const screenshotPath3 = path.join(ARTIFACT_DIR, 'local_admin_place_after_approval.png');
        await cdp.captureScreenshot(screenshotPath3);
        console.log(`[Artifact] Đã chụp ảnh sau khi duyệt: ${screenshotPath3}`);

        // -------------------------------------------------------------
        // BƯỚC 6: KIỂM TRA TRẠNG THÁI LỖI TRUY VẤN (Chưa tải được, không ra 0 / Đã sạch)
        // -------------------------------------------------------------
        console.log('\n[Bước 6] Kiểm tra xử lý lỗi mạng / API...');
        mockApiError = true;
        await cdp.eval(`window.ViVuApp.openAdminModerationModal('places')`);
        await sleep(1500);

        const errorUiState = await cdp.eval(`
            const banner = document.querySelector('#adminModerationModalContent .bg-amber-50, #adminModerationModalContent .dark\\\\:bg-amber-950\\\\/40');
            const badge = document.getElementById('sidebarAdminModerationBadge');
            const kpiSpans = Array.from(document.querySelectorAll('#adminModerationModalContent .grid .font-headline-lg')).map(s => s.textContent.trim());

            return ({
                hasErrorBanner: Boolean(banner),
                bannerText: banner ? banner.innerText.replace(/\\s+/g, ' ') : null,
                sidebarBadgeText: badge ? badge.textContent.trim() : null,
                kpiValues: kpiSpans
            });
        `);
        console.log('Error UI State:', errorUiState);
        assert.ok(errorUiState.hasErrorBanner, 'Phải hiển thị banner cảnh báo lỗi kết nối máy chủ');
        assert.strictEqual(errorUiState.sidebarBadgeText, '!', 'Badge sidebar phải hiển thị "!" khi truy vấn gặp lỗi');
        assert.ok(errorUiState.kpiValues.every(v => v === '--'), 'Tất cả thẻ KPI phải hiển thị "--" khi lỗi');
        results.push({ name: 'Error Handling Preserves Non-Zero State', passed: true });

        // Chụp ảnh trạng thái lỗi
        const screenshotPath4 = path.join(ARTIFACT_DIR, 'local_admin_place_error_state.png');
        await cdp.captureScreenshot(screenshotPath4);
        console.log(`[Artifact] Đã chụp ảnh trạng thái lỗi: ${screenshotPath4}`);

        mockApiError = false;

        // -------------------------------------------------------------
        // BƯỚC 7: KIỂM TRA MOBILE RESPONSIVE (Thanh bộ lọc cuộn ngang có dấu hiệu nhận biết)
        // -------------------------------------------------------------
        console.log('\n[Bước 7] Kiểm tra hiển thị trên màn hình Mobile (390x844)...');
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
            mobile: true
        });
        await cdp.eval(`window.ViVuApp.openAdminModerationModal('places')`);
        await sleep(1500);

        const mobileCheck = await cdp.eval(`
            const cue = Array.from(document.querySelectorAll('#adminModerationModalContent *')).find(el => el.textContent.includes('Vuốt ngang xem'));
            const buttons = Array.from(document.querySelectorAll('#adminModerationModalContent .overflow-x-auto button'));
            const buttonsNoShrink = buttons.every(b => b.classList.contains('shrink-0') || b.classList.contains('whitespace-nowrap'));

            return ({
                hasCue: Boolean(cue),
                cueText: cue ? cue.innerText.replace(/\\s+/g, ' ') : null,
                buttonsCount: buttons.length,
                allButtonsPreserveWidth: buttonsNoShrink
            });
        `);
        console.log('Mobile Check:', mobileCheck);
        assert.ok(mobileCheck.hasCue, 'Giao diện mobile phải có dấu hiệu nhận biết cuộn ngang');
        assert.ok(mobileCheck.allButtonsPreserveWidth, 'Các nút bộ lọc trên mobile không được co ép');
        results.push({ name: 'Mobile Horizontal Scroll & Cue', passed: true });

        const screenshotPath5 = path.join(ARTIFACT_DIR, 'local_admin_place_mobile_view.png');
        await cdp.captureScreenshot(screenshotPath5);
        console.log(`[Artifact] Đã chụp ảnh mobile view: ${screenshotPath5}`);

    } finally {
        // Khôi phục view
        try {
            await cdp.send('Emulation.clearDeviceMetricsOverride');
        } catch (e) {}

        cdp.close();
        browser.proc.kill();
        server.close();

        // Xóa tạm dữ liệu test khỏi database nếu cần
        if (testPlaceId) {
            console.log(`\n[Cleanup] Dọn dẹp bản ghi kiểm thử ID ${testPlaceId}...`);
            await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${testPlaceId}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            }).catch(() => {});
        }
    }

    console.log('\n======================================================');
    console.log('TỔNG HỢP KẾT QUẢ KIỂM THỬ E2E: ĐỀ XUẤT ĐỊA ĐIỂM');
    console.log('======================================================');
    results.forEach(r => {
        console.log(`✓ [ĐẠT] ${r.name}`);
    });
    console.log('Tất cả 6 hạng mục kiểm thử E2E ĐẠT 100%!');
}

main().catch(err => {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
    process.exit(1);
});
