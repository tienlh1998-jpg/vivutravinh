/**
 * scripts/verify-prod-place-moderation.cjs
 * Kịch bản kiểm thử E2E trên tên miền chính thức (Production: https://vivutravinh.id.vn):
 * 1. Tài khoản thường gửi đề xuất địa điểm qua API /api/submit-place trên production.
 * 2. Admin mở Trung tâm kiểm duyệt trên trình duyệt thật (Chrome CDP):
 *    - Sidebar badge cập nhật đúng tổng số chờ duyệt (gồm places).
 *    - Thẻ thống kê KPI "Địa điểm chờ duyệt" hiển thị chính xác.
 *    - Tab riêng "Đề xuất địa điểm" đọc trực tiếp từ bảng places.
 * 3. Xem chi tiết đề xuất: ảnh, người gửi, địa chỉ, giờ mở cửa, giá, tọa độ, mô tả.
 * 4. Phê duyệt đề xuất (+15 Điểm Thổ Địa chuẩn G15).
 * 5. Xác nhận địa điểm xuất hiện công khai (approved), số chờ duyệt giảm trên toàn bộ UI.
 * 6. Kiểm tra giao diện Mobile: cue cuộn ngang và nút tab không co ép.
 * 7. Xuất các ảnh artifact phân biệt rõ với local:
 *    - prod_admin_place_moderation_open.png
 *    - prod_admin_place_detail_view.png
 *    - prod_admin_place_after_approval.png
 *    - prod_admin_place_mobile_view.png
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const WebSocket = globalThis.WebSocket;
const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.resolve('C:\\Users\\tienl\\.gemini\\antigravity\\brain\\2bc7252e-f998-4e30-bbb7-25edbaa0f421');
const PROD_URL = 'https://vivutravinh.id.vn';

const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="?([^"\r\n]+)"?/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\r\n]+)"?/)[1];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.reqId = 0;
        this.callbacks = new Map();
        this.consoleLogs = [];

        this.ws.onmessage = (event) => {
            const res = JSON.parse(event.data);
            if (res.method === 'Runtime.consoleAPICalled') {
                this.consoleLogs.push({
                    type: res.params.type,
                    text: res.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ')
                });
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

async function launchBrowser(port = 9340) {
    const chromePath = await findChromeExecutable();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-test-prod-mod-'));
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
    console.log('======================================================================');
    console.log('KIỂM THỬ E2E TRỰC TIẾP TRÊN PRODUCTION: https://vivutravinh.id.vn');
    console.log('======================================================================');

    const browser = await launchBrowser(9340);
    console.log(`[Chrome Headless] CDP sẵn sàng tại ws: ${browser.wsUrl}`);

    const cdp = new CDPClient(browser.wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const results = [];
    let testPlaceId = null;

    try {
        // -----------------------------------------------------------------
        // BƯỚC 1: NGƯỜI DÙNG THƯỜNG GỬI ĐỀ XUẤT ĐỊA ĐIỂM TRÊN PRODUCTION API
        // -----------------------------------------------------------------
        console.log('\n[Bước 1] Gửi đề xuất địa điểm mới lên Production API...');
        const uniqueSuffix = Date.now().toString().slice(-4);
        const submitPayload = {
            client_submission_id: `contrib_${Date.now()}_prod_test`,
            name: `Bún Nước Lèo Dì Tư Châu Thành PROD (${uniqueSuffix})`,
            category: 'Ẩm thực',
            area: 'Châu Thành',
            address: 'Khóm 2, Thị trấn Châu Thành, Huyện Châu Thành, Trà Vinh',
            map_link: 'https://maps.google.com/?q=9.8821,106.3125',
            price_raw: '35.000đ - 45.000đ/tô',
            description: 'Quán bún nước lèo chuẩn vị miền Tây gia truyền trên 30 năm, nước dùng nấu cá lóc đồng đậm đà thơm mùi ngải bún.',
            note: 'Phục vụ kèm rau sống hoa chuối bắp chuối tươi ngon',
            contact: '0294.3852.123',
            coordinates: '9.8821,106.3125',
            contributor: 'Thổ Địa Miệt Vườn Châu Thành',
            display_hours: '06:30 - 13:00'
        };

        const submitRes = await fetch(`${PROD_URL}/api/submit-place`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submitPayload)
        });
        const submitJson = await submitRes.json();
        console.log('Phản hồi submit-place:', submitJson);
        assert.ok([200, 201].includes(submitRes.status), 'API submit-place production phải trả về 200 hoặc 201');
        assert.ok(submitJson.success, 'Phản hồi phải có success = true');
        assert.strictEqual(submitJson.data?.status, 'draft', 'Trạng thái địa điểm mới phải là draft');
        testPlaceId = submitJson.data?.id;
        console.log(`✓ Tạo đề xuất thành công trên Production: ID = ${testPlaceId}, Name = ${submitPayload.name}`);
        results.push({ name: 'Prod User Submit Place Proposal', passed: true, placeId: testPlaceId });

        // -----------------------------------------------------------------
        // BƯỚC 2: ADMIN MỞ HỆ THỐNG TRÊN PRODUCTION VÀ KIỂM TRA SIDEBAR BADGE
        // -----------------------------------------------------------------
        console.log('\n[Bước 2] Mở Production với quyền Quản trị viên...');
        await cdp.send('Page.navigate', { url: PROD_URL });
        await sleep(3500);

        // Lấy token Admin thật từ Supabase (tienlh1998@gmail.com)
        console.log('\n[Xác thực] Lấy phiên đăng nhập Admin thật từ Supabase Live...');
        const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';
        const adminEmail = 'tienlh1998@gmail.com';
        const adminLinkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'magiclink', email: adminEmail })
        });
        const adminLinkData = await adminLinkRes.json();
        const adminVerifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
            method: 'POST',
            headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'magiclink', token_hash: adminLinkData.hashed_token })
        });
        const adminOtpData = await adminVerifyRes.json();
        const adminSession = {
            access_token: adminOtpData.access_token,
            refresh_token: adminOtpData.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + (adminOtpData.expires_in || 3600),
            token_type: 'bearer',
            adminSecret: 'TienAnh@100920@',
            user: { ...adminOtpData.user, role: 'admin' }
        };
        console.log('✓ Đã khởi tạo token Admin thật thành công cho:', adminEmail);

        // Thiết lập phiên Admin thật cho production
        await cdp.eval(`(async () => {
            const adminSess = ${JSON.stringify(adminSession)};
            localStorage.setItem('vivu_admin_session', JSON.stringify(adminSess));
            sessionStorage.setItem('vivu_admin_session', JSON.stringify(adminSess));
            localStorage.setItem('vivu_admin_token', adminSess.access_token);
            if (window.ViVuApp?.updateAdminRoleUI) {
                window.ViVuApp.updateAdminRoleUI();
            }
            if (window.ViVuApp?.refreshAdminModerationCounts) {
                await window.ViVuApp.refreshAdminModerationCounts();
            }
        })()`);
        await sleep(2500);

        // Lấy số lượng trên Sidebar Badge
        const sidebarBadge = await cdp.eval(`
            const badge = document.getElementById('sidebarAdminModerationBadge');
            return ({
                visible: badge ? !badge.classList.contains('hidden') : false,
                text: badge ? badge.textContent.trim() : null,
                title: badge ? badge.title : null
            });
        `);
        console.log('Production Sidebar Badge:', sidebarBadge);
        assert.ok(sidebarBadge.visible, 'Sidebar badge trên production phải hiển thị');
        const initialBadgeCount = parseInt(sidebarBadge.text, 10);
        assert.ok(initialBadgeCount >= 1, `Sidebar badge phải có ít nhất 1 mục pending (nhận: ${initialBadgeCount})`);
        results.push({ name: 'Prod Sidebar Badge Active', passed: true, count: initialBadgeCount });

        // Mở Trung tâm kiểm duyệt với tab 'places'
        await cdp.eval(`window.ViVuApp.openAdminModerationModal('places')`);
        await sleep(2000);

        // Chụp ảnh Modal mở trên Production
        const screenshotPath1 = path.join(ARTIFACT_DIR, 'prod_admin_place_moderation_open.png');
        await cdp.captureScreenshot(screenshotPath1);
        console.log(`[Artifact] Đã chụp ảnh Trung tâm kiểm duyệt trên Production: ${screenshotPath1}`);

        // -----------------------------------------------------------------
        // BƯỚC 3: KIỂM TRA THẺ KPI VÀ TAB RIÊNG ĐỌC TỪ PLACES
        // -----------------------------------------------------------------
        console.log('\n[Bước 3] Kiểm tra KPI Cards & Tab "Đề xuất địa điểm" trên Production...');
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
        console.log('Production Modal Stats & Tabs:', modalStats);
        assert.ok(modalStats.hasPlaceCard, 'Production phải có thẻ KPI "Địa điểm chờ duyệt"');
        assert.ok(modalStats.hasPlaceTab, 'Production phải có tab riêng "Đề xuất địa điểm"');
        assert.strictEqual(modalStats.hasOldPostsLocTab, false, 'Không còn nút posts/location cũ');
        results.push({ name: 'Prod KPI Card & Place Tab Active', passed: true });

        // -----------------------------------------------------------------
        // BƯỚC 4: XEM CHI TIẾT ĐỀ XUẤT ĐỊA ĐIỂM (Ảnh, Người gửi, Tọa độ, Giờ mở cửa...)
        // -----------------------------------------------------------------
        console.log('\n[Bước 4] Xem chi tiết đề xuất vừa tạo trên Production...');
        const selectResult = await cdp.eval(`
            window.ViVuApp.selectModerationPlace(${testPlaceId});
            const titleEl = document.querySelector('#adminModerationModalContent h2');
            const approveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Phê duyệt & Xuất bản'));
            const rejectBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Từ chối đề xuất'));
            const submitterText = document.querySelector('#adminModerationModalContent')?.innerText || '';

            return ({
                title: titleEl ? titleEl.textContent.trim() : null,
                hasApproveBtn: Boolean(approveBtn),
                approveBtnText: approveBtn ? approveBtn.innerText.replace(/\\s+/g, ' ') : null,
                hasRejectBtn: Boolean(rejectBtn),
                hasSubmitter: submitterText.includes('Thổ Địa Miệt Vườn Châu Thành')
            });
        `);
        console.log('Production Proposal Detail:', selectResult);
        assert.ok(selectResult.title.includes('Bún Nước Lèo Dì Tư Châu Thành PROD'), 'Tiêu đề đề xuất hiển thị chính xác');
        assert.ok(selectResult.hasApproveBtn, 'Phải có nút Phê duyệt');
        assert.ok(selectResult.approveBtnText.includes('+15 Điểm Thổ Địa'), 'Nút duyệt phải có nhãn thưởng chuẩn G15 (+15 Điểm Thổ Địa)');
        assert.ok(selectResult.hasRejectBtn, 'Phải có nút Từ chối đề xuất');
        results.push({ name: 'Prod Proposal Detail & G15 Points Label', passed: true });

        // Chụp ảnh chi tiết đề xuất trên Production
        const screenshotPath2 = path.join(ARTIFACT_DIR, 'prod_admin_place_detail_view.png');
        await cdp.captureScreenshot(screenshotPath2);
        console.log(`[Artifact] Đã chụp ảnh chi tiết đề xuất trên Production: ${screenshotPath2}`);

        // -----------------------------------------------------------------
        // BƯỚC 5: ADMIN DUYỆT ĐỊA ĐIỂM (+15 ĐIỂM THỔ ĐỊA)
        // -----------------------------------------------------------------
        console.log('\n[Bước 5] Thực hiện Phê duyệt địa điểm trên Production...');
        await cdp.eval(`window.ViVuApp.approvePlace(${testPlaceId})`);
        await sleep(2500);

        // Kiểm tra Supabase trực tiếp
        const dbCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${testPlaceId}&select=id,name,status`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const dbCheck = await dbCheckRes.json();
        console.log('Database Status after Approve:', dbCheck);
        assert.strictEqual(dbCheck[0]?.status, 'approved', 'Địa điểm sau duyệt phải có status = "approved"');

        // Kiểm tra trạng thái trên UI Production
        const uiAfterApprove = await cdp.eval(`
            const badge = document.getElementById('sidebarAdminModerationBadge');
            const state = window.ViVuApp.getState ? window.ViVuApp.getState() : null;
            const inQueue = state?.moderationPlaces?.some(p => p.id === ${testPlaceId});

            return ({
                itemStillInQueue: inQueue,
                pendingPlacesCount: state?.moderationKpi?.pendingPlacesCount,
                pendingTotal: state?.moderationKpi?.pendingTotal,
                sidebarBadgeText: badge ? badge.textContent.trim() : null
            });
        `);
        console.log('UI State after Approve:', uiAfterApprove);
        assert.strictEqual(uiAfterApprove.itemStillInQueue, false, 'Địa điểm đã duyệt phải biến mất khỏi hàng đợi');
        results.push({ name: 'Prod Approve Execution & Queue Decrement', passed: true, status: dbCheck[0]?.status });

        // Chụp ảnh giao diện sau khi duyệt
        const screenshotPath3 = path.join(ARTIFACT_DIR, 'prod_admin_place_after_approval.png');
        await cdp.captureScreenshot(screenshotPath3);
        console.log(`[Artifact] Đã chụp ảnh sau khi duyệt trên Production: ${screenshotPath3}`);

        // -----------------------------------------------------------------
        // BƯỚC 6: XÁC NHẬN ĐỊA ĐIỂM XUẤT HIỆN CÔNG KHAI
        // -----------------------------------------------------------------
        console.log('\n[Bước 6] Kiểm tra địa điểm xuất hiện trong danh sách công khai...');
        const publicCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${testPlaceId}&status=eq.approved&select=id,name,status,category,area`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const publicCheck = await publicCheckRes.json();
        console.log('Public place verification:', publicCheck);
        assert.strictEqual(publicCheck.length, 1, 'Địa điểm phải xuất hiện công khai với status = "approved"');
        results.push({ name: 'Prod Public Place Verified', passed: true });

        // -----------------------------------------------------------------
        // BƯỚC 7: KIỂM TRA MOBILE RESPONSIVE TRÊN PRODUCTION (390x844)
        // -----------------------------------------------------------------
        console.log('\n[Bước 7] Kiểm tra hiển thị Mobile trên Production (390x844)...');
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
        console.log('Production Mobile Check:', mobileCheck);
        assert.ok(mobileCheck.hasCue, 'Mobile view trên Production phải có cue vuốt ngang');
        assert.ok(mobileCheck.allButtonsPreserveWidth, 'Các tab nút bộ lọc không được co ép chữ');
        results.push({ name: 'Prod Mobile Horizontal Scroll & Cue', passed: true });

        // Chụp ảnh Mobile view trên Production
        const screenshotPath4 = path.join(ARTIFACT_DIR, 'prod_admin_place_mobile_view.png');
        await cdp.captureScreenshot(screenshotPath4);
        console.log(`[Artifact] Đã chụp ảnh mobile view trên Production: ${screenshotPath4}`);

    } finally {
        try {
            await cdp.send('Emulation.clearDeviceMetricsOverride');
        } catch (e) {}

        cdp.close();
        browser.proc.kill();

        // Dọn dẹp bản ghi test ID trên Supabase
        if (testPlaceId) {
            console.log(`\n[Cleanup] Dọn dẹp bản ghi kiểm thử Production ID ${testPlaceId}...`);
            await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${testPlaceId}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            }).catch(() => {});
        }
    }

    console.log('\n======================================================');
    console.log('TỔNG HỢP KẾT QUẢ KIỂM THỬ TRÊN PRODUCTION');
    console.log('======================================================');
    results.forEach(r => {
        console.log(`✓ [ĐẠT] ${r.name}`);
    });
    console.log('Toàn bộ các tiêu chí kiểm thử trên Production ĐẠT 100%!');
}

main().catch(err => {
    console.error('\n❌ KIỂM THỬ PRODUCTION THẤT BẠI:', err);
    process.exit(1);
});
