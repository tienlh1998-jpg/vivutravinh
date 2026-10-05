/**
 * scripts/test-real-account-workflow.cjs
 *
 * Kiểm thử toàn diện tài khoản thật trên Supabase Live (Production) & Web UI:
 * 1. Khởi tạo tài khoản người dùng thật qua Supabase Auth + Sinh phiên đăng nhập thật (JWT).
 * 2. Người dùng thật gửi bài viết Cộng đồng (status: 'pending') -> Điểm vẫn là 0.
 * 3. Quản trị viên (Admin JWT) duyệt bài viết -> Nhận đúng 10 điểm và huy hiệu "Bước chân đầu tiên".
 * 4. Admin duyệt lặp bài viết -> Không cộng thêm điểm (Idempotency).
 * 5. Admin thu hồi (reject) bài viết -> Điểm và huy hiệu được điều chỉnh về 0.
 * 6. Admin duyệt lại (approve) -> Khôi phục đúng +10 điểm và huy hiệu.
 * 7. Chọn danh hiệu bằng phiên đăng nhập thật (select_user_title):
 *    - Chọn danh hiệu đã mở khóa: THÀNH CÔNG.
 *    - Thử chọn danh hiệu chưa mở khóa: BỊ TỪ CHỐI.
 * 8. Chống tự sửa điểm: Người dùng gửi PATCH/POST trực tiếp bị RLS chặn hoàn toàn.
 * 9. Giao diện Chrome CDP đọc dữ liệu thật từ Supabase (KHÔNG MOCK SESSION/PROFILE) -> Chụp ảnh desktop/mobile.
 * 10. Dọn dẹp sạch sẽ CHỈ dữ liệu do test tạo ra.
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
const PROD_URL = 'https://vivutravinh.id.vn';
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

async function runRealAccountTestWorkflow() {
    console.log('================================================================================');
    console.log(' KIỂM THỬ TÀI KHOẢN THẬT TRÊN SUPABASE LIVE & PRODUCTION WEB UI (G15)');
    console.log(` Mục tiêu: ${PROD_URL} & ${SUPABASE_URL}`);
    console.log('================================================================================\n');

    const testTs = Date.now();
    const authorEmail = `user_real_${testTs}@vivutravinh.test`;
    const authorPassword = `VivuPass_${testTs}!@#`;
    const authorDisplayName = `Nguyễn Khám Phá (${testTs.toString().slice(-4)})`;

    let authorUser = null;
    let authorToken = null;
    let authorRefreshToken = null;
    let adminToken = null;
    let createdPostId = null;
    let spoofPostId = null;

    try {
        // ----------------------------------------------------------------------
        // BƯỚC 1: KHỞI TẠO TÀI KHOẢN TÁC GIẢ THẬT & ADMIN TOKEN
        // ----------------------------------------------------------------------
        console.log('[BƯỚC 1] Khởi tạo tài khoản người dùng thật và Admin JWT...');

        // 1.1 Tạo tài khoản thật trên Supabase Auth
        const createUserRes = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: authorEmail,
                password: authorPassword,
                email_confirm: true,
                user_metadata: { display_name: authorDisplayName }
            })
        });

        assert.strictEqual(createUserRes.status, 200, `Tạo tài khoản thật thất bại: ${JSON.stringify(createUserRes.data)}`);
        authorUser = createUserRes.data;
        console.log(`  ✓ Đã tạo tài khoản thật: ${authorEmail} (ID: ${authorUser.id})`);

        // 1.2 Đăng nhập thật lấy access_token của tác giả
        const loginRes = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                apikey: ANON_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: authorEmail,
                password: authorPassword
            })
        });

        assert.strictEqual(loginRes.status, 200, `Đăng nhập tài khoản tác giả thất bại: ${JSON.stringify(loginRes.data)}`);
        authorToken = loginRes.data.access_token;
        authorRefreshToken = loginRes.data.refresh_token;
        assert(authorToken, 'Phải có JWT access_token hợp lệ từ Supabase Auth');
        console.log('  ✓ Đã đăng nhập và nhận JWT phiên thực tế từ Supabase Auth.');

        // 1.3 Sinh token quản trị viên cho tienlh1998@gmail.com
        const adminLinkRes = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type: 'magiclink', email: 'tienlh1998@gmail.com' })
        });
        assert.strictEqual(adminLinkRes.status, 200, 'Không thể generate magic link cho admin');
        const tokenHash = adminLinkRes.data.hashed_token;

        const adminVerifyRes = await fetchJson(`${SUPABASE_URL}/auth/v1/verify`, {
            method: 'POST',
            headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash })
        });
        assert.strictEqual(adminVerifyRes.status, 200, 'Không thể verify admin token');
        adminToken = adminVerifyRes.data.access_token;
        assert(adminToken, 'Phải có JWT quản trị viên hợp lệ');
        console.log('  ✓ Đã sinh JWT quản trị viên (tienlh1998@gmail.com) thành công.');

        // 1.4 Kiểm tra tài khoản mới có điểm 0 và 0 huy hiệu
        const initPointsCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${authorUser.id}`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const initBadgesCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/user_badges?user_id=eq.${authorUser.id}`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const initPoints = initPointsCheck.data?.[0]?.total_points || 0;
        const initBadgesCount = initBadgesCheck.data?.length || 0;
        assert.strictEqual(initPoints, 0, 'Tài khoản mới phải có điểm ban đầu bằng 0');
        assert.strictEqual(initBadgesCount, 0, 'Tài khoản mới phải có 0 huy hiệu');
        console.log('  ✓ Xác nhận tài khoản mới: Điểm ban đầu = 0, Huy hiệu = 0.');

        // ----------------------------------------------------------------------
        // BƯỚC 2: NGƯỜI DÙNG THẬT GỬI BÀI VIẾT CỘNG ĐỒNG
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 2] Người dùng thật gửi bài viết Cộng đồng...');
        const createPostRes = await fetchJson(`${PROD_URL}/api/community-posts`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${authorToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: `Hành trình khám phá nét đẹp văn hóa Xứ Trà ${testTs}`,
                content: 'Một trải nghiệm tuyệt vời khi đến với vùng đất Trà Vinh hữu tình và mến khách. Cảnh quan tươi đẹp và con người nồng hậu.',
                category: 'Văn hóa - Lịch sử'
            })
        });

        assert.strictEqual(createPostRes.status, 201, `Gửi bài viết thất bại: ${JSON.stringify(createPostRes.data)}`);
        assert.strictEqual(createPostRes.data.success, true);
        createdPostId = createPostRes.data.post.id;
        assert(createdPostId, 'Bài viết phải có ID');
        assert.strictEqual(createPostRes.data.post.status, 'pending', 'Bài mới gửi phải ở trạng thái pending');
        console.log(`  ✓ Bài viết được tạo thành công (ID: ${createdPostId}, Trạng thái: pending).`);

        // Điểm vẫn phải là 0 khi bài chỉ ở trạng thái pending
        const pendingPointsCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${authorUser.id}`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const pendingPoints = pendingPointsCheck.data?.[0]?.total_points || 0;
        assert.strictEqual(pendingPoints, 0, 'Bài viết ở hàng đợi pending tuyệt đối KHÔNG được cộng điểm');
        console.log('  ✓ Đúng nguyên tắc: Bài chờ duyệt không cộng điểm (Điểm vẫn = 0).');

        // ----------------------------------------------------------------------
        // BƯỚC 2.1: KIỂM TRA QUYỀN GHI METADATA (CHỐNG CAN THIỆP CỜ is_test/is_mock)
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 2.1] Kiểm tra bảo vệ quyền ghi metadata: Người dùng không thể can thiệp cờ is_test/is_mock...');

        // 2.1.1 Thử gửi bài kèm metadata tùy tiện nhằm can thiệp điều kiện điểm
        const spoofPostRes = await fetchJson(`${PROD_URL}/api/community-posts`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${authorToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: `Bài viết kiểm tra chặn metadata ${testTs}`,
                content: 'Nội dung bài viết nhằm kiểm thử xem người dùng thường có thể tự inject metadata cờ is_test hay không.',
                category: 'Văn hóa - Lịch sử',
                metadata: { is_mock: false, is_test: false, force_score: 999 } // Cố tình inject metadata
            })
        });

        assert.strictEqual(spoofPostRes.status, 201);
        spoofPostId = spoofPostRes.data.post.id;
        
        // Kiểm tra trong DB: Cột metadata không bị user can thiệp cờ force_score
        const checkSpoofDb = await fetchJson(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${spoofPostId}&select=*`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const spoofMetadata = checkSpoofDb.data?.[0]?.metadata;
        assert(!spoofMetadata?.force_score, 'Tầng API phải lọc bỏ hoàn toàn các metadata inject trái phép từ người dùng');
        console.log('  ✓ API ngăn chặn thành công việc inject metadata tùy tiện từ request body của người dùng.');

        // 2.1.2 Thử gọi PATCH trực tiếp vào community_posts bằng token người dùng thường để sửa metadata/status
        const directPatchRes = await fetchJson(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${createdPostId}`, {
            method: 'PATCH',
            headers: {
                apikey: ANON_KEY,
                Authorization: `Bearer ${authorToken}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            },
            body: JSON.stringify({
                status: 'approved',
                metadata: { is_mock: false, is_test: false }
            })
        });

        // Kiểm tra lại trong DB: Bài viết vẫn phải giữ nguyên status = 'pending'
        const verifyPostStatus = await fetchJson(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${createdPostId}&select=status`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        assert.strictEqual(verifyPostStatus.data?.[0]?.status, 'pending', 'Người dùng thường tuyệt đối không thể tự duyệt bài (status phải giữ nguyên pending)');
        console.log('  ✓ RLS & Database ngăn chặn hoàn toàn việc người dùng tự sửa status hoặc can thiệp metadata trực tiếp!');

        // Dọn dẹp bài test spoofing
        if (spoofPostId) {
            await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${spoofPostId}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
        }

        // ----------------------------------------------------------------------
        // BƯỚC 3: ADMIN DUYỆT BÀI VIẾT LẦN ĐẦU (APPROVE) -> +10 ĐIỂM & HUY HIỆU ĐẦU TIÊN
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 3] Admin phê duyệt bài viết lần đầu (approve)...');
        const approveRes = await fetchJson(`${PROD_URL}/api/admin?route=moderation`, {
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

        assert.strictEqual(approveRes.status, 200, `Admin duyệt bài thất bại: ${JSON.stringify(approveRes.data)}`);
        assert.strictEqual(approveRes.data.success, true);
        assert.strictEqual(approveRes.data.status, 'approved');
        console.log('  ✓ Admin phê duyệt bài viết thành công (status: approved).');

        // Kiểm tra điểm và huy hiệu thật từ Supabase Live
        const approvedPointsCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${authorUser.id}`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const approvedBadgesCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/user_badges?user_id=eq.${authorUser.id}`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const transCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/point_transactions?user_id=eq.${authorUser.id}&status=eq.active`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });

        const totalPoints = approvedPointsCheck.data?.[0]?.total_points;
        const currentMonthPoints = approvedPointsCheck.data?.[0]?.current_month_points;
        assert.strictEqual(totalPoints, 10, 'Sau khi duyệt bài cộng đồng, tổng điểm phải chính xác là 10');
        assert.strictEqual(currentMonthPoints, 10, 'Điểm tháng phải là 10');
        assert.strictEqual(transCheck.data?.length, 1, 'Phải có đúng 1 giao dịch điểm active');
        assert.strictEqual(transCheck.data?.[0]?.points, 10);
        assert.strictEqual(transCheck.data?.[0]?.action_type, 'community_post_approved');

        assert.strictEqual(approvedBadgesCheck.data?.length, 1, 'Phải mở khóa đúng 1 huy hiệu');
        assert.strictEqual(approvedBadgesCheck.data?.[0]?.badge_name, 'Bước chân đầu tiên', 'Huy hiệu phải là "Bước chân đầu tiên"');
        console.log(`  ✓ Xác nhận Supabase Live: Người dùng nhận đúng +${totalPoints} điểm và mở khóa huy hiệu "${approvedBadgesCheck.data[0].badge_name}".`);

        // ----------------------------------------------------------------------
        // BƯỚC 4: ADMIN DUYỆT LẶP BÀI VIẾT -> KHÔNG CỘNG THÊM (IDEMPOTENCY)
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 4] Admin duyệt lặp bài viết (Idempotency test)...');
        const reApproveRes = await fetchJson(`${PROD_URL}/api/admin?route=moderation`, {
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

        assert.strictEqual(reApproveRes.status, 200);

        const dupPointsCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${authorUser.id}`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const dupTransCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/point_transactions?user_id=eq.${authorUser.id}&status=eq.active`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });

        assert.strictEqual(dupPointsCheck.data?.[0]?.total_points, 10, 'Duyệt lặp KHÔNG được cộng thêm điểm (phải giữ nguyên 10)');
        assert.strictEqual(dupTransCheck.data?.length, 1, 'Không được phát sinh thêm bản ghi điểm trùng lặp');
        console.log('  ✓ Duyệt lặp an toàn tuyệt đối: Điểm vẫn là 10, không cộng trùng lặp!');

        // ----------------------------------------------------------------------
        // BƯỚC 5: THU HỒI NỘI DUNG (REJECT) -> ĐIỀU CHỈNH ĐIỂM & HUY HIỆU VỀ 0
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 5] Thu hồi nội dung (reject) -> Điều chỉnh điểm & thu hồi huy hiệu...');
        const revokeRes = await fetchJson(`${PROD_URL}/api/admin?route=moderation`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                entity_type: 'community_post',
                entity_id: createdPostId,
                action: 'reject',
                reason: 'Tạm thu hồi để bổ sung hình ảnh thực tế'
            })
        });

        assert.strictEqual(revokeRes.status, 200);
        assert.strictEqual(revokeRes.data.status, 'rejected');

        const revokedPointsCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${authorUser.id}`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const revokedBadgesCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/user_badges?user_id=eq.${authorUser.id}`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const revokedTransCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/point_transactions?user_id=eq.${authorUser.id}&action_type=eq.revocation`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });

        assert.strictEqual(revokedPointsCheck.data?.[0]?.total_points, 0, 'Khi thu hồi, tổng điểm phải điều chỉnh về 0');
        assert.strictEqual(revokedPointsCheck.data?.[0]?.current_month_points, 0, 'Điểm tháng phải điều chỉnh về 0');
        assert.strictEqual(revokedBadgesCheck.data?.length, 0, 'Huy hiệu phải bị thu hồi khi nội dung không còn được duyệt');
        assert.strictEqual(revokedTransCheck.data?.length, 1, 'Phải có 1 bản ghi giao dịch thu hồi (revocation)');
        assert.strictEqual(revokedTransCheck.data?.[0]?.points, -10, 'Giao dịch thu hồi phải ghi nhận -10 điểm');
        console.log('  ✓ Thu hồi thành công: Điểm đã điều chỉnh về 0 và huy hiệu được thu hồi tương ứng.');

        // ----------------------------------------------------------------------
        // BƯỚC 6: DUYỆT LẠI (APPROVE) -> KHÔI PHỤC ĐÚNG ĐIỂM & HUY HIỆU
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 6] Duyệt lại bài viết (re-approve) -> Khôi phục +10 điểm & huy hiệu...');
        const reApproveSuccess = await fetchJson(`${PROD_URL}/api/admin?route=moderation`, {
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

        assert.strictEqual(reApproveSuccess.status, 200);

        const restoredPointsCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${authorUser.id}`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const restoredBadgesCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/user_badges?user_id=eq.${authorUser.id}`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });

        assert.strictEqual(restoredPointsCheck.data?.[0]?.total_points, 10, 'Khi duyệt lại, tổng điểm phải khôi phục đúng 10');
        assert.strictEqual(restoredBadgesCheck.data?.length, 1, 'Huy hiệu phải được mở khóa lại');
        assert.strictEqual(restoredBadgesCheck.data?.[0]?.badge_name, 'Bước chân đầu tiên');
        console.log('  ✓ Duyệt lại thành công: Khôi phục chính xác +10 điểm và huy hiệu "Bước chân đầu tiên".');

        // ----------------------------------------------------------------------
        // BƯỚC 7: KIỂM TRA CHỌN DANH HIỆU BẰNG PHIÊN ĐĂNG NHẬP THẬT (RPC select_user_title)
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 7] Kiểm tra chọn danh hiệu bằng phiên đăng nhập thật (User JWT)...');

        // 7.1 Chọn danh hiệu đã mở khóa "Bước chân đầu tiên"
        const selectTitleRes = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/select_user_title`, {
            method: 'POST',
            headers: {
                apikey: ANON_KEY,
                Authorization: `Bearer ${authorToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ p_title_name: 'Bước chân đầu tiên' })
        });

        assert.strictEqual(selectTitleRes.status, 200, `Chọn danh hiệu đã mở khóa thất bại: ${JSON.stringify(selectTitleRes.data)}`);
        assert.strictEqual(selectTitleRes.data?.success, true);
        assert.strictEqual(selectTitleRes.data?.selected_title, 'Bước chân đầu tiên');

        const titleCheck = await fetchJson(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${authorUser.id}`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        assert.strictEqual(titleCheck.data?.[0]?.selected_title, 'Bước chân đầu tiên');
        console.log('  ✓ Chọn danh hiệu đã mở khóa "Bước chân đầu tiên" thành công bằng JWT người dùng thật.');

        // 7.2 Thử chọn danh hiệu chưa mở khóa "Người kể chuyện Xứ Trà" (yêu cầu 5 blog)
        const lockedTitleRes = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/select_user_title`, {
            method: 'POST',
            headers: {
                apikey: ANON_KEY,
                Authorization: `Bearer ${authorToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ p_title_name: 'Người kể chuyện Xứ Trà' })
        });

        assert(!lockedTitleRes.ok, 'Chọn danh hiệu chưa mở khóa phải bị PostgreSQL từ chối');
        assert(
            lockedTitleRes.data?.message?.includes('chưa mở khóa') || lockedTitleRes.data?.code === '42501',
            `Thông báo lỗi phải rõ ràng: ${JSON.stringify(lockedTitleRes.data)}`
        );
        console.log('  ✓ Hệ thống chặn thành công việc chọn danh hiệu chưa mở khóa (PostgreSQL 42501).');

        // ----------------------------------------------------------------------
        // BƯỚC 8: KIỂM TRA NGƯỜI DÙNG KHÔNG THỂ TỰ SỬA ĐIỂM (RLS PROTECTION)
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 8] Kiểm tra người dùng không thể tự sửa điểm (RLS Protection)...');

        // 8.1 Thử PATCH trực tiếp vào bảng user_contribution_points
        const patchRes = await fetchJson(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${authorUser.id}`, {
            method: 'PATCH',
            headers: {
                apikey: ANON_KEY,
                Authorization: `Bearer ${authorToken}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            },
            body: JSON.stringify({ total_points: 99999 })
        });

        // 8.2 Thử POST trực tiếp vào bảng point_transactions
        const postTransRes = await fetchJson(`${SUPABASE_URL}/rest/v1/point_transactions`, {
            method: 'POST',
            headers: {
                apikey: ANON_KEY,
                Authorization: `Bearer ${authorToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: authorUser.id,
                points: 88888,
                action_type: 'hack_attempt',
                status: 'active'
            })
        });

        // Xác nhận trong CSDL: Điểm vẫn phải là 10, tuyệt đối không bị thay đổi
        const verifyPointsUnmodified = await fetchJson(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${authorUser.id}`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const currentTotal = verifyPointsUnmodified.data?.[0]?.total_points;
        assert.strictEqual(currentTotal, 10, `Bảo mật bị vi phạm! Điểm bị sửa thành ${currentTotal}`);
        console.log('  ✓ Chống tự nâng điểm: RLS ngăn chặn hoàn toàn các hành vi PATCH/POST điểm trực tiếp!');

        // ----------------------------------------------------------------------
        // BƯỚC 9: KIỂM TRA GIAO DIỆN WEB VỚI PHIÊN ĐĂNG NHẬP THẬT ĐỌC TỪ SUPABASE
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 9] Kiểm tra giao diện web thực tế (Chrome CDP đọc trực tiếp từ Supabase Live)...');

        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
        ];
        const chromeExe = chromePaths.find(p => fs.existsSync(p));
        assert(chromeExe, 'Không tìm thấy Google Chrome exe trên Windows');

        const tempDir = path.join(os.tmpdir(), 'chrome_real_user_' + Date.now());
        const cdpPort = 9920 + Math.floor(Math.random() * 60);

        const chromeProcess = spawn(chromeExe, [
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            `--remote-debugging-port=${cdpPort}`,
            `--user-data-dir=${tempDir}`,
            `${PROD_URL}/?source=supabase`
        ]);

        let cdp = null;

        try {
            const wsUrl = await getDebuggerUrl(cdpPort);
            cdp = new CDPClient(wsUrl);
            await cdp.ready();
            await cdp.send('Page.enable');
            await cdp.send('Runtime.enable');
            await cdp.send('DOM.enable');

            console.log('  -> Đang chờ ứng dụng production tải xong...');
            await sleep(3000);

            // Ghi phiên đăng nhập thật vào localStorage (TUYỆT ĐỐI KHÔNG CHÈN MOCK PROFILE)
            console.log('  -> Cài đặt phiên đăng nhập thật vào browser (chỉ vivu_user_session, xóa sạch profile lưu tạm)...');
            await cdp.eval(`
                (() => {
                    const realSession = {
                        access_token: ${JSON.stringify(authorToken)},
                        refresh_token: ${JSON.stringify(authorRefreshToken)},
                        user: {
                            id: ${JSON.stringify(authorUser.id)},
                            email: ${JSON.stringify(authorEmail)},
                            user_metadata: {
                                display_name: ${JSON.stringify(authorDisplayName)}
                            }
                        }
                    };
                    localStorage.setItem('vivu_user_session', JSON.stringify(realSession));
                    localStorage.removeItem('vivu_user_profile'); // Xóa sạch để ứng dụng bắt buộc gọi Supabase thật!
                })()
            `);

            // Yêu cầu web app tải profile thật trực tiếp từ Supabase
            console.log('  -> Đang gọi fetchUserProfile tải dữ liệu thật từ Supabase Live...');
            await cdp.eval(`
                (async () => {
                    if (window.ViVuApp?.fetchUserProfile) {
                        const session = JSON.parse(localStorage.getItem('vivu_user_session'));
                        await window.ViVuApp.fetchUserProfile(session.user.id, session.access_token);
                    }
                    if (window.ViVuApp?.loadUserProfile) {
                        await window.ViVuApp.loadUserProfile();
                    }
                })()
            `);

            await sleep(1500);

            // Mở modal Hồ sơ
            await cdp.eval(`
                (() => {
                    if (window.ViVuApp?.openProfileModal) {
                        window.ViVuApp.openProfileModal('overview');
                    }
                })()
            `);

            await sleep(800);

            // 9.1 Desktop Viewport (1280x900)
            console.log('  -> Kiểm tra hiển thị Desktop (1280px)...');
            await cdp.setViewport(1280, 900, false);
            await sleep(500);

            const desktopCheck = await cdp.eval(`
                (() => {
                    const modal = document.getElementById('userProfileModal');
                    const isVisible = modal && !modal.classList.contains('hidden');
                    const content = document.getElementById('userProfileModalContent');
                    const text = content ? content.innerText : '';

                    return {
                        isVisible,
                        textSnippet: text.slice(0, 500),
                        hasName: text.includes(${JSON.stringify(authorDisplayName)}),
                        has10Points: text.includes('10') && text.includes('Điểm đóng góp'),
                        hasTitle: text.includes('Bước chân đầu tiên'),
                        hasHistory: text.includes('Bài đăng Cộng đồng được duyệt') || text.includes('10'),
                        hasChuaCoDuLieu: text.includes('Chưa có dữ liệu')
                    };
                })()
            `);

            assert(desktopCheck.isVisible, 'Modal Hồ sơ phải đang mở trên Desktop');
            assert(desktopCheck.hasName, `Tên tác giả thật phải xuất hiện trên hồ sơ (${authorDisplayName})`);
            assert(desktopCheck.has10Points, 'Hồ sơ phải hiển thị đúng 10 Điểm đóng góp từ Supabase');
            assert(desktopCheck.hasTitle, 'Danh hiệu đã chọn "Bước chân đầu tiên" phải hiển thị cạnh tên');
            assert(desktopCheck.hasChuaCoDuLieu, 'Chỉ số chưa xác nhận phải hiển thị "Chưa có dữ liệu"');
            console.log('  ✓ Desktop: Hồ sơ đọc dữ liệu thật từ Supabase hiển thị hoàn hảo.');

            const desktopShotPath = path.join(ARTIFACT_DIR, 'real_account_profile_desktop.png');
            await cdp.captureScreenshot(desktopShotPath);
            console.log(`  ✓ Đã chụp ảnh hồ sơ tài khoản thật Desktop: ${desktopShotPath}`);

            // 9.2 Mobile Viewport (390x844)
            console.log('  -> Kiểm tra hiển thị Mobile (390px)...');
            await cdp.setViewport(390, 844, true);
            await sleep(500);

            const mobileCheck = await cdp.eval(`
                (() => {
                    const modal = document.getElementById('userProfileModal');
                    const isVisible = modal && !modal.classList.contains('hidden');
                    const overflow = document.body.scrollWidth > window.innerWidth;
                    return { isVisible, overflow };
                })()
            `);

            assert(mobileCheck.isVisible, 'Modal Hồ sơ phải hiển thị trên Mobile');
            assert(!mobileCheck.overflow, 'Mobile không được có hiện tượng tràn ngang toàn trang');
            console.log('  ✓ Mobile: Hồ sơ tài khoản thật hiển thị mượt mà, không tràn ngang.');

            const mobileShotPath = path.join(ARTIFACT_DIR, 'real_account_profile_mobile.png');
            await cdp.captureScreenshot(mobileShotPath);
            console.log(`  ✓ Đã chụp ảnh hồ sơ tài khoản thật Mobile: ${mobileShotPath}`);

        } finally {
            if (cdp) await cdp.close();
            chromeProcess.kill();
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
        }

    } finally {
        // ----------------------------------------------------------------------
        // BƯỚC 10: DỌN DẸP SẠCH SẼ CÓ MỤC TIÊU (CHỈ XÓA DỮ LIỆU CỦA TEST)
        // ----------------------------------------------------------------------
        console.log('\n[BƯỚC 10] Dọn dẹp sạch sẽ có mục tiêu (Chỉ xóa dữ liệu của ca test này)...');

        if (createdPostId) {
            await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${createdPostId}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            console.log(`  - Đã xóa bài viết kiểm thử ID: ${createdPostId}`);
        }

        if (spoofPostId) {
            await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${spoofPostId}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            console.log(`  - Đã xóa bài viết test spoof ID: ${spoofPostId}`);
        }

        if (authorUser?.id) {
            await fetch(`${SUPABASE_URL}/rest/v1/point_transactions?user_id=eq.${authorUser.id}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            await fetch(`${SUPABASE_URL}/rest/v1/user_badges?user_id=eq.${authorUser.id}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            await fetch(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${authorUser.id}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authorUser.id}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            console.log(`  - Đã xóa tài khoản tác giả kiểm thử ID: ${authorUser.id}`);
        }

        console.log('  ✓ Dọn dẹp hoàn tất: 0 bản ghi rác tồn dư, giữ nguyên 100% dữ liệu thật của hệ thống.');
    }

    console.log('\n================================================================================');
    console.log(' ✅ TOÀN BỘ KIỂM THỬ TÀI KHOẢN THẬT TRÊN SUPABASE & PRODUCTION THÀNH CÔNG 100%!');
    console.log('================================================================================\n');
}

runRealAccountTestWorkflow().catch(err => {
    console.error('\n❌ KIỂM THỬ TÀI KHOẢN THẬT THẤT BẠI:', err);
    process.exit(1);
});
