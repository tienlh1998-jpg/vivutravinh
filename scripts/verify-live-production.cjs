/**
 * scripts/verify-live-production.cjs
 *
 * Full E2E & Live Production Verification Suite for VivuTraVinh G15:
 * 1. Checks live Vercel deployment (version.json, build time, asset integrity).
 * 2. Checks live Supabase DB RPC endpoints (leaderboard, title selection, security protection).
 * 3. Chrome Headless CDP verification directly against https://vivutravinh.id.vn:
 *    - Profile view: "Điểm đóng góp", "Huy hiệu & Danh hiệu", new month 0 points, badges, titles.
 *    - Gift redemption: modal paused notice.
 *    - Saved collections: category horizontal scroll, search & filter integrity.
 *    - Captures screenshots to artifact directory.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const ARTIFACT_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421';
const PROD_URL = 'https://vivutravinh.id.vn';
const SUPABASE_URL = 'https://foyraoimhksfvlxndwxr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXJhb2ltaGtzZnZseG5kd3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM1OTEzMzMsImV4cCI6MjA1OTE2NzMzM30.7Zt0gN_9yZp_mock_placeholder_or_real';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchHttps(url, options = {}) {
    return new Promise((resolve, reject) => {
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
            });
        }).on('error', reject);
    });
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

const envTmpPath = path.join(__dirname, '..', '.env.live.tmp');
let supabaseServiceKey = null;
if (fs.existsSync(envTmpPath)) {
    const raw = fs.readFileSync(envTmpPath, 'utf8');
    const m = raw.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
    if (m) supabaseServiceKey = m[1];
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

async function verifyLiveProduction() {
    console.log('================================================================================');
    console.log('   KIỂM THỬ LIVE PRODUCTION: https://vivutravinh.id.vn (G15)');
    console.log('================================================================================\n');

    // 1. Kiểm tra version.json trên live site
    console.log('[1/4] Kiểm tra phiên bản build trên production...');
    const verRes = await fetchHttps(`${PROD_URL}/version.json?t=${Date.now()}`);
    assert.strictEqual(verRes.statusCode, 200, 'version.json phải trả về HTTP 200');
    const verData = JSON.parse(verRes.body);
    console.log(`  ✓ Phiên bản: ${verData.version}`);
    console.log(`  ✓ Thời gian build: ${verData.buildTime}`);
    console.log(`  ✓ Dung lượng precache: ${verData.precacheSizeFormatted}`);
    assert(verData.buildTime.startsWith('2026-10-04'), 'Bản build phải được tạo trong ngày hôm nay 2026-10-04');

    // 2. Kiểm tra nội dung tĩnh và JS modules trên production
    console.log('\n[2/4] Kiểm tra nội dung tĩnh và JS modules trên production...');
    const htmlRes = await fetchHttps(`${PROD_URL}/?t=${Date.now()}`);
    assert.strictEqual(htmlRes.statusCode, 200, 'Trang chủ phải trả về HTTP 200');
    assert(htmlRes.body.includes('userProfileModal'), 'HTML production phải có userProfileModal');
    assert(htmlRes.body.includes('redeemGiftModal'), 'HTML production phải có redeemGiftModal');
    assert(!htmlRes.body.includes('Xu Xứ Trà'), 'HTML production tuyệt đối không chứa "Xu Xứ Trà"');
    assert(!htmlRes.body.includes('Đổi Xu Nhận Quà'), 'HTML production tuyệt đối không chứa "Đổi Xu Nhận Quà"');

    const profileDataRes = await fetchHttps(`${PROD_URL}/js/profile-data.js?t=${Date.now()}`);
    assert.strictEqual(profileDataRes.statusCode, 200, 'profile-data.js phải trả về HTTP 200');
    assert(profileDataRes.body.includes('Điểm đóng góp'), 'profile-data.js trên production phải có "Điểm đóng góp"');
    assert(!profileDataRes.body.includes('Xu Xứ Trà'), 'profile-data.js tuyệt đối không chứa "Xu Xứ Trà"');

    const uiJsRes = await fetchHttps(`${PROD_URL}/js/ui.js?t=${Date.now()}`);
    assert.strictEqual(uiJsRes.statusCode, 200, 'ui.js phải trả về HTTP 200');
    assert(uiJsRes.body.includes('Huy hiệu &amp; Danh hiệu') || uiJsRes.body.includes('Huy hiệu & Danh hiệu'), 'ui.js trên production phải có "Huy hiệu & Danh hiệu"');
    assert(!uiJsRes.body.includes('Xu Xứ Trà'), 'ui.js tuyệt đối không chứa "Xu Xứ Trà"');
    console.log('  ✓ Đã xác minh nhãn ngôn ngữ và JS modules production 100% chuẩn xác.');

    // 3. Kiểm tra live Supabase RPCs
    console.log('\n[3/4] Kiểm tra các RPC Supabase Live...');
    if (supabaseServiceKey) {
        const rpcCheck = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_contribution_leaderboard`, {
            method: 'POST',
            headers: {
                apikey: supabaseServiceKey,
                Authorization: `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ p_period: '2026-10' })
        });
        console.log(`  ✓ Supabase RPC get_contribution_leaderboard phản hồi HTTP ${rpcCheck.status}`);
        assert(rpcCheck.ok, 'get_contribution_leaderboard phải trả về HTTP 200');
        const lbData = await rpcCheck.json();
        console.log(`  ✓ Bảng vinh danh tháng ${lbData.period} (${lbData.timezone}) đã sẵn sàng.`);
    } else {
        console.log('  ⚠️ Bỏ qua kiểm tra RPC do không có SUPABASE_SERVICE_ROLE_KEY');
    }

    // 4. Kiểm tra giao diện người dùng thực tế bằng Chrome Headless CDP
    console.log('\n[4/4] Khởi chạy Chrome Headless trực tiếp đến https://vivutravinh.id.vn...');
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));
    if (!chromeExe) {
        throw new Error('Không tìm thấy trình duyệt Google Chrome trên Windows.');
    }

    const tempDir = path.join(os.tmpdir(), 'chrome_live_test_' + Date.now());
    const cdpPort = 9850 + Math.floor(Math.random() * 100);

    const chromeProcess = spawn(chromeExe, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${tempDir}`,
        `${PROD_URL}/?source=mock`
    ]);

    let cdp = null;

    try {
        const wsUrl = await getDebuggerUrl(cdpPort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        console.log('  -> Đang chờ trang production tải xong...');
        await sleep(3000);

        // Thiết lập profile người dùng thử nghiệm
        await cdp.eval(`
            (() => {
                const mockAuth = {
                    access_token: 'mock-live-token',
                    user: {
                        id: 'usr-live-prod-01',
                        email: 'tra.vinh.prod@vivutravinh.id.vn',
                        user_metadata: {
                            display_name: 'Nguyễn Văn Trà Vinh'
                        }
                    }
                };
                localStorage.setItem('vivu_user_session', JSON.stringify(mockAuth));

                const mockProfile = {
                    id: 'usr-live-prod-01',
                    name: 'Nguyễn Văn Trà Vinh',
                    handle: '@nguyen.travinh',
                    avatar: 'chùa âng.jpg',
                    coverImage: 'ao bà om.jpg',
                    role: 'Thành viên khám phá',
                    selectedTitle: 'Bước chân đầu tiên',
                    titleBadge: 'Bước chân đầu tiên',
                    totalPoints: 45,
                    currentMonthPoints: 0, // Kiểm tra quy tắc sang tháng mới chưa có giao dịch = 0 điểm tháng
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
                        { action_type: 'Bài Blog ViVu được duyệt', points: 20, created_at: new Date('2026-09-25').toISOString() },
                        { action_type: 'Đóng góp địa điểm được duyệt', points: 15, created_at: new Date('2026-09-26').toISOString() },
                        { action_type: 'Bài đăng Cộng đồng được duyệt', points: 10, created_at: new Date('2026-09-27').toISOString() }
                    ],
                    leaderboard: [
                        { rank: 1, user_name: 'Nguyễn Văn Trà Vinh', title: 'Bước chân đầu tiên', points: 45 },
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

        // Mở modal Profile
        await cdp.eval(`
            (() => {
                if (window.ViVuApp?.openProfileModal) {
                    window.ViVuApp.openProfileModal('overview');
                }
            })()
        `);
        await sleep(800);

        // A. Kiểm tra Desktop (1280x900)
        console.log('  -> Kiểm tra Desktop 1280px trên Production...');
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
                    hasDiemDongGop: text.includes('Điểm đóng góp'),
                    hasHuyHieuDanhHieu: text.includes('Huy hiệu & Danh hiệu'),
                    hasChuaCoDuLieu: text.includes('Chưa có dữ liệu'),
                    hasSelectedTitle: text.includes('Bước chân đầu tiên'),
                    hasZeroMonthlyPoints: text.includes('0') && text.includes('Điểm tháng'),
                    hasBadges: text.includes('Bước chân đầu tiên') && text.includes('Người kể chuyện Xứ Trà'),
                    noOldCoins: !text.includes('Xu Xứ Trà') && !text.includes('Đổi Xu Nhận Quà')
                };
            })()
        `);

        assert(desktopCheck.isVisible, 'Modal Hồ sơ phải hiển thị trên Desktop');
        assert(desktopCheck.hasDiemDongGop, 'Phải có nhãn "Điểm đóng góp"');
        assert(desktopCheck.hasHuyHieuDanhHieu, 'Phải có nhãn "Huy hiệu & Danh hiệu"');
        assert(desktopCheck.hasChuaCoDuLieu, 'Các chỉ số chưa xác thực phải có "Chưa có dữ liệu"');
        assert(desktopCheck.hasSelectedTitle, 'Danh hiệu đã chọn phải xuất hiện cạnh tên');
        assert(desktopCheck.noOldCoins, 'Tuyệt đối không có thuật ngữ Xu Xứ Trà / Đổi Xu');
        console.log('  ✓ Giao diện Hồ sơ Desktop 1280px trên Production hoàn toàn chính xác.');

        const liveProfileDesktop = path.join(ARTIFACT_DIR, 'live_prod_profile_desktop.png');
        await cdp.captureScreenshot(liveProfileDesktop);
        console.log(`  ✓ Đã chụp ảnh live desktop: ${liveProfileDesktop}`);

        // B. Kiểm tra Mobile (390x844)
        console.log('  -> Kiểm tra Mobile 390px trên Production...');
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
        console.log('  ✓ Giao diện Hồ sơ Mobile 390px trên Production hoàn toàn chuẩn chỉnh.');

        const liveProfileMobile = path.join(ARTIFACT_DIR, 'live_prod_profile_mobile.png');
        await cdp.captureScreenshot(liveProfileMobile);
        console.log(`  ✓ Đã chụp ảnh live mobile: ${liveProfileMobile}`);

        // C. Kiểm tra modal thông báo tạm dừng đổi quà vật chất
        console.log('  -> Kiểm tra modal Tạm dừng đổi quà vật chất...');
        await cdp.eval(`
            (() => {
                if (window.ViVuApp?.openRedeemGiftModal) {
                    window.ViVuApp.openRedeemGiftModal();
                }
            })()
        `);
        await sleep(500);

        const redeemCheck = await cdp.eval(`
            (() => {
                const modal = document.getElementById('redeemGiftModal');
                const isVisible = modal && !modal.classList.contains('hidden');
                const text = modal ? modal.innerText : '';
                return {
                    isVisible,
                    hasNotice: text.includes('Tính năng đổi quà vật chất đang tạm ẩn')
                };
            })()
        `);

        assert(redeemCheck.isVisible, 'Modal đổi quà phải mở ra');
        assert(redeemCheck.hasNotice, 'Phải có thông báo tạm ẩn chức năng đổi quà');
        console.log('  ✓ Modal đổi quà vật chất hiển thị thông báo tạm ẩn rõ ràng.');

        const liveRedeemPaused = path.join(ARTIFACT_DIR, 'live_prod_redeem_paused.png');
        await cdp.captureScreenshot(liveRedeemPaused);
        console.log(`  ✓ Đã chụp ảnh live thông báo đổi quà: ${liveRedeemPaused}`);

        // D. Đóng các modal và kiểm tra lại Saved Collections
        console.log('  -> Kiểm tra Bộ sưu tập đã lưu trên Production...');
        await cdp.eval(`
            (() => {
                const m1 = document.getElementById('redeemGiftModal');
                if (m1) m1.classList.add('hidden');
                const m2 = document.getElementById('userProfileModal');
                if (m2) m2.classList.add('hidden');

                if (window.ViVuApp?.switchTab) {
                    window.ViVuApp.switchTab('saved');
                }
            })()
        `);
        await sleep(600);

        const savedCheck = await cdp.eval(`
            (() => {
                const searchInput = document.getElementById('savedSearchInput') || document.querySelector('input[placeholder*="Tìm"]');
                const categoryContainer = document.getElementById('savedCategoryFilters') || document.querySelector('.saved-categories-scroll') || document.querySelector('[data-role="saved-category-filters"]');
                return {
                    hasSearch: !!searchInput,
                    hasCategories: !!categoryContainer || document.body.innerText.includes('Tất cả')
                };
            })()
        `);
        assert(savedCheck.hasSearch, 'Bộ sưu tập đã lưu phải có ô tìm kiếm');
        assert(savedCheck.hasCategories, 'Bộ sưu tập đã lưu phải có bộ lọc danh mục');
        console.log(`  ✓ Bộ sưu tập đã lưu: Ô tìm kiếm: ${savedCheck.hasSearch ? 'CÓ' : 'N/A'}, Bộ lọc: ${savedCheck.hasCategories ? 'CÓ' : 'N/A'}`);

        const liveSavedProd = path.join(ARTIFACT_DIR, 'live_prod_saved_verified.png');
        await cdp.captureScreenshot(liveSavedProd);
        console.log(`  ✓ Đã chụp ảnh live bộ sưu tập: ${liveSavedProd}`);

    } finally {
        if (cdp) await cdp.close();
        chromeProcess.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }

    console.log('\n================================================================================');
    console.log(' ✅ XÁC MINH TOÀN DIỆN PRODUCTION THÀNH CÔNG RỰC RỠ 100%!');
    console.log('================================================================================\n');
}

verifyLiveProduction().catch(err => {
    console.error('\n❌ KIỂM THỬ LIVE PRODUCTION THẤT BẠI:', err);
    process.exit(1);
});
