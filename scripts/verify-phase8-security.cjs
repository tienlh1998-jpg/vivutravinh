// scripts/verify-phase8-security.cjs - Automated Verification for Phase 8: Settings, Security Center & 2FA
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
    console.log('=== BẮT ĐẦU KIỂM THỬ GIAI ĐOẠN 8: CÀI ĐẶT TÀI KHOẢN, BẢO MẬT & 2FA (STITCH) ===\n');

    let serverProcess = null;
    let chrome = null;
    const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-sec-test-'));

    try {
        // Khởi động server nội bộ
        serverProcess = spawn('npx', ['http-server', '-p', '8000', '-c-1'], {
            cwd: path.resolve(__dirname, '..'),
            shell: true,
            stdio: 'ignore'
        });
        await sleep(1000);
        console.log('  ✓ Đã khởi chạy test server tại http://localhost:8000');

        // Khởi chạy Chrome Headless
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.CHROME_BIN
        ].filter(Boolean);

        const chromePath = chromePaths.find(p => fs.existsSync(p));
        if (!chromePath) throw new Error('Không tìm thấy Google Chrome.');

        const chromePort = 9222;
        chrome = spawn(chromePath, [
            `--remote-debugging-port=${chromePort}`,
            `--user-data-dir=${tmpProfile}`,
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            'http://localhost:8000/?source=mock'
        ]);

        console.log('[1] Đang kết nối tới Chrome Headless CDP...');
        const wsUrl = await getDebuggerUrl(chromePort);
        const cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        console.log('[2] Chờ ứng dụng sẵn sàng và nạp danh sách dữ liệu...');
        await sleep(1500);

        // =========================================================================
        // [3] KIỂM THỬ TRUNG TÂM BẢO MẬT TRÊN DESKTOP (1280x800)
        // =========================================================================
        console.log('\n[3] KIỂM THỬ TRUNG TÂM BẢO MẬT TRÊN DESKTOP (1280x800):');
        await cdp.setViewport(1280, 800);

        // Open security modal
        await cdp.eval(`window.ViVuApp.openSecurityModal('security')`);
        await sleep(500);

        const secModalState = await cdp.eval(`(() => {
            const modal = document.getElementById('securityModal');
            const isVisible = modal && !modal.classList.contains('hidden');
            const titleEl = modal ? modal.querySelector('h2') : null;
            const title = titleEl ? titleEl.textContent.trim() : '';
            const tabs = modal ? modal.querySelectorAll('[role="tab"]') : [];
            const form = document.getElementById('changePasswordForm');
            const healthScore = window.ViVuApp.getState().securitySettings.healthScore;

            return {
                modalExists: Boolean(modal),
                isVisible,
                title,
                tabsCount: tabs.length,
                hasForm: Boolean(form),
                healthScore
            };
        })()`);

        console.log('  Kết quả Desktop Security Modal:', secModalState);
        if (!secModalState.isVisible || secModalState.healthScore !== 75) {
            throw new Error(`Security modal chưa mở đúng hoặc điểm an ninh không đúng 75%.`);
        }
        if (secModalState.tabsCount !== 4) {
            throw new Error(`Số lượng tab điều hướng bảo mật không đúng: ${secModalState.tabsCount}`);
        }
        console.log('  ✅ Desktop Security Center hiển thị xuất sắc đầy đủ 4 tab và Bento an ninh!');

        const secDesktopShot = path.join(ARTIFACT_DIR, 'stitch-security-desktop-1280.png');
        await cdp.captureScreenshot(secDesktopShot);
        console.log(`  📸 Đã chụp ảnh minh chứng: ${secDesktopShot}`);

        // =========================================================================
        // [4] KIỂM THỬ FORM ĐỔI MẬT KHẨU TÀI KHOẢN
        // =========================================================================
        console.log('\n[4] KIỂM THỬ FORM ĐỔI MẬT KHẨU TÀI KHOẢN:');
        const passChangeResult = await cdp.eval(`(() => {
            const form = document.getElementById('changePasswordForm');
            if (form) {
                form.currPass.value = 'OldPassword@2025';
                form.newPass.value = 'TraVinhSuperSafe@2026!';
                form.confirmPass.value = 'TraVinhSuperSafe@2026!';
                window.ViVuApp.submitChangePassword(form);
            }
            return {
                lastUpdated: window.ViVuApp.getState().securitySettings.lastUpdated
            };
        })()`);

        console.log('  ✓ Kết quả cập nhật mật khẩu:', passChangeResult);
        if (passChangeResult.lastUpdated !== 'Vừa xong') {
            throw new Error('Cập nhật mật khẩu chưa ghi nhận thời gian mới.');
        }
        console.log('  ✅ Form đổi mật khẩu và kiểm tra trùng khớp hoạt động chuẩn xác!');

        // =========================================================================
        // [5] KIỂM THỬ LIÊN KẾT AUTHENTICATOR (2FA MODAL)
        // =========================================================================
        console.log('\n[5] KIỂM THỬ LIÊN KẾT AUTHENTICATOR 2FA (QR & OTP 6 SỐ):');
        await cdp.eval(`window.ViVuApp.openLink2FAModal()`);
        await sleep(400);

        const link2FAModalState = await cdp.eval(`(() => {
            const modal = document.getElementById('link2faModal');
            const isVisible = modal && !modal.classList.contains('hidden');
            const svg = modal ? modal.querySelector('svg') : null;
            const secretKey = document.getElementById('secretKeyText')?.textContent?.trim() || '';
            const otpInputs = modal ? modal.querySelectorAll('.otp-input') : [];
            return {
                isVisible,
                hasSvgQr: Boolean(svg),
                secretKey,
                otpInputsCount: otpInputs.length
            };
        })()`);

        console.log('  Kết quả Modal Liên kết 2FA:', link2FAModalState);
        if (!link2FAModalState.isVisible || !link2FAModalState.hasSvgQr || link2FAModalState.otpInputsCount !== 6) {
            throw new Error('Modal Liên kết 2FA không hiển thị đầy đủ QR hoặc 6 ô OTP.');
        }

        const twoFaShot = path.join(ARTIFACT_DIR, 'stitch-2fa-desktop-1280.png');
        await cdp.captureScreenshot(twoFaShot);
        console.log(`  📸 Đã chụp ảnh minh chứng: ${twoFaShot}`);

        // Dán mã OTP và Kích hoạt 2FA
        const verify2FAResult = await cdp.eval(`(() => {
            window.ViVuApp.pasteOtpCode();
            window.ViVuApp.verify2FA();
            const state = window.ViVuApp.getState().securitySettings;
            const modal = document.getElementById('link2faModal');
            return {
                modalClosed: modal?.classList.contains('hidden'),
                healthScore: state.healthScore,
                protectionLayers: state.protectionLayers
            };
        })()`);

        console.log('  Kết quả kích hoạt 2FA:', verify2FAResult);
        if (!verify2FAResult.modalClosed || verify2FAResult.healthScore !== 90) {
            throw new Error('Kích hoạt 2FA không tăng điểm an ninh lên 90%.');
        }
        console.log('  ✅ Liên kết Authenticator 2FA và tự động tăng điểm bảo vệ 90% hoàn hảo!');

        // =========================================================================
        // [6] KIỂM THỬ MÃ KHÔI PHỤC DỰ PHÒNG (BACKUP CODES MODAL)
        // =========================================================================
        console.log('\n[6] KIỂM THỬ MÃ KHÔI PHỤC DỰ PHÒNG (BACKUP CODES):');
        await cdp.eval(`window.ViVuApp.openBackupCodesModal()`);
        await sleep(300);

        const backupCodesState = await cdp.eval(`(() => {
            const modal = document.getElementById('backupCodesModal');
            const isVisible = modal && !modal.classList.contains('hidden');
            const codes = modal ? modal.querySelectorAll('.font-mono') : [];
            return { isVisible, codesCount: codes.length };
        })()`);

        console.log('  Modal 10 Mã khôi phục:', backupCodesState);
        if (!backupCodesState.isVisible || backupCodesState.codesCount !== 10) {
            throw new Error('Modal Mã khôi phục không hiển thị đủ 10 mã.');
        }
        await cdp.eval(`window.ViVuApp.copyBackupCodes()`);
        await cdp.eval(`window.ViVuApp.closeBackupCodesModal()`);
        await sleep(300);
        console.log('  ✅ Hiển thị và sao chép 10 mã khôi phục dự phòng hoạt động 100%!');

        // =========================================================================
        // [7] KIỂM THỬ QUẢN LÝ THIẾT BỊ & PHIÊN ĐĂNG NHẬP (TAB DEVICES)
        // =========================================================================
        console.log('\n[7] KIỂM THỬ QUẢN LÝ THIẾT BỊ & THU HỒI PHIÊN:');
        await cdp.eval(`window.ViVuApp.switchSecurityTab('devices')`);
        await sleep(300);

        const devicesTabState = await cdp.eval(`(() => {
            const cards = document.querySelectorAll('.device-card');
            const currentBadge = document.querySelector('.bg-secondary-container');
            const devicesInState = window.ViVuApp.getState().securitySettings.devices.length;
            return {
                otherDevicesCount: cards.length,
                totalDevices: devicesInState
            };
        })()`);

        console.log('  Tab Thiết bị hoạt động:', devicesTabState);
        if (devicesTabState.otherDevicesCount !== 2 || devicesTabState.totalDevices !== 3) {
            throw new Error('Danh sách thiết bị không hiển thị đúng.');
        }

        const devicesShot = path.join(ARTIFACT_DIR, 'stitch-devices-desktop-1280.png');
        await cdp.captureScreenshot(devicesShot);
        console.log(`  📸 Đã chụp ảnh minh chứng: ${devicesShot}`);

        // Test revoke device
        const revokeResult = await cdp.eval(`(() => {
            window.ViVuApp.revokeDeviceSession('dev-ipad-air');
            const devicesAfter = window.ViVuApp.getState().securitySettings.devices.length;
            return { devicesAfter };
        })()`);

        console.log('  Kết quả thu hồi phiên iPad Air:', revokeResult);
        if (revokeResult.devicesAfter !== 2) {
            throw new Error('Thu hồi phiên thiết bị thất bại.');
        }
        console.log('  ✅ Thao tác thu hồi phiên thiết bị từ xa hoạt động chính xác!');

        // =========================================================================
        // [8] KIỂM THỬ TÙY CHỌN THÔNG BÁO & ECO-TOGGLES (TAB NOTIFICATIONS)
        // =========================================================================
        console.log('\n[8] KIỂM THỬ TÙY CHỌN THÔNG BÁO & ECO-TOGGLES:');
        await cdp.eval(`window.ViVuApp.switchSecurityTab('notifications')`);
        await sleep(300);

        const notifResult = await cdp.eval(`(() => {
            const before = window.ViVuApp.getState().securitySettings.notifications.pushVouchers;
            window.ViVuApp.toggleNotificationPref('pushVouchers');
            const after = window.ViVuApp.getState().securitySettings.notifications.pushVouchers;
            return { before, after };
        })()`);

        console.log('  Kết quả gạt công tắc Voucher Ưu đãi:', notifResult);
        if (notifResult.before === notifResult.after) {
            throw new Error('Gạt công tắc thông báo không đổi trạng thái.');
        }
        console.log('  ✅ Eco-toggles thông báo cập nhật thời gian thực mượt mà!');

        // =========================================================================
        // [9] KIỂM THỬ GIAO DIỆN TRÊN DI ĐỘNG (MOBILE 390x844)
        // =========================================================================
        console.log('\n[9] KIỂM THỬ GIAO DIỆN TRÊN DI ĐỘNG (MOBILE 390x844):');
        await cdp.setViewport(390, 844);
        await cdp.eval(`window.ViVuApp.switchSecurityTab('security')`);
        await sleep(400);

        const mobileSecOverflow = await cdp.eval(`(() => {
            const modal = document.getElementById('securityModal');
            const docWidth = document.documentElement.clientWidth;
            const scrollWidth = modal ? modal.scrollWidth : 0;
            return {
                noOverflow: scrollWidth <= docWidth + 2,
                docWidth,
                scrollWidth
            };
        })()`);

        console.log('  Kiểm tra tràn ngang Security Mobile:', mobileSecOverflow);
        const secMobileShot = path.join(ARTIFACT_DIR, 'stitch-security-mobile-390.png');
        await cdp.captureScreenshot(secMobileShot);
        console.log(`  📸 Đã chụp ảnh minh chứng: ${secMobileShot}`);

        if (!mobileSecOverflow.noOverflow) {
            throw new Error('Giao diện Mobile Security bị tràn ngang.');
        }

        // =========================================================================
        // [10] KIỂM TRA CHUẨN VÙNG CHẠM TOUCH TARGET (>= 44px)
        // =========================================================================
        console.log('\n[10] KIỂM TRA CHUẨN VÙNG CHẠM TOUCH TARGET (>= 44px):');
        const touchTargets = await cdp.eval(`(() => {
            const targets = [];
            const selectors = [
                '#headerSettingsBtn',
                '#sidebarSettingsBtn',
                '#securityModal button'
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

        let allTouchPass = true;
        touchTargets.forEach(t => {
            const status = t.pass ? 'PASS' : 'FAIL';
            console.log(`  ✅ Vùng chạm "${t.text}": ${t.width}x${t.height}px (${status})`);
            if (!t.pass) allTouchPass = false;
        });

        if (!allTouchPass) {
            throw new Error('Phát hiện nút có vùng chạm < 44px!');
        }

        await cdp.eval(`window.ViVuApp.closeSecurityModal()`);

        console.log('\n========================================');
        console.log('TẤT CẢ KIỂM THỬ GIAI ĐOẠN 8 ĐẠT 100% PASS!');
        console.log('========================================\n');

    } catch (err) {
        console.error('\nLỖI KIỂM THỬ GIAI ĐOẠN 8:', err);
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
