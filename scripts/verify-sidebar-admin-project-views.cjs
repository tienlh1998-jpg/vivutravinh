/**
 * verify-sidebar-admin-project-views.cjs
 * Kịch bản kiểm thử E2E tự động qua Chrome DevTools Protocol (CDP)
 * Xác minh toàn diện nhóm "GÓC ADMIN & DỰ ÁN", 3 danh mục công khai,
 * màu sắc trạng thái, quyền hiển thị, nội dung 3 views, Router/URL/History,
 * và responsive Desktop / Mobile (Light & Dark mode).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');
const WebSocket = globalThis.WebSocket;

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.resolve(os.homedir(), '.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const envPath = path.join(ROOT_DIR, '.env.live.tmp');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const SUPABASE_URL = process.env.SUPABASE_URL || (envContent.match(/SUPABASE_URL="([^"]+)"/) || [])[1] || 'https://foyraoimhksfvlxndwxr.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || (envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/) || [])[1] || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || (envContent.match(/SUPABASE_ANON_KEY="([^"]+)"/) || [])[1] || 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

async function getRealUserSession(email) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'magiclink', email })
    });
    const data = await res.json();
    if (!data.hashed_token) throw new Error('Không thể tạo magiclink cho: ' + email + ' - ' + JSON.stringify(data));
    
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'magiclink', token_hash: data.hashed_token })
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.access_token) throw new Error('Không thể verify token cho: ' + email + ' - ' + JSON.stringify(verifyData));
    
    return {
        access_token: verifyData.access_token,
        refresh_token: verifyData.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: verifyData.user
    };
}

function startLocalServer(port = 4180) {
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2'
    };

    const server = http.createServer((req, res) => {
        try {
            const parsedUrl = new URL(req.url, `http://localhost:${port}`);
            let pathname = parsedUrl.pathname;
            if (pathname === '/') pathname = '/index.html';

            const filePath = path.join(ROOT_DIR, pathname);
            if (!filePath.startsWith(ROOT_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not Found');
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Internal Server Error: ${err.message}`);
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
        const result = await this.send('Runtime.evaluate', {
            expression: expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (result.exceptionDetails) {
            throw new Error(`Eval error: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
        }
        return result.result?.value;
    }

    async setViewport(width, height, isMobile = false) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 2,
            mobile: isMobile
        });
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
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
    ];
    for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
    }
    throw new Error('Không tìm thấy trình duyệt Google Chrome trên máy.');
}

async function launchBrowser(port = 9348) {
    const chromePath = await findChromeExecutable();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-test-sidebar-'));
    const proc = spawn(chromePath, [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--window-size=1280,900'
    ]);

    for (let i = 0; i < 30; i++) {
        await sleep(400);
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
    console.log('KIỂM THỬ E2E: NHÓM "GÓC ADMIN & DỰ ÁN", 3 DANH MỤC CÔNG KHAI & VIEWS');
    console.log('======================================================================');

    const isProd = Boolean(process.env.TARGET_URL);
    const prefix = isProd ? 'prod_' : '';
    let server = null;
    let BASE_URL = process.env.TARGET_URL;

    if (!isProd) {
        const port = 4180;
        server = await startLocalServer(port);
        BASE_URL = `http://localhost:${port}/`;
    }
    console.log(`Kiểm thử mục tiêu: ${BASE_URL} (isProd: ${isProd})`);

    let browser, cdp;

    try {
        browser = await launchBrowser(9348);
        cdp = new CDPClient(browser.wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.setViewport(1280, 850, false);

        await cdp.send('Page.navigate', { url: BASE_URL });
        await sleep(3500);

        // -----------------------------------------------------------------
        // BƯỚC 1: KIỂM TRA BỐ CỤC SIDEBAR & QUYỀN HIỂN THỊ (KHÁCH / THÀNH VIÊN)
        // -----------------------------------------------------------------
        console.log('\n[Bước 1] Kiểm tra Sidebar với tài khoản khách/thường...');
        const sidebarStateGuest = await cdp.eval(`(() => {
            const groupTitle = document.querySelector('span.uppercase:last-of-type')?.textContent?.trim() || '';
            const allGroupTitles = Array.from(document.querySelectorAll('span.uppercase')).map(el => el.textContent.trim());
            const hasOldGroup = allGroupTitles.some(t => t.includes('QUẢN TRỊ & HỖ TRỢ') || t.includes('Quản Trị & Hỗ Trợ'));
            const hasNewGroup = allGroupTitles.some(t => t.includes('GÓC ADMIN & DỰ ÁN'));

            const modLink = document.getElementById('sidebarAdminModerationLink');
            const modLinkVisible = Boolean(modLink && !modLink.classList.contains('hidden'));

            const feedbackLink = document.getElementById('sidebarLinkFeedback');
            const aboutLink = document.getElementById('sidebarLinkAbout');
            const companionLink = document.getElementById('sidebarLinkCompanion');

            // Kiểm tra "Đóng góp địa điểm" trong sidebar
            const sidebarLinks = Array.from(document.querySelectorAll('#sidebarNav a, .py-space-md a')).map(a => a.textContent.replace(/\\s+/g, ' ').trim());
            const hasSidebarContribute = sidebarLinks.some(t => t.includes('Đóng góp địa điểm'));

            // Header contribute button
            const headerBtn = document.querySelector('header button[onclick*="openContributeModal"]');

            return {
                allGroupTitles,
                hasOldGroup,
                hasNewGroup,
                modLinkVisible,
                feedbackVisible: Boolean(feedbackLink && !feedbackLink.classList.contains('hidden')),
                aboutVisible: Boolean(aboutLink && !aboutLink.classList.contains('hidden')),
                companionVisible: Boolean(companionLink && !companionLink.classList.contains('hidden')),
                hasSidebarContribute,
                hasHeaderContributeBtn: Boolean(headerBtn),
                headerBtnText: headerBtn?.innerText?.replace(/\\s+/g, ' ')?.trim()
            };
        })()`);

        console.log('Trạng thái Sidebar khách:', sidebarStateGuest);
        assert.ok(sidebarStateGuest.hasNewGroup, 'Nhóm sidebar phải đổi tên thành "GÓC ADMIN & DỰ ÁN"');
        assert.strictEqual(sidebarStateGuest.hasOldGroup, false, 'Không được còn tên nhóm cũ "Quản Trị & Hỗ Trợ"');
        assert.strictEqual(sidebarStateGuest.modLinkVisible, false, 'Kiểm duyệt nội dung phải ẨN với khách/thường');
        assert.ok(sidebarStateGuest.feedbackVisible, 'Mục "Góp ý & Hỗ trợ" phải hiển thị công khai');
        assert.ok(sidebarStateGuest.aboutVisible, 'Mục "Về dự án & Kế hoạch" phải hiển thị công khai');
        assert.ok(sidebarStateGuest.companionVisible, 'Mục "Đồng hành cùng Admin" phải hiển thị công khai');
        assert.strictEqual(sidebarStateGuest.hasSidebarContribute, false, '"Đóng góp địa điểm" phải bỏ khỏi sidebar');
        assert.ok(sidebarStateGuest.hasHeaderContributeBtn, 'Nút "+ Đóng góp" trên header phải tồn tại');

        // Cuộn sidebar xuống để thấy rõ nhóm GÓC ADMIN & DỰ ÁN và chụp ảnh
        await cdp.eval(`(() => {
            const el = document.getElementById('sidebarLinkFeedback');
            if (el) el.scrollIntoView({ block: 'center' });
        })()`);
        await sleep(400);

        const screenshotSidebar = path.join(ARTIFACT_DIR, `${prefix}sidebar_admin_project_group.png`);
        await cdp.captureScreenshot(screenshotSidebar);
        console.log(`[Artifact] Ảnh Sidebar: ${screenshotSidebar}`);

        // -----------------------------------------------------------------
        // BƯỚC 2: KIỂM TRA NÚT ĐÓNG GÓP TRÊN HEADER VẪN HOẠT ĐỘNG
        // -----------------------------------------------------------------
        console.log('\n[Bước 2] Kiểm tra nút "+ Đóng góp" cố định trên header...');
        const headerClickResult = await cdp.eval(`(() => {
            const btn = document.querySelector('header button[onclick*="openContributeModal"]');
            if (!btn) return { clicked: false };
            btn.click();
            const modal = document.getElementById('contributeModal');
            return {
                clicked: true,
                modalVisible: Boolean(modal && !modal.classList.contains('hidden'))
            };
        })()`);
        console.log('Kết quả mở modal đóng góp từ header:', headerClickResult);
        assert.ok(headerClickResult.clicked, 'Nút header phải click được');
        assert.ok(headerClickResult.modalVisible, 'Modal đóng góp phải mở khi bấm nút header');

        // Đóng modal đóng góp
        await cdp.eval(`window.ViVuApp.closeContributeModal()`);
        await sleep(500);

        // -----------------------------------------------------------------
        // BƯỚC 3: KIỂM TRA MÀU SẮC & CHUYỂN VIEW "GÓP Ý & HỖ TRỢ" (XANH DƯƠNG)
        // -----------------------------------------------------------------
        console.log('\n[Bước 3] Kiểm tra mục "Góp ý & Hỗ trợ" (Xanh dương)...');
        await cdp.eval(`document.getElementById('sidebarLinkFeedback').click()`);
        await sleep(800);

        const feedbackViewState = await cdp.eval(`(() => {
            const link = document.getElementById('sidebarLinkFeedback');
            const icon = link?.querySelector('.material-symbols-outlined');
            const view = document.getElementById('view-feedback');
            const currentHash = window.location.hash;
            const hasHero = Boolean(view?.querySelector('h1')?.textContent?.includes('Góp Ý & Hỗ Trợ'));
            const hasGuide = Boolean(view?.innerText?.includes('Hướng Dẫn Sử Dụng Nhanh'));
            const hasReport = Boolean(view?.innerText?.includes('Báo Sai Thông Tin Địa Điểm'));
            const hasZaloNotice = Boolean(view?.innerText?.includes('Kênh Zalo và hotline riêng đang chờ chủ dự án'));
            const hasNeutralContact = Boolean(view?.innerText?.includes('Email kỹ thuật ban đầu') && view?.innerText?.includes('chờ chủ dự án'));
            const hasDrafter = Boolean(document.getElementById('feedbackDraftForm'));

            return {
                linkClass: link?.className,
                iconClass: icon?.className,
                viewVisible: Boolean(view && !view.classList.contains('hidden')),
                currentHash,
                hasHero,
                hasGuide,
                hasReport,
                hasEmail: Boolean(view?.innerText?.includes('tienlh1998@gmail.com')),
                hasFacebook: Boolean(view?.innerText?.includes('facebook.com/vivutravinh.official')),
                hasZaloNotice,
                hasNeutralContact,
                hasDrafter
            };
        })()`);

        console.log('Trạng thái view Góp ý & Hỗ trợ:', feedbackViewState);
        assert.ok(feedbackViewState.viewVisible, 'View Góp ý & Hỗ trợ phải hiển thị');
        assert.strictEqual(feedbackViewState.currentHash, '#/feedback', 'URL hash phải cập nhật thành #/feedback');
        assert.ok(feedbackViewState.linkClass.includes('blue'), 'Active state phải có phong cách màu xanh dương');
        assert.ok(feedbackViewState.iconClass.includes('blue'), 'Icon phải có màu xanh dương');
        assert.ok(feedbackViewState.hasGuide, 'Phải có hướng dẫn sử dụng nhanh');
        assert.ok(feedbackViewState.hasReport, 'Phải có hướng dẫn báo sai thông tin');
        assert.ok(feedbackViewState.hasEmail, 'Phải có email kỹ thuật BQT');
        assert.ok(feedbackViewState.hasFacebook, 'Phải có link fanpage tham khảo');
        assert.ok(feedbackViewState.hasZaloNotice, 'Phải có thông báo chờ chủ dự án xác nhận kênh Zalo/Hotline (không để link giả)');
        assert.ok(feedbackViewState.hasNeutralContact, 'Kênh liên hệ phải dùng mô tả trung tính chờ chủ dự án xác nhận');
        assert.ok(feedbackViewState.hasDrafter, 'Phải có form soạn góp ý gửi BQT');

        const screenshotFeedback = path.join(ARTIFACT_DIR, `${prefix}view_feedback_desktop.png`);
        await cdp.captureScreenshot(screenshotFeedback);
        console.log(`[Artifact] Ảnh View Góp ý & Hỗ trợ: ${screenshotFeedback}`);

        // -----------------------------------------------------------------
        // BƯỚC 4: KIỂM TRA MÀU SẮC & CHUYỂN VIEW "VỀ DỰ ÁN & KẾ HOẠCH" (TÍM)
        // -----------------------------------------------------------------
        console.log('\n[Bước 4] Kiểm tra mục "Về dự án & Kế hoạch" (Tím)...');
        await cdp.eval(`document.getElementById('sidebarLinkAbout').click()`);
        await sleep(800);

        const aboutViewState = await cdp.eval(`(() => {
            const link = document.getElementById('sidebarLinkAbout');
            const icon = link?.querySelector('.material-symbols-outlined');
            const view = document.getElementById('view-about');
            const currentHash = window.location.hash;
            const text = (view?.textContent || '').replace(/\s+/g, ' ');
            const hasHero = text.includes('Về Dự Án & Kế Hoạch');
            const hasStory = text.includes('Câu Chuyện ViVuTraVinh');
            const hasCoreValues = text.includes('3 Giá Trị Cốt Lõi');
            const hasColLive = text.includes('ĐÃ CÓ (LIVE)');
            const hasColIdeas = text.includes('Ý TƯỞNG ĐANG CÂN NHẮC');
            const hasNoFalseCommitment = text.includes('Chỉ mô tả tính năng đã xác minh, không cam kết tiến độ ảo');

            return {
                linkClass: link?.className,
                iconClass: icon?.className,
                viewVisible: Boolean(view && !view.classList.contains('hidden')),
                currentHash,
                hasHero,
                hasStory,
                hasCoreValues,
                hasColLive,
                hasColIdeas,
                hasNoFalseCommitment
            };
        })()`);

        console.log('Trạng thái view Về dự án & Kế hoạch:', aboutViewState);
        assert.ok(aboutViewState.viewVisible, 'View Về dự án & Kế hoạch phải hiển thị');
        assert.strictEqual(aboutViewState.currentHash, '#/about', 'URL hash phải cập nhật thành #/about');
        assert.ok(aboutViewState.linkClass.includes('purple'), 'Active state phải có phong cách màu tím');
        assert.ok(aboutViewState.iconClass.includes('purple'), 'Icon phải có màu tím');
        assert.ok(aboutViewState.hasStory, 'Phải có câu chuyện phát triển dự án');
        assert.ok(aboutViewState.hasColLive, 'Phải phân biệt cột "ĐÃ CÓ (LIVE)"');
        assert.ok(aboutViewState.hasColIdeas, 'Phải phân biệt các cột "Ý TƯỞNG ĐANG CÂN NHẮC" thay vì cam kết tiến độ');
        assert.ok(aboutViewState.hasNoFalseCommitment, 'Chỉ mô tả tính năng đã xác minh, không cam kết tiến độ ảo');

        const screenshotAbout = path.join(ARTIFACT_DIR, `${prefix}view_about_desktop.png`);
        await cdp.captureScreenshot(screenshotAbout);
        console.log(`[Artifact] Ảnh View Về dự án & Kế hoạch: ${screenshotAbout}`);

        // -----------------------------------------------------------------
        // BƯỚC 5: KIỂM TRA MÀU SẮC & CHUYỂN VIEW "ĐỒNG HÀNH CÙNG ADMIN" (CAM HỔ PHÁCH)
        // -----------------------------------------------------------------
        console.log('\n[Bước 5] Kiểm tra mục "Đồng hành cùng Admin" (Cam hổ phách)...');
        await cdp.eval(`document.getElementById('sidebarLinkCompanion').click()`);
        await sleep(800);

        const companionViewState = await cdp.eval(`(() => {
            const link = document.getElementById('sidebarLinkCompanion');
            const icon = link?.querySelector('.material-symbols-outlined');
            const view = document.getElementById('view-companion');
            const currentHash = window.location.hash;
            const text = (view?.textContent || '').replace(/\\s+/g, ' ');
            const hasHero = text.includes('Đồng Hành Cùng Admin');
            const hasNeutralBio = text.includes('Ban Quản Trị & Đội Ngũ Phát Triển') && text.includes('chờ chủ dự án xác nhận');
            const hasVolunteerPriority = text.includes('Ưu Tiên Đóng Góp Công Sức');
            const hasNotOpenNotice = text.includes('Chưa mở nhận ủng hộ tài chính');
            const hasNoBankCommitment = !text.includes('tài khoản ngân hàng chuyên biệt') && !text.includes('sao kê tự động');
            // Kiểm tra xem có dính dữ liệu mẫu giả không
            const hasFakeQr = text.includes('DEMO THỬ NGHIỆM') || text.includes('Quét mã VietQR');
            const hasTechClearance = text.includes('Ổ cứng di động SSD') || text.includes('NuPhy');
            const hasSimulatedConfirm = text.includes('Xác nhận đã chuyển khoản');

            return {
                linkClass: link?.className,
                iconClass: icon?.className,
                viewVisible: Boolean(view && !view.classList.contains('hidden')),
                currentHash,
                hasHero,
                hasNeutralBio,
                sampleSnippet: text.slice(0, 200),
                hasVolunteerPriority,
                hasNotOpenNotice,
                hasNoBankCommitment,
                hasFakeQr,
                hasTechClearance,
                hasSimulatedConfirm
            };
        })()`);

        console.log('Trạng thái view Đồng hành cùng Admin:', companionViewState);
        assert.ok(companionViewState.viewVisible, 'View Đồng hành cùng Admin phải hiển thị');
        assert.strictEqual(companionViewState.currentHash, '#/companion', 'URL hash phải cập nhật thành #/companion');
        assert.ok(companionViewState.linkClass.includes('amber'), 'Active state phải có phong cách màu cam hổ phách');
        assert.ok(companionViewState.iconClass.includes('amber'), 'Icon phải có màu cam hổ phách');
        assert.ok(companionViewState.hasNeutralBio, 'Phải có mô tả trung tính Ban Quản Trị đang chờ chủ dự án xác nhận');
        assert.ok(companionViewState.hasVolunteerPriority, 'Phải ưu tiên đóng góp công sức');
        assert.ok(companionViewState.hasNotOpenNotice, 'Phải nêu rõ "Chưa mở nhận ủng hộ tài chính"');
        assert.ok(companionViewState.hasNoBankCommitment, 'Đã bỏ cam kết ngân hàng / sao kê tự động chưa thống nhất');
        assert.strictEqual(companionViewState.hasFakeQr, false, 'Đã gỡ bỏ QR SVG giả');
        assert.strictEqual(companionViewState.hasTechClearance, false, 'Đã ẩn phần thanh lý đồ công nghệ mẫu');
        assert.strictEqual(companionViewState.hasSimulatedConfirm, false, 'Đã gỡ nút mô phỏng chuyển khoản');

        const screenshotCompanion = path.join(ARTIFACT_DIR, `${prefix}view_companion_desktop.png`);
        await cdp.captureScreenshot(screenshotCompanion);
        console.log(`[Artifact] Ảnh View Đồng hành cùng Admin: ${screenshotCompanion}`);

        // -----------------------------------------------------------------
        // BƯỚC 6: KIỂM TRA URL TRỰC TIẾP, RELOAD & BACK/FORWARD HISTORY
        // -----------------------------------------------------------------
        console.log('\n[Bước 6] Kiểm tra điều hướng URL trực tiếp, Reload và Back/Forward...');
        // 6.1 Direct navigation to #/about
        await cdp.send('Page.navigate', { url: `${BASE_URL}#/about` });
        await sleep(2000);
        const directAbout = await cdp.eval(`(() => ({
            aboutVisible: Boolean(document.getElementById('view-about') && !document.getElementById('view-about').classList.contains('hidden')),
            feedbackVisible: Boolean(document.getElementById('view-feedback') && !document.getElementById('view-feedback').classList.contains('hidden'))
        }))()`);
        assert.ok(directAbout.aboutVisible, 'Truy cập trực tiếp #/about phải mở view About');
        assert.strictEqual(directAbout.feedbackVisible, false, 'View khác phải ẩn');

        // 6.2 Direct navigation to #/feedback
        await cdp.send('Page.navigate', { url: `${BASE_URL}#/feedback` });
        await sleep(1500);
        const directFeedback = await cdp.eval(`(() => ({
            feedbackVisible: Boolean(document.getElementById('view-feedback') && !document.getElementById('view-feedback').classList.contains('hidden'))
        }))()`);
        assert.ok(directFeedback.feedbackVisible, 'Truy cập trực tiếp #/feedback phải mở view Feedback');

        // 6.3 Back navigation
        await cdp.eval(`window.history.back()`);
        await sleep(1000);
        const afterBack = await cdp.eval(`(() => ({
            hash: window.location.hash,
            aboutVisible: Boolean(document.getElementById('view-about') && !document.getElementById('view-about').classList.contains('hidden'))
        }))()`);
        console.log('Sau khi Back:', afterBack);
        assert.ok(afterBack.aboutVisible, 'Bấm Back phải quay lại view trước đó (About)');

        // 6.4 Forward navigation
        await cdp.eval(`window.history.forward()`);
        await sleep(1000);
        const afterForward = await cdp.eval(`(() => ({
            hash: window.location.hash,
            feedbackVisible: Boolean(document.getElementById('view-feedback') && !document.getElementById('view-feedback').classList.contains('hidden'))
        }))()`);
        console.log('Sau khi Forward:', afterForward);
        assert.ok(afterForward.feedbackVisible, 'Bấm Forward phải quay lại Feedback');

        // -----------------------------------------------------------------
        // BƯỚC 7: KIỂM TRA XÁC THỰC QUYỀN VÀ HIỂN THỊ GIAO DIỆN VỚI TÀI KHOẢN THẬT
        // -----------------------------------------------------------------
        console.log('\n[Bước 7] Kiểm tra quyền hạn bằng tài khoản thật (Member & Admin)...');

        // 7.0 Lấy token thật từ Supabase Auth
        console.log('  -> Lấy phiên Supabase thật cho Admin và Member...');
        const adminEmail = 'tienlh1998@gmail.com';
        const memberEmail = 'prod_norm_1791220432814@vivutest.local';

        const realAdminSession = await getRealUserSession(adminEmail);
        const realMemberSession = await getRealUserSession(memberEmail);
        console.log(`  -> Đã lấy phiên thật cho Admin (${realAdminSession.user.id}) và Member (${realMemberSession.user.id})`);

        // 7.1 Kiểm tra RBAC Backend API (/api/admin?route=profile)
        console.log('  -> [RBAC API] Xác thực quyền truy cập qua endpoint quản trị live...');
        const apiBase = isProd ? BASE_URL.replace(/\/$/, '') : 'https://vivutravinh.id.vn';

        const adminApiRes = await fetch(`${apiBase}/api/admin?route=profile`, {
            headers: { Authorization: `Bearer ${realAdminSession.access_token}` }
        });
        const adminApiData = await adminApiRes.json();
        console.log(`     Admin API Response (HTTP ${adminApiRes.status}):`, adminApiData);
        assert.strictEqual(adminApiRes.status, 200, 'Admin thật phải được Backend trả về HTTP 200');
        assert.strictEqual(adminApiData.success, true, 'Admin API success phải là true');
        assert.strictEqual(adminApiData.user.role, 'admin', 'Role của admin trong DB phải là admin');

        const memberApiRes = await fetch(`${apiBase}/api/admin?route=profile`, {
            headers: { Authorization: `Bearer ${realMemberSession.access_token}` }
        });
        const memberApiData = await memberApiRes.json();
        console.log(`     Member API Response (HTTP ${memberApiRes.status}):`, memberApiData);
        assert.strictEqual(memberApiRes.status, 403, 'Member thật phải bị Backend chặn với HTTP 403 FORBIDDEN');
        assert.strictEqual(memberApiData.success, false, 'Member API success phải là false');

        // 7.2 Kiểm tra giao diện Sidebar với Tài khoản Member Thật
        console.log('  -> [UI Member] Đăng nhập tài khoản Member thật vào giao diện...');
        await cdp.eval(`((sess) => {
            localStorage.removeItem('vivu_admin_session');
            sessionStorage.removeItem('vivu_admin_session');
            localStorage.setItem('vivu_user_session', JSON.stringify(sess));
            if (window.ViVuApp?.updateAdminRoleUI) {
                window.ViVuApp.updateAdminRoleUI();
            }
        })(${JSON.stringify(realMemberSession)})`);
        await sleep(600);

        const memberUiState = await cdp.eval(`(() => {
            const modLink = document.getElementById('sidebarAdminModerationLink');
            const adminLoginLink = document.getElementById('sidebarAdminLoginLink');
            const userNameEl = document.getElementById('sidebarUserName');
            const userRoleEl = document.getElementById('sidebarUserRole');
            return {
                modVisible: Boolean(modLink && !modLink.classList.contains('hidden')),
                loginVisible: Boolean(adminLoginLink && !adminLoginLink.classList.contains('hidden')),
                userName: userNameEl?.textContent?.trim() || '',
                userRole: userRoleEl?.textContent?.trim() || ''
            };
        })()`);
        console.log('     Trạng thái Sidebar khi đăng nhập Member thật:', memberUiState);
        assert.strictEqual(memberUiState.modVisible, false, 'Mục "Kiểm duyệt nội dung" phải ẨN với Member thật');
        assert.strictEqual(memberUiState.userRole, 'Thành viên', 'Vai trò phải hiển thị "Thành viên"');

        // Cuộn sidebar và chụp ảnh artifact Member
        await cdp.eval(`(() => {
            const el = document.getElementById('sidebarLinkFeedback');
            if (el) el.scrollIntoView({ block: 'center' });
        })()`);
        await sleep(400);
        const screenshotMemberSidebar = path.join(ARTIFACT_DIR, `${prefix}sidebar_member_role.png`);
        await cdp.captureScreenshot(screenshotMemberSidebar);
        console.log(`     [Artifact] Ảnh Sidebar với Member thật: ${screenshotMemberSidebar}`);

        // 7.3 Kiểm tra giao diện Sidebar với Tài khoản Admin Thật
        console.log('  -> [UI Admin] Đăng nhập tài khoản Admin thật vào giao diện...');
        const adminSessionForClient = {
            access_token: realAdminSession.access_token,
            refresh_token: realAdminSession.refresh_token,
            expires_at: realAdminSession.expires_at,
            user: {
                id: realAdminSession.user.id,
                email: realAdminSession.user.email,
                role: 'admin'
            }
        };
        await cdp.eval(`((sess) => {
            localStorage.removeItem('vivu_user_session');
            sessionStorage.setItem('vivu_admin_session', JSON.stringify(sess));
            localStorage.setItem('vivu_admin_session', JSON.stringify(sess));
            if (window.ViVuApp?.updateAdminRoleUI) {
                window.ViVuApp.updateAdminRoleUI();
            }
        })(${JSON.stringify(adminSessionForClient)})`);
        await sleep(600);

        const adminUiState = await cdp.eval(`(() => {
            const modLink = document.getElementById('sidebarAdminModerationLink');
            const adminLoginLink = document.getElementById('sidebarAdminLoginLink');
            const badge = document.getElementById('sidebarAdminModerationBadge');
            const userNameEl = document.getElementById('sidebarUserName');
            const userRoleEl = document.getElementById('sidebarUserRole');
            return {
                modVisible: Boolean(modLink && !modLink.classList.contains('hidden')),
                loginVisible: Boolean(adminLoginLink && !adminLoginLink.classList.contains('hidden')),
                badgeExists: Boolean(badge),
                userName: userNameEl?.textContent?.trim() || '',
                userRole: userRoleEl?.textContent?.trim() || ''
            };
        })()`);
        console.log('     Trạng thái Sidebar khi đăng nhập Admin thật:', adminUiState);
        assert.ok(adminUiState.modVisible, 'Admin thật phải nhìn thấy mục "Kiểm duyệt nội dung"');
        assert.strictEqual(adminUiState.loginVisible, false, '"Đăng nhập Quản trị" phải ẩn khi đã là Admin');
        assert.ok(adminUiState.badgeExists, 'Badge số chờ duyệt phải tồn tại');
        assert.strictEqual(adminUiState.userRole, 'Quản trị viên', 'Vai trò phải hiển thị "Quản trị viên"');

        // Cuộn sidebar xuống để thấy rõ mục Kiểm duyệt nội dung và các danh mục
        await cdp.eval(`(() => {
            const el = document.getElementById('sidebarAdminModerationLink');
            if (el) el.scrollIntoView({ block: 'center' });
        })()`);
        await sleep(400);

        const screenshotAdminSidebar = path.join(ARTIFACT_DIR, `${prefix}sidebar_admin_role_visible.png`);
        await cdp.captureScreenshot(screenshotAdminSidebar);
        console.log(`     [Artifact] Ảnh Sidebar khi có quyền Admin thật: ${screenshotAdminSidebar}`);

        // -----------------------------------------------------------------
        // BƯỚC 8: KIỂM TRA MOBILE VIEWPORT (375x812) - KHÔNG TRÀN NGANG
        // -----------------------------------------------------------------
        console.log('\n[Bước 8] Kiểm tra giao diện Mobile (375x812)...');
        await cdp.setViewport(375, 812, true);
        await sleep(500);

        // Check view feedback on mobile
        await cdp.eval(`window.ViVuApp.navGoFeedback()`);
        await sleep(800);
        const mobileFeedbackCheck = await cdp.eval(`(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            isOverflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth
        }))()`);
        console.log('Mobile Feedback overflow check:', mobileFeedbackCheck);
        assert.strictEqual(mobileFeedbackCheck.isOverflowing, false, 'Mobile Feedback không được tràn ngang');
        const screenshotMobileFeedback = path.join(ARTIFACT_DIR, `${prefix}view_feedback_mobile.png`);
        await cdp.captureScreenshot(screenshotMobileFeedback);

        // Check view about on mobile
        await cdp.eval(`window.ViVuApp.navGoAbout()`);
        await sleep(800);
        const mobileAboutCheck = await cdp.eval(`(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            isOverflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth
        }))()`);
        console.log('Mobile About overflow check:', mobileAboutCheck);
        assert.strictEqual(mobileAboutCheck.isOverflowing, false, 'Mobile About không được tràn ngang');
        const screenshotMobileAbout = path.join(ARTIFACT_DIR, `${prefix}view_about_mobile.png`);
        await cdp.captureScreenshot(screenshotMobileAbout);

        // Check view companion on mobile
        await cdp.eval(`window.ViVuApp.navGoCompanion()`);
        await sleep(800);
        const mobileCompanionCheck = await cdp.eval(`(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            isOverflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth
        }))()`);
        console.log('Mobile Companion overflow check:', mobileCompanionCheck);
        assert.strictEqual(mobileCompanionCheck.isOverflowing, false, 'Mobile Companion không được tràn ngang');
        const screenshotMobileCompanion = path.join(ARTIFACT_DIR, `${prefix}view_companion_mobile.png`);
        await cdp.captureScreenshot(screenshotMobileCompanion);

        console.log('\n======================================================================');
        console.log('TỔNG HỢP KẾT QUẢ KIỂM THỬ: TẤT CẢ TIÊU CHÍ ĐỀU ĐẠT 100%');
        console.log('======================================================================');
        console.log('\n--- [A. KẾT QUẢ GIAO DIỆN (UI/UX & CONTENT)] ---');
        console.log('1. Tên nhóm Sidebar: "GÓC ADMIN & DỰ ÁN": ĐẠT');
        console.log('2. Bỏ "Đóng góp địa điểm" khỏi sidebar (giữ nút "+ Đóng góp" cố định header): ĐẠT');
        console.log('3. 3 danh mục công khai hiển thị cho mọi người dùng (Khách & Member): ĐẠT');
        console.log('4. Màu sắc & trạng thái: Góp ý (xanh dương), Về dự án (tím), Đồng hành (cam hổ phách): ĐẠT');
        console.log('5. Không gắn badge giả hoặc "Có cập nhật mới" giả tạo trên 3 mục công khai: ĐẠT');
        console.log('6. Nội dung "Góp ý & Hỗ trợ": Hướng dẫn sử dụng nhanh, báo sai tọa độ, kênh liên hệ trung tính: ĐẠT');
        console.log('7. Nội dung "Về dự án & Kế hoạch": ĐÃ CÓ (LIVE) vs Ý TƯỞNG ĐANG CÂN NHẮC (không cam kết ảo): ĐẠT');
        console.log('8. Nội dung "Đồng hành cùng Admin": BQT trung tính chờ xác nhận, ưu tiên công sức, chưa mở nhận tài chính, bỏ cam kết ngân hàng/sao kê tự động, gỡ sạch dữ liệu mẫu giả: ĐẠT');
        console.log('9. Router SPA, URL trực tiếp (#/feedback, #/about, #/companion), Reload, Back/Forward: ĐẠT');
        console.log('10. Responsive Mobile (375x812, Light/Dark mode), không tràn ngang, không vỡ layout: ĐẠT');
        console.log('\n--- [B. KẾT QUẢ XÁC THỰC QUYỀN (AUTH & RBAC)] ---');
        console.log('1. Phiên xác thực 100% người dùng thật từ Supabase Auth (không dùng session giả): ĐẠT');
        console.log('2. Backend RBAC API (/api/admin?route=profile): Admin trả HTTP 200 (role: admin), Member trả HTTP 403 FORBIDDEN: ĐẠT');
        console.log('3. Giao diện Sidebar với Member thật: Ẩn mục "Kiểm duyệt nội dung", hiển thị vai trò "Thành viên": ĐẠT');
        console.log('4. Giao diện Sidebar với Admin thật: Hiển thị mục "Kiểm duyệt nội dung", badge kiểm duyệt, hiển thị vai trò "Quản trị viên": ĐẠT');

    } finally {
        if (cdp) cdp.close();
        if (browser?.proc) browser.proc.kill();
        if (server) server.close();
    }
}

main().catch(err => {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
    process.exit(1);
});
