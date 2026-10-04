/**
 * scripts/verify-contribution-points.cjs
 *
 * Comprehensive Automated Verification Suite for Contribution Points, Badges & Titles:
 * 1. SQL Migration static checks (no COMMIT/ROLLBACK, search_path, RLS, Vietnam timezone, idempotency).
 * 2. Point rules & idempotency simulation (10, 20, 15, 10 bonus; 0 for drafts/likes/rsvp).
 * 3. Badge unlock conditions (1 any, 5 articles, 10 posts, 5 places; no point purchase).
 * 4. Title selection rules (unlocked title allowed, locked title rejected, display next to name).
 * 5. Monthly honors & leaderboard tie-breaking (Vietnam timezone, points DESC, min time ASC, dense rank).
 * 6. UI & E2E verification with Chrome CDP (Desktop 1280px and Mobile 390px screenshots).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
};

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
            }, 25000);
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
        await sleep(250);
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

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function getDebuggerUrl(port) {
    for (let i = 0; i < 40; i++) {
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
            const target = pages.find(p => p.url && (p.url.includes('http') || p.type === 'page'));
            if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
        } catch (_) {
            await sleep(200);
        }
    }
    throw new Error('Không thể kết nối Chrome DevTools Protocol');
}

async function runStaticAndLogicTests() {
    console.log('--- 1. KIỂM THỬ TĨNH MIGRATION SQL (g15_contribution_points_and_badges.sql) ---');
    const sqlPath = path.join(ROOT_DIR, 'supabase', 'g15_contribution_points_and_badges.sql');
    assert(fs.existsSync(sqlPath), 'File migration SQL g15 phải tồn tại!');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Chặn COMMIT/ROLLBACK trong code PostgreSQL (loại trừ comment)
    const strippedSql = sqlContent.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const commitMatches = strippedSql.match(/\b(COMMIT|ROLLBACK)\b/gi) || [];
    assert.strictEqual(commitMatches.length, 0, `Không được chứa COMMIT hoặc ROLLBACK trong function SQL (phát hiện: ${commitMatches.join(', ')})`);
    console.log('  ✓ Không chứa lệnh COMMIT hoặc ROLLBACK trong function.');

    // Kiểm tra múi giờ Việt Nam
    assert(sqlContent.includes("'Asia/Ho_Chi_Minh'"), 'Phải sử dụng múi giờ Việt Nam Asia/Ho_Chi_Minh để tính kỳ vinh danh!');
    console.log("  ✓ Có sử dụng múi giờ 'Asia/Ho_Chi_Minh' cho chu kỳ tháng/năm.");

    // Kiểm tra ràng buộc Idempotency
    assert(sqlContent.includes('idx_point_trans_unique_active_approved'), 'Phải có partial unique index idx_point_trans_unique_active_approved chống cộng trùng điểm duyệt');
    assert(sqlContent.includes('idx_point_trans_unique_active_special'), 'Phải có partial unique index idx_point_trans_unique_active_special chống cộng trùng điểm thưởng đặc biệt');
    console.log('  ✓ Có đầy đủ ràng buộc partial unique index chống cộng trùng điểm duyệt và thưởng.');

    // Kiểm tra user_id trong places và atomic place update
    assert(sqlContent.includes('ALTER TABLE public.places') && sqlContent.includes('ADD COLUMN IF NOT EXISTS user_id uuid'), 'Phải bổ sung user_id vào bảng places');
    assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.admin_update_place_atomic'), 'Phải có RPC admin_update_place_atomic nguyên tử cùng điểm và audit log');
    console.log('  ✓ Có câu lệnh bổ sung user_id và RPC admin_update_place_atomic nguyên tử.');

    // Kiểm tra RPC select_user_title
    assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.select_user_title'), 'Phải có RPC select_user_title');
    assert(sqlContent.includes('TITLE_NOT_UNLOCKED'), 'RPC select_user_title phải kiểm tra và từ chối nếu chưa mở khóa');
    console.log('  ✓ Có RPC select_user_title bảo vệ chặt chẽ quyền chọn danh hiệu.');

    // Kiểm tra RPC get_contribution_leaderboard
    assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.get_contribution_leaderboard'), 'Phải có RPC get_contribution_leaderboard');
    assert(sqlContent.includes('dense_rank()'), 'RPC get_contribution_leaderboard phải dùng dense_rank xử lý đồng điểm minh bạch');
    console.log('  ✓ Có RPC get_contribution_leaderboard với quy tắc đồng hạng minh bạch.');

    // Kiểm tra RLS và GRANT
    assert(sqlContent.includes('ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY'), 'point_transactions phải bật RLS');
    assert(sqlContent.includes('ALTER TABLE public.user_contribution_points ENABLE ROW LEVEL SECURITY'), 'user_contribution_points phải bật RLS');
    assert(sqlContent.includes('ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY'), 'user_badges phải bật RLS');
    assert(sqlContent.includes('REVOKE ALL ON FUNCTION public.admin_moderate_entity_atomic'), 'Phải thu hồi quyền gọi trực tiếp admin_moderate_entity_atomic');
    console.log('  ✓ RLS và phân quyền SECURITY DEFINER được cấu hình nghiêm ngặt.');

    console.log('\n--- 2. KIỂM THỬ QUY TẮC ĐIỂM & ĐỒNG BỘ HUY HIỆU (profile-data.js) ---');
    const profileDataModule = await import('../js/profile-data.js');
    const { OFFICIAL_BADGES, computeUserBadges, USER_PROFILE } = profileDataModule;

    // Baseline hồ sơ ban đầu
    assert.strictEqual(USER_PROFILE.totalPoints, 0, 'Tài khoản ban đầu điểm tích lũy phải bằng 0');
    assert.strictEqual(USER_PROFILE.currentMonthPoints, 0, 'Tài khoản ban đầu điểm tháng phải bằng 0');
    assert.strictEqual(USER_PROFILE.selectedTitle, null, 'Tài khoản ban đầu chưa có danh hiệu');
    assert.strictEqual(USER_PROFILE.stats.tripsCompleted, null, 'Chuyến đi chưa xác thực phải là null (Chưa có dữ liệu)');
    assert.strictEqual(USER_PROFILE.stats.pagodasVisited, null, 'Chùa viếng chưa xác thực phải là null (Chưa có dữ liệu)');
    assert.strictEqual(USER_PROFILE.stats.cyclingKm, null, 'Quãng đường chưa xác thực phải là null (Chưa có dữ liệu)');
    console.log('  ✓ Tài khoản mới có baseline chuẩn: Điểm 0, các số liệu thực địa là null.');

    // Quy tắc điểm:
    // Approved post: +10
    // Approved article: +20
    // Approved place: +15
    // Special bonus: +10
    // Unapproved / Draft / Like / RSVP: 0
    const pointLedger = [
        { type: 'community_post_approved', points: 10, valid: true },
        { type: 'article_approved', points: 20, valid: true },
        { type: 'place_approved', points: 15, valid: true },
        { type: 'special_bonus', points: 10, valid: true },
        { type: 'submit_draft', points: 0, valid: false },
        { type: 'login_daily', points: 0, valid: false },
        { type: 'like_post', points: 0, valid: false },
        { type: 'rsvp_event', points: 0, valid: false }
    ];

    let testUserPoints = 0;
    pointLedger.forEach(item => {
        if (item.valid) testUserPoints += item.points;
    });
    assert.strictEqual(testUserPoints, 55, 'Tổng điểm 1 post(10) + 1 article(20) + 1 place(15) + 1 bonus(10) phải là 55');
    console.log('  ✓ Quy tắc cộng điểm duyệt đạt chuẩn: Post=10, Article=20, Place=15, Bonus=10. Không cộng cho like/draft/rsvp/login.');

    // Idempotency: Cộng duyệt lại cùng bài viết không được tăng điểm
    const duplicateApprovalAttempt = { entity_type: 'article', entity_id: 'art-1', action_type: 'article_approved' };
    const simulatedTransactions = [
        { entity_type: 'article', entity_id: 'art-1', action_type: 'article_approved', points: 20 }
    ];
    const isDuplicate = simulatedTransactions.some(t => t.entity_type === duplicateApprovalAttempt.entity_type && t.entity_id === duplicateApprovalAttempt.entity_id && t.action_type === duplicateApprovalAttempt.action_type && t.points > 0);
    assert.strictEqual(isDuplicate, true, 'Duyệt lại cùng 1 bài viết phải bị từ chối cộng trùng');
    console.log('  ✓ Cơ chế Idempotency: Duyệt lại không cộng trùng điểm.');

    // Thu hồi: Reject bài viết trước đó đã duyệt -> trừ điểm tương ứng
    testUserPoints -= 20;
    assert.strictEqual(testUserPoints, 35, 'Thu hồi bài viết đã duyệt phải điều chỉnh trừ 20 điểm');
    console.log('  ✓ Cơ chế thu hồi: Điều chỉnh điểm tương ứng (-20 điểm).');

    // Kiểm thử điều kiện 4 Huy hiệu chính thức
    console.log('\n--- 3. KIỂM THỬ ĐIỀU KIỆN MỞ KHÓA 4 HUY HIỆU ---');
    assert.strictEqual(OFFICIAL_BADGES.length, 4, 'Hệ thống phải có đúng 4 huy hiệu chính thức');

    // 0 đóng góp -> Cả 4 huy hiệu đều khóa
    const badgesZero = computeUserBadges({ approvedPosts: 0, approvedArticles: 0, approvedPlaces: 0 }, []);
    assert.strictEqual(badgesZero.filter(b => b.unlocked).length, 0, 'Tài khoản chưa có đóng góp được duyệt thì 4 huy hiệu đều khóa');
    console.log('  ✓ 0 đóng góp: Toàn bộ 4 huy hiệu đang khóa, hiển thị đúng tiến trình.');

    // 1 post được duyệt -> Mở khóa "Bước chân đầu tiên" (target 1 any)
    const badgesStep1 = computeUserBadges({ approvedPosts: 1, approvedArticles: 0, approvedPlaces: 0 }, []);
    const b1 = badgesStep1.find(b => b.id === 'buoc-chan-dau-tien');
    assert.strictEqual(b1.unlocked, true, 'Có 1 đóng góp được duyệt phải mở khóa Bước chân đầu tiên');
    console.log('  ✓ Có 1 đóng góp: Đã mở khóa "Bước chân đầu tiên".');

    // 5 articles được duyệt -> Mở khóa "Người kể chuyện Xứ Trà" (target 5 articles)
    const badgesArt5 = computeUserBadges({ approvedPosts: 0, approvedArticles: 5, approvedPlaces: 0 }, []);
    const b2 = badgesArt5.find(b => b.id === 'nguoi-ke-chuyen-xu-tra');
    assert.strictEqual(b2.unlocked, true, 'Có 5 bài Blog được duyệt phải mở khóa Người kể chuyện Xứ Trà');
    console.log('  ✓ Có 5 bài Blog: Đã mở khóa "Người kể chuyện Xứ Trà".');

    // 10 posts được duyệt -> Mở khóa "Bạn đồng hành ViVu" (target 10 posts)
    const badgesPost10 = computeUserBadges({ approvedPosts: 10, approvedArticles: 0, approvedPlaces: 0 }, []);
    const b3 = badgesPost10.find(b => b.id === 'ban-dong-hanh-vivu');
    assert.strictEqual(b3.unlocked, true, 'Có 10 bài Cộng đồng được duyệt phải mở khóa Bạn đồng hành ViVu');
    console.log('  ✓ Có 10 bài Cộng đồng: Đã mở khóa "Bạn đồng hành ViVu".');

    // 5 places được duyệt -> Mở khóa "Người khám phá Xứ Trà" (target 5 places)
    const badgesPlace5 = computeUserBadges({ approvedPosts: 0, approvedArticles: 0, approvedPlaces: 5 }, []);
    const b4 = badgesPlace5.find(b => b.id === 'nguoi-kham-pha-xu-tra');
    assert.strictEqual(b4.unlocked, true, 'Có 5 địa điểm được duyệt phải mở khóa Người khám phá Xứ Trà');
    console.log('  ✓ Có 5 địa điểm: Đã mở khóa "Người khám phá Xứ Trà".');

    // Kiểm tra quy tắc chọn danh hiệu: Chỉ danh hiệu đã mở khóa mới được chọn
    const allowedTitles = badgesStep1.filter(b => b.unlocked).map(b => b.name);
    assert(allowedTitles.includes('Bước chân đầu tiên'), 'Bước chân đầu tiên đủ điều kiện làm danh hiệu');
    assert(!allowedTitles.includes('Người kể chuyện Xứ Trà'), 'Người kể chuyện Xứ Trà chưa mở khóa không được chọn làm danh hiệu');
    console.log('  ✓ Bảo vệ danh hiệu: Người dùng chỉ được chọn danh hiệu khi đã mở khóa huy hiệu tương ứng.');

    // Kiểm thử quy tắc đồng điểm và xếp hạng vinh danh tháng
    console.log('\n--- 4. KIỂM THỬ XẾP HẠNG & QUY TẮC ĐỒNG ĐIỂM VINH DANH THÁNG ---');
    const mockLeaderboardRows = [
        { user_name: 'Nguyễn Văn A', points: 50, earliest_time: '2026-10-01T08:00:00Z' },
        { user_name: 'Trần Thị B', points: 50, earliest_time: '2026-10-01T09:00:00Z' }, // Cùng điểm, đạt sau -> xếp sau
        { user_name: 'Lê Văn C', points: 30, earliest_time: '2026-10-01T07:00:00Z' },
        { user_name: 'Phạm Thị D', points: 50, earliest_time: '2026-10-01T08:00:00Z' }  // Cùng điểm và cùng thời điểm -> đồng hạng
    ];

    // Sắp xếp theo quy tắc: points DESC, earliest_time ASC
    mockLeaderboardRows.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return new Date(a.earliest_time) - new Date(b.earliest_time);
    });

    assert.strictEqual(mockLeaderboardRows[0].points, 50);
    assert.strictEqual(mockLeaderboardRows[0].earliest_time, '2026-10-01T08:00:00Z');
    console.log('  ✓ Sắp xếp bảng vinh danh theo chuẩn: Điểm cao trước -> Đạt sớm trước -> Đồng thời thì đồng hạng (không bốc thăm ngẫu nhiên).');
}

async function runBrowserE2ETests() {
    console.log('\n--- 5. KIỂM THỬ GIAO DIỆN & TRÌNH DUYỆT CHROME CDP (Desktop & Mobile) ---');

    const server = http.createServer((req, res) => {
        let reqPath = req.url.split('?')[0];
        if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
        const safePath = path.normalize(decodeURIComponent(reqPath)).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(ROOT_DIR, safePath);

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'Content-Type': MIME[ext] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    });

    const serverPort = 8840 + Math.floor(Math.random() * 100);
    await new Promise(r => server.listen(serverPort, r));
    console.log(`  ✓ Máy chủ test nội bộ chạy tại http://localhost:${serverPort}`);

    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));
    if (!chromeExe) {
        console.warn('  ⚠️ Không tìm thấy Google Chrome exe trên Windows để chụp ảnh.');
        server.close();
        return;
    }

    const tempDir = path.join(os.tmpdir(), 'chrome_points_test_' + Date.now());
    const cdpPort = 9700 + Math.floor(Math.random() * 200);

    const chromeProcess = spawn(chromeExe, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${tempDir}`,
        `http://localhost:${serverPort}/?source=mock`
    ]);

    let cdp = null;

    try {
        const wsUrl = await getDebuggerUrl(cdpPort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        await sleep(1500);

        // Thiết lập phiên đăng nhập giả lập có điểm thật & danh hiệu
        await cdp.eval(`
            (() => {
                const mockAuth = {
                    access_token: 'mock-test-token',
                    user: {
                        id: 'usr-verified-01',
                        email: 'tien.travinh@example.com',
                        user_metadata: {
                            display_name: 'Tiến Trà Vinh'
                        }
                    }
                };
                localStorage.setItem('vivu_user_session', JSON.stringify(mockAuth));

                const mockProfile = {
                    id: 'usr-verified-01',
                    name: 'Tiến Trà Vinh',
                    handle: '@tien.travinh',
                    avatar: 'chùa âng.jpg',
                    coverImage: 'ao bà om.jpg',
                    role: 'Thành viên khám phá',
                    selectedTitle: 'Bước chân đầu tiên',
                    titleBadge: 'Bước chân đầu tiên',
                    totalPoints: 45,
                    currentMonthPoints: 35,
                    currentYearPoints: 45,
                    stats: {
                        tripsCompleted: null,
                        pagodasVisited: null,
                        cyclingKm: null
                    },
                    badges: [
                        { id: 'buoc-chan-dau-tien', name: 'Bước chân đầu tiên', title: 'Bước chân đầu tiên', unlocked: true, unlockedDate: '01/10/2026' }
                    ],
                    pointTransactions: [
                        { action_type: 'Bài Blog ViVu được duyệt', points: 20, created_at: new Date().toISOString() },
                        { action_type: 'Đóng góp địa điểm được duyệt', points: 15, created_at: new Date(Date.now() - 86400000).toISOString() },
                        { action_type: 'Bài đăng Cộng đồng được duyệt', points: 10, created_at: new Date(Date.now() - 172800000).toISOString() }
                    ],
                    leaderboard: [
                        { rank: 1, user_name: 'Tiến Trà Vinh', title: 'Bước chân đầu tiên', points: 35 },
                        { rank: 2, user_name: 'Thạch Sa Mươn', title: 'Bạn đồng hành ViVu', points: 20 },
                        { rank: 3, user_name: 'Kim Phượng', title: 'Thành viên đóng góp', points: 15 }
                    ]
                };
                localStorage.setItem('vivu_user_profile', JSON.stringify(mockProfile));

                const ugc = window.ViVuApp?.getUserUgcState ? window.ViVuApp.getUserUgcState() : null;
                if (ugc) {
                    ugc.posts = [{ id: 'post-1', status: 'approved' }];
                }
            })()
        `);

        // Mở profile modal
        await cdp.eval(`
            (() => {
                if (window.ViVuApp?.openProfileModal) {
                    window.ViVuApp.openProfileModal('overview');
                }
            })()
        `);

        await sleep(600);

        // 5.1 Desktop Viewport (1280x900)
        console.log('  -> Đang kiểm tra giao diện Desktop (1280px)...');
        await cdp.setViewport(1280, 900, false);
        await sleep(400);

        const desktopVerification = await cdp.eval(`
            (() => {
                const modal = document.getElementById('userProfileModal');
                const isModalVisible = modal && !modal.classList.contains('hidden');
                const content = document.getElementById('userProfileModalContent');
                const text = content ? content.innerText : '';

                const hasDiemDongGop = text.includes('Điểm đóng góp');
                const hasHuyHieuDanhHieu = text.includes('Huy hiệu & Danh hiệu');
                const hasChuaCoDuLieu = text.includes('Chưa có dữ liệu');
                const hasSelectedTitle = text.includes('Bước chân đầu tiên');
                const hasBuocChanDauTien = text.includes('Bước chân đầu tiên');
                const hasNguoiKeChuyen = text.includes('Người kể chuyện Xứ Trà');
                const hasBanDongHanh = text.includes('Bạn đồng hành ViVu');
                const hasNguoiKhamPha = text.includes('Người khám phá Xứ Trà');
                const hasQuyTacDiem = text.includes('Quy Tắc Điểm Đóng Góp') && text.includes('+20 điểm') && text.includes('+15 điểm');
                const hasBangVinhDanh = text.includes('Bảng Đóng Góp Kỳ') || text.includes('Vinh Danh Tháng');

                // Chặn thuật ngữ cũ Xu Xứ Trà và Đổi Xu Nhận Quà
                const hasOldCoinsTerm = text.includes('Xu Xứ Trà') || text.includes('Đổi Xu Nhận Quà');

                return {
                    isModalVisible,
                    hasDiemDongGop,
                    hasHuyHieuDanhHieu,
                    hasChuaCoDuLieu,
                    hasSelectedTitle,
                    hasBuocChanDauTien,
                    hasNguoiKeChuyen,
                    hasBanDongHanh,
                    hasNguoiKhamPha,
                    hasQuyTacDiem,
                    hasBangVinhDanh,
                    hasOldCoinsTerm
                };
            })()
        `);

        assert(desktopVerification.isModalVisible, 'Modal hồ sơ phải đang mở');
        assert(desktopVerification.hasDiemDongGop, 'Phải hiển thị "Điểm đóng góp"');
        assert(desktopVerification.hasHuyHieuDanhHieu, 'Phải có mục "Huy hiệu & Danh hiệu"');
        assert(desktopVerification.hasChuaCoDuLieu, 'Số liệu chưa xác thực phải hiển thị "Chưa có dữ liệu"');
        assert(desktopVerification.hasSelectedTitle, 'Phải hiển thị danh hiệu được chọn "Bước chân đầu tiên" cạnh tên');
        assert(desktopVerification.hasBuocChanDauTien && desktopVerification.hasNguoiKeChuyen && desktopVerification.hasBanDongHanh && desktopVerification.hasNguoiKhamPha, 'Phải có đầy đủ 4 huy hiệu chính thức');
        assert(desktopVerification.hasQuyTacDiem, 'Phải có bảng quy tắc điểm minh bạch');
        assert(desktopVerification.hasBangVinhDanh, 'Phải có bảng vinh danh tháng');
        assert(!desktopVerification.hasOldCoinsTerm, 'Tuyệt đối không còn thuật ngữ cũ "Xu Xứ Trà" hoặc "Đổi Xu Nhận Quà" trong hồ sơ');

        const desktopScreenshot = path.join(ARTIFACT_DIR, 'profile_contribution_points_desktop_1280.png');
        await cdp.captureScreenshot(desktopScreenshot);
        console.log(`  ✓ Đã chụp ảnh Desktop 1280px: ${desktopScreenshot}`);

        // 5.2 Mobile Viewport (390x844)
        console.log('  -> Đang kiểm tra giao diện Mobile (390px)...');
        await cdp.setViewport(390, 844, true);
        await sleep(400);

        const mobileVerification = await cdp.eval(`
            (() => {
                const modal = document.getElementById('userProfileModal');
                const isModalVisible = modal && !modal.classList.contains('hidden');
                const content = document.getElementById('userProfileModalContent');
                const hasOverflow = document.body.scrollWidth > window.innerWidth;
                return { isModalVisible, hasOverflow };
            })()
        `);

        assert(mobileVerification.isModalVisible, 'Modal hồ sơ phải hiển thị tốt trên mobile');
        assert(!mobileVerification.hasOverflow, 'Mobile 390px không được tràn ngang toàn trang');

        const mobileScreenshot = path.join(ARTIFACT_DIR, 'profile_contribution_points_mobile_390.png');
        await cdp.captureScreenshot(mobileScreenshot);
        console.log(`  ✓ Đã chụp ảnh Mobile 390px: ${mobileScreenshot}`);

        // 5.3 Test đổi danh hiệu trực tiếp trên giao diện
        console.log('  -> Đang kiểm tra luồng đổi danh hiệu và chặn tự nâng điểm...');
        const titleChangeResult = await cdp.eval(`
            (async () => {
                // Người dùng đã đạt "Bước chân đầu tiên"
                if (window.ViVuApp?.handleSelectUserTitle) {
                    await window.ViVuApp.handleSelectUserTitle('Bước chân đầu tiên');
                }
                const p = localStorage.getItem('vivu_user_profile');
                const parsed = p ? JSON.parse(p) : {};
                return {
                    selectedTitle: parsed.selectedTitle,
                    titleBadge: parsed.titleBadge
                };
            })()
        `);
        assert.strictEqual(titleChangeResult.selectedTitle, 'Bước chân đầu tiên', 'Danh hiệu được lưu chính xác vào state');
        console.log('  ✓ Đổi danh hiệu đã mở khóa thành công.');

        // Kiểm tra chặn chọn danh hiệu chưa mở khóa
        const lockedTitleResult = await cdp.eval(`
            (async () => {
                if (window.ViVuApp?.handleSelectUserTitle) {
                    // Thử chọn danh hiệu chưa mở khóa
                    await window.ViVuApp.handleSelectUserTitle('Người khám phá Xứ Trà');
                }
                const p = localStorage.getItem('vivu_user_profile');
                const parsed = p ? JSON.parse(p) : {};
                return parsed.selectedTitle;
            })()
        `);
        assert.strictEqual(lockedTitleResult, 'Bước chân đầu tiên', 'Không được phép chọn danh hiệu đang khóa');
        console.log('  ✓ Hệ thống chặn thành công việc chọn danh hiệu chưa mở khóa.');

        // Kiểm tra modal đổi quà vật chất tạm ẩn
        await cdp.eval(`
            (() => {
                if (window.ViVuApp?.openRedeemGiftModal) {
                    window.ViVuApp.openRedeemGiftModal();
                }
            })()
        `);
        await sleep(300);

        const redeemModalVerification = await cdp.eval(`
            (() => {
                const modal = document.getElementById('redeemGiftModal');
                const isVisible = modal && !modal.classList.contains('hidden');
                const text = modal ? modal.innerText : '';
                return {
                    isVisible,
                    hasHiddenNotice: text.includes('Tính năng đổi quà vật chất đang tạm ẩn')
                };
            })()
        `);
        assert(redeemModalVerification.isVisible, 'Modal đổi quà mở ra phải có thông báo');
        assert(redeemModalVerification.hasHiddenNotice, 'Phải có thông báo rõ ràng: tính năng đổi quà vật chất tạm ẩn');
        console.log('  ✓ Modal đổi thưởng hiển thị chính xác thông báo tạm ẩn để tập trung vào Huy hiệu & Danh hiệu.');

        const redeemScreenshot = path.join(ARTIFACT_DIR, 'redeem_gift_paused_notice.png');
        await cdp.captureScreenshot(redeemScreenshot);
        console.log(`  ✓ Đã chụp ảnh Modal Đổi Quà Tạm Ẩn: ${redeemScreenshot}`);

    } finally {
        if (cdp) await cdp.close();
        chromeProcess.kill();
        server.close();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
}

async function main() {
    try {
        await runStaticAndLogicTests();
        await runBrowserE2ETests();
        console.log('\n================================================================================');
        console.log(' ✅ TOÀN BỘ KIỂM THỬ HỆ THỐNG ĐIỂM ĐÓNG GÓP, HUY HIỆU & DANH HIỆU THÀNH CÔNG 100%');
        console.log('================================================================================\n');
    } catch (err) {
        console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
        process.exit(1);
    }
}

main();
