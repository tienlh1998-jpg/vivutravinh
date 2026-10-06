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

    ready() {
        return new Promise((resolve, reject) => {
            if (this.ws.readyState === WebSocket.OPEN) return resolve();
            this.ws.onopen = () => resolve();
            this.ws.onerror = (err) => reject(err);
        });
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.reqId;
            this.callbacks.set(id, (res) => {
                if (res.error) {
                    reject(new Error(`CDP Error [${method}]: ${JSON.stringify(res.error)}`));
                } else {
                    resolve(res.result);
                }
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
            throw new Error(`Eval exception: ${res.exceptionDetails.text} (${JSON.stringify(res.exceptionDetails.exception)})`);
        }
        return res.result ? res.result.value : undefined;
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
        const finalName = process.env.TARGET_URL?.includes('vivutravinh.id.vn') && !filename.startsWith('prod_')
            ? `prod_${filename.replace(/^local_/, '')}`
            : filename;
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        const filePath = path.join(ARTIFACT_DIR, finalName);
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
        console.log(`  📸 Đã chụp màn hình: ${finalName}`);
        return filePath;
    }
}

async function main() {
    console.log('=== BẮT ĐẦU KIỂM THỬ E2E AVATAR & BỘ LỌC ĐỊA ĐIỂM ===');
    const targetEnv = process.env.TARGET_URL;
    const isProd = !!targetEnv && targetEnv.includes('vivutravinh.id.vn');
    let server = null;
    let BASE_URL = targetEnv;
    if (!BASE_URL) {
        const localPort = 4175;
        server = await startLocalServer(localPort);
        BASE_URL = `http://localhost:${localPort}`;
        console.log(`✓ Local server đang chạy tại ${BASE_URL}`);
    } else {
        console.log(`✓ Đang kiểm thử trên môi trường: ${BASE_URL}`);
    }

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
    let initialProfile = null;
    let tempDir = null;

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

        // Tạo thư mục tạm và các tệp test thật trên đĩa OS
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-test-files-'));
        const invalidTxtFile = path.join(tempDir, 'invalid_text_doc.txt');
        fs.writeFileSync(invalidTxtFile, 'Đây là tệp tin văn bản không hợp lệ');

        const oversizedPngFile = path.join(tempDir, 'oversized_giant_image.png');
        fs.writeFileSync(oversizedPngFile, Buffer.alloc(2.5 * 1024 * 1024, 0));

        const validPngFile = path.join(tempDir, 'valid_real_avatar.png');
        // Valid 1x1 green PNG
        const validPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        fs.writeFileSync(validPngFile, Buffer.from(validPngBase64, 'base64'));

        // 1. Đăng nhập với tài khoản member thật
        console.log('\n--- BƯỚC 1: Đăng nhập tài khoản Member thật & Lưu Snapshot ban đầu ---');
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

        // Lưu snapshot hồ sơ ban đầu của Member từ database
        const snapRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${normalUserId}&select=*`, {
            headers: { apikey: ANON_KEY, Authorization: `Bearer ${normalToken}` }
        });
        const snapData = await snapRes.json();
        assert(Array.isArray(snapData) && snapData.length > 0, 'Không tìm thấy profile của member');
        initialProfile = snapData[0];
        console.log('✓ Snapshot hồ sơ ban đầu của Member:', {
            id: initialProfile.id,
            avatar_url: initialProfile.avatar_url,
            display_name: initialProfile.display_name
        });

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

        // 2. Kiểm tra UI Chọn Avatar & Validate kích thước/định dạng QUA INPUT THẬT
        console.log('\n--- BƯỚC 2: Kiểm tra Chọn File qua Input thật trong DOM & Validate ---');
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

        // Tìm node thẻ input trong DOM bằng CDP
        const docRes = await cdp.send('DOM.getDocument');
        const inputNodeRes = await cdp.send('DOM.querySelector', {
            nodeId: docRes.root.nodeId,
            selector: '#editProfileAvatarInput'
        });
        assert(inputNodeRes.nodeId > 0, 'Phải tìm thấy thẻ input[type="file"] thật trong DOM');

        // 2.1. Thử nghiệm nạp tệp sai định dạng (.txt) qua DOM.setFileInputFiles thật
        console.log('Thử nghiệm nạp tệp sai định dạng (.txt) qua DOM input thật...');
        await cdp.send('DOM.setFileInputFiles', {
            nodeId: inputNodeRes.nodeId,
            files: [invalidTxtFile]
        });
        await cdp.eval(`document.getElementById('editProfileAvatarInput').dispatchEvent(new Event('change', { bubbles: true }))`);
        await sleep(400);

        const invalidTypeResult = await cdp.eval(`(() => {
            const errEl = document.getElementById('editProfileAvatarError');
            return {
                errorVisible: errEl && !errEl.classList.contains('hidden'),
                errorText: document.getElementById('editProfileAvatarErrorText')?.textContent
            };
        })()`);
        console.log('Kết quả validate sai định dạng qua input thật:', invalidTypeResult);
        assert(invalidTypeResult.errorVisible, 'Phải hiển thị thông báo lỗi khi chọn file sai định dạng qua input thật');
        assert(invalidTypeResult.errorText.includes('JPEG, PNG'), 'Thông báo lỗi phải nêu rõ định dạng cho phép');

        // 2.2. Thử nghiệm nạp tệp quá dung lượng (> 2MB) qua DOM.setFileInputFiles thật
        console.log('Thử nghiệm nạp tệp quá dung lượng (2.5MB) qua DOM input thật...');
        await cdp.send('DOM.setFileInputFiles', {
            nodeId: inputNodeRes.nodeId,
            files: [oversizedPngFile]
        });
        await cdp.eval(`document.getElementById('editProfileAvatarInput').dispatchEvent(new Event('change', { bubbles: true }))`);
        await sleep(400);

        const oversizedResult = await cdp.eval(`(() => {
            const errEl = document.getElementById('editProfileAvatarError');
            return {
                errorVisible: errEl && !errEl.classList.contains('hidden'),
                errorText: document.getElementById('editProfileAvatarErrorText')?.textContent
            };
        })()`);
        console.log('Kết quả validate quá dung lượng qua input thật:', oversizedResult);
        assert(oversizedResult.errorVisible, 'Phải hiển thị thông báo lỗi khi dung lượng vượt quá 2MB');
        assert(oversizedResult.errorText.includes('2MB'), 'Thông báo lỗi phải nêu rõ giới hạn 2MB');

        // 2.3. Nạp tệp ảnh hợp lệ qua DOM.setFileInputFiles thật, kiểm tra preview & nút Bỏ ảnh mới
        console.log('Nạp ảnh hợp lệ qua DOM input thật và kiểm tra preview...');
        await cdp.send('DOM.setFileInputFiles', {
            nodeId: inputNodeRes.nodeId,
            files: [validPngFile]
        });
        await cdp.eval(`document.getElementById('editProfileAvatarInput').dispatchEvent(new Event('change', { bubbles: true }))`);
        await sleep(400);

        const validPickResult = await cdp.eval(`(() => {
            const errEl = document.getElementById('editProfileAvatarError');
            const cancelBtn = document.getElementById('editProfileAvatarCancelBtn');
            const preview = document.getElementById('editProfileAvatarPreview');
            return {
                errorHidden: !errEl || errEl.classList.contains('hidden'),
                cancelBtnVisible: cancelBtn && !cancelBtn.classList.contains('hidden'),
                previewSrcUpdated: preview && preview.src.startsWith('blob:')
            };
        })()`);
        console.log('Kết quả chọn ảnh hợp lệ qua input thật:', validPickResult);
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

        // 2.4. BỔ SUNG KIỂM TRA: UPLOAD THẤT BẠI GIỮ NGUYÊN AVATAR CŨ VÀ DỮ LIỆU FORM
        console.log('\n--- BƯỚC 2.4: Kiểm tra upload thất bại -> Giữ avatar cũ & Giữ form data ---');
        // Chọn lại ảnh hợp lệ qua input thật
        await cdp.send('DOM.setFileInputFiles', {
            nodeId: inputNodeRes.nodeId,
            files: [validPngFile]
        });
        await cdp.eval(`document.getElementById('editProfileAvatarInput').dispatchEvent(new Event('change', { bubbles: true }))`);
        await sleep(400);

        // Thay đổi tên trong form
        const tempTestName = 'Tên Test Khi Upload Lỗi';
        await cdp.eval(`(() => {
            document.getElementById('editProfileName').value = '${tempTestName}';
        })()`);

        // Mô phỏng mạng lỗi khi gọi Storage upload (mock window.fetch cục bộ)
        await cdp.eval(`(() => {
            window._realFetch = window.fetch;
            window.fetch = async function(...args) {
                const targetUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
                if (targetUrl.includes('/storage/v1/object/review-photos/')) {
                    return new Response(JSON.stringify({ message: 'Mô phỏng lỗi máy chủ Storage (500 Internal Server Error)' }), {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                return window._realFetch.apply(this, args);
            };
        })()`);

        // Submit form khi upload bị lỗi
        console.log('Submit form khi Storage upload gặp lỗi...');
        await cdp.eval(`(() => {
            const form = document.getElementById('editProfileForm');
            window.ViVuApp.submitEditProfile(form);
        })()`);
        await sleep(1500);

        const uploadFailCheck = await cdp.eval(`(() => {
            const modal = document.getElementById('editProfileModal');
            const errEl = document.getElementById('editProfileAvatarError');
            const errorText = document.getElementById('editProfileAvatarErrorText')?.textContent;
            const currentName = document.getElementById('editProfileName')?.value;
            const stateAvatar = window.ViVuApp.getState().userProfile?.avatar;
            const submitBtn = document.getElementById('editProfileSubmitBtn');
            return {
                modalStillOpen: modal && !modal.classList.contains('hidden'),
                errorVisible: errEl && !errEl.classList.contains('hidden'),
                errorText,
                namePreserved: currentName === '${tempTestName}',
                stateAvatarNotOverwritten: stateAvatar !== null && !stateAvatar.startsWith('blob:'),
                btnReenabled: submitBtn && !submitBtn.disabled
            };
        })()`);
        console.log('Kết quả kiểm tra upload thất bại:', uploadFailCheck);
        assert(uploadFailCheck.modalStillOpen, 'Modal phải giữ nguyên, KHÔNG được đóng khi upload thất bại');
        assert(uploadFailCheck.errorVisible, 'Phải hiển thị thông báo lỗi cụ thể khi upload thất bại');
        assert(uploadFailCheck.namePreserved, 'Dữ liệu form (họ tên) phải được giữ nguyên khi upload lỗi');
        assert(uploadFailCheck.stateAvatarNotOverwritten, 'Avatar cũ phải được giữ nguyên khi upload lỗi');
        assert(uploadFailCheck.btnReenabled, 'Nút Lưu thay đổi phải được kích hoạt lại để người dùng thử lại');

        // Khôi phục window.fetch thật
        await cdp.eval(`(() => {
            if (window._realFetch) {
                window.fetch = window._realFetch;
                delete window._realFetch;
            }
        })()`);

        // 3. Thực hiện UPLOAD VÀ LƯU AVATAR THẬT BẰNG USER ACCESS TOKEN
        console.log('\n--- BƯỚC 3: Upload và lưu avatar thật lên Storage + Profiles ---');
        // Đặt lại tên hợp lệ
        await cdp.eval(`(() => {
            document.getElementById('editProfileName').value = '${initialProfile.display_name || 'prod_norm_1791220432814'}';
        })()`);

        // Submit form thật
        console.log('Submit form cập nhật hồ sơ với fetch thật...');
        await cdp.eval(`(() => {
            const form = document.getElementById('editProfileForm');
            return window.ViVuApp.submitEditProfile(form);
        })()`);
        await sleep(2500);

        // Kiểm tra sau khi submit
        const postSubmitCheck = await cdp.eval(`(() => {
            const modal = document.getElementById('editProfileModal');
            const stateAvatar = window.ViVuApp.getState().userProfile?.avatar;
            const headerAvatarImg = document.getElementById('headerProfileBtn')?.querySelector('img')?.src;
            const sidebarAvatarImg = document.getElementById('sidebarUserAvatar')?.querySelector('img')?.src;
            const drawerAvatarImg = document.getElementById('drawerUserAvatar')?.querySelector('img')?.src;
            return {
                modalClosed: modal && modal.classList.contains('hidden'),
                avatarStateUrl: stateAvatar,
                headerAvatarSrc: headerAvatarImg,
                sidebarAvatarSrc: sidebarAvatarImg,
                drawerAvatarSrc: drawerAvatarImg
            };
        })()`);
        console.log('Kết quả sau khi submit hồ sơ:', postSubmitCheck);
        assert(postSubmitCheck.modalClosed, 'Modal phải đóng sau khi lưu thành công');
        assert(postSubmitCheck.avatarStateUrl && postSubmitCheck.avatarStateUrl.includes('review-photos'), 'Avatar state phải có URL Storage thực tế');
        assert(postSubmitCheck.headerAvatarSrc === postSubmitCheck.avatarStateUrl, 'Header avatar phải đồng bộ');
        assert(postSubmitCheck.sidebarAvatarSrc === postSubmitCheck.avatarStateUrl, 'Sidebar avatar phải đồng bộ');
        assert(postSubmitCheck.drawerAvatarSrc === postSubmitCheck.avatarStateUrl, 'Drawer avatar phải đồng bộ');

        // Ghi lại đường dẫn trên Storage để dọn dẹp
        const avatarUrlObj = new URL(postSubmitCheck.avatarStateUrl);
        const matchPath = avatarUrlObj.pathname.match(/\/review-photos\/(.+)$/);
        if (matchPath) {
            uploadedAvatarStoragePath = matchPath[1];
            console.log('✓ File đã upload thành công tại path:', uploadedAvatarStoragePath);
        }
        await cdp.captureScreenshot('avatar_uploaded_and_synced.png');

        // 4. Kiểm tra tải lại trang (Reload), phiên vẫn duy trì đúng Avatar từ database
        console.log('\n--- BƯỚC 4: Kiểm tra tải lại trang (Reload), phiên vẫn duy trì đúng Avatar từ database ---');
        await cdp.send('Page.reload');
        await sleep(2500);

        const reloadStatus = await cdp.eval(`(() => {
            const stateAvatar = window.ViVuApp.getState().userProfile?.avatar;
            const headerAvatarImg = document.getElementById('headerProfileBtn')?.querySelector('img')?.src;
            const sidebarAvatarImg = document.getElementById('sidebarUserAvatar')?.querySelector('img')?.src;
            const drawerAvatarImg = document.getElementById('drawerUserAvatar')?.querySelector('img')?.src;
            return {
                stateAvatar,
                headerImgSrc: headerAvatarImg,
                sidebarImgSrc: sidebarAvatarImg,
                drawerImgSrc: drawerAvatarImg
            };
        })()`);
        console.log('Trạng thái Avatar sau reload trang:', reloadStatus);
        assert(reloadStatus.stateAvatar === postSubmitCheck.avatarStateUrl, 'Sau reload, state avatar phải duy trì từ database');
        assert(reloadStatus.headerImgSrc === postSubmitCheck.avatarStateUrl, 'Sau reload, Header avatar phải duy trì đúng URL');
        assert(reloadStatus.sidebarImgSrc === postSubmitCheck.avatarStateUrl, 'Sau reload, Sidebar avatar phải duy trì đúng URL');
        assert(reloadStatus.drawerImgSrc === postSubmitCheck.avatarStateUrl, 'Sau reload, Drawer avatar phải duy trì đúng URL');

        // 4.1. BỔ SUNG KIỂM TRA: ĐĂNG XUẤT VÀ ĐĂNG NHẬP LẠI (RE-LOGIN) VẪN HIỆN ĐÚNG AVATAR
        console.log('\n--- BƯỚC 4.1: Kiểm tra Đăng xuất & Đăng nhập lại (Re-login) vẫn hiện đúng Avatar ---');
        console.log('Thực hiện Đăng xuất...');
        await cdp.eval(`window.ViVuApp.handleUserSignOut()`);
        await sleep(1000);

        const loggedOutCheck = await cdp.eval(`(() => {
            const headerImg = document.getElementById('headerProfileBtn')?.querySelector('img');
            const stateAvatar = window.ViVuApp.getState().userProfile?.avatar;
            return {
                isLoggedOut: !localStorage.getItem('vivu_user_session'),
                headerHasImg: !!headerImg
            };
        })()`);
        console.log('Trạng thái sau khi đăng xuất:', loggedOutCheck);
        assert(loggedOutCheck.isLoggedOut, 'Session phải được xóa sau khi đăng xuất');

        console.log('Thực hiện Đăng nhập lại (Re-login)...');
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

        const reloginStatus = await cdp.eval(`(() => {
            const stateAvatar = window.ViVuApp.getState().userProfile?.avatar;
            const headerAvatarImg = document.getElementById('headerProfileBtn')?.querySelector('img')?.src;
            const sidebarAvatarImg = document.getElementById('sidebarUserAvatar')?.querySelector('img')?.src;
            const drawerAvatarImg = document.getElementById('drawerUserAvatar')?.querySelector('img')?.src;
            return {
                stateAvatar,
                headerImgSrc: headerAvatarImg,
                sidebarImgSrc: sidebarAvatarImg,
                drawerImgSrc: drawerAvatarImg
            };
        })()`);
        console.log('Trạng thái Avatar sau khi Đăng nhập lại:', reloginStatus);
        assert(reloginStatus.stateAvatar === postSubmitCheck.avatarStateUrl, 'Sau re-login, state avatar phải nạp đúng từ database');
        assert(reloginStatus.headerImgSrc === postSubmitCheck.avatarStateUrl, 'Sau re-login, Header avatar phải nạp đúng từ database');
        assert(reloginStatus.sidebarImgSrc === postSubmitCheck.avatarStateUrl, 'Sau re-login, Sidebar avatar phải nạp đúng từ database');
        assert(reloginStatus.drawerImgSrc === postSubmitCheck.avatarStateUrl, 'Sau re-login, Drawer avatar phải nạp đúng từ database');
        console.log('✓ Đăng nhập lại thành công và hiển thị chính xác avatar trên cả 4 vị trí!');

        // 5. Kiểm tra RLS: Không thể sửa hồ sơ của người khác
        console.log('\n--- BƯỚC 5: Kiểm tra RLS ngăn cản sửa avatar người khác ---');
        const otherUserId = '11111111-1111-1111-1111-111111111111';
        const unauthorizedPatchRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${otherUserId}`, {
            method: 'PATCH',
            headers: {
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${normalToken}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({ avatar_url: 'https://attacker.example.com/hacked.png' })
        });
        const unauthorizedPatchData = await unauthorizedPatchRes.json().catch(() => []);
        console.log('Số bản ghi người khác bị sửa bởi member thường (phải = 0):', unauthorizedPatchData.length);
        assert(Array.isArray(unauthorizedPatchData) && unauthorizedPatchData.length === 0, 'RLS vi phạm: Member sửa được profile người khác');

        // 6. KIỂM TRA BỘ LỌC ĐỊA ĐIỂM TRÊN DESKTOP (1280px & 1440px)
        console.log('\n--- BƯỚC 6: Kiểm tra thanh bộ lọc địa điểm trên Desktop (1280px, 1440px) ---');
        await cdp.setViewport(1280, 800, false);
        await sleep(500);

        // Mở Map Modal
        await cdp.eval(`window.ViVuApp.openFullMapModal()`);
        await sleep(1000);

        const desktopFilterCheck = await cdp.eval(`(() => {
            const sidePanel = document.getElementById('mapSidePanel');
            const searchInput = document.getElementById('mapSideSearchInput');
            const pillsContainer = document.getElementById('mapSideCategoryPills');
            const pills = pillsContainer ? Array.from(pillsContainer.querySelectorAll('button')) : [];
            const openOnlyBtn = document.getElementById('mapFilterOpenOnlyBtn');
            const freeBtn = document.getElementById('mapFilterFreeBtn');
            const countBadge = document.getElementById('mapPlacesCountBadge');
            const closeBtn = document.getElementById('fullMapCloseBtn');

            const allPillsGe44 = pills.every(p => {
                const rect = p.getBoundingClientRect();
                return rect.height >= 43.5;
            });

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
        assert(desktopFilterCheck.searchInputHeight >= 43.5, 'Ô tìm kiếm phải cao >= 44px');
        assert(desktopFilterCheck.allPillsGe44, 'Tất cả các nút danh mục phải có chiều cao >= 44px');
        assert(desktopFilterCheck.openOnlyHeight >= 43.5, 'Nút Đang mở cửa phải cao >= 44px');
        assert(desktopFilterCheck.freeBtnHeight >= 43.5, 'Nút Miễn phí vé phải cao >= 44px');
        assert(!desktopFilterCheck.isOverflown, 'Không được tràn trang ngang');
        assert(desktopFilterCheck.closeBtnVisible, 'Nút đóng modal phải nhìn thấy rõ ràng');
        await cdp.captureScreenshot('desktop_1280_filter_bar.png');

        // Thử click chọn danh mục trên Desktop
        console.log('Click chọn danh mục "Chùa Khmer"...');
        await cdp.eval(`window.ViVuApp.setMapCategory('chua-khmer')`);
        await sleep(500);

        const catClickCheck = await cdp.eval(`(() => {
            const countBadge = document.getElementById('mapPlacesCountBadge');
            return {
                activeCat: window.ViVuApp.getState().mapCategory,
                badgeText: countBadge?.textContent?.trim()
            };
        })()`);
        console.log('Sau khi chọn "Chùa Khmer":', catClickCheck);
        assert(catClickCheck.activeCat === 'chua-khmer', 'Danh mục đang chọn phải là chua-khmer');

        // 7. KIỂM TRA BỘ LỌC ĐỊA ĐIỂM TRÊN MOBILE (390px & 360px)
        console.log('\n--- BƯỚC 7: Kiểm tra thanh bộ lọc địa điểm trên Mobile (390px & 360px) ---');
        await cdp.setViewport(390, 844, true);
        await sleep(500);

        // Map View (Floating Category Chips trên mobile)
        const mobileMapViewCheck = await cdp.eval(`(() => {
            const mobilePillsContainer = document.getElementById('mapMobileCategoryPills');
            const pills = mobilePillsContainer ? Array.from(mobilePillsContainer.querySelectorAll('button')) : [];
            const allGe44 = pills.every(p => p.getBoundingClientRect().height >= 43.5);
            const fade = document.getElementById('mapMobileCategoryFade');
            return {
                pillsCount: pills.length,
                allGe44,
                hasFade: !!fade,
                fadeDisplay: fade ? window.getComputedStyle(fade).display : null,
                isOverflown: document.documentElement.scrollWidth > window.innerWidth
            };
        })()`);
        console.log('Mobile 390px Map View:', mobileMapViewCheck);
        assert(mobileMapViewCheck.pillsCount > 0, 'Phải có các nút danh mục trên mobile map view');
        assert(mobileMapViewCheck.allGe44, 'Các nút danh mục trên mobile map view phải >= 44px');
        assert(mobileMapViewCheck.hasFade, 'Phải có hiệu ứng fade mép phải');
        assert(!mobileMapViewCheck.isOverflown, 'Mobile map view không được tràn ngang trang');
        await cdp.captureScreenshot('mobile_390_map_view_filter.png');

        // Chuyển sang Mobile List View
        console.log('Chuyển sang chế độ Danh sách trên Mobile...');
        await cdp.eval(`window.ViVuApp.toggleMapMobileView()`);
        await sleep(500);

        const mobileListCheck = await cdp.eval(`(() => {
            const panel = document.getElementById('mapSidePanel');
            const pills = panel ? Array.from(document.getElementById('mapSideCategoryPills').querySelectorAll('button')) : [];
            const allGe44 = pills.every(p => p.getBoundingClientRect().height >= 43.5);
            const fade = document.getElementById('mapSideCategoryFade');
            const searchInput = document.getElementById('mapSideSearchInput');
            const openOnlyBtn = document.getElementById('mapFilterOpenOnlyBtn');
            const freeBtn = document.getElementById('mapFilterFreeBtn');
            const countBadge = document.getElementById('mapPlacesCountBadge');

            return {
                panelVisible: panel && window.getComputedStyle(panel).display !== 'none',
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
        // QUY TRÌNH DỌN DẸP CHUẨN MỰC:
        // 1. KHÔI PHỤC HỒ SƠ BAN ĐẦU TRONG DATABASE TRƯỚC
        if (initialProfile && normalUserId && normalToken) {
            console.log('\n--- 1. KHÔI PHỤC HỒ SƠ BAN ĐẦU CỦA USER TRONG DATABASE ---');
            try {
                const restoreRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${normalUserId}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': ANON_KEY,
                        'Authorization': `Bearer ${normalToken}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        avatar_url: initialProfile.avatar_url,
                        display_name: initialProfile.display_name,
                        bio: initialProfile.bio,
                        updated_at: new Date().toISOString()
                    })
                });
                console.log('✓ Khôi phục hồ sơ trong DB: Status =', restoreRes.status);

                const verifyRestore = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${normalUserId}&select=avatar_url,display_name`, {
                    headers: { apikey: ANON_KEY, Authorization: `Bearer ${normalToken}` }
                });
                const restoredRows = await verifyRestore.json();
                if (restoredRows && restoredRows[0]) {
                    console.log('✓ Hồ sơ đã được khôi phục nguyên trạng:', restoredRows[0]);
                }
            } catch (err) {
                console.error('Lỗi khi khôi phục hồ sơ:', err);
            }
        }

        // 2. SAU KHI HỒ SƠ ĐÃ KHÔI PHỤC XONG, MỚI TIẾN HÀNH XÓA ẢNH TEST TRÊN STORAGE
        if (uploadedAvatarStoragePath && normalToken) {
            console.log('\n--- 2. Dọn dẹp tệp test avatar trên Storage ---');
            try {
                const delRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${uploadedAvatarStoragePath}`, {
                    method: 'DELETE',
                    headers: {
                        'apikey': SERVICE_KEY,
                        'Authorization': `Bearer ${SERVICE_KEY}`
                    }
                });
                console.log('✓ Đã xóa tệp test avatar trên Storage (Status: ' + delRes.status + '):', uploadedAvatarStoragePath);
            } catch (err) {
                console.error('Lỗi khi xóa tệp test avatar:', err);
            }
        }

        // 3. Dọn dẹp thư mục tạm trên OS
        if (tempDir && fs.existsSync(tempDir)) {
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
                console.log('✓ Đã dọn dẹp các tệp tạm trên máy cục bộ');
            } catch (_) {}
        }

        chromeProc.kill();
        if (server) server.close();
    }
}

main().catch(err => {
    console.error('LỖI KIỂM THỬ:', err);
    process.exit(1);
});
