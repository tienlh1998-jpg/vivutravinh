/**
 * scripts/verify-ui-moderation-points-idempotency.cjs
 * 
 * Kiểm tra toàn diện luồng duyệt và từ chối địa điểm qua giao diện:
 * 1. Bấm nút Phê duyệt qua giao diện thật.
 * 2. Xác nhận tài khoản người gửi thực nhận +15 Điểm Thổ Địa (G15).
 * 3. Kiểm tra Idempotency: Duyệt lại không cộng trùng (vẫn giữ nguyên 15 điểm).
 * 4. Bấm nút Từ chối qua giao diện (mở modal lý do, chọn lý do, xác nhận từ chối).
 * 5. Xác nhận địa điểm bị từ chối chuyển sang status = 'archived' và rời khỏi hàng đợi.
 * 6. Bảo toàn 100% đề xuất thật (ID 105 "tesstttt") không bị ảnh hưởng.
 * 7. Dọn dẹp sạch sẽ chỉ riêng các bản ghi thử nghiệm.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const WebSocket = globalThis.WebSocket;
const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.resolve('C:\\Users\\tienl\\.gemini\\antigravity\\brain\\2bc7252e-f998-4e30-bbb7-25edbaa0f421');
const TARGET_URL = 'https://vivutravinh.id.vn';

const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="?([^"\r\n]+)"?/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\r\n]+)"?/)[1];
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    throw new Error('Không tìm thấy Google Chrome!');
}

async function launchBrowser(port = 9345) {
    const chromePath = await findChromeExecutable();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-test-mod-pts-'));
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
    console.log('KIỂM THỬ: DUYỆT & TỪ CHỐI QUA GIAO DIỆN, ĐIỂM G15 (+15đ), CHỐNG CỘNG TRÙNG');
    console.log('Mục tiêu: ' + TARGET_URL);
    console.log('======================================================================\n');

    const headersAdmin = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

    // -----------------------------------------------------------------
    // BƯỚC 1: KIỂM TRA TRẠNG THÁI ĐỀ XUẤT THẬT (ID 105) TRƯỚC KHI THỰC HIỆN
    // -----------------------------------------------------------------
    console.log('[Bước 1] Kiểm tra đề xuất thật của người dùng (ID 105)...');
    const realPlaceBeforeRes = await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.105&select=*`, { headers: headersAdmin });
    const realPlaceBefore = await realPlaceBeforeRes.json();
    assert.strictEqual(realPlaceBefore.length, 1, 'Đề xuất thật ID 105 phải tồn tại trong CSDL');
    assert.strictEqual(realPlaceBefore[0].status, 'draft', 'Đề xuất thật ID 105 phải đang ở trạng thái draft');
    console.log(`✓ Đề xuất thật ID 105: Name = "${realPlaceBefore[0].name}", Contributor = "${realPlaceBefore[0].contributor}", Status = "${realPlaceBefore[0].status}"`);

    let testAuthorId = null;
    let testPlace1Id = null;
    let testPlace2Id = null;
    let browser = null;
    let cdp = null;

    try {
        // -----------------------------------------------------------------
        // BƯỚC 2: TẠO TÀI KHOẢN NGƯỜI DÙNG THỰC TẾ ĐỂ NHẬN ĐIỂM THƯỞNG
        // -----------------------------------------------------------------
        console.log('\n[Bước 2] Tạo tài khoản người gửi thực tế để xác nhận điểm thưởng...');
        const testAuthorEmail = `author_g15_e2e_${Date.now()}@vivutest.local`;
        const testAuthorPass = 'TestPassG15!@#';
        const createUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: headersAdmin,
            body: JSON.stringify({ email: testAuthorEmail, password: testAuthorPass, email_confirm: true })
        });
        const createdUser = await createUserRes.json();
        testAuthorId = createdUser.id;
        assert.ok(testAuthorId, 'Tạo tài khoản người dùng thực tế phải thành công');
        console.log(`✓ Đã tạo tài khoản người gửi: ID = ${testAuthorId}, Email = ${testAuthorEmail}`);

        // Đăng nhập lấy access_token của tác giả
        const authorLoginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testAuthorEmail, password: testAuthorPass })
        });
        const authorAuth = await authorLoginRes.json();
        const authorAccessToken = authorAuth.access_token;
        assert.ok(authorAccessToken, 'Đăng nhập người dùng phải trả về access_token');

        // Kiểm tra điểm ban đầu của tác giả
        const initialPointsRes = await fetch(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${testAuthorId}&select=*`, { headers: headersAdmin });
        const initialPoints = await initialPointsRes.json();
        const startPoints = initialPoints.length > 0 ? initialPoints[0].total_points : 0;
        console.log(`✓ Điểm khởi đầu của tác giả: ${startPoints} điểm`);
        assert.strictEqual(startPoints, 0, 'Điểm khởi đầu của người dùng mới phải bằng 0');

        // -----------------------------------------------------------------
        // BƯỚC 3: GỬI 2 ĐỀ XUẤT THỬ NGHIỆM TÁCH BIỆT
        // -----------------------------------------------------------------
        console.log('\n[Bước 3] Gửi 2 đề xuất địa điểm thử nghiệm...');
        const suffix = Date.now().toString().slice(-4);

        // 3.1 Đề xuất 1: Sẽ dùng để DUYỆT QUA GIAO DIỆN & KIỂM TRA ĐIỂM +15
        const submitPayload1 = {
            client_submission_id: `contrib_${Date.now()}_approve_test`,
            name: `Bánh Canh Bến Có Trà Vinh E2E (+15đ) (${suffix})`,
            category: 'Ẩm thực',
            area: 'Châu Thành',
            address: 'Ấp Bến Có, Xã Nguyệt Hóa, Huyện Châu Thành, Trà Vinh',
            map_link: 'https://maps.google.com/?q=9.9125,106.3210',
            price_raw: '40.000đ - 60.000đ/tô',
            description: 'Món bánh canh Bến Có đặc sản trứ danh Trà Vinh sợi bánh bột gạo dẻo trong, nước dùng xương hầm thanh ngọt.',
            note: 'Có phục vụ bánh tét Trà Cuôn ăn kèm',
            contact: '0294.3842.888',
            coordinates: '9.9125,106.3210',
            contributor: 'Thổ Địa Bến Có G15',
            display_hours: '06:00 - 21:00'
        };

        const submit1Res = await fetch(`${TARGET_URL}/api/submit-place`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authorAccessToken}` },
            body: JSON.stringify(submitPayload1)
        });
        const submit1Json = await submit1Res.json();
        assert.ok(submit1Json.success, 'Gửi đề xuất 1 phải thành công');
        testPlace1Id = submit1Json.data?.id;
        console.log(`✓ Đề xuất 1 (Chờ duyệt): ID = ${testPlace1Id}, Name = "${submitPayload1.name}", user_id = ${submit1Json.data?.user_id}`);

        // Chờ 11s để vượt qua khoảng cách rate-limit cooldown giữa 2 lần submit
        console.log('Chờ 11 giây hết hạn cooldown rate-limit...');
        await sleep(11000);

        // 3.2 Đề xuất 2: Sẽ dùng để TỪ CHỐI QUA GIAO DIỆN
        const submitPayload2 = {
            client_submission_id: `contrib_${Date.now()}_reject_test`,
            name: `Quán Ảo Thử Nghiệm Từ Chối E2E (${suffix})`,
            category: 'Điểm Check-in / Sống Ảo',
            area: 'TP. Trà Vinh',
            address: 'Địa chỉ không có thật - thử nghiệm từ chối',
            map_link: 'https://maps.google.com/?q=9.9300,106.3400',
            price_raw: 'Miễn phí',
            description: 'Địa điểm thử nghiệm chức năng từ chối thẩm định với lý do.',
            note: null,
            contact: '',
            coordinates: '9.9300,106.3400',
            contributor: 'Tác Giả Ảo',
            display_hours: '08:00 - 17:00'
        };

        const submit2Res = await fetch(`${TARGET_URL}/api/submit-place`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authorAccessToken}` },
            body: JSON.stringify(submitPayload2)
        });
        const submit2Json = await submit2Res.json();
        assert.ok(submit2Json.success, 'Gửi đề xuất 2 phải thành công');
        testPlace2Id = submit2Json.data?.id;
        console.log(`✓ Đề xuất 2 (Chờ từ chối): ID = ${testPlace2Id}, Name = "${submitPayload2.name}"`);
        // -----------------------------------------------------------------
        // BƯỚC 4: KHỞI ĐỘNG TRÌNH DUYỆT & ĐĂNG NHẬP ADMIN THẬT
        // -----------------------------------------------------------------
        console.log('\n[Bước 4] Mở trình duyệt Headless Chrome kết nối CDP...');
        browser = await launchBrowser(9345);
        cdp = new CDPClient(browser.wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');

        await cdp.send('Page.navigate', { url: TARGET_URL });
        await sleep(3500);

        // Lấy token Admin thật từ Supabase
        const adminEmail = 'tienlh1998@gmail.com';
        const adminLinkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: headersAdmin,
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
            expires_at: Math.floor(Date.now() / 1000) + 7200,
            token_type: 'bearer',
            adminSecret: 'TienAnh@100920@',
            user: { ...adminOtpData.user, role: 'admin' }
        };

        // Ghi session admin vào trình duyệt
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
        await sleep(2000);

        // Mở Trung tâm kiểm duyệt với tab 'places' (phải await để fetch API hoàn tất)
        await cdp.eval(`(async () => {
            await window.ViVuApp.openAdminModerationModal('places');
        })()`);

        let isModalOpen = false;
        for (let i = 0; i < 20; i++) {
            await sleep(500);
            isModalOpen = await cdp.eval(`
                const modal = document.getElementById('adminModerationModal');
                return Boolean(modal && !modal.classList.contains('hidden'));
            `);
            if (isModalOpen) break;
        }
        console.log('Trạng thái mở modal kiểm duyệt:', isModalOpen);
        if (!isModalOpen) {
            console.log('Console logs:', (cdp.consoleLogs || []).slice(-10));
            console.log('JS Errors:', (cdp.jsErrors || []).slice(-10));
        }
        assert.ok(isModalOpen, 'Modal kiểm duyệt phải được mở');

        // Cuộn xuống để xem hàng đợi và chi tiết
        await cdp.eval(`
            const scrollContainer = document.querySelector('#adminModerationModal .overflow-y-auto');
            if (scrollContainer) scrollContainer.scrollTop = 400;
        `);
        await sleep(500);

        const screenshotQueue = path.join(ARTIFACT_DIR, 'ui_admin_proposals_queue.png');
        await cdp.captureScreenshot(screenshotQueue);
        console.log(`✓ Đã mở Trung tâm kiểm duyệt. Ảnh hàng đợi: ${screenshotQueue}`);

        // -----------------------------------------------------------------
        // BƯỚC 5: KIỂM THỬ BẤM NÚT PHÊ DUYỆT QUA GIAO DIỆN
        // -----------------------------------------------------------------
        console.log('\n[Bước 5] Kiểm tra thao tác BẤM NÚT DUYỆT qua giao diện...');

        // 5.1 Bấm chọn thẻ đề xuất 1 trong hàng đợi qua giao diện
        await cdp.eval(`
            window.ViVuApp.selectModerationPlace(${testPlace1Id});
            const scrollContainer = document.querySelector('#adminModerationModal .overflow-y-auto');
            if (scrollContainer) scrollContainer.scrollTop = 500;
        `);
        await sleep(1500);

        // Chụp ảnh giao diện trước khi duyệt
        const screenshotBeforeApprove = path.join(ARTIFACT_DIR, 'ui_place_before_approve.png');
        await cdp.captureScreenshot(screenshotBeforeApprove);
        console.log(`[Artifact] Ảnh chi tiết đề xuất trước khi duyệt: ${screenshotBeforeApprove}`);

        // 5.2 Tìm và BẤM NÚT "Phê duyệt & Xuất bản (+15 Điểm Thổ Địa)" qua giao diện
        const approveClickResult = await cdp.eval(`
            const btn = Array.from(document.querySelectorAll('#adminModerationModalContent button')).find(b => b.textContent.includes('Phê duyệt & Xuất bản'));
            if (!btn) {
                return {
                    clicked: false,
                    error: 'Không tìm thấy nút Phê duyệt',
                    allButtons: Array.from(document.querySelectorAll('#adminModerationModalContent button')).map(b => b.innerText.replace(/\\s+/g, ' ').trim()),
                    contentPreview: document.getElementById('adminModerationModalContent')?.innerText?.slice(0, 300)
                };
            }
            btn.click();
            return { clicked: true, text: btn.innerText.replace(/\\s+/g, ' ') };
        `);
        console.log('Thao tác click nút duyệt trên UI:', approveClickResult);
        assert.ok(approveClickResult.clicked, `Nút duyệt phải được click thành công trên UI (Chi tiết: ${JSON.stringify(approveClickResult)})`);
        assert.ok(approveClickResult.text.includes('+15 Điểm Thổ Địa'), 'Nút duyệt phải có nhãn thưởng +15 Điểm Thổ Địa');

        // Đợi xử lý API và giao dịch DB
        await sleep(3000);

        // Chụp ảnh giao diện sau khi duyệt
        const screenshotAfterApprove = path.join(ARTIFACT_DIR, 'ui_place_after_approve.png');
        await cdp.captureScreenshot(screenshotAfterApprove);
        console.log(`[Artifact] Ảnh sau khi duyệt trên UI: ${screenshotAfterApprove}`);

        // 5.3 XÁC NHẬN CƠ SỞ DỮ LIỆU & ĐIỂM SỐ G15
        console.log('Kiểm tra cập nhật DB & Điểm số của tác giả...');
        const checkPlace1Db = await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${testPlace1Id}&select=id,name,status,user_id`, { headers: headersAdmin });
        const place1Data = await checkPlace1Db.json();
        assert.strictEqual(place1Data[0]?.status, 'approved', 'Địa điểm 1 trong DB phải có status = "approved"');
        console.log(`✓ DB: Địa điểm ID ${testPlace1Id} đã chuyển sang status = "approved"`);

        // Kiểm tra bảng user_contribution_points của tác giả
        const checkPointsAfter = await fetch(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${testAuthorId}&select=*`, { headers: headersAdmin });
        const pointsAfter = await checkPointsAfter.json();
        console.log('Thông tin điểm tác giả sau khi duyệt:', pointsAfter);
        assert.strictEqual(pointsAfter.length, 1, 'Tác giả phải có bản ghi trong bảng user_contribution_points');
        assert.strictEqual(pointsAfter[0].total_points, 15, `Tổng điểm của tác giả phải tăng đúng +15 (thực tế: ${pointsAfter[0].total_points})`);
        assert.strictEqual(pointsAfter[0].current_month_points, 15, `Điểm tháng của tác giả phải tăng đúng +15 (thực tế: ${pointsAfter[0].current_month_points})`);
        console.log(`✓ TÀI KHOẢN NGƯỜI GỬI THỰC NHẬN CHÍNH XÁC: +15 Điểm Thổ Địa (Tổng: ${pointsAfter[0].total_points})`);

        // Kiểm tra bảng sổ cái point_transactions
        const checkTxRes = await fetch(`${SUPABASE_URL}/rest/v1/point_transactions?user_id=eq.${testAuthorId}&entity_id=eq.${testPlace1Id}&select=*`, { headers: headersAdmin });
        const txList = await checkTxRes.json();
        console.log('Giao dịch điểm được ghi nhận:', txList);
        assert.strictEqual(txList.length, 1, 'Phải có đúng 1 giao dịch điểm cho địa điểm này');
        assert.strictEqual(txList[0].points, 15, 'Giao dịch điểm phải ghi nhận +15 điểm');
        assert.strictEqual(txList[0].action_type, 'place_approved', 'Loại giao dịch phải là "place_approved"');
        assert.strictEqual(txList[0].status, 'active', 'Trạng thái giao dịch phải là "active"');
        console.log('✓ Sổ cái giao dịch point_transactions xác nhận: +15 điểm place_approved (active)');

        // -----------------------------------------------------------------
        // BƯỚC 6: KIỂM TRA DUYỆT LẠI - BẢO ĐẢM KHÔNG CỘNG TRÙNG (IDEMPOTENCY)
        // -----------------------------------------------------------------
        console.log('\n[Bước 6] Kiểm tra duyệt lại - Bảo đảm Idempotency (Không cộng trùng điểm)...');
        // Kích hoạt duyệt lại qua API
        const reApproveRes = await fetch(`${TARGET_URL}/api/admin-moderation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminSession.access_token}`
            },
            body: JSON.stringify({
                entity_type: 'place',
                entity_id: String(testPlace1Id),
                action: 'approve'
            })
        });
        const reApproveJson = await reApproveRes.json();
        console.log('Kết quả duyệt lại:', reApproveJson);
        assert.ok(reApproveJson.success, 'Yêu cầu duyệt lại phải trả về thành công an toàn');

        await sleep(1500);

        // Kiểm tra lại điểm của tác giả
        const checkPointsReApprove = await fetch(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${testAuthorId}&select=*`, { headers: headersAdmin });
        const pointsReApprove = await checkPointsReApprove.json();
        console.log('Điểm của tác giả sau khi duyệt lại:', pointsReApprove[0]?.total_points);
        assert.strictEqual(pointsReApprove[0].total_points, 15, `LỖI CỘNG TRÙNG: Điểm phải giữ nguyên là 15, không được tăng lên (nhận: ${pointsReApprove[0].total_points})`);

        // Kiểm tra lại giao dịch trong sổ cái
        const checkTxReApprove = await fetch(`${SUPABASE_URL}/rest/v1/point_transactions?user_id=eq.${testAuthorId}&entity_id=eq.${testPlace1Id}&status=eq.active&select=*`, { headers: headersAdmin });
        const txReApproveList = await checkTxReApprove.json();
        assert.strictEqual(txReApproveList.length, 1, `LỖI CỘNG TRÙNG: Số bản ghi giao dịch active phải duy nhất là 1 (nhận: ${txReApproveList.length})`);
        console.log('✓ XÁC NHẬN IDEMPOTENCY: Duyệt lại KHÔNG cộng trùng điểm (vẫn là 15 điểm, 1 giao dịch active)');

        // -----------------------------------------------------------------
        // BƯỚC 7: KIỂM THỬ BẤM NÚT TỪ CHỐI QUA GIAO DIỆN
        // -----------------------------------------------------------------
        console.log('\n[Bước 7] Kiểm tra thao tác BẤM NÚT TỪ CHỐI qua giao diện...');

        // 7.1 Chọn đề xuất 2 trên giao diện bằng click thẻ
        await cdp.eval(`
            const cards = Array.from(document.querySelectorAll('#adminModerationModalContent [onclick*="selectModerationPlace"]'));
            const card2 = cards.find(c => c.textContent.includes('Quán Ảo') || c.getAttribute('onclick').includes('${testPlace2Id}'));
            if (card2) {
                card2.click();
            } else {
                window.ViVuApp.selectModerationPlace(${testPlace2Id});
            }
        `);
        await sleep(1500);

        // 7.2 Bấm nút "Từ chối đề xuất" qua giao diện
        const rejectBtnClick = await cdp.eval(`
            const btn = Array.from(document.querySelectorAll('#adminModerationModalContent button')).find(b => b.textContent.includes('Từ chối đề xuất'));
            if (!btn) return { clicked: false, error: 'Không tìm thấy nút Từ chối đề xuất' };
            btn.click();
            return { clicked: true, text: btn.innerText.replace(/\\s+/g, ' ') };
        `);
        console.log('Thao tác click nút từ chối trên UI:', rejectBtnClick);
        assert.ok(rejectBtnClick.clicked, 'Nút từ chối phải được click thành công trên UI');

        await sleep(1000);

        // 7.3 Kiểm tra Modal lý do xuất hiện
        const rejectModalState = await cdp.eval(`
            const modal = document.getElementById('adminActionReasonModal');
            const input = document.getElementById('actionReasonInput');
            const presets = Array.from(document.querySelectorAll('#adminActionReasonModal button[onclick*="actionReasonInput"]'));
            return ({
                visible: modal && !modal.classList.contains('hidden'),
                hasInput: Boolean(input),
                presetCount: presets.length,
                firstPreset: presets[0]?.textContent?.trim()
            });
        `);
        console.log('Trạng thái Modal lý do từ chối:', rejectModalState);
        assert.ok(rejectModalState.visible, 'Modal lý do từ chối phải hiển thị');
        assert.ok(rejectModalState.presetCount >= 1, 'Phải có các preset lý do từ chối cho địa điểm');

        // Chụp ảnh Modal lý do
        const screenshotRejectModal = path.join(ARTIFACT_DIR, 'ui_place_reject_modal.png');
        await cdp.captureScreenshot(screenshotRejectModal);
        console.log(`[Artifact] Ảnh modal nhập lý do từ chối: ${screenshotRejectModal}`);

        // 7.4 Chọn preset lý do và BẤM NÚT "Xác nhận gửi thông báo" qua giao diện
        const confirmRejectResult = await cdp.eval(`
            const presets = Array.from(document.querySelectorAll('#adminActionReasonModal button[onclick*="actionReasonInput"]'));
            if (presets.length > 0) {
                presets[0].click(); // Click preset nhanh đầu tiên
            }
            const input = document.getElementById('actionReasonInput');
            if (input && !input.value) {
                input.value = 'Địa điểm không có thật hoặc sai lệch địa chỉ/tọa độ';
            }
            if (input) {
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const confirmBtn = Array.from(document.querySelectorAll('#adminActionReasonModal button')).find(b =>
                b.getAttribute('onclick')?.includes('submitActionReason') ||
                b.textContent.includes('Xác nhận gửi thông báo') ||
                b.textContent.includes('Xác nhận')
            );
            if (!confirmBtn) {
                return {
                    confirmed: false,
                    error: 'Không tìm thấy nút Xác nhận gửi thông báo',
                    buttons: Array.from(document.querySelectorAll('#adminActionReasonModal button')).map(b => b.innerText.trim())
                };
            }
            confirmBtn.click();
            return { confirmed: true, reason: input ? input.value : null };
        `);
        console.log('Thao tác xác nhận từ chối trên modal:', confirmRejectResult);
        assert.ok(confirmRejectResult.confirmed, 'Nút xác nhận từ chối phải được click thành công');

        // Đợi xử lý API
        await sleep(3000);

        // Chụp ảnh sau khi từ chối
        const screenshotAfterReject = path.join(ARTIFACT_DIR, 'ui_place_after_reject.png');
        await cdp.captureScreenshot(screenshotAfterReject);
        console.log(`[Artifact] Ảnh sau khi từ chối: ${screenshotAfterReject}`);

        // 7.5 XÁC MINH CƠ SỞ DỮ LIỆU ĐỐI VỚI ĐỀ XUẤT BỊ TỪ CHỐI
        const checkPlace2Db = await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${testPlace2Id}&select=id,name,status`, { headers: headersAdmin });
        const place2Data = await checkPlace2Db.json();
        console.log('Trạng thái đề xuất 2 trong DB sau từ chối:', place2Data);
        assert.strictEqual(place2Data[0]?.status, 'archived', 'Địa điểm bị từ chối phải chuyển sang status = "archived" (theo check constraint DB)');
        console.log(`✓ DB: Đề xuất ID ${testPlace2Id} đã chuyển sang status = "archived"`);

        // Đề xuất bị từ chối không được cấp điểm
        const checkTxReject = await fetch(`${SUPABASE_URL}/rest/v1/point_transactions?user_id=eq.${testAuthorId}&entity_id=eq.${testPlace2Id}&select=*`, { headers: headersAdmin });
        const txRejectList = await checkTxReject.json();
        assert.strictEqual(txRejectList.length, 0, 'Đề xuất bị từ chối không được có giao dịch điểm');
        console.log('✓ Đề xuất bị từ chối không phát sinh điểm thưởng');

        // Kiểm tra đề xuất 2 đã biến mất khỏi hàng đợi UI
        const queueCheck = await cdp.eval(`
            const state = window.ViVuApp.getState ? window.ViVuApp.getState() : null;
            const places = state?.moderationPlaces || [];
            return ({
                hasPlace1: places.some(p => p.id == ${testPlace1Id} || String(p.id) === String('${testPlace1Id}')),
                hasPlace2: places.some(p => p.id == ${testPlace2Id} || String(p.id) === String('${testPlace2Id}')),
                hasRealPlace105: places.some(p => p.id == 105 || String(p.id) === '105'),
                remainingCount: places.length
            });
        `);
        console.log('Trạng thái hàng đợi sau khi duyệt và từ chối:', queueCheck);
        assert.strictEqual(queueCheck.hasPlace1, false, 'Đề xuất 1 đã duyệt phải rời khỏi hàng đợi');
        assert.strictEqual(queueCheck.hasPlace2, false, 'Đề xuất 2 đã từ chối phải rời khỏi hàng đợi');

        // -----------------------------------------------------------------
        // BƯỚC 8: BẢO TOÀN NGUYÊN VẸN ĐỀ XUẤT THẬT (ID 105)
        // -----------------------------------------------------------------
        console.log('\n[Bước 8] Kiểm tra bảo toàn đề xuất thật (ID 105)...');
        const realPlaceAfterRes = await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.105&select=*`, { headers: headersAdmin });
        const realPlaceAfter = await realPlaceAfterRes.json();
        assert.strictEqual(realPlaceAfter.length, 1, 'Đề xuất thật ID 105 vẫn phải tồn tại');
        assert.strictEqual(realPlaceAfter[0].status, 'draft', 'Đề xuất thật ID 105 VẪN PHẢI LÀ "draft"');
        assert.strictEqual(realPlaceAfter[0].name, 'tesstttt', 'Tên đề xuất thật ID 105 không được thay đổi');
        assert.strictEqual(realPlaceAfter[0].contributor, 'Thổ Địa Trà Vinh', 'Người gửi đề xuất thật ID 105 không được thay đổi');
        assert.ok(queueCheck.hasRealPlace105, 'Đề xuất thật ID 105 vẫn phải hiển thị trong hàng đợi chờ duyệt');
        console.log('✓ BẢO TOÀN TUYỆT ĐỐI: Đề xuất thật ID 105 ("tesstttt") giữ nguyên trạng thái draft trong hàng đợi!');

    } finally {
        if (cdp) cdp.close();
        if (browser?.proc) browser.proc.kill();

        // -----------------------------------------------------------------
        // BƯỚC 9: DỌN DẸP SẠCH TOÀN BỘ DỮ LIỆU THỬ NGHIỆM
        // -----------------------------------------------------------------
        console.log('\n[Cleanup] Dọn dẹp dữ liệu thử nghiệm...');
        // Xóa 2 địa điểm test
        if (testPlace1Id) {
            await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${testPlace1Id}`, { method: 'DELETE', headers: headersAdmin }).catch(() => {});
            console.log(`- Đã xóa địa điểm thử nghiệm ID ${testPlace1Id}`);
        }
        if (testPlace2Id) {
            await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${testPlace2Id}`, { method: 'DELETE', headers: headersAdmin }).catch(() => {});
            console.log(`- Đã xóa địa điểm thử nghiệm ID ${testPlace2Id}`);
        }
        // Xóa giao dịch điểm & điểm test
        if (testAuthorId) {
            await fetch(`${SUPABASE_URL}/rest/v1/point_transactions?user_id=eq.${testAuthorId}`, { method: 'DELETE', headers: headersAdmin }).catch(() => {});
            await fetch(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${testAuthorId}`, { method: 'DELETE', headers: headersAdmin }).catch(() => {});
            await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${testAuthorId}`, { method: 'DELETE', headers: headersAdmin }).catch(() => {});
            console.log(`- Đã dọn dẹp điểm và xóa tài khoản thử nghiệm ${testAuthorId}`);
        }
        console.log('✓ Hoàn tất dọn dẹp sạch sẽ!');
    }

    console.log('\n======================================================');
    console.log('TỔNG HỢP KẾT QUẢ KIỂM THỬ: TẤT CẢ TIÊU CHÍ ĐỀU ĐẠT 100%');
    console.log('======================================================');
    console.log('1. Bấm nút Phê duyệt qua giao diện UI: ĐẠT');
    console.log('2. Tài khoản người gửi thực nhận +15 Điểm Thổ Địa (G15): ĐẠT');
    console.log('3. Duyệt lại không cộng trùng (Idempotency): ĐẠT');
    console.log('4. Bấm nút Từ chối qua giao diện (mở modal lý do & xác nhận): ĐẠT');
    console.log('5. Đề xuất bị từ chối chuyển sang status archived: ĐẠT');
    console.log('6. Giữ nguyên toàn vẹn đề xuất thật ID 105 ("tesstttt"): ĐẠT');
}

main().catch(err => {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
    process.exit(1);
});
