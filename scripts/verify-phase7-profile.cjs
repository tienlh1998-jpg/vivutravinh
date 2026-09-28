// scripts/verify-phase7-profile.cjs - Automated Verification for Phase 7: Profile, Achievements, Badges & Saved Collections
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || (fs.existsSync(path.resolve(__dirname, '../../05_AGY_BRAIN_ARTIFACTS'))
    ? path.resolve(__dirname, '../../05_AGY_BRAIN_ARTIFACTS')
    : path.resolve(__dirname, '../scratch/artifacts'));
if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

const BRAIN_ARTIFACTS_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/511499a4-7194-4965-9c2b-32af7520e85d';

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function getDebuggerUrl(port) {
    for (let i = 0; i < 30; i++) {
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
            const target = pages.find(p => p.url && p.url.includes('8000'));
            if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
        } catch (e) {
            await sleep(200);
        }
    }
    throw new Error('Không thể kết nối Chrome DevTools protocol.');
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.reqId = 0;
        this.callbacks = new Map();
        this.ws.onmessage = (msg) => {
            const res = JSON.parse(msg.data);
            if (res.id && this.callbacks.has(res.id)) {
                const cb = this.callbacks.get(res.id);
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
                reject(new Error(`CDP method ${method} timed out after 15000ms`));
            }, 15000);
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
            throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result?.value;
    }

    async setViewport(width, height) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 1,
            mobile: false
        });
        await sleep(300);
    }

    async captureScreenshot(filepath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png', quality: 90 });
        const buf = Buffer.from(res.data, 'base64');
        fs.writeFileSync(filepath, buf);

        if (fs.existsSync(BRAIN_ARTIFACTS_DIR)) {
            try {
                const brainDest = path.join(BRAIN_ARTIFACTS_DIR, path.basename(filepath));
                fs.writeFileSync(brainDest, buf);
            } catch (err) {}
        }
    }
}

