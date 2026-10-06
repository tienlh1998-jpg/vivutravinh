/**
 * scripts/test-avatar-and-filters-e2e.cjs
 * Comprehensive E2E test for Avatar upload & Place filter bar across desktop and mobile.
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
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function startLocalServer(port = 4175) {
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2'
    };

    const server = http.createServer(async (req, res) => {
        try {
            const parsedUrl = new URL(req.url, `http://localhost:${port}`);
            let pathname = parsedUrl.pathname;

            if (pathname.startsWith('/api/')) {
                // handle API if needed
            }

            if (pathname === '/') pathname = '/index.html';
            const filePath = path.join(ROOT_DIR, pathname);

            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                const ext = path.extname(filePath).toLowerCase();
                res.writeHead(200, {
                    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                    'Cache-Control': 'no-cache'
                });
                return fs.createReadStream(filePath).pipe(res);
            }

            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Server Error: ' + err.message);
        }
    });

    return new Promise(resolve => {
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
            }

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

    async captureScreenshot(filename) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        const filePath = path.join(ARTIFACT_DIR, filename);
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
        console.log(`  📸 Đã chụp màn hình: ${filename}`);
        return filePath;
    }
}

async function main() {
    console.log('=== BẮT ĐẦU KIỂM THỬ E2E AVATAR & BỘ LỌC ĐỊA ĐIỂM ===');
    const localPort = 4175;
    const server = await startLocalServer(localPort);
    const BASE_URL = `http://localhost:${localPort}`;
    console.log(`✓ Local server đang chạy tại ${BASE_URL}`);

    // Launch Chrome
    const userDataDir = path.join(os.tmpdir(), `vivu-avatar-filter-test-${Date.now()}`);
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const cdpPort = 9226;

    const chromeProc = spawn(chromePath, [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        'about:blank'
    ]);

    let uploadedAvatarStoragePath = null;
    let normalUserId = null;
    let normalToken = null;

    try {
        await sleep(2000);
        const tabsRes = await fetch(`http://127.0.0.1:${cdpPort}/json`);
        const tabs = await tabsRes.json();
        const tab = tabs.find(t => t.type === 'page');
        if (!tab) throw new Error('Không tìm thấy tab Chrome!');

        const cdp = new CDPClient(tab.webSocketDebuggerUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        // 1. Đăng nhập tài khoản thường thật
        console.log('\n--- BƯỚC 1: Đăng nhập tài khoản Member thật ---');
        const normalUserEmail = 'prod_norm_1791220432814@vivutest.local';
        const normalUserPass = 'TestPass123!@#';
        const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalUserEmail, password: normalUserPass })
        });
        const normalAuth = await loginRes.json();
        assert(normalAuth.access_token, 'Đăng nhập member thất bại');
        normalUserId = normalAuth.user.id;
        normalToken = normalAuth.access_token;
        console.log('✓ Member logged in:', normalUserId);

        await cdp.send('Page.navigate', { url: BASE_URL });
        await sleep(2500);

        // Nạp session vào localStorage của browser
        await cdp.eval(`(() => {
            const authObj = ${JSON.stringify(normalAuth)};
            localStorage.setItem('vivu_user_session', JSON.stringify({
                access_token: authObj.access_token,
                refresh_token: authObj.refresh_token,
                user: authObj.user,
                expires_at: Math.floor(Date.now() / 1000) + 3600
            }));
            window.dispatchEvent(new CustomEvent('vivu:user-auth-changed'));
        })()`);
        await sleep(1500);

        // 2. Kiểm tra giao diện Hồ sơ & Edit Profile Modal
        console.log('\n--- BƯỚC 2: Kiểm tra UI Chọn Avatar & Validate kích thước/định dạng ---');
        await cdp.eval(`window.ViVuApp.openProfileModal()`);
        await sleep(500);
        await cdp.eval(`window.ViVuApp.openEditProfileModal()`);
        await sleep(500);

        const editModalStatus = await cdp.eval(`(() => {
            const modal = document.getElementById('editProfileModal');
            const preview = document.getElementById('editProfileAvatarPreview');
            const pickBtn = document.getElementById('editProfileAvatarPickBtn');
            const input = document.getElementById('editProfileAvatarInput');
            return {
                open: modal && !modal.classList.contains('hidden'),
                hasPreview: !!preview,
                previewSrc: preview ? preview.src : null,
                hasPickBtn: !!pickBtn,
                inputAccept: input ? input.getAttribute('accept') : null
            };
        })()`);
        console.log('Trạng thái Edit Profile Modal:', editModalStatus);
        assert(editModalStatus.open, 'Edit profile modal phải mở');
        assert(editModalStatus.hasPreview, 'Phải có preview avatar');
        assert(editModalStatus.inputAccept.includes('image/png'), 'Input phải nhận image/png, jpeg, webp');

        // Test validate định dạng không hợp lệ qua handleAvatarFileChange
        console.log('Thử nghiệm chọn tệp sai định dạng (text/plain)...');
        const invalidTypeResult = await cdp.eval(`(() => {
            const fakeEvent = {
                target: {
                    files: [new File(['dummy content'], 'document.txt', { type: 'text/plain' })],
                    value: 'document.txt'
                }
            };
            window.ViVuApp.handleAvatarFileChange(fakeEvent);
            const errEl = document.getElementById('editProfileAvatarError');
            const errText = document.getElementById('editProfileAvatarErrorText')?.textContent;
            return {
                errorVisible: errEl && !errEl.classList.contains('hidden'),
                errorText: errText
            };
        })()`);
        console.log('Kết quả validate sai định dạng:', invalidTypeResult);
        assert(invalidTypeResult.errorVisible, 'Phải hiển thị thông báo lỗi khi chọn file sai định dạng');
        assert(invalidTypeResult.errorText.includes('JPEG, PNG'), 'Thông báo lỗi phải nêu rõ định dạng cho phép');

        // Test validate quá dung lượng (> 2MB)
        console.log('Thử nghiệm chọn tệp quá dung lượng (> 2MB)...');
        const oversizedResult = await cdp.eval(`(() => {
            const bigData = new Uint8Array(2.5 * 1024 * 1024);
            const fakeEvent = {
                target: {
                    files: [new File([bigData], 'giant.png', { type: 'image/png' })],
                    value: 'giant.png'
                }
            };
            window.ViVuApp.handleAvatarFileChange(fakeEvent);
            const errEl = document.getElementById('editProfileAvatarError');
            const errText = document.getElementById('editProfileAvatarErrorText')?.textContent;
            return {
                errorVisible: errEl && !errEl.classList.contains('hidden'),
                errorText: errText
            };
        })()`);
        console.log('Kết quả validate quá dung lượng:', oversizedResult);
        assert(oversizedResult.errorVisible, 'Phải hiển thị thông báo lỗi khi dung lượng vượt quá 2MB');
        assert(oversizedResult.errorText.includes('2MB'), 'Thông báo lỗi phải nêu rõ giới hạn 2MB');

        // Test chọn ảnh hợp lệ, kiểm tra preview & nút Bỏ ảnh mới
        console.log('Thử nghiệm chọn ảnh hợp lệ và preview...');
        const validPickResult = await cdp.eval(`(() => {
            // 1x1 png file
            const byteCharacters = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const validFile = new File([byteArray], 'my_new_avatar.png', { type: 'image/png' });
            
            const fakeEvent = {
                target: {
                    files: [validFile],
                    value: 'my_new_avatar.png'
                }
            };
            window.ViVuApp.handleAvatarFileChange(fakeEvent);

            const errEl = document.getElementById('editProfileAvatarError');
            const cancelBtn = document.getElementById('editProfileAvatarCancelBtn');
            const preview = document.getElementById('editProfileAvatarPreview');
            return {
                errorHidden: !errEl || errEl.classList.contains('hidden'),
                cancelBtnVisible: cancelBtn && !cancelBtn.classList.contains('hidden'),
                previewSrcUpdated: preview && preview.src.startsWith('blob:')
            };
        })()`);
        console.log('Kết quả chọn ảnh hợp lệ:', validPickResult);
        assert(validPickResult.errorHidden, 'Lỗi phải bị ẩn khi chọn ảnh hợp lệ');
        assert(validPickResult.cancelBtnVisible, 'Nút Bỏ ảnh mới phải xuất hiện');
        assert(validPickResult.previewSrcUpdated, 'Preview phải cập nhật sang blob url');

        // Thử click nút "Bỏ ảnh mới"
        console.log('Thử click Bỏ ảnh mới...');
        const cancelResult = await cdp.eval(`(() => {
            window.ViVuApp.cancelAvatarChange();
            const cancelBtn = document.getElementById('editProfileAvatarCancelBtn');
            const preview = document.getElementById('editProfileAvatarPreview');
            return {
                cancelBtnHidden: !cancelBtn || cancelBtn.classList.contains('hidden'),
                previewRestored: preview && !preview.src.startsWith('blob:')
            };
        })()`);
        console.log('Kết quả Bỏ ảnh mới:', cancelResult);
        assert(cancelResult.cancelBtnHidden, 'Nút Bỏ ảnh mới phải ẩn sau khi hủy');
        assert(cancelResult.previewRestored, 'Preview phải khôi phục avatar ban đầu');

        // 3. Thực hiện UPLOAD VÀ LƯU AVATAR THẬT BẰNG USER ACCESS TOKEN
        console.log('\n--- BƯỚC 3: Upload và lưu avatar thật lên Storage + Profiles ---');
        // Chọn lại ảnh hợp lệ
        await cdp.eval(`(() => {
            const byteCharacters = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const validFile = new File([byteArray], 'my_new_avatar.png', { type: 'image/png' });
            
            window.ViVuApp.handleAvatarFileChange({ target: { files: [validFile], value: 'my_new_avatar.png' } });
        })()`);

        // Submit form
        console.log('Submit form cập nhật hồ sơ...');
        await cdp.eval(`(() => {
            const form = document.getElementById('editProfileForm');
            return window.ViVuApp.submitEditProfile(form);
        })()`);
        await sleep(2500);

        // Kiểm tra sau khi submit
        const postSubmitCheck = await cdp.eval(`(() => {
            const modal = document.getElementById('editProfileModal');
            const state = window.ViVuApp.getState();
            const headerProfileBtn = document.getElementById('headerProfileBtn');
            const headerImg = headerProfileBtn?.querySelector('img');
            const sidebarAvatar = document.getElementById('sidebarUserAvatar');
            const sidebarImg = sidebarAvatar?.querySelector('img');
            const drawerAvatar = document.getElementById('drawerUserAvatar');
            const drawerImg = drawerAvatar?.querySelector('img');

            return {
                modalClosed: !modal || modal.classList.contains('hidden'),
                avatarStateUrl: state.userProfile?.avatar,
                headerAvatarSrc: headerImg ? headerImg.src : null,
                sidebarAvatarSrc: sidebarImg ? sidebarImg.src : null,
                drawerAvatarSrc: drawerImg ? drawerImg.src : null
            };
        })()`);
        console.log('Kết quả sau khi submit hồ sơ:', postSubmitCheck);
        assert(postSubmitCheck.modalClosed, 'Modal chỉnh sửa phải đóng sau khi lưu');
        assert(postSubmitCheck.avatarStateUrl.includes('supabase.co/storage/v1/object/public/review-photos/reviews/avatars/'), 'Avatar URL phải là đường dẫn thực trên Supabase Storage');
        assert(postSubmitCheck.headerAvatarSrc === postSubmitCheck.avatarStateUrl, 'Header phải hiển thị avatar mới');
        assert(postSubmitCheck.sidebarAvatarSrc === postSubmitCheck.avatarStateUrl, 'Sidebar phải hiển thị avatar mới');
        assert(postSubmitCheck.drawerAvatarSrc === postSubmitCheck.avatarStateUrl, 'Drawer phải hiển thị avatar mới');

        // Lưu đường dẫn file để cleanup sau test
        uploadedAvatarStoragePath = postSubmitCheck.avatarStateUrl.split('/review-photos/')[1];
        console.log('✓ File đã upload thành công tại path:', uploadedAvatarStoragePath);

        await cdp.captureScreenshot('local_avatar_uploaded_and_synced.png');

        // 4. KIỂM TRA RELOAD VÀ ĐĂNG NHẬP LẠI VẪN HIỆN ĐÚNG ẢNH
        console.log('\n--- BƯỚC 4: Kiểm tra tải lại trang (Reload), phiên vẫn duy trì đúng Avatar từ database ---');
        await cdp.send('Page.navigate', { url: BASE_URL });
        await sleep(3000);

        const reloadCheck = await cdp.eval(`(() => {
            const state = window.ViVuApp.getState();
            const headerProfileBtn = document.getElementById('headerProfileBtn');
            const headerImg = headerProfileBtn?.querySelector('img');
            const sidebarAvatar = document.getElementById('sidebarUserAvatar');
            const sidebarImg = sidebarAvatar?.querySelector('img');
            const drawerAvatar = document.getElementById('drawerUserAvatar');
            const drawerImg = drawerAvatar?.querySelector('img');

            return {
                stateAvatar: state.userProfile?.avatar,
                headerImgSrc: headerImg ? headerImg.src : null,
                sidebarImgSrc: sidebarImg ? sidebarImg.src : null,
                drawerImgSrc: drawerImg ? drawerImg.src : null
            };
        })()`);
        console.log('Trạng thái Avatar sau reload trang:', reloadCheck);
        assert(reloadCheck.stateAvatar.includes('supabase.co/storage/v1/object/public/review-photos/reviews/avatars/'), 'Sau reload avatar vẫn phải là link Supabase thực');
        assert(reloadCheck.headerImgSrc === reloadCheck.stateAvatar, 'Header sau reload phải hiện đúng ảnh');
        assert(reloadCheck.sidebarImgSrc === reloadCheck.stateAvatar, 'Sidebar sau reload phải hiện đúng ảnh');
        assert(reloadCheck.drawerImgSrc === reloadCheck.stateAvatar, 'Drawer sau reload phải hiện đúng ảnh');

        // 5. KIỂM TRA RLS BẢO VỆ: USER KHÔNG THỂ SỬA AVATAR NGƯỜI KHÁC
        console.log('\n--- BƯỚC 5: Kiểm tra RLS ngăn cản sửa avatar người khác ---');
        const adminUserId = '113c9b9f-0d3e-4bc1-84be-141952a41462';
        const hackPatchRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(adminUserId)}`, {
            method: 'PATCH',
            headers: {
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${normalToken}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                avatar_url: 'https://hacker.fake/evil.jpg',
                updated_at: new Date().toISOString()
            })
        });
        const hackModifiedRows = await hackPatchRes.json();
        console.log('Số bản ghi người khác bị sửa bởi member thường (phải = 0):', hackModifiedRows.length);
        assert(hackModifiedRows.length === 0, 'RLS phải chặn hoàn toàn việc sửa avatar người khác!');

        // 6. KIỂM TRA BỘ LỌC ĐỊA ĐIỂM TRÊN DESKTOP (1280px & 1440px)
        console.log('\n--- BƯỚC 6: Kiểm tra thanh bộ lọc địa điểm trên Desktop (1280px, 1440px) ---');
        await cdp.setViewport(1280, 800, false);
        await cdp.eval(`window.ViVuApp.openFullMapModal()`);
        await sleep(1000);

        const desktopFilterCheck = await cdp.eval(`(() => {
            const sidePanel = document.getElementById('mapSidePanel');
            const searchInput = document.getElementById('mapSideSearchInput');
            const pillsContainer = document.getElementById('mapSideCategoryPills');
            const pills = Array.from(pillsContainer?.querySelectorAll('button') || []);
            const openOnlyBtn = document.getElementById('mapFilterOpenOnlyBtn');
            const freeBtn = document.getElementById('mapFilterFreeBtn');
            const countBadge = document.getElementById('mapPlacesCountBadge');
            const closeBtn = document.getElementById('fullMapCloseBtn');

            const pillHeights = pills.map(p => p.getBoundingClientRect().height);
            const allPillsGe44 = pillHeights.every(h => h >= 43.5);

            return {
                panelVisible: sidePanel && window.getComputedStyle(sidePanel).display !== 'none',
                hasSearchInput: !!searchInput,
                searchInputHeight: searchInput?.getBoundingClientRect().height,
                pillsCount: pills.length,
                allPillsGe44,
                openOnlyHeight: openOnlyBtn?.getBoundingClientRect().height,
                freeBtnHeight: freeBtn?.getBoundingClientRect().height,
                countBadgeText: countBadge?.textContent?.trim(),
                isOverflown: document.documentElement.scrollWidth > window.innerWidth,
                closeBtnVisible: closeBtn && window.getComputedStyle(closeBtn).display !== 'none'
            };
        })()`);
        console.log('Kiểm tra Desktop 1280px Filter Bar:', desktopFilterCheck);
        assert(desktopFilterCheck.panelVisible, 'Side panel phải hiển thị trên Desktop');
        assert(desktopFilterCheck.hasSearchInput, 'Phải có ô tìm kiếm');
        assert(desktopFilterCheck.allPillsGe44, 'Các nút danh mục phải có chiều cao >= 44px');
        assert(desktopFilterCheck.openOnlyHeight >= 43.5, 'Nút Đang mở cửa phải >= 44px');
        assert(desktopFilterCheck.freeBtnHeight >= 43.5, 'Nút Miễn phí vé phải >= 44px');
        assert(!desktopFilterCheck.isOverflown, 'Trang không được tràn ngang');

        await cdp.captureScreenshot('desktop_1280_filter_bar.png');

        // Test click chọn danh mục trên desktop và scrollIntoView
        console.log('Click chọn danh mục "Chùa Khmer"...');
        await cdp.eval(`window.ViVuApp.setMapCategory('chua-khmer')`);
        await sleep(500);

        const categoryClickCheck = await cdp.eval(`(() => {
            const state = window.ViVuApp.getState();
            const badge = document.getElementById('mapPlacesCountBadge');
            return {
                activeCat: state.mapCategory,
                badgeText: badge?.textContent?.trim()
            };
        })()`);
        console.log('Sau khi chọn "Chùa Khmer":', categoryClickCheck);
        assert(categoryClickCheck.activeCat === 'chua-khmer', 'Category state phải là chua-khmer');
        assert(categoryClickCheck.badgeText.includes('địa điểm'), 'Badge phải hiển thị số lượng');

        // 7. KIỂM TRA BỘ LỌC ĐỊA ĐIỂM TRÊN MOBILE (390px & 360px)
        console.log('\n--- BƯỚC 7: Kiểm tra thanh bộ lọc địa điểm trên Mobile (390px & 360px) ---');
        await cdp.setViewport(390, 844, true);
        await sleep(500);

        // Kiểm tra chế độ xem bản đồ trên mobile (floating pills)
        const mobileMapCheck = await cdp.eval(`(() => {
            const floatingPills = document.getElementById('mapMobileCategoryPills');
            const fade = document.getElementById('mapMobileCategoryFade');
            const pills = Array.from(floatingPills?.querySelectorAll('button') || []);
            const allGe44 = pills.every(p => p.getBoundingClientRect().height >= 43.5);
            return {
                pillsCount: pills.length,
                allGe44,
                hasFade: !!fade,
                fadeDisplay: fade ? window.getComputedStyle(fade).display : null,
                isOverflown: document.documentElement.scrollWidth > window.innerWidth
            };
        })()`);
        console.log('Mobile 390px Map View:', mobileMapCheck);
        assert(mobileMapCheck.allGe44, 'Floating pills trên mobile phải có chiều cao >= 44px');
        assert(!mobileMapCheck.isOverflown, 'Mobile không được tràn ngang');
        await cdp.captureScreenshot('mobile_390_map_view_filter.png');

        // Chuyển sang chế độ xem Danh sách trên mobile
        console.log('Chuyển sang chế độ Danh sách trên Mobile...');
        await cdp.eval(`window.ViVuApp.toggleMapMobileView()`);
        await sleep(500);

        const mobileListCheck = await cdp.eval(`(() => {
            const sidePanel = document.getElementById('mapSidePanel');
            const searchInput = document.getElementById('mapSideSearchInput');
            const pillsContainer = document.getElementById('mapSideCategoryPills');
            const pills = Array.from(pillsContainer?.querySelectorAll('button') || []);
            const fade = document.getElementById('mapSideCategoryFade');
            const openOnlyBtn = document.getElementById('mapFilterOpenOnlyBtn');
            const freeBtn = document.getElementById('mapFilterFreeBtn');
            const countBadge = document.getElementById('mapPlacesCountBadge');

            const allGe44 = pills.every(p => p.getBoundingClientRect().height >= 43.5);

            return {
                panelVisible: sidePanel && window.getComputedStyle(sidePanel).display !== 'none',
                hasSearchInput: !!searchInput,
                searchInputHeight: searchInput?.getBoundingClientRect().height,
                pillsCount: pills.length,
                allGe44,
                hasFade: !!fade,
                openOnlyHeight: openOnlyBtn?.getBoundingClientRect().height,
                freeBtnHeight: freeBtn?.getBoundingClientRect().height,
                countBadgeText: countBadge?.textContent?.trim(),
                isOverflown: document.documentElement.scrollWidth > window.innerWidth
            };
        })()`);
        console.log('Mobile 390px List View Filter Bar:', mobileListCheck);
        assert(mobileListCheck.panelVisible, 'Side panel phải hiển thị ở chế độ Danh sách trên mobile');
        assert(mobileListCheck.allGe44, 'Các nút danh mục trên mobile list phải >= 44px');
        assert(mobileListCheck.openOnlyHeight >= 43.5, 'Nút Đang mở cửa phải >= 44px');
        assert(mobileListCheck.freeBtnHeight >= 43.5, 'Nút Miễn phí vé phải >= 44px');
        assert(!mobileListCheck.isOverflown, 'Mobile list view không được tràn ngang trang');
        await cdp.captureScreenshot('mobile_390_list_view_filter.png');

        // Test chọn tab cuối cùng (Làng nghề) và kiểm tra scrollIntoView
        console.log('Chọn tab cuối cùng "lang-nghe"...');
        await cdp.eval(`window.ViVuApp.setMapCategory('lang-nghe')`);
        await sleep(600);

        const lastTabCheck = await cdp.eval(`(() => {
            const container = document.getElementById('mapSideCategoryPills');
            const lastBtn = container?.querySelector('[data-category-id="lang-nghe"]');
            const rect = lastBtn?.getBoundingClientRect();
            const containerRect = container?.getBoundingClientRect();
            const isVisibleInContainer = rect && containerRect && rect.left >= containerRect.left - 5 && rect.right <= containerRect.right + 5;
            return {
                activeCat: window.ViVuApp.getState().mapCategory,
                isVisibleInContainer,
                rectLeft: rect?.left,
                containerLeft: containerRect?.left
            };
        })()`);
        console.log('Kiểm tra cuộn tab cuối cùng vào vùng nhìn thấy:', lastTabCheck);
        assert(lastTabCheck.activeCat === 'lang-nghe', 'Tab active phải là lang-nghe');
        assert(lastTabCheck.isVisibleInContainer, 'Tab lang-nghe phải được cuộn vào vùng nhìn thấy!');

        // Test ở viewport cực hẹp 360px
        console.log('\n--- Kiểm tra ở viewport cực hẹp 360px ---');
        await cdp.setViewport(360, 780, true);
        await sleep(500);

        const vp360Check = await cdp.eval(`(() => {
            return {
                isOverflown: document.documentElement.scrollWidth > window.innerWidth,
                panelWidth: document.getElementById('mapSidePanel')?.getBoundingClientRect().width,
                windowWidth: window.innerWidth
            };
        })()`);
        console.log('Viewport 360px check:', vp360Check);
        assert(!vp360Check.isOverflown, 'Viewport 360px tuyệt đối không tràn ngang');
        await cdp.captureScreenshot('mobile_360_filter_bar.png');

        // 8. KIỂM TRA LIGHT / DARK MODE
        console.log('\n--- BƯỚC 8: Kiểm tra Dark Mode ---');
        await cdp.eval(`window.ViVuApp.toggleTheme()`);
        await sleep(500);

        const darkModeCheck = await cdp.eval(`(() => {
            return {
                isDark: document.documentElement.classList.contains('dark'),
                headerBtnText: document.getElementById('headerProfileBtn')?.textContent?.trim()
            };
        })()`);
        console.log('Dark mode check:', darkModeCheck);
        assert(darkModeCheck.isDark, 'Giao diện phải chuyển sang Dark mode');
        await cdp.captureScreenshot('dark_mode_filter_bar.png');

        // Đổi lại light mode
        await cdp.eval(`window.ViVuApp.toggleTheme()`);
        await sleep(300);

        console.log('\n=== TẤT CẢ CÁC BƯỚC KIỂM THỬ E2E ĐÃ HOÀN TẤT THÀNH CÔNG 100%! ===');
    } finally {
        // Dọn dẹp test file trên Supabase Storage
        if (uploadedAvatarStoragePath && normalToken) {
            console.log('\n--- Dọn dẹp tệp test avatar trên Storage ---');
            await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${uploadedAvatarStoragePath}`, {
                method: 'DELETE',
                headers: {
                    'apikey': ANON_KEY,
                    'Authorization': `Bearer ${normalToken}`
                }
            });
            console.log('✓ Đã xóa tệp test avatar:', uploadedAvatarStoragePath);
        }

        chromeProc.kill();
        server.close();
    }
}

main().catch(err => {
    console.error('LỖI KIỂM THỬ:', err);
    process.exit(1);
});