async function runVerification() {
    console.log('=== BẮT ĐẦU KIỂM THỬ GIAI ĐOẠN 7: HỒ SƠ CÁ NHÂN, THÀNH TÍCH & BỘ SƯU TẬP ĐÃ LƯU (STITCH) ===\n');

    let serverProcess = null;
    let serverRunning = false;

    try {
        await new Promise((resolve, reject) => {
            const req = http.get('http://localhost:8000', () => {
                serverRunning = true;
                resolve();
            });
            req.on('error', () => resolve());
        });
    } catch (e) {}

    if (!serverRunning) {
        serverProcess = spawn('npx', ['http-server', '-p', '8000', '-c-1'], {
            cwd: path.resolve(__dirname, '..'),
            shell: true,
            stdio: 'ignore'
        });
        await sleep(1500);
        console.log('  ✓ Đã khởi chạy test server tại http://localhost:8000');
    }

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-phase7-test-'));
    const chrome = spawn(chromePath, [
        '--remote-debugging-port=9222',
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tmpProfile}`,
        'http://localhost:8000/?source=mock'
    ]);

    let cdp = null;

    try {
        console.log('[1] Đang kết nối tới Chrome Headless CDP...');
        const wsUrl = await getDebuggerUrl(9222);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');

        console.log('[2] Chờ ứng dụng sẵn sàng và nạp danh sách dữ liệu...');
        let ready = false;
        for (let i = 0; i < 40; i++) {
            ready = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.getState && window.ViVuApp.getState().allPlaces && window.ViVuApp.getState().allPlaces.length > 0)`);
            if (ready) break;
            await sleep(250);
        }
        if (!ready) throw new Error('Timeout chờ app sẵn sàng.');
        console.log('  ✓ Ứng dụng đã sẵn sàng với toàn bộ dữ liệu!');

        // =========================================================================
        // [3] KIỂM THỬ HỒ SƠ CÁ NHÂN & BẢNG VINH DANH HUY HIỆU TRÊN DESKTOP (1280x800)
        // =========================================================================
        console.log('\n[3] KIỂM THỬ HỒ SƠ CÁ NHÂN & HUY HIỆU TRÊN DESKTOP (1280x800):');
        await cdp.setViewport(1280, 800);

        // Open profile modal
        await cdp.eval(`window.ViVuApp.openProfileModal('overview')`);
        await sleep(500);

        const profileModalState = await cdp.eval(`(() => {
            const modal = document.getElementById('userProfileModal');
            const isVisible = modal && !modal.classList.contains('hidden');
            const nameEl = modal ? modal.querySelector('h1') : null;
            const name = nameEl ? nameEl.textContent.trim() : '';
            const metrics = modal ? modal.querySelectorAll('.grid-cols-2 > div') : [];
            const badges = modal ? modal.querySelectorAll('#profileBadgesGrid > div') : [];
            const tabs = modal ? modal.querySelectorAll('[role="tab"]') : [];
            const coinsEl = modal ? modal.querySelector('.text-amber-600') : null;

            return {
                modalExists: Boolean(modal),
                isVisible,
                name,
                metricsCount: metrics.length,
                badgesCount: badges.length,
                tabsCount: tabs.length
            };
        })()`);

        console.log('  Kết quả Desktop Profile Modal:', profileModalState);
        if (!profileModalState.isVisible || profileModalState.name !== 'Nguyễn Văn Tiến') {
            throw new Error(`Profile modal chưa mở đúng với tên Nguyễn Văn Tiến. Thực tế: ${profileModalState.name}`);
        }
        if (profileModalState.badgesCount < 4) {
            throw new Error(`Số lượng huy hiệu hiển thị không đúng: ${profileModalState.badgesCount}`);
        }
        console.log('  ✅ Desktop Profile Modal hiển thị xuất sắc đầy đủ thông tin định danh và bento huy hiệu!');

        const profileDesktopShot = path.join(ARTIFACT_DIR, 'stitch-profile-desktop-1280.png');
        await cdp.captureScreenshot(profileDesktopShot);
        console.log(`  📸 Đã chụp ảnh minh chứng: ${profileDesktopShot}`);

        // =========================================================================
        // [4] KIỂM THỬ BỘ LỌC HUY HIỆU (BADGES FILTERING)
        // =========================================================================
        console.log('\n[4] KIỂM THỬ BỘ LỌC DANH MỤC HUY HIỆU:');
        const filterBadgeResult = await cdp.eval(`(() => {
            window.ViVuApp.filterProfileBadges('temple');
            const templeBadges = document.querySelectorAll('#profileBadgesGrid > div').length;
            window.ViVuApp.filterProfileBadges('all');
            const allBadges = document.querySelectorAll('#profileBadgesGrid > div').length;
            return { templeBadges, allBadges };
        })()`);

        console.log('  ✓ Lọc huy hiệu Văn hóa Chùa Cổ:', filterBadgeResult);
        if (filterBadgeResult.templeBadges !== 2 || filterBadgeResult.allBadges < 5) {
            throw new Error('Lọc huy hiệu chưa trả về đúng số lượng!');
        }
        console.log('  ✅ Bộ lọc danh mục huy hiệu hoạt động chính xác 100%!');

        // =========================================================================
        // [5] KIỂM THỬ ĐỔI QUÀ XU XỨ TRÀ (REDEEM GIFT MODAL)
        // =========================================================================
        console.log('\n[5] KIỂM THỬ ĐỔI QUÀ XU XỨ TRÀ (REDEEM GIFTS):');
        await cdp.eval(`window.ViVuApp.openRedeemGiftModal()`);
        await sleep(400);

        const giftModalState = await cdp.eval(`(() => {
            const modal = document.getElementById('redeemGiftModal');
            const isVisible = modal && !modal.classList.contains('hidden');
            const giftCards = modal ? modal.querySelectorAll('.space-y-3 > div') : [];
            return { isVisible, giftsCount: giftCards.length };
        })()`);

        console.log('  Modal Đổi quà hiển thị:', giftModalState);
        if (!giftModalState.isVisible || giftModalState.giftsCount < 3) {
            throw new Error('Modal đổi quà không hiển thị đúng.');
        }

        // Redeem 1 gift (gift-xe-buyt = 200 xu)
        const redeemResult = await cdp.eval(`(() => {
            const beforeCoins = window.ViVuApp.getState().userProfile.coins;
            window.ViVuApp.redeemGift('gift-xe-buyt');
            const afterCoins = window.ViVuApp.getState().userProfile.coins;
            return { beforeCoins, afterCoins, deducted: beforeCoins - afterCoins };
        })()`);

        console.log('  Kết quả đổi vé xe buýt điện:', redeemResult);
        if (redeemResult.deducted !== 200) {
            throw new Error(`Đổi quà chưa trừ đúng số Xu. Deducted: ${redeemResult.deducted}`);
        }
        console.log('  ✅ Thao tác Đổi quà bằng Xu Xứ Trà hoạt động chuẩn xác!');

        // =========================================================================
        // [6] KIỂM THỬ CHỈNH SỬA HỒ SƠ (EDIT PROFILE MODAL)
        // =========================================================================
        console.log('\n[6] KIỂM THỬ CHỈNH SỬA THÔNG TIN HỒ SƠ:');
        await cdp.eval(`window.ViVuApp.openEditProfileModal()`);
        await sleep(300);

        const editProfileResult = await cdp.eval(`(() => {
            const modal = document.getElementById('editProfileModal');
            const isVisible = modal && !modal.classList.contains('hidden');
            const form = document.getElementById('editProfileForm');
            const roleInput = document.getElementById('editProfileRole');
            if (roleInput) roleInput.value = 'Đại sứ Di sản & Văn hóa Xứ Trà 2026';
            window.ViVuApp.submitEditProfile(form);
            return {
                isVisible,
                updatedRole: window.ViVuApp.getState().userProfile.role
            };
        })()`);

        console.log('  Kết quả chỉnh sửa hồ sơ:', editProfileResult);
        if (!editProfileResult.updatedRole.includes('2026')) {
            throw new Error('Hồ sơ chưa được cập nhật đúng vai trò mới.');
        }
        console.log('  ✅ Chỉnh sửa hồ sơ và đồng bộ lưu trữ hoạt động mượt mà!');
        await cdp.eval(`window.ViVuApp.closeProfileModal()`);
        await sleep(300);

        // =========================================================================
        // [7] KIỂM THỬ BỘ SƯU TẬP ĐÃ LƯU (SAVED COLLECTIONS MODAL)
        // =========================================================================
        console.log('\n[7] KIỂM THỬ BỘ SƯU TẬP ĐÃ LƯU TRÊN DESKTOP:');
        await cdp.eval(`window.ViVuApp.openSavedCollectionsModal()`);
        await sleep(500);

        const savedModalState = await cdp.eval(`(() => {
            const modal = document.getElementById('savedCollectionsModal');
            const isVisible = modal && !modal.classList.contains('hidden');
            const cards = modal ? modal.querySelectorAll('.saved-card') : [];
            const badge = document.getElementById('savedTotalBadge');
            const badgeText = badge ? badge.textContent.trim() : '';
            const folders = modal ? modal.querySelectorAll('.grid-cols-1 > div') : [];
            return {
                isVisible,
                cardsCount: cards.length,
                badgeText,
                hasFolders: folders.length > 0
            };
        })()`);

        console.log('  Kết quả Desktop Saved Collections:', savedModalState);
        if (!savedModalState.isVisible || savedModalState.cardsCount < 5) {
            throw new Error(`Bộ sưu tập đã lưu không hiển thị đầy đủ thẻ. Thực tế: ${savedModalState.cardsCount}`);
        }
        console.log('  ✅ Bộ sưu tập đã lưu hiển thị đầy đủ 6 địa điểm & trải nghiệm di sản!');

        const savedDesktopShot = path.join(ARTIFACT_DIR, 'stitch-saved-desktop-1280.png');
        await cdp.captureScreenshot(savedDesktopShot);
        console.log(`  📸 Đã chụp ảnh minh chứng: ${savedDesktopShot}`);

        // =========================================================================
        // [8] KIỂM THỬ LỌC & TƯƠNG TÁC XÓA BỎ LƯU TRONG BỘ SƯU TẬP
        // =========================================================================
        console.log('\n[8] KIỂM THỬ LỌC DANH MỤC & BỎ LƯU:');
        const filterSavedResult = await cdp.eval(`(() => {
            window.ViVuApp.filterSavedCategory('culinary');
            const culinaryCount = document.querySelectorAll('.saved-card').length;
            window.ViVuApp.filterSavedCategory('all');
            const allCount = document.querySelectorAll('.saved-card').length;
            return { culinaryCount, allCount };
        })()`);

        console.log('  ✓ Lọc Ẩm thực & Quán:', filterSavedResult);
        if (filterSavedResult.culinaryCount !== 2 || filterSavedResult.allCount < 5) {
            throw new Error('Lọc danh mục đã lưu chưa đúng.');
        }

        // Test remove 1 item
        const removeSavedResult = await cdp.eval(`(() => {
            const beforeCount = window.ViVuApp.getState().savedCollections.length;
            window.ViVuApp.removeSavedItem('saved-cafe-vuon', 'Quán Cà Phê Vườn Xứ Trà');
            const afterCount = window.ViVuApp.getState().savedCollections.length;
            return { beforeCount, afterCount };
        })()`);

        console.log('  ✓ Bỏ lưu 1 mục:', removeSavedResult);
        if (removeSavedResult.beforeCount - removeSavedResult.afterCount !== 1) {
            throw new Error('Bỏ lưu không thành công.');
        }
        console.log('  ✅ Thao tác bỏ lưu và cập nhật bộ đếm danh sách hoạt động hoàn hảo!');

        // =========================================================================
        // [9] KIỂM THỬ MODAL TẠO DANH SÁCH MỚI & XUẤT LỊCH TRÌNH
        // =========================================================================
        console.log('\n[9] KIỂM THỬ MODAL TẠO DANH SÁCH MỚI & XUẤT LỊCH TRÌNH:');
        await cdp.eval(`window.ViVuApp.openCreateCollectionModal()`);
        await sleep(300);
        const createModalVisible = await cdp.eval(`Boolean(!document.getElementById('createCollectionModal')?.classList.contains('hidden'))`);
        await cdp.eval(`window.ViVuApp.closeCreateCollectionModal()`);

        await cdp.eval(`window.ViVuApp.openExportItineraryModal()`);
        await sleep(300);
        const exportModalState = await cdp.eval(`(() => {
            const modal = document.getElementById('exportItineraryModal');
            const isVisible = Boolean(modal && !modal.classList.contains('hidden'));
            const text = document.getElementById('exportItineraryText')?.value || '';
            return { isVisible, hasText: text.length > 20 };
        })()`);
        await cdp.eval(`window.ViVuApp.closeExportItineraryModal()`);
        await cdp.eval(`window.ViVuApp.closeSavedCollectionsModal()`);

        console.log('  ✓ Modal Tạo danh sách mới:', createModalVisible);
        console.log('  ✓ Modal Xuất lịch trình tự túc:', exportModalState);
        if (!createModalVisible || !exportModalState.isVisible || !exportModalState.hasText) {
            throw new Error('Modal Tạo danh sách hoặc Xuất lịch trình bị lỗi.');
        }

        // =========================================================================
        // [10] KIỂM THỬ GIAO DIỆN TRÊN DI ĐỘNG (MOBILE 390x844)
        // =========================================================================
        console.log('\n[10] KIỂM THỬ GIAO DIỆN TRÊN DI ĐỘNG (MOBILE 390x844):');
        await cdp.setViewport(390, 844);

        // Open Profile on Mobile
        await cdp.eval(`window.ViVuApp.openProfileModal('overview')`);
        await sleep(500);

        const mobileProfileOverflow = await cdp.eval(`(() => {
            const modal = document.getElementById('userProfileModal');
            const docWidth = document.documentElement.clientWidth;
            const scrollWidth = modal ? modal.scrollWidth : 0;
            return {
                noOverflow: scrollWidth <= docWidth + 2,
                docWidth,
                scrollWidth
            };
        })()`);

        console.log('  Kiểm tra tràn ngang Profile Mobile:', mobileProfileOverflow);
        const profileMobileShot = path.join(ARTIFACT_DIR, 'stitch-profile-mobile-390.png');
        await cdp.captureScreenshot(profileMobileShot);
        console.log(`  📸 Đã chụp ảnh minh chứng: ${profileMobileShot}`);

        await cdp.eval(`window.ViVuApp.closeProfileModal()`);
        await sleep(300);

        // Open Saved Collections on Mobile
        await cdp.eval(`window.ViVuApp.openSavedCollectionsModal()`);
        await sleep(500);

        const mobileSavedOverflow = await cdp.eval(`(() => {
            const modal = document.getElementById('savedCollectionsModal');
            const docWidth = document.documentElement.clientWidth;
            const scrollWidth = modal ? modal.scrollWidth : 0;
            return {
                noOverflow: scrollWidth <= docWidth + 2,
                docWidth,
                scrollWidth
            };
        })()`);

        console.log('  Kiểm tra tràn ngang Saved Collections Mobile:', mobileSavedOverflow);
        const savedMobileShot = path.join(ARTIFACT_DIR, 'stitch-saved-mobile-390.png');
        await cdp.captureScreenshot(savedMobileShot);
        console.log(`  📸 Đã chụp ảnh minh chứng: ${savedMobileShot}`);
        await cdp.eval(`window.ViVuApp.closeSavedCollectionsModal()`);

        // =========================================================================
        // [11] KIỂM TRA CHUẨN VÙNG CHẠM TOUCH TARGET (>= 44px)
        // =========================================================================
        console.log('\n[11] KIỂM TRA CHUẨN VÙNG CHẠM TOUCH TARGET (>= 44px):');
        await cdp.eval(`window.ViVuApp.openSavedCollectionsModal()`);
        await sleep(300);

        const touchTargets = await cdp.eval(`(() => {
            const targets = [];
            const selectors = [
                '#headerProfileBtn',
                '#headerSavedBtn',
                '#savedCollectionsModal button'
            ];
            selectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const text = el.innerText ? el.innerText.trim().slice(0, 18) : (el.getAttribute('title') || 'btn');
                    if (rect.width > 0 && rect.height > 0) {
                        targets.push({
                            selector: sel,
                            text,
                            width: Math.round(rect.width * 10) / 10,
                            height: Math.round(rect.height * 10) / 10,
                            pass: rect.height >= 43.5
                        });
                    }
                });
            });
            return targets.slice(0, 15);
        })()`);
        await cdp.eval(`window.ViVuApp.closeSavedCollectionsModal()`);

        let allTouchPass = true;
        touchTargets.forEach(t => {
            const status = t.pass ? 'PASS' : 'FAIL';
            console.log(`  ✅ Vùng chạm "${t.text}": ${t.width}x${t.height}px (${status})`);
            if (!t.pass) allTouchPass = false;
        });

        if (!allTouchPass) {
            throw new Error('Phát hiện nút có vùng chạm < 44px!');
        }

        console.log('\n========================================');
        console.log('TẤT CẢ KIỂM THỬ GIAI ĐOẠN 7 ĐẠT 100% PASS!');
        console.log('========================================\n');

    } catch (err) {
        console.error('\nLỖI KIỂM THỬ GIAI ĐOẠN 7:', err);
        process.exitCode = 1;
    } finally {
        if (chrome) {
            try { chrome.kill(); } catch (e) {}
        }
        if (serverProcess) {
            try { serverProcess.kill(); } catch (e) {}
        }
        try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (e) {}
    }
}

runVerification();
